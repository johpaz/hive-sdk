/**
 * Crear un enjambre y el seed selectivo, conectados.
 *
 * El seed selectivo dejaba elegir especialistas al instalar, pero `createSwarm`
 * no lo miraba: guardaba el enjambre con miembros apagados y sus tools
 * inactivas, sin una queja. El enjambre existía y no podía trabajar.
 *
 * Lo que estos tests fijan es que **el usuario decide**: por defecto crear un
 * enjambre no cambia en silencio las capacidades de la instalación, pero el
 * faltante se informa; con `activateMembers` se siembra lo que haga falta.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import { col } from "../packages/core/src/storage/hive";
import type { AgentDoc, ToolDoc, SkillDoc } from "../packages/core/src/storage/collections";
import * as setup from "../packages/core/src/services/setup";
import { MINIMAL_TOOLS } from "../packages/core/src/agent/minimal-loadout";
import { createSwarm, updateSwarm } from "../packages/core/src/services/swarms";

const habilitado = async (id: string) =>
  !!(await (await col<AgentDoc>("agents")).get(id))?.doc.enabled;
const toolActiva = async (n: string) =>
  !!(await (await col<ToolDoc>("tools")).get(n))?.doc.active;

beforeEach(async () => {
  closeHiveDb();
  await ensureHiveDb();
});
afterEach(() => closeHiveDb());

const cuenta = async () => ({
  agentes: (await (await col<AgentDoc>("agents")).scan({})).filter((e) => e.doc.source === "catalog").length,
  toolsActivas: (await (await col<ToolDoc>("tools")).scan({})).filter((e) => e.doc.active).length,
  toolsTotal: (await (await col<ToolDoc>("tools")).scan({})).length,
  skillsActivas: (await (await col<SkillDoc>("skills")).scan({})).filter((e) => e.doc.active).length,
});

describe("planActivationFor: qué se encendería, sin encender", () => {
  test("informa el faltante y no toca nada", async () => {
    await setup.applySeedPlan(["web_researcher"]);

    const gap = await setup.planActivationFor(["software_engineer"]);

    expect(gap.agents).toEqual(["software_engineer"]);
    expect(gap.tools.length).toBeGreaterThan(0);
    // Es un plan, no una acción: si encendiera algo, la UI no podría preguntar
    // antes de confirmar.
    expect(await habilitado("software_engineer")).toBe(false);
  });

  test("un especialista ya activo no tiene faltante", async () => {
    await setup.applySeedPlan(["web_researcher"]);
    const gap = await setup.planActivationFor(["web_researcher"]);
    expect(gap).toEqual({ agents: [], tools: [], skills: [], nonCatalog: [] });
  });

  test("no promete encender lo que ya está encendido por otro", async () => {
    // `web_fetch` la comparten web_researcher y browser_operator. Con el
    // primero activo, agregar el segundo no la "va a activar": ya lo está.
    await setup.applySeedPlan(["web_researcher"]);
    expect(await toolActiva("web_fetch")).toBe(true);

    const gap = await setup.planActivationFor(["browser_operator"]);
    expect(gap.agents).toEqual(["browser_operator"]);
    expect(gap.tools).not.toContain("web_fetch");
  });

  test("los agentes que no son del catálogo se separan, no se rechazan", async () => {
    // Un agente creado por el usuario trae sus propias tools: no se siembra
    // desde el catálogo, pero tampoco puede hacer fallar el plan.
    const gap = await setup.planActivationFor(["web_researcher", "mi_agente_propio"]);
    expect(gap.nonCatalog).toEqual(["mi_agente_propio"]);
  });
});

describe("createSwarm sin activar (por defecto)", () => {
  test("crea el enjambre y avisa qué falta encender", async () => {
    await setup.applySeedPlan(["web_researcher"]);

    const s = await createSwarm({
      name: "Equipo mixto",
      strategy: "sequential",
      members: [{ agentId: "web_researcher" }, { agentId: "software_engineer" }],
    });

    expect(s.members).toHaveLength(2);
    expect(s.pendingActivation?.agents).toEqual(["software_engineer"]);
  });

  test("NO cambia las capacidades de la instalación", async () => {
    // Es la razón de que el default sea `false`: crear un enjambre no debería
    // encender de prepo tools que el usuario apagó a propósito.
    await setup.applySeedPlan(["web_researcher"]);
    expect(await toolActiva("cli_exec")).toBe(false);

    await createSwarm({
      name: "Equipo mixto",
      strategy: "sequential",
      members: [{ agentId: "web_researcher" }, { agentId: "software_engineer" }],
    });

    expect(await habilitado("software_engineer")).toBe(false);
    expect(await toolActiva("cli_exec")).toBe(false);
  });
});

describe("createSwarm con activateMembers", () => {
  test("enciende los especialistas y siembra sus tools", async () => {
    await setup.applySeedPlan(["web_researcher"]);
    expect(await toolActiva("cli_exec")).toBe(false);

    const s = await createSwarm({
      name: "Equipo mixto",
      strategy: "sequential",
      members: [{ agentId: "web_researcher" }, { agentId: "software_engineer" }],
      activateMembers: true,
    });

    expect(await habilitado("software_engineer")).toBe(true);
    expect(await toolActiva("cli_exec")).toBe(true);
    // Recalculado después de activar: ya no queda nada pendiente.
    expect(s.pendingActivation?.agents).toEqual([]);
  });

  test("no apaga lo que ya estaba activo por otro enjambre", async () => {
    // La trampa: sembrar "sólo lo del enjambre nuevo" dejaría sin capacidades a
    // los especialistas que el usuario ya tenía andando.
    await setup.applySeedPlan(["web_researcher"]);
    expect(await toolActiva("web_search")).toBe(true);

    await createSwarm({
      name: "Sólo ingeniería",
      strategy: "sequential",
      members: [{ agentId: "software_engineer" }],
      activateMembers: true,
    });

    expect(await habilitado("web_researcher")).toBe(true);
    expect(await toolActiva("web_search")).toBe(true);
    expect(await toolActiva("cli_exec")).toBe(true);
  });
});

describe("updateSwarm", () => {
  test("agregar un especialista después pasa por el mismo camino", async () => {
    await setup.applySeedPlan(["web_researcher"]);
    const s = await createSwarm({
      name: "Equipo",
      strategy: "sequential",
      members: [{ agentId: "web_researcher" }],
    });
    expect(s.pendingActivation?.agents).toEqual([]);

    const actualizado = await updateSwarm(s.id, {
      members: [{ agentId: "web_researcher" }, { agentId: "software_engineer" }],
      activateMembers: true,
    });

    expect(actualizado.members).toHaveLength(2);
    expect(await habilitado("software_engineer")).toBe(true);
    expect(actualizado.pendingActivation?.agents).toEqual([]);
  });

  test("sin activar, la edición también avisa el faltante", async () => {
    await setup.applySeedPlan(["web_researcher"]);
    const s = await createSwarm({
      name: "Equipo", strategy: "sequential", members: [{ agentId: "web_researcher" }],
    });

    const actualizado = await updateSwarm(s.id, {
      members: [{ agentId: "web_researcher" }, { agentId: "software_engineer" }],
    });

    expect(actualizado.pendingActivation?.agents).toEqual(["software_engineer"]);
    expect(await habilitado("software_engineer")).toBe(false);
  });
});

describe("seed inicial: elegir qué especialistas se instalan", () => {
  test('"none" deja la colmena vacía, con las mínimas prendidas', async () => {
    closeHiveDb();
    await ensureHiveDb({ specialists: "none" });

    const c = await cuenta();
    expect(c.agentes).toBe(0);
    expect(c.skillsActivas).toBe(0);
    // Las MINIMAL_TOOLS quedan activas igual: son la competencia del
    // coordinador —delegar, buscar, avisar— y sin ellas no hay colmena a la que
    // agregarle especialistas después.
    expect(c.toolsActivas).toBe(MINIMAL_TOOLS.size);
    // Las filas existen todas, apagadas: activarlas después no requiere volver
    // a sembrar desde el código.
    expect(c.toolsTotal).toBeGreaterThan(c.toolsActivas);
  });

  test('"all" es el default y no cambió', async () => {
    closeHiveDb();
    await ensureHiveDb();   // sin opciones
    const c = await cuenta();
    expect(c.agentes).toBe(8);
    expect(c.toolsActivas).toBe(c.toolsTotal);
  });

  test("una lista instala sólo esos y sus capacidades", async () => {
    closeHiveDb();
    await ensureHiveDb({ specialists: ["web_researcher"] });

    expect(await habilitado("web_researcher")).toBe(true);
    expect(await toolActiva("web_search")).toBe(true);
    expect(await toolActiva("cli_exec")).toBe(false);
    expect((await cuenta()).agentes).toBe(1);
  });

  test("cambiar a `none` NO borra los especialistas que ya estaban", async () => {
    // La garantía que hace seguro cambiar de modo: la elección gobierna qué se
    // CREA, nunca qué se conserva. Sin esto, un host que pruebe `none` perdería
    // los ocho agentes de una instalación en uso.
    expect((await cuenta()).agentes).toBe(8);   // el beforeEach sembró todo

    await ensureHiveDb({ specialists: "none" });

    expect((await cuenta()).agentes).toBe(8);
    expect(await habilitado("software_engineer")).toBe(true);
  });
});

describe("de una instalación limpia a un enjambre que funciona", () => {
  test("el enjambre trae a sus especialistas consigo", async () => {
    closeHiveDb();
    await ensureHiveDb({ specialists: "none" });
    expect((await cuenta()).agentes).toBe(0);

    const s = await createSwarm({
      name: "Mi equipo",
      strategy: "sequential",
      members: [{ agentId: "web_researcher" }, { agentId: "software_engineer" }],
      activateMembers: true,
    });

    expect(s.pendingActivation?.agents).toEqual([]);
    expect(await habilitado("web_researcher")).toBe(true);
    expect(await habilitado("software_engineer")).toBe(true);
    expect(await toolActiva("cli_exec")).toBe(true);
    expect(await toolActiva("web_search")).toBe(true);
  });

  test("se puede definir el enjambre antes de instalar a nadie", async () => {
    // Con el seed en `none` los especialistas no tienen fila todavía. Un
    // enjambre tiene que poder nombrarlos igual: es el pedido de instalación,
    // no una referencia a algo que debería existir.
    closeHiveDb();
    await ensureHiveDb({ specialists: "none" });

    const s = await createSwarm({
      name: "Para después",
      strategy: "sequential",
      members: [{ agentId: "software_engineer" }],
    });

    expect(s.members).toHaveLength(1);
    expect(s.pendingActivation?.agents).toEqual(["software_engineer"]);
    expect((await cuenta()).agentes).toBe(0);   // definir no instala
  });

  test("un agente que no existe ni es del catálogo sigue siendo un error", async () => {
    closeHiveDb();
    await ensureHiveDb({ specialists: "none" });
    await expect(createSwarm({
      name: "Roto", strategy: "sequential", members: [{ agentId: "no_existe" }],
    })).rejects.toThrow(/agentes inexistentes/);
  });
});
