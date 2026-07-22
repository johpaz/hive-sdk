/**
 * Proof packets — compressed evidence artifact for a completed run
 * (harness-engineering "proof" practice): what was intended, what was
 * checked, what evidence backs the verdict, and known limits. Written once
 * per run so a reviewer doesn't have to replay the whole run to trust its
 * outcome.
 */

import { col, nextId } from "./db-helpers";
import type { ProofPacketDoc } from "./collections";
import type { AcceptanceResult } from "./goal-verifier";
import type { RunEpoch } from "./run-epoch";
import { logger } from "../utils/logger";

const log = logger.child("harness:proof-packet");

const COLLECTION = "harness_proofPackets";

export interface BuildProofPacketInput {
  runId: string;
  agentId: string;
  intendedOutcome: string;
  met: boolean;
  /** Per-criterion verdicts when acceptance criteria were set; falls back to a single-entry summary otherwise. */
  acceptanceResults?: AcceptanceResult[];
  checksRun: string[];
  evidence: string[];
  knownLimits?: string | null;
  epoch?: RunEpoch | null;
}

export async function buildProofPacket(input: BuildProofPacketInput): Promise<ProofPacketDoc> {
  const id = await nextId(COLLECTION);
  const acceptanceResults: AcceptanceResult[] =
    input.acceptanceResults ?? [{ id: "goal", description: input.intendedOutcome, met: input.met, evidence: input.evidence.join("; ") || "n/a" }];

  const doc: ProofPacketDoc = {
    id,
    run_id: input.runId,
    agent_id: input.agentId,
    intended_outcome: input.intendedOutcome,
    acceptance_results_json: JSON.stringify(acceptanceResults),
    checks_run_json: JSON.stringify(input.checksRun),
    evidence_json: JSON.stringify(input.evidence),
    known_limits: input.knownLimits ?? null,
    epoch_json: input.epoch ? JSON.stringify(input.epoch) : null,
    met: input.met,
    created_at: Date.now(),
  };

  const c = await col<ProofPacketDoc>(COLLECTION);
  await c.put(id, doc, { expectedVersion: 0 });
  log.info(`[buildProofPacket] Packet ${id} written for run ${input.runId} (met=${input.met})`);
  return doc;
}

export async function findProofPacketsByRun(runId: string): Promise<ProofPacketDoc[]> {
  const c = await col<ProofPacketDoc>(COLLECTION);
  const entries = await c.findBy("run_id", runId);
  return entries.map((e) => e.doc);
}

export async function ensureProofPacketIndexes(): Promise<void> {
  const c = await col<ProofPacketDoc>(COLLECTION);
  await c.createIndex("run_id");
  await c.createIndex("agent_id");
}

export { COLLECTION as PROOF_PACKETS_COLLECTION };
