/**
 * Los ejecutores que el harness trae listos.
 *
 * `harness/` daba la cola durable pero no sabía ejecutar nada: quien usara el
 * SDK tenía que escribir el cableado de `worker_task` y `goal_run` a mano antes
 * de poder correr un enjambre durable. Estos tests fijan el contrato de que
 * vienen incluidos, y que `chat_turn` deliberadamente no.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import { resetBootId } from "../packages/core/src/storage/boot-id";
import {
  initHarnessExecutors,
  setHarnessExecutorMCPManager,
  registerExecutor,
  getRegisteredExecutorTypes,
} from "../packages/core/src/harness/index";

beforeEach(async () => {
  closeHiveDb();
  resetBootId();
  await ensureHiveDb();
});

afterEach(() => {
  closeHiveDb();
});

describe("ejecutores del harness", () => {
  test("initHarnessExecutors registra worker_task y goal_run", () => {
    initHarnessExecutors();
    const tipos = getRegisteredExecutorTypes();
    expect(tipos).toContain("worker_task");
    expect(tipos).toContain("goal_run");
  });

  test("no registra chat_turn: eso lo define la aplicación", () => {
    // El registro es un singleton de módulo compartido por toda la suite, así
    // que preguntar "¿está chat_turn?" mide lo que hicieron otros archivos, no
    // esta función. Lo que importa es qué AÑADE la llamada.
    const antes = new Set(getRegisteredExecutorTypes());
    initHarnessExecutors();
    const añadidos = getRegisteredExecutorTypes().filter((t) => !antes.has(t));

    // En hive, chat_turn depende de su servidor HTTP (webchat-turn.ts). Qué es
    // un canal y cómo se transmite un token es decisión de quien monta la app.
    expect(añadidos).not.toContain("chat_turn");
  });

  test("es idempotente — llamarla dos veces no duplica", () => {
    initHarnessExecutors();
    const antes = getRegisteredExecutorTypes().length;
    initHarnessExecutors();
    expect(getRegisteredExecutorTypes().length).toBe(antes);
  });

  test("la app puede registrar su propio chat_turn junto a los incluidos", () => {
    initHarnessExecutors();
    registerExecutor("chat_turn", async () => "listo");

    const tipos = getRegisteredExecutorTypes();
    expect(tipos).toContain("chat_turn");
    expect(tipos).toContain("worker_task");
  });

  test("el manager MCP es opcional — sin él los workers corren con tools nativas", () => {
    // Registrar no debe exigir MCP: un enjambre sin servidores MCP es válido.
    expect(() => setHarnessExecutorMCPManager(null)).not.toThrow();
    expect(() => initHarnessExecutors()).not.toThrow();
  });
});
