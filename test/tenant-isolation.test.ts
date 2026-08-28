/**
 * Aislamiento de credenciales entre inquilinos en UN MISMO proceso.
 *
 * Regresión de un bug real: `resolveProviderConfig` sólo sabía leer la key del
 * secret store de HiveDB o de `process.env[PROVIDER_API_KEY]`, ambos globales al
 * proceso. Un backend multi-tenant no tiene un proceso por inquilino, así que
 * cada llamada terminaba usando la key global del host — todas las workspaces
 * compartían credencial sin importar lo que tuvieran configurado.
 *
 * El arreglo es pasar la credencial en la llamada. Estos tests fijan el contrato:
 * la credencial de la llamada gana, no se mezcla entre llamadas concurrentes, y
 * cuando no viene se conserva el comportamiento anterior.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import * as crypto from "../packages/core/src/storage/crypto";
import { resolveProviderConfig } from "../packages/core/src/agent/llm-client";

const PROVIDER = "anthropic";
const ENV_VAR = "ANTHROPIC_API_KEY";

let savedEnv: string | undefined;

/**
 * El secret store real espeja al keychain del SO (`Bun.secrets`, service "hive"),
 * que NO lo aísla `HIVE_DB_PATH=":memory:"`: escribirlo desde un test pisaría la
 * credencial de verdad de quien corre la suite. Se stubea la lectura y nunca se
 * escribe nada fuera del proceso.
 */
let storeKey = "";
mock.module("../packages/core/src/storage/crypto", () => ({
  ...crypto,
  loadProviderApiKey: async () => storeKey,
}));

beforeEach(async () => {
  savedEnv = process.env[ENV_VAR];
  delete process.env[ENV_VAR];
  storeKey = "";
  closeHiveDb();
  await ensureHiveDb();
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = savedEnv;
  closeHiveDb();
});

describe("aislamiento multi-tenant: credenciales por llamada", () => {
  test("la key de la llamada gana sobre el secret store global", async () => {
    storeKey = "key-del-host";

    const cfg = await resolveProviderConfig(PROVIDER, "claude-x", { apiKey: "key-del-inquilino" });
    expect(cfg.apiKey).toBe("key-del-inquilino");
  });

  test("la key de la llamada gana sobre process.env", async () => {
    process.env[ENV_VAR] = "key-del-entorno";

    const cfg = await resolveProviderConfig(PROVIDER, "claude-x", { apiKey: "key-del-inquilino" });
    expect(cfg.apiKey).toBe("key-del-inquilino");
  });

  test("dos inquilinos concurrentes no se pisan la credencial", async () => {
    // La key global existe y es la que se filtraba antes.
    storeKey = "key-del-host";
    process.env[ENV_VAR] = "key-del-entorno";

    const [a, b, c] = await Promise.all([
      resolveProviderConfig(PROVIDER, "claude-x", { apiKey: "key-workspace-A" }),
      resolveProviderConfig(PROVIDER, "claude-x", { apiKey: "key-workspace-B" }),
      resolveProviderConfig(PROVIDER, "claude-x", { apiKey: "key-workspace-C" }),
    ]);

    expect(a!.apiKey).toBe("key-workspace-A");
    expect(b!.apiKey).toBe("key-workspace-B");
    expect(c!.apiKey).toBe("key-workspace-C");
    // Y ninguna cayó al fallback global.
    for (const cfg of [a, b, c]) {
      expect(cfg!.apiKey).not.toBe("key-del-host");
      expect(cfg!.apiKey).not.toBe("key-del-entorno");
    }
  });

  test("una llamada con credencial no altera el estado global del proceso", async () => {
    process.env[ENV_VAR] = "key-del-entorno";
    await resolveProviderConfig(PROVIDER, "claude-x", { apiKey: "key-del-inquilino" });

    // El workaround anterior mutaba process.env antes de cada llamada; este
    // camino no debe tocarlo, o el aislamiento dependería otra vez del proceso.
    expect(process.env[ENV_VAR]).toBe("key-del-entorno");
  });

  test("el baseUrl también se puede fijar por llamada", async () => {
    const cfg = await resolveProviderConfig(PROVIDER, "claude-x", {
      apiKey: "k",
      baseUrl: "https://proxy-del-inquilino.example",
    });
    expect(cfg.baseUrl).toBe("https://proxy-del-inquilino.example");
  });
});

describe("aislamiento multi-tenant: retrocompatibilidad", () => {
  test("sin credencial en la llamada se usa el secret store, como siempre", async () => {
    storeKey = "key-del-host";

    const cfg = await resolveProviderConfig(PROVIDER, "claude-x");
    expect(cfg.apiKey).toBe("key-del-host");
  });

  test("sin credencial ni secret store se cae a process.env, como siempre", async () => {
    process.env[ENV_VAR] = "key-del-entorno";

    const cfg = await resolveProviderConfig(PROVIDER, "claude-x");
    expect(cfg.apiKey).toBe("key-del-entorno");
  });

  test("una credencial parcial no anula el fallback de la key", async () => {
    storeKey = "key-del-host";

    // Sólo baseUrl: la key sigue resolviéndose por el camino de siempre.
    const cfg = await resolveProviderConfig(PROVIDER, "claude-x", { baseUrl: "https://x.example" });
    expect(cfg.apiKey).toBe("key-del-host");
    expect(cfg.baseUrl).toBe("https://x.example");
  });
});
