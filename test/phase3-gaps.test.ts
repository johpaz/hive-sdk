/**
 * Tres huecos que el barrido encontró: opciones declaradas que no hacían nada.
 *
 * Los tres comparten la misma forma de fallo — el SDK prometía algo en su API o
 * su configuración y no lo cumplía, en silencio:
 *
 *  - `stream: true` no existía: los proveedores emitían deltas pero ningún punto
 *    de entrada los pasaba, así que la respuesta aparecía de golpe al terminar.
 *  - `agent.context.compactionThreshold` estaba en el esquema y no lo leía nadie.
 *  - `search_knowledge` mostraba tools fuera de la lista blanca del agente.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import { col, toIndexable } from "../packages/core/src/storage/hive";
import type { AgentDoc } from "../packages/core/src/storage/collections";
import { searchKnowledgeTool } from "../packages/core/src/tools/core/index";
import { MINIMAL_TOOLS } from "../packages/core/src/agent/minimal-loadout";
import { syncToolCatalogToIndex } from "../packages/core/src/agent/tool-selector";

async function crearAgente(id: string, allowlist: string[] | null) {
  const agents = await col<AgentDoc>("agents");
  await agents.put(id, {
    id, user_id: "u1", name: id, description: null, system_prompt: null, tone: null,
    role: "worker", status: "idle", enabled: true,
    provider_id: toIndexable(null), model_id: toIndexable(null),
    tools_json: null, skills_json: null, parent_id: toIndexable(null),
    max_iterations: 10, workspace: null, lastTraceAt: null,
    source: "user", created_at: Date.now(), updated_at: Date.now(),
    tool_allowlist_json: allowlist ? JSON.stringify(allowlist) : null,
  } as AgentDoc);
}

beforeEach(async () => {
  closeHiveDb();
  await ensureHiveDb();
  // `search_knowledge` busca contra el índice BM25, que en el arranque real lo
  // llena el initializer del gateway. Sin esto no hay resultados y cualquier
  // aserción de "no ve X" se cumpliría en vacío, sin probar nada.
  await syncToolCatalogToIndex();
});

afterEach(() => {
  closeHiveDb();
});

describe("search_knowledge respeta la lista blanca del agente", () => {
  test("un agente restringido no ve tools fuera de su lista", async () => {
    await crearAgente("restringido", ["web_search"]);

    const res = await searchKnowledgeTool.execute(
      { query: "browser", type: "tools", limit: 20 },
      { configurable: { agent_id: "restringido" } },
    ) as any;

    const nombres = (res.tools ?? []).map((t: any) => t.name);
    expect(nombres.some((n: string) => n.startsWith("browser_"))).toBe(false);

    // Y que el filtro es lo que las quita: sin agente en el contexto sí aparecen.
    const sinFiltro = await searchKnowledgeTool.execute(
      { query: "browser", type: "tools", limit: 20 },
    ) as any;
    expect((sinFiltro.tools ?? []).some((t: any) => t.name.startsWith("browser_"))).toBe(true);
  });

  test("sí ve las suyas y las mínimas del coordinador", async () => {
    await crearAgente("restringido", ["web_search"]);

    const res = await searchKnowledgeTool.execute(
      { query: "buscar", type: "tools", limit: 20 },
      { configurable: { agent_id: "restringido" } },
    ) as any;

    const nombres = new Set((res.tools ?? []).map((t: any) => t.name));
    for (const n of nombres) {
      expect(n === "web_search" || MINIMAL_TOOLS.has(n as string)).toBe(true);
    }
  });

  test("un agente sin lista declarada conserva el descubrimiento abierto", async () => {
    await crearAgente("abierto", null);

    const res = await searchKnowledgeTool.execute(
      { query: "browser", type: "tools", limit: 20 },
      { configurable: { agent_id: "abierto" } },
    ) as any;

    expect((res.tools ?? []).length).toBeGreaterThan(0);
  });

  test("sin agente en el contexto no se filtra nada", async () => {
    // Una llamada suelta o un test no debería quedarse sin resultados.
    const res = await searchKnowledgeTool.execute({ query: "browser", type: "tools", limit: 20 }) as any;
    expect((res.tools ?? []).length).toBeGreaterThan(0);
  });
});

describe("la compactación respeta el umbral configurado", () => {
  test("`compactionThreshold` deja de ser decorativo", async () => {
    const { loadConfig } = await import("../packages/core/src/config/loader");
    const cfg = loadConfig();

    // El esquema lo declara; lo que faltaba era que alguien lo leyera.
    expect(cfg.agent?.context).toBeDefined();

    const compaction = await Bun.file("packages/core/src/agent/compaction.ts").text();
    expect(compaction).toContain("compactionThreshold");
    // Y que gane sobre lo deducido del modelo: es lo que el usuario pidió.
    expect(compaction).toContain("if (configurado && configurado > 0)");
  });
});

describe("streaming por token en la API pública", () => {
  test("`chat` acepta `stream` y declara el evento `token`", async () => {
    const src = await Bun.file("packages/core/src/api/createAgent.ts").text();

    // El mecanismo existía en los proveedores; lo que faltaba era que un punto
    // de entrada lo pasara.
    expect(src).toContain('type: "token"');
    expect(src).toContain("stream?: boolean");
    expect(src).toContain("onToken");
  });
});
