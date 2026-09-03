/**
 * Aislamiento de varios enjambres dentro de UNA sola HiveDB, en UN solo proceso.
 *
 * Hive Cloud creaba una base física por enjambre y pagaba un proceso por turno
 * de agente para aislarlos. El aislamiento pasa a ser lógico: `col()` prefija el
 * nombre de la colección con el tenant activo.
 *
 * Lo que estos tests fijan como contrato:
 *  - dos inquilinos con el MISMO id de documento no se ven entre sí, ni por
 *    lectura directa ni por `scan`, `count` o los índices secundarios;
 *  - `findBy` es el caso que de verdad importa: un prefijo en el id del
 *    documento —la alternativa descartada— habría dejado esta puerta abierta,
 *    porque el índice se recorre por colección entera;
 *  - la unicidad de un índice `unique` es POR inquilino, no global;
 *  - sin tenant en scope nada cambia, para que la app de escritorio siga viendo
 *    exactamente los mismos nombres de colección;
 *  - `HIVE_TENANT_REQUIRED=1` convierte "esta ruta se olvidó del contexto" en un
 *    error ruidoso en vez de una escritura fuera de partición.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { col } from "../packages/core/src/storage/hive";
import {
  runInTenant,
  currentTenant,
  requireTenant,
  tenantKeyFromId,
  isTenantKey,
  qualify,
  unqualify,
  qualifyDocId,
  unqualifyDocId,
} from "../packages/core/src/storage/tenant";

const A = tenantKeyFromId("11111111-2222-3333-4444-555555555555");
const B = tenantKeyFromId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

interface Fila {
  id: string;
  nombre: string;
  status: string;
}

/** Colección propia del test: no colisiona con las del catálogo del SDK. */
const COL = "tenantScopingFixture";

beforeEach(() => {
  closeHiveDb();
});

afterEach(() => {
  delete process.env.HIVE_TENANT_REQUIRED;
  closeHiveDb();
});

describe("qualify: la forma física del nombre de colección", () => {
  test("sin tenant en scope es la identidad", () => {
    expect(currentTenant()).toBeNull();
    expect(qualify("agents")).toBe("agents");
    expect(qualifyDocId("tool:web_search")).toBe("tool:web_search");
  });

  test("con tenant en scope prefija, y unqualify lo revierte", () => {
    runInTenant(A, () => {
      expect(qualify("agents")).toBe(`${A}__agents`);
      expect(unqualify(qualify("agents"))).toBe("agents");
      expect(qualifyDocId("tool:web_search")).toBe(`${A}:tool:web_search`);
      expect(unqualifyDocId(qualifyDocId("tool:web_search"))).toBe("tool:web_search");
    });
  });

  test("unqualify deja intacto lo que no lleva prefijo", () => {
    expect(unqualify("agents")).toBe("agents");
    expect(unqualifyDocId("tool:web_search")).toBe("tool:web_search");
  });

  test("dos inquilinos nunca resuelven al mismo nombre físico", () => {
    const a = runInTenant(A, () => qualify(COL));
    const b = runInTenant(B, () => qualify(COL));
    expect(a).not.toBe(b);
  });

  test("rechaza una tenant key con forma inválida", () => {
    expect(() => runInTenant("no-es-una-key", () => 0)).toThrow(/tenant key inválida/);
    expect(isTenantKey(A)).toBe(true);
    expect(isTenantKey("agents")).toBe(false);
  });

  test("tenantKeyFromId normaliza un uuid y rechaza ids demasiado cortos", () => {
    expect(tenantKeyFromId("11111111-2222-3333-4444-555555555555")).toBe(
      "t_11111111222233334444555555555555"
    );
    expect(() => tenantKeyFromId("abc")).toThrow(/demasiado corto/);
  });
});

describe("modo estricto (HIVE_TENANT_REQUIRED)", () => {
  test("sin tenant en scope, qualify lanza en vez de escribir fuera de partición", () => {
    process.env.HIVE_TENANT_REQUIRED = "1";
    expect(() => qualify("agents")).toThrow(/no hay tenant en scope/);
  });

  test("con tenant en scope no estorba", () => {
    process.env.HIVE_TENANT_REQUIRED = "1";
    runInTenant(A, () => {
      expect(qualify("agents")).toBe(`${A}__agents`);
    });
  });

  test("requireTenant lanza fuera de contexto y devuelve la clave dentro", () => {
    expect(() => requireTenant("prueba")).toThrow(/requiere un tenant activo/);
    runInTenant(B, () => expect(requireTenant("prueba")).toBe(B));
  });
});

