/** Optional decision plane. Jev is never used through the chat completions API. */
import { col } from "../storage/hive.ts"
import type { ProviderDoc } from "../storage/collections.ts"
import { loadDurableProviderApiKey, loadProviderApiKey } from "../storage/crypto.ts"
import { recordJevDecision, recordUsage } from "../storage/usage.ts"
import { catalogModelKey } from "../storage/model-id.ts"
import { currentTenant } from "../storage/tenant.ts"
import { logger } from "../utils/logger.ts"
import { emitCanvas, type CanvasJevDecision } from "../canvas/emitter.ts"

const log = logger.child("jev-decisions")
export const JEV_MODEL = "typesafe/jev-1.13"
const ENDPOINT = "https://openrouter.ai/api/alpha/decisions"
const TIMEOUT_MS = 3000
const COOLDOWN_MS = 60_000
/** Where the user turns an MCP server on, when the host does not say otherwise. */
export const DEFAULT_JEV_MCP_SETTINGS_PATH = "Ajustes → Entorno → MCP Servers"
let decisionSequence = 0

/**
 * How a caller controls Jev for one run.
 *
 * - `{ apiKey }`: use this OpenRouter key. A multi-tenant host resolves its
 *   tenant's key and passes it here, exactly like `credentials`.
 *   `mcpSettingsPath` names where that host's users turn an MCP server on.
 * - `false`: Jev is off for this run; nothing is sent to OpenRouter.
 * - `undefined`: the `openrouter` provider row of the current tenant decides.
 */
export type JevOption = { apiKey: string; mcpSettingsPath?: string } | false

/**
 * Failure and cooldown bookkeeping, per tenant: one tenant's invalid key must
 * not put every other tenant in the same process into fallback.
 */
interface JevTenantState {
  failures: number
  cooldownUntil: number
  lastError: string | null
  lastSuccessAt: number | null
  /** Since process start; the office shows them as the oracle's running contribution. */
  totals: { decisions: number; savedTokens: number; costUsd: number }
}

const states = new Map<string, JevTenantState>()

function tenantState(): JevTenantState {
  const key = currentTenant() ?? "default"
  let state = states.get(key)
  if (!state) {
    state = { failures: 0, cooldownUntil: 0, lastError: null, lastSuccessAt: null, totals: { decisions: 0, savedTokens: 0, costUsd: 0 } }
    states.set(key, state)
  }
  return state
}

export type JevQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }

export type JevAnswer =
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "noul"; noul: number }

export interface JevResult {
  answers: Record<string, JevAnswer>
  inputTokens: number
  costUsd: number
  latencyMs: number
}

/**
 * The OpenRouter key Jev would use, or null when Jev is off.
 *
 * With a tenant in scope the key comes only from that tenant's `secrets`
 * partition — never from `OPENROUTER_API_KEY`, which is the platform's, nor
 * from the process-wide secret cache, which is not partitioned.
 */
export async function getJevKey(option?: JevOption): Promise<string | null> {
  if (option === false) return null
  if (option) return option.apiKey || null
  const provider = await (await col<ProviderDoc>("providers")).get("openrouter")
  if (!provider?.doc.enabled || !provider.doc.active) return null
  if (currentTenant()) return (await loadDurableProviderApiKey("openrouter")) || null
  return (await loadProviderApiKey("openrouter")) || process.env.OPENROUTER_API_KEY || null
}

export interface JevStatus {
  state: "off" | "ready" | "fallback"
  lastError: string | null
  lastSuccessAt: number | null
  totals: { decisions: number; savedTokens: number; costUsd: number }
}

export async function getJevStatus(option?: JevOption): Promise<JevStatus> {
  const key = await getJevKey(option).catch(() => null)
  const state = tenantState()
  return {
    state: !key ? "off" : Date.now() < state.cooldownUntil || state.lastError ? "fallback" : "ready",
    lastError: key ? state.lastError : null,
    lastSuccessAt: key ? state.lastSuccessAt : null,
    totals: { ...state.totals },
  }
}

function broadcastStatus(option?: JevOption): void {
  getJevStatus(option).then(status => emitCanvas("canvas:jev_status", status)).catch(() => { /* best effort */ })
}

