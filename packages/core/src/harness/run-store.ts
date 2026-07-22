/**
 * run-store — persistent checkpoint + lease for harness runs. Ported from
 * `hive`'s agent/run-store.ts.
 *
 * A HarnessRunDoc tracks the lifecycle of a single durable agent invocation
 * (chat turn, worker task, goal run). Its checkpoint (state_json) allows
 * resuming after a crash: messages, iteration count, token totals and
 * pending tool calls are persisted after every round-trip — when the host
 * app chooses to call `checkpoint()` from its own agent loop (this module
 * does not wire itself into `AgentRunner` automatically).
 *
 * All write operations use OCC (expectedVersion). Only the owning loop
 * should write to a run; single-writer pattern keeps contention minimal.
 */

import { col, updateDoc, nextId } from "./db-helpers";
import type { HarnessRunDoc } from "./collections";
import { getBootId } from "./boot-id";
import { logger } from "../utils/logger";
import type { RunEpoch } from "./run-epoch";

const log = logger.child("harness:run-store");

const COLLECTION = "harness_agentRuns";
const MAX_STATE_BYTES = 1_500_000;

let leaseRenewIntervalMs = 30_000;
let leaseDurationMs = 2 * 60 * 1000;

/** Override the run lease duration / renewal interval (defaults: 2min / 30s). */
export function setRunLeaseConfig(opts: { leaseDurationMs?: number; leaseRenewIntervalMs?: number }): void {
  if (opts.leaseDurationMs !== undefined) leaseDurationMs = opts.leaseDurationMs;
  if (opts.leaseRenewIntervalMs !== undefined) leaseRenewIntervalMs = opts.leaseRenewIntervalMs;
}

export interface RunCheckpointState {
  version: 1
  messages: unknown[]
  iterations: number
  totalInputTokens: number
  totalOutputTokens: number
  lastToolSignature?: string
  consecutiveRepeat?: number
  idleIterations?: number
  injectedToolNames?: string[]
  systemPromptSkillSections?: string[]
}

/** Whole-job acceptance criterion (harness-engineering "proof" concept). */
export interface AcceptanceCriterion {
  id: string
  description: string
  /** Deterministic tool to check this specific criterion; falls back to LLM judgment when absent. */
  checkTool?: string | null
}

export interface CreateRunInput {
  thread_id: string
  agent_id: string
  user_id: string
  channel: string | null
  kind: string
  max_iterations: number
  max_turns?: number | null
  max_tokens?: number | null
  goal?: string | null
  goal_check_tool?: string | null
  resume_policy?: HarnessRunDoc["resume_policy"]
  acceptance?: AcceptanceCriterion[]
  epoch?: RunEpoch
}

export async function createRun(input: CreateRunInput): Promise<HarnessRunDoc> {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const now = Date.now();
  const bootId = getBootId();
  const doc: HarnessRunDoc = {
    id,
    thread_id: input.thread_id,
    agent_id: input.agent_id,
    user_id: input.user_id,
    channel: input.channel,
    kind: input.kind,
    status: "running",
    iterations_used: 0,
    max_iterations: input.max_iterations,
    turns_used: 0,
    max_turns: input.max_turns ?? null,
    tokens_used: 0,
    max_tokens: input.max_tokens ?? null,
    goal: input.goal ?? null,
    goal_check_tool: input.goal_check_tool ?? null,
    goal_attempts: 0,
    state_json: "",
    state_bytes: 0,
    pending_tool_calls_json: null,
    checkpointed_at: now,
    boot_id: bootId,
    lease_expires_at: now + leaseDurationMs,
    resume_policy: input.resume_policy ?? "resume",
    acceptance_json: input.acceptance ? JSON.stringify(input.acceptance) : null,
    epoch_json: input.epoch ? JSON.stringify(input.epoch) : null,
    error: null,
    created_at: now,
    updated_at: now,
    finished_at: null,
  };
  const c = await col<HarnessRunDoc>(COLLECTION);
  await c.put(id, doc, { expectedVersion: 0 });
  log.info(`[createRun] Run ${id} created (agent=${input.agent_id} kind=${input.kind})`);
  return doc;
}

