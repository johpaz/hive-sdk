/**
 * reconcileOnBoot — repair harness rows left in inconsistent states by a
 * previous crash/kill, plus a retention cap. Ported from `hive`'s
 * storage/reconcile.ts, trimmed to only the generic harness collections
 * (agentRuns/jobQueue) — `hive`'s version also repairs app-specific rows
 * (taskRuns, meetingSessions, project tasks) that don't exist in the SDK.
 *
 * Call early in a host app's boot sequence, before `initDurableQueue`.
 */

import { col } from "./db-helpers";
import type { HarnessRunDoc } from "./collections";
import type { JobDoc } from "./collections";
import { logger } from "../utils/logger";
import { reclaimOrInterrupt, JOB_QUEUE_COLLECTION } from "./job-store";
import { interruptRun, AGENT_RUNS_COLLECTION } from "./run-store";

const log = logger.child("harness:reconcile");

export interface ReconcileResult {
  bootId: string;
  runsInterrupted: number;
  runsReEnqueueable: number;
  jobsReclaimed: number;
  jobsInterrupted: number;
  runsPruned: number;
  jobsPruned: number;
}

export interface ReconcileOptions {
  /** Run kinds treated as "interactive" (interrupted outright rather than flagged for re-enqueue). Default: ["chat"]. */
  interactiveKinds?: string[];
  /** Retention cap per thread/run. Default: 500. */
  retentionLimit?: number;
  /** Called when an interactive run is interrupted, so the host can notify the user. */
  onInteractiveInterrupted?: (run: HarnessRunDoc) => Promise<void> | void;
}

export async function reconcileOnBoot(bootId: string, opts: ReconcileOptions = {}): Promise<ReconcileResult> {
  const interactiveKinds = new Set(opts.interactiveKinds ?? ["chat"]);
  const retentionLimit = opts.retentionLimit ?? 500;

  log.info(`[reconcileOnBoot] Starting with boot_id=${bootId}`);
  const result: ReconcileResult = {
    bootId,
    runsInterrupted: 0,
    runsReEnqueueable: 0,
    jobsReclaimed: 0,
    jobsInterrupted: 0,
    runsPruned: 0,
    jobsPruned: 0,
  };

  // 1. harness_agentRuns: any "running" row is orphaned at boot — HiveDB is
  // single-process and this process just started, so no run can actually be
  // executing.
  try {
    const runsCol = await col<HarnessRunDoc>(AGENT_RUNS_COLLECTION);
    const runningRuns = await runsCol.findBy("status", "running");
    for (const entry of runningRuns) {
      const run = entry.doc;
      if (interactiveKinds.has(run.kind)) {
        await interruptRun(run.id, "Process restarted while an interactive run was in flight");
        result.runsInterrupted++;
        try {
          await opts.onInteractiveInterrupted?.(run);
        } catch {
          // non-critical
        }
      } else {
        await interruptRun(run.id, "Process restarted — job will be re-enqueued if durable");
        result.runsReEnqueueable++;
      }
    }
    if (result.runsInterrupted > 0 || result.runsReEnqueueable > 0) {
      log.info(`[reconcileOnBoot] ${result.runsInterrupted} interactive runs interrupted, ${result.runsReEnqueueable} durable runs flagged for re-enqueue`);
    }
  } catch (err) {
    log.warn(`[reconcileOnBoot] Failed to repair agentRuns: ${(err as Error).message}`);
  }

  // 2. harness_jobQueue: any "running" row is orphaned at boot (same
  // single-process argument as above) → reclaim (pending) or interrupt,
  // ignoring the lease.
  try {
    const jobsCol = await col<JobDoc>(JOB_QUEUE_COLLECTION);
    const runningJobs = await jobsCol.findBy("status", "running");
    for (const entry of runningJobs) {
      const doc = await reclaimOrInterrupt(entry.doc.id, { force: true });
      if (doc?.status === "pending") result.jobsReclaimed++;
      else if (doc?.status === "interrupted") result.jobsInterrupted++;
    }
    if (result.jobsReclaimed > 0 || result.jobsInterrupted > 0) {
      log.info(`[reconcileOnBoot] ${result.jobsReclaimed} jobs reclaimed to pending, ${result.jobsInterrupted} jobs interrupted (attempts exhausted)`);
    }
  } catch (err) {
    log.warn(`[reconcileOnBoot] Failed to repair jobQueue: ${(err as Error).message}`);
  }

  // 3. Retention cap: keep only the most recent N agentRuns/jobs per thread/run.
  try {
    const runsCol = await col<HarnessRunDoc>(AGENT_RUNS_COLLECTION);
    const allRuns = await runsCol.scan({});
    const runsByThread = new Map<string, typeof allRuns>();
    for (const entry of allRuns) {
      const key = entry.doc.thread_id ?? entry.doc.agent_id ?? "_default";
      const list = runsByThread.get(key) ?? [];
      list.push(entry);
      runsByThread.set(key, list);
    }
    for (const [, runs] of runsByThread) {
      if (runs.length <= retentionLimit) continue;
      const sorted = runs.sort((a, b) => (b.doc.created_at ?? 0) - (a.doc.created_at ?? 0));
      for (const entry of sorted.slice(retentionLimit)) {
        await runsCol.delete(entry.id);
        result.runsPruned++;
      }
    }
    if (result.runsPruned > 0) {
      log.info(`[reconcileOnBoot] Retention: pruned ${result.runsPruned} old agentRuns (cap=${retentionLimit}/thread)`);
    }

    const jobsCol = await col<JobDoc>(JOB_QUEUE_COLLECTION);
    const allJobs = await jobsCol.scan({});
    const jobsByRun = new Map<string, typeof allJobs>();
    for (const entry of allJobs) {
      const key = entry.doc.run_id ?? "_default";
      const list = jobsByRun.get(key) ?? [];
      list.push(entry);
      jobsByRun.set(key, list);
    }
    for (const [, jobs] of jobsByRun) {
      if (jobs.length <= retentionLimit) continue;
      const sorted = jobs.sort((a, b) => (b.doc.created_at ?? 0) - (a.doc.created_at ?? 0));
      for (const entry of sorted.slice(retentionLimit)) {
        await jobsCol.delete(entry.id);
        result.jobsPruned++;
      }
    }
    if (result.jobsPruned > 0) {
      log.info(`[reconcileOnBoot] Retention: pruned ${result.jobsPruned} old jobs (cap=${retentionLimit}/run)`);
    }
  } catch (err) {
    log.warn(`[reconcileOnBoot] Failed to enforce retention cap: ${(err as Error).message}`);
  }

  log.info(`[reconcileOnBoot] Done`, result);
  return result;
}