describe("aislamiento de documentos entre inquilinos", () => {
  test("el mismo id en dos inquilinos son dos documentos distintos", async () => {
    await runInTenant(A, async () => {
      const c = await col<Fila>(COL);
      await c.put("fila-1", { id: "fila-1", nombre: "de A", status: "activo" });
    });
    await runInTenant(B, async () => {
      const c = await col<Fila>(COL);
      await c.put("fila-1", { id: "fila-1", nombre: "de B", status: "activo" });
    });

    const enA = await runInTenant(A, async () => (await col<Fila>(COL)).get("fila-1"));
    const enB = await runInTenant(B, async () => (await col<Fila>(COL)).get("fila-1"));

    expect(enA?.doc.nombre).toBe("de A");
    expect(enB?.doc.nombre).toBe("de B");
  });

  test("scan y count sólo ven lo del inquilino activo", async () => {
    await runInTenant(A, async () => {
      const c = await col<Fila>(COL);
      for (const n of ["a1", "a2", "a3"]) {
        await c.put(n, { id: n, nombre: n, status: "activo" });
      }
    });
    await runInTenant(B, async () => {
      const c = await col<Fila>(COL);
      await c.put("b1", { id: "b1", nombre: "b1", status: "activo" });
    });

    const a = await runInTenant(A, async () => {
      const c = await col<Fila>(COL);
      return { filas: await c.scan({}), total: await c.count() };
    });
    const b = await runInTenant(B, async () => {
      const c = await col<Fila>(COL);
      return { filas: await c.scan({}), total: await c.count() };
    });

    expect(a.total).toBe(3);
    expect(b.total).toBe(1);
    expect(a.filas.map((f) => f.id).sort()).toEqual(["a1", "a2", "a3"]);
    expect(b.filas.map((f) => f.id)).toEqual(["b1"]);
  });

  /**
   * El test que decide el diseño. Prefijar el ID del documento (la alternativa
   * descartada) habría aislado `get` y `scan` pero NO esto: `findBy` recorre el
   * índice de la colección entera, así que B habría visto las filas de A.
   */
  test("findBy no cruza inquilinos", async () => {
    await runInTenant(A, async () => {
      const c = await col<Fila>(COL);
      await c.createIndex("status", { unique: false });
      await c.put("a1", { id: "a1", nombre: "a1", status: "en-cola" });
      await c.put("a2", { id: "a2", nombre: "a2", status: "en-cola" });
    });
    await runInTenant(B, async () => {
      const c = await col<Fila>(COL);
      await c.createIndex("status", { unique: false });
      await c.put("b1", { id: "b1", nombre: "b1", status: "en-cola" });
    });

    const a = await runInTenant(A, async () =>
      (await col<Fila>(COL)).findBy("status", "en-cola")
    );
    const b = await runInTenant(B, async () =>
      (await col<Fila>(COL)).findBy("status", "en-cola")
    );

    expect(a.map((e) => e.id).sort()).toEqual(["a1", "a2"]);
    expect(b.map((e) => e.id)).toEqual(["b1"]);
  });

  test("la unicidad de un índice unique es por inquilino, no global", async () => {
    const escribir = async (tenant: string) =>
      runInTenant(tenant, async () => {
        const c = await col<Fila>(COL);
        await c.createIndex("nombre", { unique: true });
        await c.put(`${tenant}-1`, { id: `${tenant}-1`, nombre: "mismo-nombre", status: "x" });
      });

    await escribir(A);
    // Si la unicidad fuese global, esto reventaría por conflicto con la fila de A.
    await escribir(B);

    const a = await runInTenant(A, async () => (await col<Fila>(COL)).findBy("nombre", "mismo-nombre"));
    const b = await runInTenant(B, async () => (await col<Fila>(COL)).findBy("nombre", "mismo-nombre"));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].id).toBe(`${A}-1`);
    expect(b[0].id).toBe(`${B}-1`);
  });

  test("borrar en un inquilino no toca al otro", async () => {
    for (const t of [A, B]) {
      await runInTenant(t, async () => {
        const c = await col<Fila>(COL);
        await c.put("compartido", { id: "compartido", nombre: t, status: "activo" });
      });
    }
    await runInTenant(A, async () => (await col<Fila>(COL)).delete("compartido"));

    expect(await runInTenant(A, async () => (await col<Fila>(COL)).get("compartido"))).toBeUndefined();
    const enB = await runInTenant(B, async () => (await col<Fila>(COL)).get("compartido"));
    expect(enB?.doc.nombre).toBe(B);
  });
});