/** Save a checkpoint to the run: serialize messages, trim state if too big. */
export async function checkpoint(
  runId: string,
  state: RunCheckpointState,
  pendingToolCalls?: unknown[] | null
): Promise<HarnessRunDoc> {
  const serialized = JSON.stringify(state);
  let stateJson = serialized;
  let stateBytes = new TextEncoder().encode(serialized).length;

  if (stateBytes > MAX_STATE_BYTES) {
    stateJson = truncateState(state);
    stateBytes = new TextEncoder().encode(stateJson).length;
  }

  const patch: Partial<HarnessRunDoc> = {
    state_json: stateJson,
    state_bytes: stateBytes,
    pending_tool_calls_json: pendingToolCalls ? JSON.stringify(pendingToolCalls) : null,
    checkpointed_at: Date.now(),
    iterations_used: state.iterations,
    tokens_used: state.totalInputTokens + state.totalOutputTokens,
    lease_expires_at: Date.now() + leaseDurationMs,
    boot_id: getBootId(),
    updated_at: Date.now(),
  };

  return updateDoc<HarnessRunDoc>(COLLECTION, runId, patch);
}

export async function bumpTurn(runId: string, tokensDelta: number): Promise<HarnessRunDoc> {
  const existing = await getRun(runId);
  if (!existing) throw new Error(`Run ${runId} not found`);
  return updateDoc<HarnessRunDoc>(COLLECTION, runId, {
    turns_used: existing.turns_used + 1,
    tokens_used: existing.tokens_used + tokensDelta,
    lease_expires_at: Date.now() + leaseDurationMs,
    updated_at: Date.now(),
  });
}

export async function completeRun(runId: string, finalContent?: string): Promise<void> {
  const now = Date.now();
  void finalContent;
  await updateDoc<HarnessRunDoc>(COLLECTION, runId, {
    status: "completed",
    state_json: "",
    state_bytes: 0,
    pending_tool_calls_json: null,
    lease_expires_at: now,
    finished_at: now,
    updated_at: now,
  } as Partial<HarnessRunDoc>);
  log.info(`[completeRun] Run ${runId} completed`);
}

export async function failRun(runId: string, error: string): Promise<void> {
  const now = Date.now();
  await updateDoc<HarnessRunDoc>(COLLECTION, runId, {
    status: "failed",
    error,
    lease_expires_at: now,
    finished_at: now,
    updated_at: now,
    state_json: "",
    state_bytes: 0,
    pending_tool_calls_json: null,
  });
  log.warn(`[failRun] Run ${runId} failed: ${error}`);
}

export async function interruptRun(runId: string, reason: string): Promise<void> {
  const now = Date.now();
  await updateDoc<HarnessRunDoc>(COLLECTION, runId, {
    status: "interrupted",
    error: reason,
    lease_expires_at: now,
    finished_at: now,
    updated_at: now,
  });
  log.warn(`[interruptRun] Run ${runId} interrupted: ${reason}`);
}

/**
 * Take ownership of an existing run before (re-)executing it. After a crash,
 * reconcile leaves the row "interrupted" with the dead process's boot_id;
 * both must be reset before resuming.
 */
export async function reclaimRun(runId: string): Promise<void> {
  const now = Date.now();
  await updateDoc<HarnessRunDoc>(COLLECTION, runId, {
    status: "running",
    boot_id: getBootId(),
    lease_expires_at: now + leaseDurationMs,
    error: null,
    finished_at: null,
    updated_at: now,
  });
}

export async function getRun(runId: string): Promise<HarnessRunDoc | null> {
  const c = await col<HarnessRunDoc>(COLLECTION);
  const entry = await c.get(runId);
  return entry ? entry.doc : null;
}

export async function findRunsByStatus(status: HarnessRunDoc["status"]): Promise<HarnessRunDoc[]> {
  const c = await col<HarnessRunDoc>(COLLECTION);
  const entries = await c.findBy("status", status);
  return entries.map((e) => e.doc);
}

