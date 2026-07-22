/**
 * goal-verifier — verify whether a goal/acceptance-criterion has been met.
 * Ported from `hive`'s agent/goal-runner.ts#verifyGoal, decoupled from
 * `hive`'s goal-run orchestration loop (that's host-app specific — see
 * `harness/collections.ts` doc comment). This module only answers "was it
 * met", using either a caller-provided deterministic check tool or an LLM
 * verifier.
 */

import { logger } from "../utils/logger";
import { callLLM, type LLMMessage, type LLMCallOptions } from "../agent/providers/LLMClient";
import type { AcceptanceCriterion } from "./run-store";

type ProviderConfig = Pick<LLMCallOptions, "provider" | "model" | "apiKey" | "baseUrl" | "numCtx" | "numGpu">;

const log = logger.child("harness:goal-verifier");

export interface AcceptanceResult {
  id: string;
  description: string;
  met: boolean;
  evidence: string;
}

export interface GoalVerdict {
  met: boolean;
  reason: string;
  acceptanceResults?: AcceptanceResult[];
}

/**
 * Runs a caller-provided check tool and interprets its result (boolean, or
 * an object/string with a `met` field). The harness has no built-in tool
 * registry — the host app resolves `checkTool` to a callable.
 */
export type CheckToolRunner = (checkTool: string, args: { goal: string }) => Promise<unknown>;

export interface VerifyGoalOptions {
  goal: string;
  checkTool?: string | null;
  messages: LLMMessage[];
  providerCfg: ProviderConfig;
  /** Required when any criterion (or the top-level goal) specifies `checkTool`. */
  runCheckTool?: CheckToolRunner;
  acceptance?: AcceptanceCriterion[] | null;
}

/**
 * Verify whether a goal has been met using either a deterministic check
 * tool (via `runCheckTool`) or an LLM verifier. When `acceptance` criteria
 * are supplied, each is verified independently and the overall verdict is
 * the conjunction of all of them — the top-level `goal`/`checkTool` are
 * ignored in that case.
 */
export async function verifyGoal(opts: VerifyGoalOptions): Promise<GoalVerdict> {
  const { goal, checkTool, messages, providerCfg, runCheckTool, acceptance } = opts;

  if (acceptance && acceptance.length > 0) {
    const results: AcceptanceResult[] = [];
    for (const criterion of acceptance) {
      const verdict = await verifyGoal({
        goal: criterion.description,
        checkTool: criterion.checkTool,
        messages,
        providerCfg,
        runCheckTool,
      });
      results.push({ id: criterion.id, description: criterion.description, met: verdict.met, evidence: verdict.reason });
    }
    const met = results.every((r) => r.met);
    const reason = results.map((r) => `${r.met ? "✅" : "❌"} ${r.description}: ${r.evidence}`).join("\n");
    return { met, reason, acceptanceResults: results };
  }

  if (checkTool) {
    if (!runCheckTool) {
      log.warn(`[verifyGoal] Check tool "${checkTool}" requested but no runCheckTool was provided — falling back to LLM verifier`);
    } else {
      try {
        const result = await runCheckTool(checkTool, { goal });
        return interpretCheckResult(result);
      } catch (err) {
        log.warn(`[verifyGoal] Check tool "${checkTool}" failed: ${(err as Error).message}`);
        // Fall through to LLM verifier
      }
    }
  }

  try {
    const verificationMessages: LLMMessage[] = [
      ...messages,
      {
        role: "user",
        content: `Evaluá si el siguiente objetivo ha sido cumplido basándote en la conversación anterior.\n\nObjetivo: "${goal}"\n\nRespondé en JSON:\n{"met": true/false, "reason": "explicación breve"}`,
      },
    ];

    const response = await callLLM({ ...providerCfg, messages: verificationMessages, tools: undefined });

    const content = response.content?.trim() || "";
    const jsonMatch = content.match(/\{[^}]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { met: !!parsed.met, reason: parsed.reason || "No reason provided" };
    }
    return { met: false, reason: "Could not parse verification response" };
  } catch (err) {
    log.warn(`[verifyGoal] LLM verification failed: ${(err as Error).message}`);
    return { met: false, reason: `Verification error: ${(err as Error).message}` };
  }
}

/**
 * Interpret a check tool's result strictly: an object with a boolean `met`,
 * a bare boolean, or a JSON string with `met` — anything else is not met.
 */
function interpretCheckResult(raw: unknown): { met: boolean; reason: string } {
  if (typeof raw === "boolean") {
    return { met: raw, reason: raw ? "Check tool returned true" : "Check tool returned false" };
  }
  if (raw && typeof raw === "object" && "met" in (raw as Record<string, unknown>)) {
    const obj = raw as { met: unknown; reason?: unknown };
    return { met: obj.met === true, reason: typeof obj.reason === "string" ? obj.reason : `Check tool met=${obj.met === true}` };
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "true" || trimmed === "false") {
      return { met: trimmed === "true", reason: `Check tool returned "${trimmed}"` };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && "met" in parsed) {
        return { met: parsed.met === true, reason: typeof parsed.reason === "string" ? parsed.reason : `Check tool met=${parsed.met === true}` };
      }
      if (typeof parsed === "boolean") {
        return { met: parsed, reason: `Check tool returned ${parsed}` };
      }
    } catch { /* not JSON */ }
  }
  return { met: false, reason: "Check tool result had no interpretable met/true signal" };
}
