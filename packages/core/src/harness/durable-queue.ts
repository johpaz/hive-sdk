/**
 * DurableLaneQueue — persistent work queue backed by the harness_jobQueue
 * HiveDB collection. Ported from `hive`'s gateway/durable-queue.ts,
 * generalized for SDK consumers (job `type` is a plain string; the set of
 * "never auto-retry a logical failure" types is configurable instead of a
 * hardcoded `chat_turn` check — default matches `hive`'s convention).
 *
 * Guarantees:
 * - FIFO + priority per lane
 * - 1 concurrent running job per lane
 * - maxGlobalConcurrency across all lanes (default 4)
 * - JobDoc persists every status transition → survives crashes
 * - Expired leases (crashed worker) are reclaimed or interrupted on next dispatch
 * - Logical failures ({ok:false, retryable:true}) retry with backoff+jitter
 *   via `failJobOrRetry`, except for `nonRetryableTypes` (default: chat_turn)
 */

import { logger } from "../utils/logger";
import {
  createJob,
  claimJob,
  completeJob,
  failJob,
  failJobOrRetry,
  cancelJob,
  reclaimOrInterrupt,
  findPendingJobsByLane,
  findAllPendingJobs,
  findExpiredLeases,
  DEFAULT_JOB_RETRY_POLICY,
  type JobRetryPolicy,
} from "./job-store";
import type { JobDoc } from "./collections";
import { getBootId } from "./boot-id";

const log = logger.child("harness:durable-queue");

const LEASE_CHECK_INTERVAL_MS = 10_000;
const DEFAULT_MAX_GLOBAL_CONCURRENCY = 4;
const DEFAULT_TASK_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_NON_RETRYABLE_TYPES = ["chat_turn"];

export interface JobPayload {
  [key: string]: unknown;
}

export interface JobExecutorResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  /** Logical failures default to retryable; set false for terminal errors (validation, not-found) that a retry can't fix. Ignored when ok=true. */
  retryable?: boolean;
  /** Stable failure code for observability/tooling, e.g. {code:"PROVIDER_TIMEOUT"}. */
  failureSignature?: string;
}

export interface JobLiveCallbacks {
  onToken?: (token: string) => void;
  onStep?: (step: unknown) => Promise<void>;
  sendRaw?: (payload: string) => void;
}

export type JobExecutor = (
  job: JobDoc,
  signal: AbortSignal,
  callbacks?: JobLiveCallbacks
) => Promise<JobExecutorResult>;

const executors = new Map<string, JobExecutor>();

export function registerExecutor(type: string, executor: JobExecutor): void {
  executors.set(type, executor);
  log.info(`[registerExecutor] Registered executor for type=${type}`);
}

export interface DurableLaneQueueOptions {
  maxGlobalConcurrency?: number;
  taskTimeoutMs?: number;
  jobRetryPolicy?: JobRetryPolicy;
  /** Job types that should never auto-retry a logical failure (e.g. user-facing turns). Default: ["chat_turn"]. */
  nonRetryableTypes?: string[];
}

export class DurableLaneQueue {
  private maxGlobalConcurrency: number;
  private taskTimeoutMs: number;
  private jobRetryPolicy: JobRetryPolicy;
  private nonRetryableTypes: Set<string>;
  private runningCount = 0;
  private runningAborts = new Map<string, { lane: string; controller: AbortController }>();
  private dispatchTimers = new Map<string, ReturnType<typeof setInterval>>();
  private leaseCheckTimer: ReturnType<typeof setInterval> | null = null;
  private bootId: string;

  constructor(options: DurableLaneQueueOptions = {}) {
    this.maxGlobalConcurrency = options.maxGlobalConcurrency ?? DEFAULT_MAX_GLOBAL_CONCURRENCY;
    this.taskTimeoutMs = options.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
    this.jobRetryPolicy = options.jobRetryPolicy ?? DEFAULT_JOB_RETRY_POLICY;
    this.nonRetryableTypes = new Set(options.nonRetryableTypes ?? DEFAULT_NON_RETRYABLE_TYPES);
    this.bootId = getBootId();
  }

