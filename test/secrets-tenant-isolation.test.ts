/**
 * Secretos aislados entre inquilinos de UN MISMO proceso.
 *
 * Regresión: la colección `secrets` está particionada por inquilino, pero el
 * almacén cacheaba cada valor descifrado en un `Map` del proceso indexado sólo
 * por nombre, y el llavero del SO es de toda la máquina. Después de que un
 * inquilino leyera o guardara `provider:openai:api_key`, cualquier otro recibía
 * esa misma clave.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import {
  deleteProviderSecrets,
  envSecret,
  loadProviderApiKey,
  resetKeychainProbe,
  storeProviderApiKey,
} from "../packages/core/src/storage/crypto";
import { runInTenant } from "../packages/core/src/storage/tenant";
import { resolveProviderConfig } from "../packages/core/src/agent/llm-client";

/** Un proveedor inventado: el llavero real de quien corre la suite no se toca. */
const PROVIDER = "test-secrets-tenant";
const ENV_VAR = "TEST-SECRETS-TENANT_API_KEY";
const TENANT_A = "t_aaaaaaaa33333333";
const TENANT_B = "t_bbbbbbbb44444444";

/** Un llavero en memoria que registra quién lo usa. */
const keychain = new Map<string, string>();
const keychainCalls: string[] = [];
const realSecrets = (Bun as unknown as { secrets: unknown }).secrets;

beforeAll(() => {
  (Bun as unknown as { secrets: unknown }).secrets = {
    get: async ({ name }: { name: string }) => { keychainCalls.push(`get:${name}`); return keychain.get(name) ?? null; },
    set: async ({ name, value }: { name: string; value: string }) => { keychainCalls.push(`set:${name}`); keychain.set(name, value); },
    delete: async ({ name }: { name: string }) => { keychainCalls.push(`delete:${name}`); return keychain.delete(name); },
  };
  resetKeychainProbe();
});

afterAll(() => {
  (Bun as unknown as { secrets: unknown }).secrets = realSecrets;
  resetKeychainProbe();
  closeHiveDb();
});

beforeEach(async () => {
  closeHiveDb();
  await ensureHiveDb();
  resetKeychainProbe();
  keychain.clear();
  keychainCalls.length = 0;
});

describe("secretos por inquilino", () => {
  test("la clave que guarda un inquilino no la ve otro, aunque ya esté en caché", async () => {
    await runInTenant(TENANT_A, async () => {
      await storeProviderApiKey(PROVIDER, "clave-de-A");
      expect(await loadProviderApiKey(PROVIDER)).toBe("clave-de-A");
    });
    await runInTenant(TENANT_B, async () => {
      expect(await loadProviderApiKey(PROVIDER)).toBe("");
      const cfg = await resolveProviderConfig(PROVIDER, "modelo");
      expect(cfg.apiKey).toBe("");
    });
    // Ni el escritorio (sin inquilino) hereda la del cliente.
    expect(await loadProviderApiKey(PROVIDER)).toBe("");
  });

  test("dos inquilinos con claves distintas leen cada uno la suya", async () => {
    await runInTenant(TENANT_A, () => storeProviderApiKey(PROVIDER, "clave-de-A"));
    await runInTenant(TENANT_B, () => storeProviderApiKey(PROVIDER, "clave-de-B"));
    const [a, b] = await Promise.all([
      runInTenant(TENANT_A, () => loadProviderApiKey(PROVIDER)),
      runInTenant(TENANT_B, () => loadProviderApiKey(PROVIDER)),
    ]);
    expect(a).toBe("clave-de-A");
    expect(b).toBe("clave-de-B");
  });

  test("borrar la clave de un inquilino no toca la de otro", async () => {
    await runInTenant(TENANT_A, () => storeProviderApiKey(PROVIDER, "clave-de-A"));
    await runInTenant(TENANT_B, () => storeProviderApiKey(PROVIDER, "clave-de-B"));
    await runInTenant(TENANT_A, () => deleteProviderSecrets(PROVIDER));
    expect(await runInTenant(TENANT_A, () => loadProviderApiKey(PROVIDER))).toBe("");
    expect(await runInTenant(TENANT_B, () => loadProviderApiKey(PROVIDER))).toBe("clave-de-B");
  });

  test("con inquilino activo el llavero del SO no se lee, no se escribe ni se borra", async () => {
    keychain.set(`provider:${PROVIDER}:api_key`, "clave-del-escritorio");
    await runInTenant(TENANT_A, async () => {
      expect(await loadProviderApiKey(PROVIDER)).toBe("");
      await storeProviderApiKey(PROVIDER, "clave-de-A");
      await deleteProviderSecrets(PROVIDER);
    });
    expect(keychainCalls).toEqual([]);
    expect(keychain.get(`provider:${PROVIDER}:api_key`)).toBe("clave-del-escritorio");
  });

  test("sin inquilino (escritorio) el llavero sigue siendo el respaldo", async () => {
    keychain.set(`provider:${PROVIDER}:api_key`, "clave-del-escritorio");
    expect(await loadProviderApiKey(PROVIDER)).toBe("clave-del-escritorio");
    await storeProviderApiKey(PROVIDER, "nueva");
    expect(keychain.get(`provider:${PROVIDER}:api_key`)).toBe("nueva");
  });
});

describe("variables de entorno por inquilino", () => {
  afterAll(() => { delete process.env[ENV_VAR]; });

  test("dentro de un inquilino la clave del entorno (la de la plataforma) no se usa", async () => {
    process.env[ENV_VAR] = "clave-de-la-plataforma";
    await runInTenant(TENANT_A, async () => {
      expect(envSecret(ENV_VAR)).toBeUndefined();
      expect((await resolveProviderConfig(PROVIDER, "modelo")).apiKey).toBe("");
      // La del inquilino, por credentials o guardada, sigue funcionando.
      expect((await resolveProviderConfig(PROVIDER, "modelo", { apiKey: "clave-de-A" })).apiKey).toBe("clave-de-A");
      await storeProviderApiKey(PROVIDER, "guardada-de-A");
      expect((await resolveProviderConfig(PROVIDER, "modelo")).apiKey).toBe("guardada-de-A");
    });
  });

  test("sin inquilino (escritorio) el entorno sigue siendo el último respaldo", async () => {
    process.env[ENV_VAR] = "clave-del-escritorio";
    expect(envSecret(ENV_VAR)).toBe("clave-del-escritorio");
    expect((await resolveProviderConfig(PROVIDER, "modelo")).apiKey).toBe("clave-del-escritorio");
  });
});
