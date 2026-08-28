/**
 * Contrato de `exports`: todo subpath declarado tiene que importarse.
 *
 * Los deep-imports del SDK se han roto entre versiones sin aviso (ver el commit
 * "fix deep-imports" y el comentario de hive-cloud sobre el subpath `/tools`
 * roto). El consumidor se defendió pineando la versión exacta en tres
 * package.json distintos, que es el síntoma, no la solución: nada verificaba que
 * lo declarado en `exports` resolviera de verdad.
 *
 * Este test recorre `exports` del package.json y realmente importa cada entrada.
 * Un subpath que apunte a un archivo movido o borrado falla acá, no en el build
 * de quien consume el paquete.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect } from "bun:test";
import pkg from "../package.json";

const SUBPATHS = Object.keys(pkg.exports).filter((k) => k !== "./package.json");

/** `.` → el nombre del paquete; `./agent` → `@johpaz/hive-sdk/agent`. */
function specifierFor(subpath: string): string {
  return subpath === "." ? pkg.name : `${pkg.name}/${subpath.slice(2)}`;
}

describe("contrato de exports", () => {
  test("declara al menos los subpaths del cerebro", () => {
    // Las cinco piezas que el SDK expone como cerebro de Hive.
    for (const required of ["./agent", "./sessions", "./swarm", "./harness", "./models"]) {
      expect(SUBPATHS).toContain(required);
    }
  });

  test.each(SUBPATHS)("%s se puede importar", async (subpath) => {
    const mod = await import(specifierFor(subpath));
    // Un módulo que resuelve pero no exporta nada casi siempre es un barrel
    // apuntando a un archivo equivocado.
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });

  test("cada subpath apunta a un archivo que existe", async () => {
    const missing: string[] = [];
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      if (typeof target !== "string") continue;
      if (!(await Bun.file(target).exists())) missing.push(`${subpath} → ${target}`);
    }
    expect(missing).toEqual([]);
  });
});