  /**
   * Enqueue a durable job. Returns the JobDoc. Callers should use `enqueue`
   * instead of any in-memory queue for work that must survive crashes.
   */
  async enqueue(input: {
    lane: string;
    type: string;
    payload: JobPayload;
    run_id: string;
    priority?: number;
    max_attempts?: number;
    not_before?: number;
    idempotency_key?: string | null;
    callbacks?: JobLiveCallbacks;
  }): Promise<JobDoc> {
    const job = await createJob({
      lane: input.lane,
      type: input.type,
      payload: { ...input.payload, _callbacks: !!input.callbacks },
      run_id: input.run_id,
      priority: input.priority,
      max_attempts: input.max_attempts,
      not_before: input.not_before,
      idempotency_key: input.idempotency_key,
    });

    if (input.callbacks) {
      liveCallbacks.set(job.id, input.callbacks);
    }

    this.scheduleDispatch(input.lane);
    return job;
  }

  /** Cancel a job by id (pending or running). A running job also gets its AbortSignal fired. */
  async cancel(jobId: string): Promise<boolean> {
    const running = this.runningAborts.get(jobId);
    if (running) running.controller.abort();
    return cancelJob(jobId);
  }

  /** Cancel all pending and running jobs in a lane. */
  async cancelLane(lane: string): Promise<number> {
    let count = 0;
    for (const [jobId, entry] of this.runningAborts) {
      if (entry.lane === lane) {
        entry.controller.abort();
        if (await cancelJob(jobId)) count++;
      }
    }
    const pending = await findPendingJobsByLane(lane, 100);
    for (const job of pending) {
      if (await cancelJob(job.id)) count++;
    }
    return count;
  }

  /**
   * Start the maintenance tick (expired-lease reclaim + due-pending
   * redispatch) and dispatch any jobs left pending by a previous boot.
   */
  start(): void {
    if (this.leaseCheckTimer) return;
    this.leaseCheckTimer = setInterval(() => this.runMaintenanceTick(), LEASE_CHECK_INTERVAL_MS);
    log.info(`[start] Maintenance tick running every ${LEASE_CHECK_INTERVAL_MS}ms`);
    this.dispatchPendingLanes().catch((err) => {
      log.error(`[start] Failed to dispatch pending lanes: ${(err as Error).message}`);
    });
  }

  /**
   * Periodic tick: reclaim crashed jobs (expired leases) AND re-dispatch
   * lanes with jobs whose `not_before` (e.g. a backoff delay from
   * `failJobOrRetry`) has now elapsed.
   */
  private async runMaintenanceTick(): Promise<void> {
    await this.checkExpiredLeases();
    await this.dispatchPendingLanes().catch((err) => {
      log.error(`[runMaintenanceTick] Failed to dispatch pending lanes: ${(err as Error).message}`);
    });
  }

  private async dispatchPendingLanes(): Promise<void> {
    const pending = await findAllPendingJobs();
    const lanes = new Set(pending.map((j) => j.lane));
    for (const lane of lanes) this.scheduleDispatch(lane);
    if (lanes.size > 0) {
      log.info(`[dispatchPendingLanes] Re-dispatching ${pending.length} pending job(s) across ${lanes.size} lane(s)`);
    }
  }

  stop(): void {
    if (this.leaseCheckTimer) {
      clearInterval(this.leaseCheckTimer);
      this.leaseCheckTimer = null;
    }
    for (const [, timer] of this.dispatchTimers) clearInterval(timer);
    this.dispatchTimers.clear();
  }

  private scheduleDispatch(lane: string): void {
    if (this.dispatchTimers.has(lane)) return;
    const timer = setTimeout(() => {
      this.dispatchTimers.delete(lane);
      this.dispatchLane(lane).catch((err) => {
        log.error(`[scheduleDispatch] Error dispatching lane ${lane}: ${(err as Error).message}`);
      });
    }, 0);
    this.dispatchTimers.set(lane, timer);
  }

