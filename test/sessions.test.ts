/**
 * Tests for sessions/ — la vista compuesta sobre conversationThreads + agentRuns.
 *
 * Cubre el ciclo que antes no tenía dueño: crear → escribir → listar → retomar
 * tras un corte. `listSessions` es la consulta que no existía (el estado de
 * sesión vivía en un Map en memoria que moría con el proceso).
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import { createRun, checkpoint, interruptRun, completeRun, type RunCheckpointState } from "../packages/core/src/agent/run-store";
import {
  createSession,
  createWebSession,
  getSession,
  listSessions,
  appendMessage,
  getSessionHistory,
  resumeSession,
  renameSession,
  closeSession,
  reopenSession,
  deleteSession,
  makeThreadId,
} from "../packages/core/src/sessions";

beforeEach(async () => {
  closeHiveDb();
  await ensureHiveDb();
});

afterEach(() => {
  closeHiveDb();
});

/**
 * Espera a que una lectura eventual-consistente devuelva algo, o falla con un
 * mensaje claro en vez de un `undefined` desconcertante.
 */
async function esperarA<T>(leer: () => Promise<T | null>, timeoutMs = 5000): Promise<T> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    const valor = await leer();
    if (valor !== null) return valor;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`el valor esperado no llegó en ${timeoutMs}ms`);
}

function checkpointState(overrides: Partial<RunCheckpointState> = {}): RunCheckpointState {
  return {
    version: 1,
    messages: [{ role: "user", content: "seguí desde acá" }],
    iterations: 3,
    totalInputTokens: 120,
    totalOutputTokens: 45,
    lastToolSignature: "",
    consecutiveRepeat: 0,
    idleIterations: 0,
    injectedToolNames: [],
    systemPromptSkillSections: [],
    ...overrides,
  } as RunCheckpointState;
}

describe("sessions: creación e identidad", () => {
  test("el id de la sesión ES el threadId", async () => {
    const session = await createSession({ userId: "u1", channel: "telegram", peerId: "p1" });
    expect(session.id).toBe(makeThreadId("u1", "telegram", "p1"));
    expect(session.userId).toBe("u1");
    expect(session.channel).toBe("telegram");
    expect(session.archived).toBe(false);
  });

  test("createSession es idempotente — el mismo peer no abre dos sesiones", async () => {
    const a = await createSession({ userId: "u1", channel: "telegram", peerId: "p1" });
    const b = await createSession({ userId: "u1", channel: "telegram", peerId: "p1" });
    expect(b.id).toBe(a.id);
    expect(await listSessions("u1")).toHaveLength(1);
  });

  test("createWebSession abre una conversación nueva cada vez", async () => {
    const a = await createWebSession("u1");
    const b = await createWebSession("u1");
    expect(a.id).not.toBe(b.id);
    expect(await listSessions("u1")).toHaveLength(2);
  });

  test("getSession devuelve null para una sesión inexistente", async () => {
    expect(await getSession("u1/webchat/no-existe")).toBeNull();
  });
});

describe("sessions: mensajes y listado", () => {
  test("appendMessage persiste el mensaje de inmediato", async () => {
    const session = await createSession({ userId: "u1", channel: "webchat", peerId: "c1" });
    await appendMessage(session.id, "user", "hola");
    await appendMessage(session.id, "assistant", "buenas");

    // El historial sí es consistente al instante: es la escritura que importa.
    const history = await getSessionHistory(session.id);
    expect(history.map((m) => m.content)).toEqual(["hola", "buenas"]);
  });

  test("el catálogo de la sesión se pone al día (consistencia eventual)", async () => {
    const session = await createSession({ userId: "u1", channel: "webchat", peerId: "c1" });
    await appendMessage(session.id, "user", "hola");
    await appendMessage(session.id, "assistant", "buenas");

    // `addMessage` actualiza el catálogo sin esperar el resultado, para no
    // bloquear la persistencia del mensaje detrás del contador. Eso lo vuelve
    // consistente-eventual, así que esperarlo es parte del contrato, no una
    // concesión del test: afirmar el valor de una vez pasaba en una máquina
    // ociosa y fallaba en CI.
    const puestoAlDia = await esperarA(async () => {
      const s = await getSession(session.id);
      return s?.messageCount === 2 ? s : null;
    });

    expect(puestoAlDia.messageCount).toBe(2);
    // El título se deriva del primer mensaje del usuario.
    expect(puestoAlDia.title).toBe("hola");
  });

  test("listSessions ordena por actividad, de la más reciente a la más vieja", async () => {
    const first = await createSession({ userId: "u1", channel: "webchat", peerId: "c1" });
    await appendMessage(first.id, "user", "vieja");
    const second = await createSession({ userId: "u1", channel: "telegram", peerId: "p1" });
    await appendMessage(second.id, "user", "nueva");

    const sessions = await listSessions("u1");
    expect(sessions[0]!.id).toBe(second.id);
    expect(sessions[1]!.id).toBe(first.id);
  });

  test("listSessions filtra por canal y aísla por usuario", async () => {
    await createSession({ userId: "u1", channel: "webchat", peerId: "c1" });
    await createSession({ userId: "u1", channel: "telegram", peerId: "p1" });
    await createSession({ userId: "u2", channel: "webchat", peerId: "c9" });

    expect(await listSessions("u1", { channel: "telegram" })).toHaveLength(1);
    expect(await listSessions("u2")).toHaveLength(1);
  });
});

