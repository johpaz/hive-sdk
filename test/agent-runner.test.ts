/**
 * `AgentRunner` estaba exportado pero no era utilizable.
 *
 * `generate()` necesita que el loop global exista (`getAgentLoop()`), y
 * construirlo es un paso aparte: `new AgentRunner(config)` a secas compila, se
 * instancia sin quejarse y falla recién en la primera llamada con "AgentLoop not
 * initialized". En hive ese paso lo hace su initializer; en el SDK no lo hacía
 * nadie, así que la clase existía en el contrato público sin funcionar.
 *
 * `createAgentRunner()` hace las dos cosas en el orden correcto.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import { loadConfig } from "../packages/core/src/config/loader";
import { AgentRunner, createAgentRunner } from "../packages/core/src/agent/providers/index";
import { getAgentLoop } from "../packages/core/src/agent/agent-loop";

beforeEach(async () => {
  closeHiveDb();
  await ensureHiveDb();
});

afterEach(() => {
  closeHiveDb();
});

describe("createAgentRunner", () => {
  test("deja el loop construido, que es lo que generate() necesita", async () => {
    const runner = await createAgentRunner(loadConfig());

    expect(runner).toBeInstanceOf(AgentRunner);
    // Sin esto, la primera llamada moriría con "AgentLoop not initialized".
    expect(getAgentLoop()).not.toBeNull();
  });

  test("es idempotente: llamarla dos veces no rompe nada", async () => {
    await createAgentRunner(loadConfig());
    const segundo = await createAgentRunner(loadConfig());

    expect(segundo).toBeInstanceOf(AgentRunner);
    expect(getAgentLoop()).not.toBeNull();
  });

  test("acepta un manager MCP nulo — un enjambre sin MCP es válido", async () => {
    const runner = await createAgentRunner(loadConfig(), { mcpManager: null });
    expect(runner).toBeInstanceOf(AgentRunner);
  });

  test("se alcanza desde la superficie pública", async () => {
    const raiz = await import("@johpaz/hive-sdk");
    expect(typeof (raiz as any).createAgentRunner).toBe("function");
    expect(typeof (raiz as any).AgentRunner).toBe("function");
  });
});
