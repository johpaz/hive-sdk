/**
 * Reusable HiveDB collection helpers for the harness module — ported from
 * `hive`'s `storage/hive.ts`. Provides the primitives HiveDB's `Collection`
 * API doesn't have directly: autoincrement ids (`nextId`), whitelisted
 * partial UPDATEs (`updateDoc`), and `WHERE field IN (...)` (`findByAny`).
 */

import { hiveCollection } from "../storage/HiveDBStorage.ts";

const MAX_RETRIES = 5;

/** Sentinel for nullable FK-like fields used in equality indexes (`findBy`/`createIndex` reject `null`). */
export const NO_PARENT = "__none__";

/** Encode a nullable FK-like value for storage in an indexed field. */
export function toIndexable(value: string | null | undefined): string {
  return value ?? NO_PARENT;
}

/** Decode a value stored via {@link toIndexable} back to its nullable form. */
export function fromIndexable(value: string): string | null {
  return value === NO_PARENT ? null : value;
}

export async function col<T>(name: string) {
  return hiveCollection<T>(name);
}

/**
 * Monotonic counter, formatted as a zero-padded string so lexicographic
 * `scan()` order matches numeric order. Retries on optimistic-concurrency
 * conflicts (another writer bumped the same counter concurrently).
 */
export async function nextId(counterName: string): Promise<string> {
  const counters = await col<{ value: number }>("harness_counters");
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const cur = await counters.get(counterName);
    const next = (cur?.doc.value ?? 0) + 1;
    try {
      await counters.put(counterName, { value: next }, { expectedVersion: cur?.version ?? 0 });
      return String(next).padStart(15, "0");
    } catch {
      // Version conflict — another writer won the race, retry.
    }
  }
  throw new Error(`nextId: too much contention on counter "${counterName}"`);
}

/**
 * Read-modify-write a document, replacing the whole-document `put()` with
 * whitelisted-field UPDATE semantics. Retries on optimistic-concurrency
 * conflicts.
 */
export async function updateDoc<T extends object>(
  collection: string,
  id: string,
  patch: Partial<T>
): Promise<T> {
  const c = await col<T>(collection);
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const existing = await c.get(id);
    if (!existing) throw new Error(`${collection}/${id} not found`);
    const merged = { ...existing.doc, ...patch };
    try {
      await c.put(id, merged, { expectedVersion: existing.version });
      return merged;
    } catch {
      // Version conflict — retry with a fresh read.
    }
  }
  throw new Error(`updateDoc: too much contention on ${collection}/${id}`);
}

/**
 * Fetch documents whose indexed `field` matches any of `values` — emulates
 * `WHERE field IN (...)`. Requires a prior `createIndex(field)`.
 */
export async function findByAny<T>(
  collection: string,
  field: string,
  values: Array<string | number | boolean>
): Promise<Array<{ id: string; version: number; doc: T }>> {
  const c = await col<T>(collection);
  const uniq = [...new Set(values)];
  const chunks = await Promise.all(uniq.map((v) => c.findBy(field, v)));
  return chunks.flat();
}
