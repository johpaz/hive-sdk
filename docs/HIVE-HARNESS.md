# Hive Harness — durable task execution

The `harness` module (`@johpaz/hive-sdk/harness`) is the SDK's durable-execution
layer: a HiveDB-backed job queue with crash recovery, checkpointable runs,
retry with backoff, idempotent submission, goal verification, and proof
packets. It's what lets a host app (a `hive-app`, or a production service like
Hive Cloud) survive a process restart mid-task without losing work or
double-executing a tool call.

It is deliberately **not** wired into the agent loop automatically, and it has
no built-in notion of "chat" vs "project task" vs any other app-specific job
type — job `type` and run `kind` are plain strings. The host app defines its
own vocabulary and registers executors for it. This is the same infrastructure
that powers `hive`'s durable-queue harness, generalized so any SDK consumer
can reuse it instead of re-implementing crash-safe job execution from scratch.

## Architecture

| Piece | File | Responsibility |
|---|---|---|
| `JobDoc` / `HarnessRunDoc` / `ProofPacketDoc` | `collections.ts` | HiveDB document shapes |
| `db-helpers` | `db-helpers.ts` | `nextId`, `updateDoc`, `findByAny` — primitives HiveDB's `Collection` doesn't provide directly |
| `job-store` | `job-store.ts` | Durable job persistence: claim/lease/complete/fail/retry, all via OCC |
| `run-store` | `run-store.ts` | Checkpoint + lease for a single durable run (messages, iteration/token counters, pending tool calls) |
| `durable-queue` | `durable-queue.ts` | `DurableLaneQueue` — FIFO+priority per lane, global concurrency cap, executor registry |
| `goal-verifier` | `goal-verifier.ts` | `verifyGoal()` — deterministic check tool or LLM verifier, single goal or a list of acceptance criteria |
| `run-epoch` | `run-epoch.ts` | Fixed-worker epoch fingerprint (provider/model/app-version/tool-catalog) |
| `proof-packet` | `proof-packet.ts` | Compressed evidence artifact for a completed run |
| `reconcile` | `reconcile.ts` | `reconcileOnBoot()` — crash repair + retention cap, call once at startup |

## Durable queue semantics

- **Lanes**: a lane (e.g. a session id, or `task:<id>`) runs at most one job
  at a time, FIFO within the lane, ordered by `priority` then creation order.
- **Global concurrency**: `maxGlobalConcurrency` caps how many jobs run at
  once across all lanes (default 4). Types listed in `nonRetryableTypes`
  (default `["chat_turn"]`) bypass this cap — a busy batch of background jobs
  must not make an interactive/user-facing job type stop responding.
- **Leases**: a claimed job gets a lease (default 30 min); the queue renews
  it every 30s while executing. A lease that expires (crashed process) is
  reclaimed to `pending` or marked `interrupted` once `attempts >=
  max_attempts` — checked by `reconcileOnBoot()` at startup and by the
  queue's periodic maintenance tick thereafter.
- **Executors**: register one per job type with `registerExecutor(type, fn)`.
  An executor receives the `JobDoc`, an `AbortSignal` (fired on cancel or
  `taskTimeoutMs`), and any live callbacks passed to `enqueue()`.

## Retry & backoff

Two independent retry mechanisms:

1. **Crash retries** (`attempts` / `max_attempts`) — bumped on every claim,
   checked by `reclaimOrInterrupt` after a lease expires. This is about
   *the process dying*, not the job failing logically.
2. **Logical-failure retries** (`retry_count` / `JobRetryPolicy`) — when an
   executor returns `{ok: false, retryable: true}` (the default unless set
   `false`), `failJobOrRetry` reschedules the job with exponential backoff +
   jitter instead of failing it immediately:

   ```ts
   delay = min(maxDelayMs, initialDelayMs * backoffMultiplier ** retryCount)
         * (1 + jitter * random())
   ```

   Once `retryCount >= policy.maxRetries`, the job fails terminally. Types in
   `nonRetryableTypes` never take this path — a failed interactive turn
   should surface to the user immediately, not silently retry later.

## Idempotency

`createJob`/`enqueue` accept an optional `idempotency_key`. A repeated key
returns the existing job (whatever its status — pending, running, completed,
or terminally failed) instead of creating a duplicate, so a retried HTTP
request from a caller doesn't double-enqueue work.

## Goal verification & acceptance criteria

`verifyGoal()` answers "was this met" for a single goal or — when
`acceptance` criteria are supplied — for each criterion independently (its
own optional `checkTool`, or an LLM judgment against its own description).
The overall verdict is the conjunction of all criteria. The harness has no
built-in tool registry: pass a `runCheckTool` callback that resolves a
`checkTool` name to something the host app can actually execute.

## Proof packets

`buildProofPacket()` persists a compressed evidence artifact once a run
finishes: intended outcome, per-criterion results, checks run, evidence
snippets, known limits, and the run's fixed-worker epoch. Useful as an
audit trail without having to replay the full run transcript.

## Setup

```ts
import {
  ensureHarnessIndexes,
  reconcileOnBoot,
  initDurableQueue,
  registerExecutor,
  getBootId,
} from "@johpaz/hive-sdk/harness";

await ensureHarnessIndexes();     // idempotent — safe every boot
await reconcileOnBoot(getBootId());

registerExecutor("my_job_type", async (job, signal) => {
  // ... do the work, honoring `signal` for cancellation/timeout
  return { ok: true, result: "done" };
});

const queue = initDurableQueue({ maxGlobalConcurrency: 4 });
await queue.enqueue({ lane: "session-1", type: "my_job_type", run_id: "r1", payload: {} });
```
