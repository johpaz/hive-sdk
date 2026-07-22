/**
 * Hive Harness — durable task execution for the Hive Agent SDK.
 *
 * A generic (non-hive-app-specific) durable job queue + checkpointable run
 * store, backed by HiveDB: retry/backoff on logical failure, lease-based
 * crash recovery, idempotent job submission, goal verification, and proof
 * packets. See docs/HIVE-HARNESS.md for the full write-up.
 *
 * This module does not wire itself into `AgentRunner` automatically — the
 * host app decides what "durable" means for its own job types and registers
 * executors accordingly via `registerExecutor()`.
 */

import { ensureJobStoreIndexes } from "./job-store";
import { ensureRunStoreIndexes } from "./run-store";
import { ensureProofPacketIndexes } from "./proof-packet";

export * from "./collections";
export * from "./job-store";
export * from "./run-store";
export * from "./durable-queue";
export * from "./goal-verifier";
export * from "./run-epoch";
export * from "./proof-packet";
export * from "./reconcile";
export { getBootId, resetBootId } from "./boot-id";
export { col, nextId, updateDoc, findByAny, toIndexable, fromIndexable, NO_PARENT } from "./db-helpers";

/** Create the equality indexes the harness collections need. Idempotent — safe to call on every boot. */
export async function ensureHarnessIndexes(): Promise<void> {
  await ensureJobStoreIndexes();
  await ensureRunStoreIndexes();
  await ensureProofPacketIndexes();
}
