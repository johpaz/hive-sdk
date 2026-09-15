/**
 * Log causal (G9) sobre UNA HiveDB compartida por varios inquilinos.
 *
 * Lo que estos tests fijan como contrato:
 *  - el shard de cada evento es `causalAgentKey(agentId)`: con tenant lleva el
 *    tenant delante, así que dos inquilinos con un agente del MISMO id no se
 *    ven entre sí en `toolStats`, `causalThread`, `buildAgentContext` ni en el
 *    tail de `watchCausalEvents`;
 *  - con un tenant activo esas lecturas ya no se apagan: van acotadas;
 *  - una lista de agentes vacía no llega nunca al motor, que la trataría como
 *    "todos los shards";
 *  - sin tenant, `toolStats` también se acota a los agentes del lote;
 *  - lo que sale hacia el host (insights, formato) lleva el id crudo.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb, getHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import { resetBootId } from "../packages/core/src/storage/boot-id";
import { col, nextId, toIndexable } from "../packages/core/src/storage/hive";
import { runInTenant, tenantKeyFromId } from "../packages/core/src/storage/tenant";
import {
  causalAgentKey,
  causalScope,
  causalReadsEnabled,
  watchCausalEvents,
  formatCausalEvent,
} from "../packages/core/src/storage/causal-events";
import { runReflector } from "../packages/core/src/agent/reflector";
import { compileContext } from "../packages/core/src/agent/context-compiler";
import { addMessage, saveSummary } from "../packages/core/src/agent/conversation-store";
import type {
  AgentDoc,
  ModelDoc,
  ProviderDoc,
  ReflectionDoc,
  TraceDoc,
  UserDoc,
} from "../packages/core/src/storage/collections";

const A = tenantKeyFromId("11111111-2222-3333-4444-555555555555");
const B = tenantKeyFromId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

/** El mismo id crudo en los dos inquilinos: justo lo que un shard sin tenant mezclaba. */
const AGENT = "agent-1";

const QUALIFIED = /t_[a-z0-9]{8,48}:/;

/**
 * Entra al tenant como lo hace un host (Hive Cloud llama a ensureHiveDb dentro
 * de runInTenant): sin eso las colecciones del tenant no tienen sus índices y
 * el curator o el compilador fallan antes de llegar al log.
 */
function inTenant<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return runInTenant(key, async () => {
    await ensureHiveDb({ specialists: "none" });
    return fn();
  });
}

async function appendToolErrors(tool: string, n: number, agentId = AGENT) {
  const db = await getHiveDb();
  for (let i = 0; i < n; i++) {
    await db.append({
      agentId: causalAgentKey(agentId),
      streamId: "stream-history",
      kind: "ToolCall",
      payload: JSON.stringify({ tool, outcome: { Err: `boom-${i}` } }),
    });
  }
}

/** Intent → decisión → `failures` ToolCall con error, como los emite agent-loop.ts. */
async function appendThread(streamId: string, agentId: string, decision: string, tool: string, failures: number) {
  const db = await getHiveDb();
  const shard = causalAgentKey(agentId);
  const intentSeq = await db.append({
    agentId: shard,
    streamId,
    kind: "IntentLogged",
    payload: JSON.stringify({ actor: agentId, intent: decision }),
  });
  const decisionSeq = await db.append({
    agentId: shard,
    streamId,
    kind: "StateTransition",
    payload: JSON.stringify({ description: decision }),
    causation: intentSeq,
  });
  for (let i = 0; i < failures; i++) {
    await db.append({
      agentId: shard,
      streamId,
      kind: "ToolCall",
      payload: JSON.stringify({ tool, outcome: { Err: "boom" } }),
      causation: decisionSeq,
    });
  }
}

async function seedTrace(overrides: Partial<TraceDoc>) {
  const tracesCol = await col<TraceDoc>("traces");
  const id = await nextId("traces");
  await tracesCol.put(id, {
    id,
    thread_id: "thread-1",
    agent_id: AGENT,
    agent_name: "Agent 1",
    tool_used: null,
    input_summary: "input",
    output_summary: "output",
    success: true,
    error_message: null,
    duration_ms: null,
    tokens_used: null,
    created_at: Date.now(),
    ...overrides,
  });
  return id;
}

