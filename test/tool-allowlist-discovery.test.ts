/**
 * La lista blanca de tools tiene que valer también para el descubrimiento.
 *
 * Regresión de un hueco real: `compileContext` sólo recortaba `allTools` cuando
 * el agente era de catálogo (`source === "catalog"`). Un agente creado por el
 * usuario —que es lo que define un host multi-tenant— quedaba sin límite: el
 * loadout inicial se veía restringido, pero `search_knowledge` busca contra el
 * índice completo y agent-loop.ts inyecta lo que encuentre resolviéndolo contra
 * `ctx.allTools`, así que la tool restringida terminaba siendo llamable igual.
 *
 * `allTools` es la superficie que decide qué se puede inyectar: si la tool no
 * está ahí, se puede encontrar en el índice pero no cargar ni ejecutar.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import { resetBootId } from "../packages/core/src/storage/boot-id";
import { col, toIndexable } from "../packages/core/src/storage/hive";
import { compileContext } from "../packages/core/src/agent/context-compiler";
import type { AgentDoc, ModelDoc, ProviderDoc, UserDoc } from "../packages/core/src/storage/collections";

/** Una tool nativa potente que un agente restringido no debería poder alcanzar. */
const RESTRICTED_TOOL = "api_request";
const ALLOWED_TOOL = "search_knowledge";

async function seedBase() {
  const usersCol = await col<UserDoc>("users");
  await usersCol.put("u1", {
    id: "u1", name: "U", language: "es", timezone: null, occupation: null,
    notes: null, master_key_hash: null, email: null, password_hash: null,
    preferred_cron_channel: "webchat", created_at: Date.now(),
  });

  const providersCol = await col<ProviderDoc>("providers");
  await providersCol.put("hiveagents", {
    id: "hiveagents", name: "HiveAgents", enabled: true, active: true,
    base_url: "https://fake.api.com/v1", category: "llm",
    num_ctx: null, num_gpu: 0, created_at: Date.now(),
  });

  const modelsCol = await col<ModelDoc>("models");
  await modelsCol.put("test-model", {
    id: "test-model", provider_id: "hiveagents", name: "Test Model",
    model_type: "llm", active: true, enabled: true,
    context_window: 100000, capabilities: null,
  });
}

/** Un agente `source: "user"` — no de catálogo — con la lista blanca que se le declare. */
async function seedUserAgent(id: string, toolsJson: string | null) {
  const agentsCol = await col<AgentDoc>("agents");
  await agentsCol.put(id, {
    id, user_id: "u1", name: id, description: null,
    system_prompt: "Agente de prueba.", tone: null,
    role: "worker", status: "idle", enabled: true,
    provider_id: toIndexable("hiveagents"), model_id: toIndexable("test-model"),
    tools_json: toolsJson, skills_json: null, parent_id: toIndexable(null),
    max_iterations: 10, workspace: null, lastTraceAt: null,
    source: "user",
    created_at: Date.now(), updated_at: Date.now(),
  } as AgentDoc);
}

beforeEach(async () => {
  closeHiveDb();
  resetBootId();
  await ensureHiveDb();
  await seedBase();
});

afterEach(() => {
  closeHiveDb();
});

describe("lista blanca de tools y descubrimiento dinámico", () => {
  test("un agente de usuario con lista blanca no puede resolver una tool fuera de ella", async () => {
    await seedUserAgent("restringido", JSON.stringify([ALLOWED_TOOL]));

    const ctx = await compileContext({
      agentId: "restringido",
      threadId: "u1/webchat/c1",
      userMessage: "hola",
    });

    const reachable = ctx.allTools.map((t) => t.name);
    expect(reachable).toContain(ALLOWED_TOOL);
    // Esta es la regresión: antes `api_request` seguía en allTools y
    // search_knowledge podía inyectarla pese a la lista blanca.
    expect(reachable).not.toContain(RESTRICTED_TOOL);
  });

  test("la tool restringida tampoco llega al loadout inicial", async () => {
    await seedUserAgent("restringido", JSON.stringify([ALLOWED_TOOL]));

    const ctx = await compileContext({
      agentId: "restringido",
      threadId: "u1/webchat/c1",
      userMessage: "hola",
    });

    const loadout = ctx.tools.map((t) => t.function.name);
    expect(loadout).not.toContain(RESTRICTED_TOOL);
  });

  test("un agente sin lista blanca conserva el descubrimiento abierto", async () => {
    await seedUserAgent("abierto", null);

    const ctx = await compileContext({
      agentId: "abierto",
      threadId: "u1/webchat/c2",
      userMessage: "hola",
    });

    const reachable = ctx.allTools.map((t) => t.name);
    expect(reachable).toContain(RESTRICTED_TOOL);
  });

  test("una lista blanca vacía no deja ninguna tool nativa alcanzable", async () => {
    await seedUserAgent("sin-tools", JSON.stringify([]));

    const ctx = await compileContext({
      agentId: "sin-tools",
      threadId: "u1/webchat/c3",
      userMessage: "hola",
    });

    expect(ctx.allTools.map((t) => t.name)).not.toContain(RESTRICTED_TOOL);
    expect(ctx.allTools.map((t) => t.name)).not.toContain(ALLOWED_TOOL);
  });
});
