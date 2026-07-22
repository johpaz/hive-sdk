/**
 * Document shapes for the harness's HiveDB collections. Ported from `hive`'s
 * durable-task harness, generalized for SDK consumers: `JobDoc.type` and
 * `HarnessRunDoc.kind` are plain strings (not a fixed union) so a host app
 * (hive-cloud, a custom hive-sdk app, etc.) can define its own job/run
 * vocabulary and register executors for it via `registerExecutor()`.
 */

export interface HarnessRunDoc {
  id: string
  thread_id: string
  agent_id: string
  user_id: string
  channel: string | null
  /** Host-defined run kind, e.g. "chat" | "worker" | "goal". */
  kind: string
  status: "running" | "completed" | "failed" | "interrupted" | "aborted"

  iterations_used: number
  max_iterations: number
  turns_used: number
  max_turns: number | null
  tokens_used: number
  max_tokens: number | null

  goal: string | null
  goal_check_tool: string | null
  goal_attempts: number

  state_json: string
  state_bytes: number
  pending_tool_calls_json: string | null
  checkpointed_at: number

  boot_id: string
  lease_expires_at: number
  resume_policy: "resume" | "mark_interrupted" | "discard"

  /** Whole-job acceptance criteria (harness-engineering "proof" concept): JSON array of AcceptanceCriterion. */
  acceptance_json: string | null
  /** Fixed-worker epoch recorded at run creation: RunEpoch JSON. */
  epoch_json: string | null

  error: string | null
  created_at: number
  updated_at: number
  finished_at: number | null
}

export interface JobDoc {
  id: string
  lane: string
  /** Host-defined job type, e.g. "chat_turn" | "worker_task" | "goal_run". */
  type: string
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "interrupted"
  priority: number
  payload_json: string
  run_id: string
  attempts: number
  max_attempts: number
  not_before: number
  boot_id: string | null
  lease_expires_at: number | null
  result_json: string | null
  error: string | null
  created_at: number
  started_at: number | null
  finished_at: number | null
  /** Logical-failure retries (executor returned {ok:false, retryable:true}). Separate from `attempts` (crash/lease-expiry only). */
  retry_count: number
  /** Error from the most recent logical-failure retry; `error` stays null until the job is terminal. */
  last_error: string | null
  /** `toIndexable`-encoded — sentinel when unset. Client-supplied dedup key for job creation. */
  idempotency_key: string
}

/**
 * Compressed evidence artifact for a completed run — the "proof packet"
 * concept from harness-engineering's proof/verification practice: what was
 * intended, what was checked, what evidence backs the verdict, known limits.
 */
export interface ProofPacketDoc {
  id: string
  run_id: string
  agent_id: string
  intended_outcome: string
  /** Per-acceptance-criterion verdicts: [{id, description, met, evidence}]. */
  acceptance_results_json: string
  /** Names of checks executed (tool ids, LLM verifier, etc). */
  checks_run_json: string
  /** Free-form evidence snippets backing the verdict (tool outputs, verifier reasons). */
  evidence_json: string
  known_limits: string | null
  /** Fixed-worker epoch this run executed under — copied from HarnessRunDoc.epoch_json. */
  epoch_json: string | null
  met: boolean
  created_at: number
}
