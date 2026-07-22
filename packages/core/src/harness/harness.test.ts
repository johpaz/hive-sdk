/**
 * Harness module tests — job-store retry/idempotency, durable-queue
 * dispatch + retry wiring, run-store checkpoint/acceptance/epoch
 * round-trip, proof-packet persistence, goal-verifier (deterministic
 * check-tool + acceptance-criteria paths only — no network/LLM calls).
 *
 * Uses an isolated HIVE_HOME so this never touches a real dev database.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDB } from "../storage/HiveDBStorage.ts";
import {
  ensureHarnessIndexes,
  createJob,
  claimJob,
  failJobOrRetry,
  getJob,
  computeBackoffDelay,
  findByIdempotencyKey,
  DurableLaneQueue,
  registerExecutor,
  createRun,
  deserializeAcceptance,
  deserializeEpoch,
  buildRunEpoch,
  buildProofPacket,
  findProofPacketsByRun,
  verifyGoal,
  getBootId,
  resetBootId,
  col,
  type JobRetryPolicy,
  type JobDoc,
} from "./index.ts";

// Fresh HiveDB directory per test — hive-sdk's HiveDBStorage has no ":memory:"
// mode, so isolation means pointing HIVE_HOME at a new temp dir each time and
// letting the lazy singleton reopen there.
let currentDir: string;

beforeEach(async () => {
  closeHiveDB();
  resetBootId();
  currentDir = mkdtempSync(path.join(tmpdir(), "hive-sdk-harness-test-"));
  process.env.HIVE_HOME = currentDir;
  await ensureHarnessIndexes();
});

afterEach(() => {
  closeHiveDB();
  rmSync(currentDir, { recursive: true, force: true });
});

const FAST_POLICY: JobRetryPolicy = {
  maxRetries: 2,
  initialDelayMs: 10,
  backoffMultiplier: 2,
  maxDelayMs: 1000,
  jitter: 0,
};

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("waitFor timed out");
}

describe("harness/job-store: idempotency", () => {
  test("repeated idempotency_key returns the same job", async () => {
    const first = await createJob({ lane: "s1", type: "worker_task", payload: { n: 1 }, run_id: "r1", idempotency_key: "dedupe-1" });
    const second = await createJob({ lane: "s1", type: "worker_task", payload: { n: 2 }, run_id: "r1", idempotency_key: "dedupe-1" });
    expect(second.id).toBe(first.id);
    expect(JSON.parse(second.payload_json).n).toBe(1);
  });

  test("findByIdempotencyKey returns null for an unknown key", async () => {
    expect(await findByIdempotencyKey("nope")).toBeNull();
  });
});

describe("harness/job-store: retry/backoff", () => {
  test("computeBackoffDelay grows exponentially and caps", () => {
    const policy: JobRetryPolicy = { maxRetries: 10, initialDelayMs: 100, backoffMultiplier: 2, maxDelayMs: 500, jitter: 0 };
    expect(computeBackoffDelay(0, policy)).toBe(100);
    expect(computeBackoffDelay(1, policy)).toBe(200);
    expect(computeBackoffDelay(3, policy)).toBe(500);
  });

  test("failJobOrRetry schedules a retry, then fails terminally after maxRetries", async () => {
    const job = await createJob({ lane: "s2", type: "worker_task", payload: {}, run_id: "r2" });
    const c = await col<JobDoc>("harness_jobQueue");
    // Force not_before into the past after each retry so claimJob doesn't block on the backoff delay.
    const forcePastNotBefore = async () => {
      const entry = await c.get(job.id);
      await c.put(job.id, { ...entry!.doc, not_before: Date.now() - 1 }, { expectedVersion: entry!.version });
    };

    await claimJob(job.id);
    const r1 = await failJobOrRetry(job.id, "boom", getBootId(), FAST_POLICY);
    expect(r1!.status).toBe("pending");
    expect(r1!.retry_count).toBe(1);
    await forcePastNotBefore();

    await claimJob(job.id);
    const r2 = await failJobOrRetry(job.id, "boom again", getBootId(), FAST_POLICY);
    expect(r2!.status).toBe("pending");
    expect(r2!.retry_count).toBe(2);
    await forcePastNotBefore();

    await claimJob(job.id);
    const r3 = await failJobOrRetry(job.id, "final", getBootId(), FAST_POLICY);
    expect(r3!.status).toBe("failed");
  });
});

describe("harness/durable-queue", () => {
  let queue: DurableLaneQueue | null = null;

  afterEach(() => {
    queue?.stop();
    queue = null;
  });

  test("retries a retryable logical failure then completes", async () => {
    let calls = 0;
    registerExecutor("flaky_task", async () => {
      calls++;
      if (calls < 2) return { ok: false, error: "flaky", retryable: true };
      return { ok: true, result: "recovered" };
    });

    queue = new DurableLaneQueue({ maxGlobalConcurrency: 2, jobRetryPolicy: FAST_POLICY });
    const job = await queue.enqueue({ lane: "lane-flaky", type: "flaky_task", run_id: "r3", payload: {} });

    await waitFor(async () => (await getJob(job.id))?.retry_count === 1);
    await new Promise((r) => setTimeout(r, 30));
    queue.start();

    await waitFor(async () => (await getJob(job.id))?.status === "completed");
    expect(calls).toBe(2);
  });

  test("nonRetryableTypes never auto-retries a logical failure", async () => {
    let calls = 0;
    registerExecutor("chat_turn", async () => {
      calls++;
      return { ok: false, error: "user-facing failure" };
    });

    queue = new DurableLaneQueue({ maxGlobalConcurrency: 2, jobRetryPolicy: FAST_POLICY });
    const job = await queue.enqueue({ lane: "lane-chat", type: "chat_turn", run_id: "r4", payload: {} });

    await waitFor(async () => (await getJob(job.id))?.status === "failed");
    expect(calls).toBe(1);
    expect((await getJob(job.id))!.retry_count).toBe(0);
  });
});

describe("harness/run-store: acceptance + epoch round-trip", () => {
  test("createRun persists and deserializes acceptance criteria and epoch", async () => {
    const epoch = buildRunEpoch({ provider: "anthropic", model: "claude-x", appVersion: "1.2.3", toolNames: ["search", "exec"] });
    const run = await createRun({
      thread_id: "t1",
      agent_id: "a1",
      user_id: "u1",
      channel: null,
      kind: "goal",
      max_iterations: 20,
      acceptance: [
        { id: "c1", description: "responds in Spanish" },
        { id: "c2", description: "calls the search tool", checkTool: "search" },
      ],
      epoch,
    });

    const acceptance = deserializeAcceptance(run);
    expect(acceptance).not.toBeNull();
    expect(acceptance!.length).toBe(2);
    expect(acceptance![1].checkTool).toBe("search");
    expect(deserializeEpoch(run)).toEqual(epoch);
  });
});

describe("harness/proof-packet", () => {
  test("persists and retrieves a proof packet", async () => {
    const packet = await buildProofPacket({
      runId: "run-proof-1",
      agentId: "a1",
      intendedOutcome: "send the weekly report",
      met: true,
      checksRun: ["llm_verifier"],
      evidence: ["report sent"],
    });
    expect(packet.met).toBe(true);
    const found = await findProofPacketsByRun("run-proof-1");
    expect(found.length).toBe(1);
    expect(found[0].id).toBe(packet.id);
  });
});

describe("harness/goal-verifier: deterministic check-tool path (no LLM)", () => {
  test("a single boolean-returning check tool is interpreted directly", async () => {
    const verdict = await verifyGoal({
      goal: "workspace exists",
      checkTool: "check_workspace",
      messages: [],
      providerCfg: { provider: "anthropic", model: "x", apiKey: "unused" },
      runCheckTool: async () => true,
    });
    expect(verdict.met).toBe(true);
  });

  test("acceptance criteria aggregate as a conjunction across check tools", async () => {
    const verdict = await verifyGoal({
      goal: "onboard client",
      messages: [],
      providerCfg: { provider: "anthropic", model: "x", apiKey: "unused" },
      runCheckTool: async (tool) => (tool === "check_a" ? true : { met: false, reason: "email not sent" }),
      acceptance: [
        { id: "c1", description: "workspace created", checkTool: "check_a" },
        { id: "c2", description: "welcome email sent", checkTool: "check_b" },
      ],
    });
    expect(verdict.met).toBe(false);
    expect(verdict.acceptanceResults).toHaveLength(2);
    expect(verdict.acceptanceResults![0].met).toBe(true);
    expect(verdict.acceptanceResults![1].met).toBe(false);
  });
});
