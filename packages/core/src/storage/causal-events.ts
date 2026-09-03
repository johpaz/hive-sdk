/**
 * Live-tail wrapper over HiveDB's G9 causal event log (subscribe()/events()).
 *
 * Read-side, separate from agent-loop.ts's write-side appendCausalEvent()
 * (module-private there, write-only). This is the read/watch counterpart,
 * co-located with the DB singleton accessor.
 */

import { getHiveDb } from "./hivedb.ts"
import { currentTenant } from "./tenant.ts"
import { loadConfig } from "../config/loader.ts"
import type { Event, EventPattern } from "@johpaz/hive-db"

export type { Event as CausalEvent, EventPattern as CausalEventPattern }

/**
 * ¿Se pueden hacer lecturas AGREGADAS del log causal en este contexto?
 *
 * `causalThread`, `buildAgentContext` y `toolStats` recorren todos los shards
 * de la base y mezclan sus resultados (`log.rs` — `read_stream_all_agents` y
 * `project::<P>()` para proyecciones con scope Agent). Sobre una base
 * compartida eso devolvería hilos y estadísticas de otros inquilinos. Mientras
 * el motor no exponga las variantes acotadas por agente, con un tenant activo
 * estas lecturas se apagan: perder una señal de reflexión es aceptable, cruzar
 * datos entre agencias no.
 *
 * La ESCRITURA (`append`) no entra aquí: va al shard del propio agente, y los
 * agentes de Hive Cloud ya llevan el enjambre en el id.
 */
export function causalReadsEnabled(): boolean {
  return !!loadConfig().causalLog?.enabled && !currentTenant()
}

/**
 * Live-tail causal events matching `pattern`. Forward-only: only events
 * appended AFTER this call resolves are delivered. hive-db's subscribe()/
 * events() are a pure in-process pub/sub (see hiveBD's reactive.rs — a
 * DashMap of subscribers, dispatched right after the durable write, with no
 * backing read of the log on subscribe) — there is no historical replay.
 * Combine with causalThread()/read(seq) if backfill is ever needed.
 *
 * Note: `pattern.kind` matches exactly one kind at a time, not an OR of
 * several — call watchCausalEvents() once per kind if you need more than one.
 *
 * Process constraint (confirmed by testing): getHiveDb() opens the database
 * exclusively — there is no shared/read-only mode, so this can only be
 * called from within the SAME process as whatever else has the DB open
 * (e.g. embedded inside the gateway). A separate process (like the `hive
 * causal watch` CLI) calling this while a `hive` gateway is already running
 * against the same DB fails fast with an "already open" error.
 */
export async function watchCausalEvents(
  pattern: EventPattern
): Promise<AsyncIterable<Event> & { close(): void }> {
  // El log de eventos no tiene colecciones que prefijar: el aislamiento entre
  // inquilinos lo da el shard por `agentId`. Un patrón sin `agentId` sobre una
  // base compartida entregaría los eventos de todos los enjambres, así que se
  // exige explícitamente en vez de filtrar a medias.
  if (currentTenant() && !pattern.agentId) {
    throw new Error(
      "watchCausalEvents: con un tenant activo el patrón debe fijar agentId; " +
        "un tail sin agente cruzaría eventos de otros inquilinos."
    )
  }
  const db = await getHiveDb()
  return db.events(pattern)
}

/** One-line human-readable summary of a causal event, keyed by its kindTag. */
export function formatCausalEvent(event: Event): string {
  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(event.payload)
  } catch {
    // Malformed payload — still print seq/kind/agent/stream below.
  }

  const streamShort = event.streamId.slice(0, 8)
  const header = `[${event.seq}] ${kindIcon(event.kindTag)} ${event.kindTag.padEnd(16)} agent=${event.agentId}  stream=${streamShort}…`

  switch (event.kindTag) {
    case "IntentLogged":
      return `${header}  "${truncate(String(payload.intent ?? ""), 120)}"`
    case "StateTransition":
      return `${header}  "${truncate(String(payload.description ?? ""), 120)}"`
    case "ToolCall": {
      const outcome = payload.outcome
      const outcomeStr =
        outcome === "Ok" ? "ok"
        : outcome === "Timeout" ? "TIMEOUT"
        : (outcome && typeof outcome === "object" && "Err" in (outcome as object))
          ? `ERR: ${(outcome as { Err: string }).Err}`
          : String(outcome)
      const latency = payload.latency_ms !== undefined ? `${payload.latency_ms}ms` : "?ms"
      return `${header}  tool=${payload.tool}  ${latency}  ${outcomeStr}`
    }
    default:
      return `${header}  ${truncate(JSON.stringify(payload), 120)}`
  }
}

function kindIcon(kindTag: string): string {
  switch (kindTag) {
    case "IntentLogged": return "🎯"
    case "StateTransition": return "🔀"
    case "ToolCall": return "🔧"
    case "LearningProposal": return "📄"
    default: return "•"
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s
}
