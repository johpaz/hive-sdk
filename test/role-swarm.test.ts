/**
 * Enjambre por roles: secuencial, paralelo y jerárquico.
 *
 * Se usa un invocador falso, así que no hay LLM ni base de por medio: lo que se
 * verifica es la topología —quién recibe qué, en qué orden y en qué hilo— y el
 * protocolo de delegación.
 *
 * Dos casos cubren defectos del runner original que este port corrige:
 * subtareas multilínea (el regex cortaba en el primer salto) y un orquestador
 * que delega sin parar (no había tope y el bucle no terminaba).
 */

import { describe, test, expect } from "bun:test";
import {
  runRoleSwarm,
  type AgentInvoker,
  type RoleAgent,
  type SwarmMessage,
} from "../packages/core/src/swarm/RoleSwarm";

/** Invocador falso: devuelve lo que diga `script` y registra cada llamada. */
function fakeInvoker(script: (agentId: string, message: string, call: number) => string) {
  const calls: Array<{ agentId: string; message: string; threadId: string }> = [];
  let n = 0;
  const invoke: AgentInvoker = async ({ agentId, message, threadId }) => {
    calls.push({ agentId, message, threadId });
    return script(agentId, message, n++);
  };
  return { invoke, calls };
}

const workers = (...ids: string[]): RoleAgent[] =>
  ids.map((agentId, orderIndex) => ({ agentId, role: "worker" as const, orderIndex }));

describe("enjambre por roles: secuencial", () => {
  test("encadena la salida de cada agente como entrada del siguiente", async () => {
    const { invoke, calls } = fakeInvoker((agentId) => `salida-${agentId}`);

    const result = await runRoleSwarm({
      agents: workers("a", "b", "c"),
      strategy: "sequential",
      input: "entrada",
      runId: "run1",
      invoke,
    });

    expect(calls.map((c) => c.message)).toEqual(["entrada", "salida-a", "salida-b"]);
    expect(result.output).toBe("salida-c");
    expect(result.agentCalls).toBe(3);
  });

  test("respeta orderIndex, no el orden del array", async () => {
    const { invoke, calls } = fakeInvoker((agentId) => `salida-${agentId}`);

    await runRoleSwarm({
      agents: [
        { agentId: "ultimo", role: "worker", orderIndex: 2 },
        { agentId: "primero", role: "worker", orderIndex: 0 },
        { agentId: "medio", role: "worker", orderIndex: 1 },
      ],
      strategy: "sequential",
      input: "x",
      runId: "run1",
      invoke,
    });

    expect(calls.map((c) => c.agentId)).toEqual(["primero", "medio", "ultimo"]);
  });

  test("emite un par user/assistant por agente", async () => {
    const { invoke } = fakeInvoker((agentId) => `salida-${agentId}`);
    const messages: SwarmMessage[] = [];

    await runRoleSwarm({
      agents: workers("a", "b"),
      strategy: "sequential",
      input: "x",
      runId: "run1",
      invoke,
      onMessage: (m) => { messages.push(m); },
    });

    expect(messages.map((m) => `${m.agentId}:${m.role}`)).toEqual([
      "a:user", "a:assistant", "b:user", "b:assistant",
    ]);
  });
});

describe("enjambre por roles: paralelo", () => {
  test("todos reciben la misma entrada y se concatenan las salidas", async () => {
    const { invoke, calls } = fakeInvoker((agentId) => `salida-${agentId}`);

    const result = await runRoleSwarm({
      agents: workers("a", "b"),
      strategy: "parallel",
      input: "entrada",
      runId: "run1",
      invoke,
    });

    expect(calls.every((c) => c.message === "entrada")).toBe(true);
    expect(result.output).toBe("salida-a\n\n---\n\nsalida-b");
  });

  test("cada agente corre en su propio hilo, no en el compartido", async () => {
    const { invoke, calls } = fakeInvoker(() => "ok");

    await runRoleSwarm({
      agents: workers("a", "b"),
      strategy: "parallel",
      input: "x",
      runId: "run1",
      invoke,
    });

    expect(calls.map((c) => c.threadId).sort()).toEqual(["run1-a", "run1-b"]);
  });
});