export async function findRunsByThread(threadId: string): Promise<HarnessRunDoc[]> {
  const c = await col<HarnessRunDoc>(COLLECTION);
  const entries = await c.findBy("thread_id", threadId);
  return entries.map((e) => e.doc);
}

export async function findExpiredRuns(): Promise<HarnessRunDoc[]> {
  const running = await findRunsByStatus("running");
  const now = Date.now();
  return running.filter((r) => r.lease_expires_at < now);
}

export function deserializeAcceptance(run: HarnessRunDoc): AcceptanceCriterion[] | null {
  if (!run.acceptance_json) return null;
  try {
    return JSON.parse(run.acceptance_json) as AcceptanceCriterion[];
  } catch {
    log.warn(`[deserializeAcceptance] Failed to parse acceptance_json for run ${run.id}`);
    return null;
  }
}

export function deserializeEpoch(run: HarnessRunDoc): RunEpoch | null {
  if (!run.epoch_json) return null;
  try {
    return JSON.parse(run.epoch_json) as RunEpoch;
  } catch {
    log.warn(`[deserializeEpoch] Failed to parse epoch_json for run ${run.id}`);
    return null;
  }
}

/** Deserialize a checkpoint, or null if the run has no checkpoint. */
export function deserializeCheckpoint(run: HarnessRunDoc): RunCheckpointState | null {
  if (!run.state_json) return null;
  try {
    const raw = JSON.parse(run.state_json);
    if (raw.version !== 1) return null;
    return raw as RunCheckpointState;
  } catch {
    log.warn(`[deserializeCheckpoint] Failed to parse state_json for run ${run.id}`);
    return null;
  }
}

function truncateState(state: RunCheckpointState): string {
  const messages = [...state.messages] as Array<Record<string, unknown>>;
  const keepLastN = 8;
  const cutoff = messages.length - keepLastN;

  for (let i = 0; i < cutoff; i++) {
    const msg = messages[i];
    if (msg.role === "tool" && typeof msg.content === "string" && msg.content.length > 200) {
      messages[i] = { ...msg, content: `[Truncated: ${(msg.content as string).substring(0, 200)}...]` };
    }
    if (msg.role === "assistant" && typeof msg.content === "string" && (msg.content as string).length > 500) {
      messages[i] = { ...msg, content: (msg.content as string).substring(0, 500) + "[...]" };
    }
  }

  return JSON.stringify({ ...state, messages });
}

// ─── Lease renewal timer ────────────────────────────────────────────────────

const leaseTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

export function startLeaseRenewal(runId: string): void {
  if (leaseTimers.has(runId)) return;
  const timer = setInterval(async () => {
    try {
      const run = await getRun(runId);
      if (!run || run.status !== "running") {
        stopLeaseRenewal(runId);
        return;
      }
      await updateDoc<HarnessRunDoc>(COLLECTION, runId, {
        lease_expires_at: Date.now() + leaseDurationMs,
        updated_at: Date.now(),
      } as Partial<HarnessRunDoc>);
    } catch (err) {
      log.warn(`[startLeaseRenewal] Failed to renew lease for ${runId}: ${(err as Error).message}`);
    }
  }, leaseRenewIntervalMs);
  leaseTimers.set(runId, timer);
}

export function stopLeaseRenewal(runId: string): void {
  const timer = leaseTimers.get(runId);
  if (timer) {
    clearInterval(timer);
    leaseTimers.delete(runId);
  }
}

export function stopAllLeaseRenewals(): void {
  for (const [, timer] of leaseTimers) clearInterval(timer);
  leaseTimers.clear();
}

export async function ensureRunStoreIndexes(): Promise<void> {
  const c = await col<HarnessRunDoc>(COLLECTION);
  await c.createIndex("status");
  await c.createIndex("thread_id");
  await c.createIndex("agent_id");
  await c.createIndex("kind");
}

export { COLLECTION as AGENT_RUNS_COLLECTION };
