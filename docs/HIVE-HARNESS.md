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

`@johpaz/hive-sdk/harness` is a **barrel, not a directory**: until 0.1.5 it
carried its own copies of the job store, run store and reconcile helpers, in
parallel with the ones in `storage/` and `agent/`. Two job stores over the same
HiveDB collections is one thing with two possible states, so the duplicates were
removed and the subpath now re-exports the single implementation. The paths below
are where each piece actually lives, relative to `packages/core/src/`.

| Piece | File | Responsibility |
|---|---|---|
| `JobDoc` / `AgentRunDoc` / `ProofPacketDoc` | `storage/collections.ts` | HiveDB document shapes |
| collection helpers | `storage/hive.ts` | `nextId`, `updateDoc`, `findByAny`, `col` — primitives HiveDB's `Collection` doesn't provide directly |
| `job-store` | `gateway/job-store.ts` | Durable job persistence: claim/lease/complete/fail/retry, all via OCC |
| `run-store` | `agent/run-store.ts` | Checkpoint + lease for a single durable run (messages, iteration/token counters, pending tool calls) |
| `durable-queue` | `gateway/durable-queue.ts` | `DurableLaneQueue` — FIFO+priority per lane, global concurrency cap, executor registry |
| `goal-runner` | `agent/goal-runner.ts` | `runGoal()` / `verifyGoal()` — deterministic check tool or LLM verifier, single goal or a list of acceptance criteria |
| `run-epoch` | `agent/run-epoch.ts` | Fixed-worker epoch fingerprint (provider/model/app-version/tool-catalog) |
| `proof-packet` | `agent/proof-packet.ts` | Compressed evidence artifact for a completed run |
| `boot-id` | `storage/boot-id.ts` | `getBootId()` — identifies this process run, so a crash is distinguishable from a restart |
| `reconcile` | `storage/reconcile.ts` | `reconcileOnBoot()` — crash repair + retention cap, call once at startup |

`test/harness-barrel.test.ts` pins this contract: the subpath must keep exporting
the same names, pointing at the single implementation rather than at copies.

## Ready-made executors

The queue knows how to enqueue, retry and recover after a crash — but not how to
*do* anything. Registering executors used to be entirely on whoever built on the
SDK, and that is ~420 lines of wiring (epoch, proof packets, acceptance checks,
delegation fan-in) before running a single durable swarm.

Two now ship with the SDK:

```typescript
import { initHarnessExecutors, registerExecutor } from "@johpaz/hive-sdk/harness";

initHarnessExecutors();   // worker_task + goal_run
```

- **`worker_task`** — runs a delegated worker in an isolated context, verifies
  its acceptance criteria, builds the proof packet and notifies the agent bus.
- **`goal_run`** — orchestrates multiple turns against a goal until it verifies
  or the budget runs out.

**`chat_turn` is deliberately absent.** What a "channel" is and how a token is
streamed is the application's decision — in hive it depends on its HTTP server.
Register your own:

```typescript
registerExecutor("chat_turn", async (job, signal, callbacks) => { /* ... */ });
```

Registering stays opt-in: `initHarnessExecutors()` is never called for you,
because which job types this process executes is the app's call. Use
`getRegisteredExecutorTypes()` to check what got wired — a job enqueued without
an executor fails when it is claimed, not when it is enqueued, which is far from
where the mistake is.

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

## API reference

Everything below is exported from `@johpaz/hive-sdk/harness`. Grouped by what
you reach for, not alphabetically.

### Wiring it up

| | |
|---|---|
| `ensureHarnessIndexes()` | Creates the indexes the collections need. Idempotent, safe on every boot. |
| `reconcileOnBoot(bootId)` | Crash repair: reclaims leases from a previous process and interrupts what cannot resume. Call once at startup, before the queue. |
| `getBootId()` / `resetBootId()` | Identifies this process run, which is what distinguishes a crash from a restart. |
| `initDurableQueue(opts)` / `getDurableQueue()` | The queue itself. |
| `initHarnessExecutors()` | Registers the bundled `worker_task` and `goal_run`. |
| `registerExecutor(type, fn)` | Your own job types. |
| `getRegisteredExecutorTypes()` | What this process can actually execute — a job enqueued without an executor fails when claimed, not when enqueued. |
| `setHarnessExecutorMCPManager(m)` | MCP tools for delegated workers. Optional: a swarm without MCP is valid. |
| `registerTerminalHook(fn)` / `runTerminalHook(job, outcome)` | Runs when a job reaches a terminal state, however it got there. |

### Jobs

`createJob` · `getJob` · `claimJob` · `renewLease` · `completeJob` · `failJob` ·
`failJobOrRetry` · `cancelJob` · `reclaimOrInterrupt`

Queries: `findPendingJobsByLane` · `findAllPendingJobs` · `findExpiredLeases` ·
`findByIdempotencyKey`

Retry policy: `loadJobRetryPolicy` · `computeBackoffDelay` — see
[Retry & backoff](#retry--backoff) for why crash-retries and logical-failure
retries are counted separately.

### Runs

A *run* is one durable execution of an agent: its messages, its counters and its
lease.

`createRun` · `getRun` · `checkpoint` · `bumpTurn` · `completeRun` · `failRun` ·
`interruptRun` · `reclaimRun`

Queries: `findRunsByThread` · `findRunsByStatus` · `findExpiredRuns`

Leases: `startLeaseRenewal` · `stopLeaseRenewal` · `stopAllLeaseRenewals` — a run
that stops renewing is treated as dead and reclaimed, which is what makes crash
recovery work.

Reading back a checkpoint: `deserializeCheckpoint` · `deserializeAcceptance` ·
`deserializeEpoch`

### Epoch

`buildRunEpoch` fingerprints provider, model, app version and tool catalog. A run
resumed under a different epoch is not the same run — the model or the tools
changed underneath it — and the harness will not silently continue it.

### Goals and proof

`runGoal` · `verifyGoal` · `interpretCheckResult` · `buildProofPacket` ·
`findProofPacketsByRun`

### Collection primitives

`col` · `nextId` · `updateDoc` · `findByAny` · `toIndexable` · `fromIndexable` ·
`NO_PARENT`

Re-exported for convenience: the harness stores everything in HiveDB, and a
consumer that needs a query the helpers above do not cover can write it without
importing from a second subpath.

### Document shapes

`JobDoc` · `AgentRunDoc` · `ProofPacketDoc`

*Documentación Hive SDK — ver `version` en package.json*
