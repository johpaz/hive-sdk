/**
 * Hooks: engancharse al ciclo de vida sin bifurcar el SDK.
 *
 * `HooksConfigSchema` declaraba 14 hooks y **ninguno se invocaba** — un esquema
 * sin implementación, que es peor que no tenerlo porque quien lo encuentra
 * asume que funciona.
 *
 * El test que importa es el de bloqueo: un `beforeToolCall` que objeta tiene que
 * impedir que la tool **se ejecute**, no sólo registrarlo. Si la tool corre
 * igual, el hook es decorativo.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import {
  registerHook, clearHooks, hasHooks,
  runBeforeToolCall, runAfterToolCall,
} from "../packages/core/src/hooks/index";
import { executeToolBatch } from "../packages/core/src/tool-runtime/index";
import {
  createSession, createWebSession, closeSession, reopenSession, deleteSession,
  appendMessage,
} from "../packages/core/src/sessions/index";
import type { Tool } from "../packages/core/src/tools/types";

/** Una tool que deja constancia de haberse ejecutado. */
function toolEspia() {
  const llamadas: string[] = [];
  const tool: Tool = {
    name: "espia",
    description: "deja constancia",
    parameters: { type: "object", properties: { valor: { type: "string" } } },
    execute: async (params) => {
      llamadas.push(String(params.valor ?? ""));
      return { ok: true, eco: params.valor };
    },
  };
  return { llamadas, tool };
}

const llamada = (id: string, valor: string) => ({
  id,
  type: "function" as const,
  function: { name: "espia", arguments: JSON.stringify({ valor }) },
});

beforeEach(async () => {
  closeHiveDb();
  clearHooks();
  await ensureHiveDb();
});

afterEach(() => {
  clearHooks();
  closeHiveDb();
});

describe("registro de hooks", () => {
  test("registrar y quitar", () => {
    expect(hasHooks("beforeToolCall")).toBe(false);
    const quitar = registerHook("beforeToolCall", () => undefined);
    expect(hasHooks("beforeToolCall")).toBe(true);
    quitar();
    expect(hasHooks("beforeToolCall")).toBe(false);
  });

  test("varios hooks del mismo tipo corren en orden", async () => {
    const orden: number[] = [];
    registerHook("afterToolCall", () => { orden.push(1); });
    registerHook("afterToolCall", () => { orden.push(2); });

    await runAfterToolCall({ toolName: "x", args: {}, result: null, ok: true, durationMs: 0 });
    expect(orden).toEqual([1, 2]);
  });

  test("el primero que bloquea gana: no se sigue preguntando", async () => {
    const consultados: string[] = [];
    registerHook("beforeToolCall", () => { consultados.push("a"); return { block: true, reason: "no" }; });
    registerHook("beforeToolCall", () => { consultados.push("b"); });

    expect(await runBeforeToolCall({ toolName: "x", args: {} })).toBe("no");
    expect(consultados).toEqual(["a"]);
  });

  test("un hook que lanza no bloquea: un observador roto no debe frenar el trabajo", async () => {
    registerHook("beforeToolCall", () => { throw new Error("hook roto"); });
    expect(await runBeforeToolCall({ toolName: "x", args: {} })).toBeNull();
  });
});

describe("beforeToolCall impide la ejecución de verdad", () => {
  test("una tool bloqueada NO corre", async () => {
    const { llamadas, tool } = toolEspia();
    registerHook("beforeToolCall", (ctx) =>
      ctx.toolName === "espia" ? { block: true, reason: "prohibido por política" } : undefined);

    const res = await executeToolBatch({
      toolCalls: [llamada("1", "uno")],
      allTools: [tool],
    } as any);

    // Si la tool corriera igual, el hook sería decorativo.
    expect(llamadas).toHaveLength(0);
    expect(res[0]!.ok).toBe(false);
    expect(JSON.stringify(res[0]!.result)).toContain("prohibido por política");
  });

  test("bloquear una no impide las demás, y el orden se conserva", async () => {
    const { llamadas, tool } = toolEspia();
    registerHook("beforeToolCall", (ctx) =>
      ctx.args.valor === "malo" ? { block: true, reason: "vetado" } : undefined);

    const res = await executeToolBatch({
      toolCalls: [llamada("1", "bueno"), llamada("2", "malo"), llamada("3", "otro")],
      allTools: [tool],
    } as any);

    expect(llamadas.sort()).toEqual(["bueno", "otro"]);
    // El modelo espera una respuesta por llamada, en el orden en que las hizo.
    expect(res).toHaveLength(3);
    expect(res[0]!.ok).toBe(true);
    expect(res[1]!.ok).toBe(false);
    expect(res[2]!.ok).toBe(true);
  });

  test("el hook ve los argumentos, no sólo el nombre", async () => {
    const vistos: unknown[] = [];
    const { tool } = toolEspia();
    registerHook("beforeToolCall", (ctx) => { vistos.push(ctx.args); });

    await executeToolBatch({ toolCalls: [llamada("1", "dato")], allTools: [tool] } as any);
    expect(vistos[0]).toEqual({ valor: "dato" });
  });

  test("sin hooks registrados, todo corre como antes", async () => {
    const { llamadas, tool } = toolEspia();
    const res = await executeToolBatch({ toolCalls: [llamada("1", "x")], allTools: [tool] } as any);

    expect(llamadas).toEqual(["x"]);
    expect(res[0]!.ok).toBe(true);
  });
});