/** Lote mínimo para que el reflector corra (MIN_TRACES_TO_RUN = 10): 4 fallas y 6 éxitos. */
async function seedFailureBatch(tool: string) {
  for (let i = 0; i < 4; i++) await seedTrace({ tool_used: tool, success: false });
  for (let i = 0; i < 6; i++) await seedTrace({ tool_used: "ok_tool", success: true });
}

async function reflections(): Promise<ReflectionDoc[]> {
  const all = await (await col<ReflectionDoc>("reflections")).scan({});
  return all.map((e) => e.doc);
}

async function seedAgentWithSmallContextWindow() {
  const usersCol = await col<UserDoc>("users");
  await usersCol.put("test-user", {
    id: "test-user",
    name: "Test User",
    language: "es",
    timezone: null,
    occupation: null,
    notes: null,
    master_key_hash: null,
    email: null,
    password_hash: null,
    preferred_cron_channel: "webchat",
    created_at: Date.now(),
  });

  const agentsCol = await col<AgentDoc>("agents");
  await agentsCol.put("test-agent", {
    id: "test-agent",
    user_id: "test-user",
    name: "Test Agent",
    description: null,
    system_prompt: "Eres un agente de prueba.",
    tone: null,
    role: "coordinator",
    status: "idle",
    enabled: true,
    provider_id: toIndexable("hiveagents"),
    model_id: toIndexable("test-model"),
    tools_json: null,
    skills_json: null,
    parent_id: toIndexable(null),
    max_iterations: 10,
    workspace: null,
    lastTraceAt: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  });

  const providersCol = await col<ProviderDoc>("providers");
  await providersCol.put("hiveagents", {
    id: "hiveagents",
    name: "HiveAgents",
    enabled: true,
    active: true,
    base_url: "https://fake.api.com/v1",
    category: "llm",
    num_ctx: null,
    num_gpu: 0,
    created_at: Date.now(),
  });

  const modelsCol = await col<ModelDoc>("models");
  await modelsCol.put("test-model", {
    id: "test-model",
    provider_id: "hiveagents",
    name: "Test Model",
    model_type: "llm",
    active: true,
    enabled: true,
    context_window: 1000,
    capabilities: null,
  });
}

/** Igual que en context-compiler.test.ts: 35 mensajes + resumen para que el resumen aplique. */
async function forceCompaction(threadId: string) {
  for (let i = 0; i < 35; i++) {
    await addMessage(threadId, i % 2 === 0 ? "user" : "assistant", `msg-${i}`);
  }
  await saveSummary(threadId, "Resumen de la conversación previa.", 5, 5);
}

beforeEach(async () => {
  closeHiveDb();
  resetBootId();
  await ensureHiveDb();
});

afterEach(() => {
  closeHiveDb();
  delete process.env.HIVE_CAUSAL_LOG;
});

describe("causalAgentKey / causalScope", () => {
  test("sin tenant la clave es el id tal cual; con tenant lleva el tenant delante", () => {
    expect(causalAgentKey(AGENT)).toBe(AGENT);
    expect(runInTenant(A, () => causalAgentKey(AGENT))).toBe(`${A}:${AGENT}`);
    expect(runInTenant(A, () => causalScope([AGENT, AGENT, ""]))).toEqual([`${A}:${AGENT}`]);
  });

  test("una lista vacía, o de puros vacíos, da null: nunca llega [] al motor", () => {
    expect(causalScope([])).toBeNull();
    expect(causalScope(["", null, undefined])).toBeNull();
  });

  test("con un tenant activo las lecturas causales ya no se apagan", () => {
    process.env.HIVE_CAUSAL_LOG = "true";
    expect(runInTenant(A, () => causalReadsEnabled())).toBe(true);
  });
});

describe("log causal por tenant: toolStats del reflector", () => {
  test("los errores del mismo agente en otro inquilino no cuentan", async () => {
    process.env.HIVE_CAUSAL_LOG = "true";

    await runInTenant(B, () => appendToolErrors("flaky_tool", 9));
    await inTenant(A, async () => {
      await appendToolErrors("flaky_tool", 5);
      await seedFailureBatch("flaky_tool");
      await runReflector();
    });

    const failure = (await inTenant(A, reflections)).find((r) => r.insight_type === "failure_pattern");
    expect(failure).toBeDefined();
    // Los 5 de A. Un shard sin tenant daría 14; la lectura apagada, 4 (sólo el lote).
    expect(failure!.description).toContain("5 times");
  });

  test("sin tenant, toolStats se acota a los agentes del lote", async () => {
    process.env.HIVE_CAUSAL_LOG = "true";

    await appendToolErrors("flaky_tool", 5, "agent-1");
    await appendToolErrors("flaky_tool", 20, "agent-2");
    await seedFailureBatch("flaky_tool"); // trazas sólo de agent-1

    await runReflector();

    const failure = (await reflections()).find((r) => r.insight_type === "failure_pattern");
    expect(failure).toBeDefined();
    expect(failure!.description).toContain("5 times");
  });
});