/**
 * Publishes a served decision to the office and persists it for the dashboard.
 * Callers estimate savings; Jev itself only answers questions. `provider`/`model`
 * are the advised agent's main model, used to price the avoided tokens.
 * Returns the published event so the caller can forward it to its own host.
 */
export function emitJevDecision({ provider, model, ...decision }: Omit<CanvasJevDecision, "eventId" | "totals"> & { provider: string; model: string }): CanvasJevDecision {
  recordJevDecision({ agentId: decision.agentId, provider, model, savedTokens: decision.savedTokens, costUsd: decision.costUsd })
  const { totals } = tenantState()
  totals.decisions++
  totals.savedTokens += decision.savedTokens
  totals.costUsd += decision.costUsd
  const event = {
    ...decision,
    eventId: `jev:${Date.now().toString(36)}:${++decisionSequence}`,
    summary: decision.summary.slice(0, 160),
    totals: { ...totals },
  } satisfies CanvasJevDecision
  emitCanvas("canvas:jev_decision", event)
  return event
}

/** Clears the current tenant's failure state (after its key changed, for instance). */
export function resetJevStatus(option?: JevOption): void {
  const state = tenantState()
  state.failures = 0
  state.cooldownUntil = 0
  state.lastError = null
  state.lastSuccessAt = null
  broadcastStatus(option)
}

export async function askJev(
  state: unknown,
  questions: Record<string, JevQuestion>,
  options: { fetcher?: typeof fetch; signal?: AbortSignal; jev?: JevOption } = {},
): Promise<JevResult | null> {
  const key = await getJevKey(options.jev).catch(() => null)
  const tenant = tenantState()
  if (!key || Date.now() < tenant.cooldownUntil || Object.keys(questions).length === 0) return null
  const started = performance.now()
  try {
    const response = await (options.fetcher ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: JEV_MODEL, state, questions }),
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) tenant.cooldownUntil = Date.now() + COOLDOWN_MS
      throw new Error(`OpenRouter HTTP ${response.status}`)
    }
    const data = await response.json() as {
      answers?: Record<string, JevAnswer>
      usage?: { input_tokens?: number; output_tokens?: number; cost?: number }
    }
    const answers: Record<string, JevAnswer> = {}
    for (const [name, question] of Object.entries(questions)) {
      const answer = data.answers?.[name]
      if (question.type === "choice") {
        if (answer?.type !== "choice" || !Object.hasOwn(question.criteria, answer.choice) ||
          !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) {
          throw new Error(`Invalid choice answer: ${name}`)
        }
      } else if (answer?.type !== "noul" || !Number.isFinite(answer.noul) || answer.noul < 0 || answer.noul > 1) {
        throw new Error(`Invalid noul answer: ${name}`)
      }
      answers[name] = answer
    }
    const recovered = tenant.lastError !== null
    tenant.failures = 0
    tenant.lastError = null
    tenant.lastSuccessAt = Date.now()
    if (recovered) broadcastStatus(options.jev)
    const inputTokens = data.usage?.input_tokens ?? 0
    const costUsd = data.usage?.cost ?? inputTokens * 0.042 / 1_000_000
    log.info(`Decision served: questions=${Object.keys(questions).join(",")} latency_ms=${Math.round(performance.now() - started)} input_tokens=${inputTokens} cost_usd=${costUsd}`)
    if (inputTokens > 0) {
      recordUsage({ provider: "openrouter", model: catalogModelKey("openrouter", JEV_MODEL), inputTokens, outputTokens: data.usage?.output_tokens ?? 0, latencyMs: Math.round(performance.now() - started) })
    }
    return { answers, inputTokens, costUsd, latencyMs: Math.round(performance.now() - started) }
  } catch (error) {
    if (options.signal?.aborted) return null
    tenant.failures++
    tenant.lastError = error instanceof Error ? error.message : "Jev unavailable"
    if (tenant.failures >= 3) tenant.cooldownUntil = Date.now() + COOLDOWN_MS
    log.warn(`Decision fallback: ${tenant.lastError}`)
    broadcastStatus(options.jev)
    return null
  }
}