describe("sessions: cierre y borrado", () => {
  test("closeSession la saca de la lista sin perder el historial", async () => {
    const session = await createSession({ userId: "u1", channel: "webchat", peerId: "c1" });
    await appendMessage(session.id, "user", "hola");

    await closeSession(session.id);
    expect(await listSessions("u1")).toHaveLength(0);
    expect(await listSessions("u1", { includeArchived: true })).toHaveLength(1);
    expect(await getSessionHistory(session.id)).toHaveLength(1);

    await reopenSession(session.id);
    expect(await listSessions("u1")).toHaveLength(1);
  });

  test("deleteSession borra la sesión y sus mensajes", async () => {
    const session = await createSession({ userId: "u1", channel: "webchat", peerId: "c1" });
    await appendMessage(session.id, "user", "hola");

    await deleteSession(session.id);
    expect(await getSession(session.id)).toBeNull();
    expect(await getSessionHistory(session.id)).toHaveLength(0);
  });

  test("renameSession fija el título", async () => {
    const session = await createSession({ userId: "u1", channel: "webchat", peerId: "c1" });
    await renameSession(session.id, "Presupuesto Q3");
    expect((await getSession(session.id))?.title).toBe("Presupuesto Q3");
  });
});

describe("sessions: resume tras un corte", () => {
  async function runFor(threadId: string) {
    return createRun({
      thread_id: threadId,
      agent_id: "coordinator",
      user_id: "u1",
      channel: "webchat",
      kind: "chat",
      max_iterations: 10,
    });
  }

  test("una sesión sin ejecuciones no tiene nada que retomar", async () => {
    const session = await createSession({ userId: "u1", channel: "webchat", peerId: "c1" });
    expect(await resumeSession(session.id)).toBeNull();
    expect((await getSession(session.id))?.lastRun).toBeUndefined();
  });

  test("retoma el checkpoint de una ejecución interrumpida", async () => {
    const session = await createSession({ userId: "u1", channel: "webchat", peerId: "c1" });
    const run = await runFor(session.id);
    await checkpoint(run.id, checkpointState({ iterations: 4 }));
    await interruptRun(run.id, "el proceso murió");

    const resumable = await resumeSession(session.id);
    expect(resumable).not.toBeNull();
    expect(resumable!.run.runId).toBe(run.id);
    expect(resumable!.run.resumable).toBe(true);
    expect(resumable!.checkpoint.iterations).toBe(4);
    expect(resumable!.checkpoint.messages[0]!.content).toBe("seguí desde acá");
  });

  test("una ejecución terminada no se ofrece para retomar", async () => {
    const session = await createSession({ userId: "u1", channel: "webchat", peerId: "c1" });
    const run = await runFor(session.id);
    await checkpoint(run.id, checkpointState());
    await completeRun(run.id, "listo");

    expect(await resumeSession(session.id)).toBeNull();
  });

  test("getSession expone la última ejecución del hilo", async () => {
    const session = await createSession({ userId: "u1", channel: "webchat", peerId: "c1" });
    const run = await runFor(session.id);
    await checkpoint(run.id, checkpointState());
    await interruptRun(run.id, "corte");

    const withRun = await getSession(session.id);
    expect(withRun?.lastRun?.runId).toBe(run.id);
    expect(withRun?.lastRun?.status).toBe("interrupted");
    expect(withRun?.lastRun?.agentId).toBe("coordinator");
  });

  test("listSessions sólo trae ejecuciones si se las pide", async () => {
    const session = await createSession({ userId: "u1", channel: "webchat", peerId: "c1" });
    const run = await runFor(session.id);
    await checkpoint(run.id, checkpointState());
    await interruptRun(run.id, "corte");

    expect((await listSessions("u1"))[0]!.lastRun).toBeUndefined();
    expect((await listSessions("u1", { withRuns: true }))[0]!.lastRun?.runId).toBe(run.id);
  });
});
