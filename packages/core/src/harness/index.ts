/**
 * Hive Harness — ejecución durable de tareas.
 *
 * Cola de jobs con retry/backoff, recuperación por lease tras un crash, envío
 * idempotente, verificación de objetivos y proof packets. Ver docs/HIVE-HARNESS.md.
 *
 * **Esto es un barrel, no una implementación.** Hasta 0.1.5 `harness/` tenía su
 * propia copia de `db-helpers`, `boot-id`, `reconcile`, `collections`, `run-store`,
 * `run-epoch` y `proof-packet`, en paralelo con las de `storage/` y `agent/`. Dos
 * almacenes de jobs sobre las mismas colecciones de HiveDB son una sola cosa con
 * dos estados posibles, así que ahora esto re-exporta la implementación única y el
 * subpath `@johpaz/hive-sdk/harness` sigue funcionando igual.
 *
 * El módulo no se cablea solo dentro del agent loop: la app decide qué significa
 * "durable" para sus tipos de job y registra ejecutores con `registerExecutor()`.
 */

import { ensureHiveDb } from "../storage/bootstrap.ts";

// ─── Cola y almacén de jobs ──────────────────────────────────────────────────
export * from "../gateway/job-store.ts";
export * from "../gateway/durable-queue.ts";

// ─── Runs: checkpoint, lease, epoch, proof ───────────────────────────────────
export * from "../agent/run-store.ts";
export * from "../agent/run-epoch.ts";
export * from "../agent/proof-packet.ts";

// ─── Verificación de objetivos ───────────────────────────────────────────────
export { runGoal, verifyGoal, interpretCheckResult } from "../agent/goal-runner.ts";
export type { AcceptanceResult, GoalRunOptions, GoalRunResult } from "../agent/goal-runner.ts";

// ─── Durabilidad entre arranques ─────────────────────────────────────────────
export { getBootId, resetBootId } from "../storage/boot-id.ts";
export { reconcileOnBoot } from "../storage/reconcile.ts";
export type { ReconcileResult } from "../storage/reconcile.ts";

// ─── Shapes ──────────────────────────────────────────────────────────────────
export type { JobDoc, AgentRunDoc, ProofPacketDoc } from "../storage/collections.ts";

// ─── Primitivas de colección ─────────────────────────────────────────────────
export { col, nextId, updateDoc, findByAny, toIndexable, fromIndexable, NO_PARENT } from "../storage/hive.ts";

/**
 * Crea los índices que necesitan las colecciones del harness.
 *
 * Los índices ahora se declaran en un solo lugar (`INDEXES` en storage/bootstrap.ts)
 * y los crea `ensureHiveDb()`. Se mantiene la función porque era pública; es
 * idempotente y llamarla en cada arranque sigue siendo seguro.
 */
export async function ensureHarnessIndexes(): Promise<void> {
  await ensureHiveDb();
}