describe("enjambre por roles: jerárquico", () => {
  const swarm: RoleAgent[] = [
    { agentId: "jefe", role: "orchestrator" },
    { agentId: "obrero", role: "worker" },
  ];

  test("delega, recibe el resultado y cierra con FINAL", async () => {
    const { invoke, calls } = fakeInvoker((agentId, _m, n) => {
      if (agentId === "obrero") return "trabajo hecho";
      return n === 0 ? "DELEGATE:obrero:hacé la parte 1" : "FINAL:todo listo";
    });

    const result = await runRoleSwarm({
      agents: swarm, strategy: "hierarchical", input: "tarea", runId: "run1", invoke,
    });

    expect(result.output).toBe("todo listo");
    expect(result.delegations).toBe(1);
    expect(result.truncated).toBe(false);
    expect(calls.find((c) => c.agentId === "obrero")?.message).toBe("hacé la parte 1");
  });

  test("una subtarea de varias líneas llega entera", async () => {
    // El runner original usaba `.` en el regex, que no cruza saltos de línea:
    // el worker recibía sólo el primer renglón de la instrucción.
    const subtask = "hacé esto:\n- primero A\n- después B";
    const { invoke, calls } = fakeInvoker((agentId, _m, n) => {
      if (agentId === "obrero") return "ok";
      return n === 0 ? `DELEGATE:obrero:${subtask}` : "FINAL:listo";
    });

    await runRoleSwarm({
      agents: swarm, strategy: "hierarchical", input: "tarea", runId: "run1", invoke,
    });

    expect(calls.find((c) => c.agentId === "obrero")?.message).toBe(subtask);
  });

  test("un orquestador que delega sin parar se corta en maxDelegations", async () => {
    // Sin tope esto no terminaba nunca, y cada vuelta es una llamada al modelo.
    const { invoke } = fakeInvoker((agentId) =>
      agentId === "obrero" ? "ok" : "DELEGATE:obrero:otra vuelta",
    );

    const result = await runRoleSwarm({
      agents: swarm, strategy: "hierarchical", input: "tarea", runId: "run1",
      maxDelegations: 3, invoke,
    });

    expect(result.delegations).toBe(3);
    expect(result.truncated).toBe(true);
  });

  test("delegar a un agente ajeno al enjambre corta en vez de llamarlo", async () => {
    const { invoke, calls } = fakeInvoker((agentId) =>
      agentId === "jefe" ? "DELEGATE:intruso:algo" : "no debería pasar",
    );

    const result = await runRoleSwarm({
      agents: swarm, strategy: "hierarchical", input: "tarea", runId: "run1", invoke,
    });

    expect(calls.some((c) => c.agentId === "intruso")).toBe(false);
    expect(result.delegations).toBe(0);
  });

  test("sin orquestador falla con un mensaje claro", async () => {
    const { invoke } = fakeInvoker(() => "x");
    await expect(
      runRoleSwarm({
        agents: workers("a"), strategy: "hierarchical", input: "t", runId: "r", invoke,
      }),
    ).rejects.toThrow(/orchestrator/);
  });

  test("sin trabajadores falla con un mensaje claro", async () => {
    const { invoke } = fakeInvoker(() => "x");
    await expect(
      runRoleSwarm({
        agents: [{ agentId: "jefe", role: "orchestrator" }],
        strategy: "hierarchical", input: "t", runId: "r", invoke,
      }),
    ).rejects.toThrow(/worker/);
  });

  test("si el orquestador no dice FINAL se devuelve lo último que dijo", async () => {
    const { invoke } = fakeInvoker(() => "no sé cómo seguir");
    const result = await runRoleSwarm({
      agents: swarm, strategy: "hierarchical", input: "t", runId: "r", invoke,
    });
    expect(result.output).toBe("no sé cómo seguir");
  });
});

describe("enjambre por roles: contratos generales", () => {
  test("un enjambre vacío falla", async () => {
    const { invoke } = fakeInvoker(() => "x");
    await expect(
      runRoleSwarm({ agents: [], strategy: "sequential", input: "t", runId: "r", invoke }),
    ).rejects.toThrow(/al menos un agente/);
  });

  test("las credenciales del inquilino llegan a cada agente", async () => {
    const seen: Array<string | undefined> = [];
    const invoke: AgentInvoker = async ({ credentials }) => {
      seen.push(credentials?.apiKey);
      return "ok";
    };

    await runRoleSwarm({
      agents: workers("a", "b"),
      strategy: "sequential", input: "t", runId: "r",
      credentials: { apiKey: "key-del-inquilino" },
      invoke,
    });

    expect(seen).toEqual(["key-del-inquilino", "key-del-inquilino"]);
  });
});