  private async dispatchLane(lane: string): Promise<void> {
    for (;;) {
      const pending = await findPendingJobsByLane(lane, 1);
      if (pending.length === 0) break;

      const job = pending[0];
      // Interactive/user-facing types bypass the global cap so a busy batch
      // of background jobs can't starve them — matches `hive`'s chat_turn
      // convention: nonRetryableTypes doubles as the "must stay responsive" set.
      if (!this.nonRetryableTypes.has(job.type) && this.runningCount >= this.maxGlobalConcurrency) break;

      const claimed = await claimJob(job.id, this.bootId);
      if (!claimed) continue;

      this.runningCount++;
      this.executeJob(claimed, lane).catch((err) => {
        log.error(`[dispatchLane] Unhandled error in job ${claimed.id}: ${(err as Error).message}`);
      });

      break;
    }
  }

  private async executeJob(job: JobDoc, lane: string): Promise<void> {
    const abortController = new AbortController();
    this.runningAborts.set(job.id, { lane, controller: abortController });
    const timeoutId = setTimeout(() => abortController.abort(), this.taskTimeoutMs);

    let leasedHere = true;
    const leaseRenewer = setInterval(async () => {
      if (leasedHere) {
        const { renewLease } = await import("./job-store");
        await renewLease(job.id, this.bootId).catch(() => {});
      }
    }, 30_000);

    try {
      const executor = executors.get(job.type);
      if (!executor) {
        await failJob(job.id, `No executor registered for type=${job.type}`, this.bootId);
        log.error(`[executeJob] No executor for type=${job.type} (job ${job.id})`);
        return;
      }

      const callbacks = liveCallbacks.get(job.id);
      const result = await executor(job, abortController.signal, callbacks);
      liveCallbacks.delete(job.id);

      if (result.ok) {
        await completeJob(job.id, result.result ?? null, this.bootId);
      } else {
        const error = result.error ?? "Unknown error";
        if (!this.nonRetryableTypes.has(job.type) && result.retryable !== false) {
          await failJobOrRetry(job.id, error, this.bootId, this.jobRetryPolicy);
        } else {
          await failJob(job.id, error, this.bootId);
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        await cancelJob(job.id);
      } else {
        const error = (err as Error).message;
        if (!this.nonRetryableTypes.has(job.type)) {
          await failJobOrRetry(job.id, error, this.bootId, this.jobRetryPolicy);
        } else {
          await failJob(job.id, error, this.bootId);
        }
      }
    } finally {
      clearTimeout(timeoutId);
      clearInterval(leaseRenewer);
      leasedHere = false;
      this.runningAborts.delete(job.id);
      this.runningCount--;
      this.scheduleDispatch(lane);
    }
  }

  private async checkExpiredLeases(): Promise<void> {
    try {
      const expired = await findExpiredLeases();
      for (const job of expired) {
        const result = await reclaimOrInterrupt(job.id);
        if (result?.status === "pending") {
          this.scheduleDispatch(job.lane);
        }
      }
    } catch (err) {
      log.warn(`[checkExpiredLeases] Error: ${(err as Error).message}`);
    }
  }

  getRunningCount(): number {
    return this.runningCount;
  }

  getMaxGlobalConcurrency(): number {
    return this.maxGlobalConcurrency;
  }

  getJobRetryPolicy(): JobRetryPolicy {
    return this.jobRetryPolicy;
  }
}

// Live callback stash — not serializable, kept in memory only
const liveCallbacks = new Map<string, JobLiveCallbacks>();

// Singleton
let _durableQueue: DurableLaneQueue | null = null;

export function getDurableQueue(): DurableLaneQueue {
  if (!_durableQueue) {
    _durableQueue = new DurableLaneQueue();
  }
  return _durableQueue;
}

export function initDurableQueue(options?: DurableLaneQueueOptions): DurableLaneQueue {
  _durableQueue = new DurableLaneQueue(options);
  _durableQueue.start();
  return _durableQueue;
}