describe("concurrencia: el contexto sobrevive a los await entrelazados", () => {
  /**
   * Secuencial no prueba nada del AsyncLocalStorage. Lo que puede romperse es
   * que dos inquilinos se pisen mientras sus `await` se intercalan en el mismo
   * event loop — que es exactamente lo que pasa cuando un proceso atiende dos
   * enjambres a la vez.
   */
  test("dos inquilinos concurrentes con awaits intercalados no se pisan", async () => {
    const trabajo = (tenant: string, marca: string) =>
      runInTenant(tenant, async () => {
        const c1 = await col<Fila>(COL);
        await c1.put(marca, { id: marca, nombre: tenant, status: "activo" });
        await new Promise((r) => setTimeout(r, 5));
        expect(currentTenant()).toBe(tenant);
        const c2 = await col<Fila>(COL);
        await new Promise((r) => setTimeout(r, 1));
        expect(currentTenant()).toBe(tenant);
        return { visto: (await c2.scan({})).map((f) => f.id).sort(), tenant: currentTenant() };
      });

    const [ra, rb] = await Promise.all([trabajo(A, "solo-a"), trabajo(B, "solo-b")]);

    expect(ra.tenant).toBe(A);
    expect(rb.tenant).toBe(B);
    expect(ra.visto).toEqual(["solo-a"]);
    expect(rb.visto).toEqual(["solo-b"]);
  });

  test("al salir del contexto no queda tenant colgando", async () => {
    await runInTenant(A, async () => {
      await new Promise((r) => setTimeout(r, 1));
    });
    expect(currentTenant()).toBeNull();
  });
});

describe("compatibilidad: sin tenant nada cambia", () => {
  test("los documentos escritos sin tenant no los ve ningún inquilino", async () => {
    const c = await col<Fila>(COL);
    await c.put("local", { id: "local", nombre: "escritorio", status: "activo" });

    expect(await runInTenant(A, async () => (await col<Fila>(COL)).get("local"))).toBeUndefined();
    expect((await c.get("local"))?.doc.nombre).toBe("escritorio");
  });

  test("lo escrito por un inquilino no aparece en el modo local", async () => {
    await runInTenant(B, async () => {
      const c = await col<Fila>(COL);
      await c.put("de-b", { id: "de-b", nombre: "b", status: "activo" });
    });
    const c = await col<Fila>(COL);
    expect(await c.get("de-b")).toBeUndefined();
  });
});

describe("log causal: lo que no se puede aislar se apaga", () => {
  test("las lecturas agregadas quedan desactivadas bajo un tenant", async () => {
    const { causalReadsEnabled } = await import(
      "../packages/core/src/storage/causal-events"
    );
    // `causalThread` / `buildAgentContext` / `toolStats` recorren todos los
    // shards de la base: sobre una base compartida devolverían datos de otros
    // inquilinos. Hasta que el motor exponga variantes acotadas por agente, la
    // respuesta correcta bajo tenant es "no", nunca "sí a medias".
    runInTenant(A, () => expect(causalReadsEnabled()).toBe(false));
    runInTenant(B, () => expect(causalReadsEnabled()).toBe(false));
  });

  test("un tail sin agentId se rechaza bajo un tenant en vez de cruzar eventos", async () => {
    const { watchCausalEvents } = await import(
      "../packages/core/src/storage/causal-events"
    );
    await expect(
      runInTenant(A, () => watchCausalEvents({ kind: "IntentLogged" } as any))
    ).rejects.toThrow(/debe fijar agentId/);
  });
});
