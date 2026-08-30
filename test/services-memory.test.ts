/**
 * El servicio de memoria y sus tools tienen que producir el mismo efecto.
 *
 * Estas operaciones vivían sólo dentro de `memoryWriteTool` y sus hermanas, con
 * argumentos con forma de LLM y respuestas escritas para un prompt. Ahora la
 * implementación está en `services/memory.ts` y las tools la envuelven.
 *
 * Los tests de abajo fijan las dos mitades del contrato: que el servicio hace
 * lo que dice, y que la tool sigue devolviendo exactamente lo que el modelo
 * espera — porque si el envoltorio cambia la forma, el agente se rompe sin que
 * ningún test de servicio se entere.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import {
  writeMemory, readMemory, listMemories, searchMemories, deleteMemory,
} from "../packages/core/src/services/memory";
import {
  memoryWriteTool, memoryReadTool, memoryListTool, memorySearchTool, memoryDeleteTool,
} from "../packages/core/src/tools/agents/index";

beforeEach(async () => {
  closeHiveDb();
  await ensureHiveDb();
});

afterEach(() => {
  closeHiveDb();
});

describe("services/memory", () => {
  test("escribir y leer devuelve el contenido", async () => {
    await writeMemory("presupuesto", "el tope es 5000");
    expect((await readMemory("presupuesto"))?.content).toBe("el tope es 5000");
  });

  test("escribir el mismo título actualiza y conserva created_at", async () => {
    const primera = await writeMemory("nota", "v1");
    await new Promise((r) => setTimeout(r, 2));
    const segunda = await writeMemory("nota", "v2");

    expect(segunda.content).toBe("v2");
    expect(segunda.createdAt).toBe(primera.createdAt);
    expect(segunda.updatedAt).toBeGreaterThan(primera.updatedAt);
    expect(await listMemories()).toHaveLength(1);
  });

  test("leer algo inexistente devuelve null, no lanza", async () => {
    expect(await readMemory("no-existe")).toBeNull();
  });

  test("un título vacío se rechaza", async () => {
    await expect(writeMemory("   ", "x")).rejects.toThrow(/título/);
  });

  test("listar ordena de la más reciente a la más vieja", async () => {
    await writeMemory("vieja", "a");
    await new Promise((r) => setTimeout(r, 2));
    await writeMemory("nueva", "b");
    expect((await listMemories()).map((m) => m.title)).toEqual(["nueva", "vieja"]);
  });

  test("buscar mira título y contenido", async () => {
    await writeMemory("cliente Acme", "pidió tres informes");
    await writeMemory("otra cosa", "mención a Acme adentro");

    expect(await searchMemories("acme")).toHaveLength(2);
    expect(await searchMemories("informes")).toHaveLength(1);
    expect(await searchMemories("nada")).toHaveLength(0);
  });

  test("borrar devuelve false si no existía", async () => {
    expect(await deleteMemory("fantasma")).toBe(false);
    await writeMemory("real", "x");
    expect(await deleteMemory("real")).toBe(true);
    expect(await readMemory("real")).toBeNull();
  });
});

describe("las tools siguen siendo envoltorios equivalentes", () => {
  test("memory_write persiste lo mismo que el servicio", async () => {
    const res = await memoryWriteTool.execute({ title: "t", content: "c" }) as any;
    expect(res.ok).toBe(true);
    // El efecto se verifica por el servicio, no por lo que la tool dice.
    expect((await readMemory("t"))?.content).toBe("c");
  });

  test("memory_read conserva el formato que espera el modelo", async () => {
    await writeMemory("t", "c");
    const res = await memoryReadTool.execute({ title: "t" }) as any;

    expect(res.ok).toBe(true);
    expect(res.content).toBe("c");
    // Fechas como ISO, no como epoch: es lo que el prompt sabe leer.
    expect(res.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("memory_read devuelve ok:false en vez de lanzar", async () => {
    const res = await memoryReadTool.execute({ title: "no-existe" }) as any;
    expect(res.ok).toBe(false);
    expect(res.error).toContain("not found");
  });

  test("memory_list y memory_search conservan sus campos", async () => {
    await writeMemory("uno", "contenido con dato");

    const lista = await memoryListTool.execute({}) as any;
    expect(lista.count).toBe(1);
    expect(lista.entries[0].title).toBe("uno");

    const busq = await memorySearchTool.execute({ query: "dato" }) as any;
    expect(busq.count).toBe(1);
    expect(busq.results[0].snippet).toContain("dato");
  });

  test("memory_delete informa el fallo sin lanzar", async () => {
    const res = await memoryDeleteTool.execute({ title: "fantasma" }) as any;
    expect(res.ok).toBe(false);
  });

  test("un contenido largo se recorta en el snippet de búsqueda", async () => {
    await writeMemory("largo", "x".repeat(500));
    const res = await memorySearchTool.execute({ query: "xxx" }) as any;
    expect(res.results[0].snippet).toEndWith("...");
    expect(res.results[0].snippet.length).toBeLessThan(500);
  });
});

describe("aislamiento por usuario", () => {
  test("dos usuarios no se ven la memoria en el mismo proceso", async () => {
    await writeMemory("presupuesto", "el de Ana es 5000", "ana");
    await writeMemory("presupuesto", "el de Beto es 900", "beto");

    // El mismo título en dos usuarios son dos memorias distintas: antes el id
    // era sólo el título y la segunda escritura pisaba la primera.
    expect((await readMemory("presupuesto", "ana"))?.content).toBe("el de Ana es 5000");
    expect((await readMemory("presupuesto", "beto"))?.content).toBe("el de Beto es 900");
  });

  test("listar sólo devuelve lo propio", async () => {
    await writeMemory("a", "1", "ana");
    await writeMemory("b", "2", "ana");
    await writeMemory("c", "3", "beto");

    expect((await listMemories("ana")).map((m) => m.title).sort()).toEqual(["a", "b"]);
    expect((await listMemories("beto")).map((m) => m.title)).toEqual(["c"]);
  });

  test("buscar no cruza usuarios", async () => {
    await writeMemory("secreto de ana", "contraseña wifi", "ana");
    await writeMemory("nota de beto", "otra cosa", "beto");

    expect(await searchMemories("wifi", "beto")).toHaveLength(0);
    expect(await searchMemories("wifi", "ana")).toHaveLength(1);
  });

  test("borrar la de uno no toca la del otro", async () => {
    await writeMemory("compartida", "de ana", "ana");
    await writeMemory("compartida", "de beto", "beto");

    expect(await deleteMemory("compartida", "ana")).toBe(true);
    expect(await readMemory("compartida", "ana")).toBeNull();
    expect((await readMemory("compartida", "beto"))?.content).toBe("de beto");
  });

  test("sin userId explícito se resuelve el del contexto", async () => {
    // Es lo que hace que las tools del modelo sigan funcionando sin cambios.
    await writeMemory("sin dueño explícito", "x");
    expect((await readMemory("sin dueño explícito"))?.content).toBe("x");
  });
});