describe("afterToolCall observa el resultado", () => {
  test("recibe lo que devolvió la tool y si salió bien", async () => {
    const observado: any[] = [];
    const { tool } = toolEspia();
    registerHook("afterToolCall", (ctx) => { observado.push(ctx); });

    await executeToolBatch({ toolCalls: [llamada("1", "hola")], allTools: [tool] } as any);

    expect(observado).toHaveLength(1);
    expect(observado[0].toolName).toBe("espia");
    expect(observado[0].ok).toBe(true);
  });

  test("también ve las bloqueadas: auditar incluye lo que no pasó", async () => {
    const observado: any[] = [];
    const { tool } = toolEspia();
    registerHook("beforeToolCall", () => ({ block: true, reason: "no" }));
    registerHook("afterToolCall", (ctx) => { observado.push(ctx); });

    await executeToolBatch({ toolCalls: [llamada("1", "x")], allTools: [tool] } as any);

    expect(observado).toHaveLength(1);
    expect(observado[0].ok).toBe(false);
  });
});

describe("sessionStart / sessionEnd", () => {
  const ANA = "user-ana";

  test("se dispara al abrir la conversación, con su usuario y canal", async () => {
    const vistos: any[] = [];
    registerHook("sessionStart", (ctx) => { vistos.push(ctx); });

    const s = await createSession({ userId: ANA, channel: "telegram", peerId: "555" });

    expect(vistos).toHaveLength(1);
    expect(vistos[0].threadId).toBe(s.id);
    expect(vistos[0].userId).toBe(ANA);
    expect(vistos[0].channel).toBe("telegram");
  });

  test("NO se dispara en cada turno: `createSession` es idempotente", async () => {
    // Es el error que este cableado evita. `createSession` se llama en cada
    // mensaje entrante; enganchado ahí, el hook correría por mensaje y no por
    // conversación — y quien lo use para cobrar o para inicializar estado
    // estaría contando turnos creyendo contar sesiones.
    const vistos: any[] = [];
    registerHook("sessionStart", (ctx) => { vistos.push(ctx); });

    await createSession({ userId: ANA, channel: "telegram", peerId: "555" });
    await createSession({ userId: ANA, channel: "telegram", peerId: "555" });
    await createSession({ userId: ANA, channel: "telegram", peerId: "555" });

    expect(vistos).toHaveLength(1);
  });

  test("dos turnos concurrentes del mismo canal lo disparan una sola vez", async () => {
    const vistos: any[] = [];
    registerHook("sessionStart", (ctx) => { vistos.push(ctx); });

    await Promise.all([
      createSession({ userId: ANA, channel: "webchat", peerId: "carrera" }),
      createSession({ userId: ANA, channel: "webchat", peerId: "carrera" }),
      createSession({ userId: ANA, channel: "webchat", peerId: "carrera" }),
    ]);

    expect(vistos).toHaveLength(1);
  });

  test("cada conversación nueva de la web es una sesión distinta", async () => {
    const vistos: any[] = [];
    registerHook("sessionStart", (ctx) => { vistos.push(ctx); });

    const a = await createWebSession(ANA);
    const b = await createWebSession(ANA);

    expect(vistos.map((v) => v.threadId).sort()).toEqual([a.id, b.id].sort());
  });

  test("archivar termina la sesión; archivar de nuevo no", async () => {
    const s = await createSession({ userId: ANA, channel: "webchat", peerId: "p1" });
    const vistos: any[] = [];
    registerHook("sessionEnd", (ctx) => { vistos.push(ctx); });

    await closeSession(s.id);
    await closeSession(s.id);

    expect(vistos).toHaveLength(1);
    expect(vistos[0].threadId).toBe(s.id);
    expect(vistos[0].userId).toBe(ANA);
  });

  test("reabrir vuelve a arrancarla", async () => {
    const s = await createSession({ userId: ANA, channel: "webchat", peerId: "p2" });
    await closeSession(s.id);

    const arranques: any[] = [];
    registerHook("sessionStart", (ctx) => { arranques.push(ctx); });
    await reopenSession(s.id);
    await reopenSession(s.id);   // ya estaba abierta: no hay nada que anunciar

    expect(arranques).toHaveLength(1);
    expect(arranques[0].threadId).toBe(s.id);
  });

  test("borrar la termina, y el contexto sobrevive al borrado de la fila", async () => {
    const s = await createSession({ userId: ANA, channel: "telegram", peerId: "999" });
    await appendMessage(s.id, "user", "hola");

    const vistos: any[] = [];
    registerHook("sessionEnd", (ctx) => { vistos.push(ctx); });
    await deleteSession(s.id);

    // Si el hook leyera la fila después del delete, `userId` y `channel`
    // llegarían vacíos y el consumidor no sabría de quién era lo que se borró.
    expect(vistos).toHaveLength(1);
    expect(vistos[0].userId).toBe(ANA);
    expect(vistos[0].channel).toBe("telegram");
  });

  test("un hook que lanza no tumba la creación de la sesión", async () => {
    registerHook("sessionStart", () => { throw new Error("boom"); });

    const s = await createSession({ userId: ANA, channel: "webchat", peerId: "p3" });
    expect(s.id).toBeTruthy();
  });
});