describe("log causal por tenant: causalThread del reflector", () => {
  test("el hilo sólo trae eventos del inquilino, y affected_agents lleva el id crudo", async () => {
    process.env.HIVE_CAUSAL_LOG = "true";
    const streamId = "stream-compartido";

    await runInTenant(B, () => appendThread(streamId, AGENT, "Leaked decision from B", "other_tool", 3));
    await inTenant(A, async () => {
      await appendThread(streamId, AGENT, "Calling deploy_service", "deploy_service", 1);
      await seedTrace({ tool_used: "deploy_service", success: false, causal_stream_id: streamId });
      for (let i = 0; i < 9; i++) await seedTrace({ tool_used: "ok_tool", success: true });
      await runReflector();
    });

    const insightsA = await inTenant(A, reflections);
    const rootCauses = insightsA.filter((r) => r.insight_type === "root_cause");
    expect(rootCauses.length).toBe(1);
    expect(rootCauses[0].description).toContain("Calling deploy_service");
    expect(rootCauses[0].affected_agents).toBe(JSON.stringify([AGENT]));

    const texto = insightsA.map((r) => r.description).join("\n");
    expect(texto).not.toContain("Leaked decision from B");
    expect(texto).not.toContain("other_tool");
    expect(texto).not.toMatch(QUALIFIED);
  });
});

describe("log causal por tenant: contexto causal del compilador", () => {
  test("con tenant activo se inyecta, y sólo con el hilo propio", async () => {
    process.env.HIVE_CAUSAL_LOG = "true";
    const streamId = "ctx-compartido";

    await runInTenant(B, () => appendThread(streamId, "test-agent", "Leaked decision from B", "other_tool", 0));
    const ctx = await inTenant(A, async () => {
      await seedAgentWithSmallContextWindow();
      await appendThread(streamId, "test-agent", "Calling deploy_service on checkout", "deploy_service", 0);
      await forceCompaction("thread-ctx-1");
      return compileContext({
        agentId: "test-agent",
        threadId: "thread-ctx-1",
        userMessage: "Seguí con el deploy",
        causalStreamId: streamId,
      });
    });

    expect(ctx.systemPrompt).toContain("# CAUSAL CONTEXT");
    expect(ctx.systemPrompt).toContain("Calling deploy_service on checkout");
    expect(ctx.systemPrompt).not.toContain("Leaked decision from B");
    expect(ctx.systemPrompt).not.toMatch(QUALIFIED);
  });
});

describe("log causal por tenant: watchCausalEvents", () => {
  test("con tenant, el id crudo sólo entrega los eventos del propio inquilino", async () => {
    const received = await runInTenant(A, async () => {
      const stream = await watchCausalEvents({ agentId: AGENT });
      const db = await getHiveDb();
      // Mismo id crudo, pero en B: con un shard sin tenant, el tail lo entregaría primero.
      await runInTenant(B, () =>
        db.append({
          agentId: causalAgentKey(AGENT),
          streamId: "s1",
          kind: "IntentLogged",
          payload: JSON.stringify({ actor: AGENT, intent: "de B" }),
        })
      );
      await db.append({
        agentId: causalAgentKey(AGENT),
        streamId: "s1",
        kind: "IntentLogged",
        payload: JSON.stringify({ actor: AGENT, intent: "de A" }),
      });
      const first = (await stream[Symbol.asyncIterator]().next()).value!;
      stream.close();
      return first;
    });

    expect(JSON.parse(received.payload).intent).toBe("de A");
    expect(received.agentId).toBe(`${A}:${AGENT}`);
    expect(formatCausalEvent(received)).toContain(`agent=${AGENT}  stream=`);
  });
});
