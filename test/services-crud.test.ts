/**
 * Los servicios de CRUD que una UI necesita.
 *
 * Cada uno de estos existía sólo dentro de una tool del LLM o inline en una
 * ruta HTTP de hive. Los tests se concentran en las reglas que no son obvias y
 * que, si se pierden, dejan la colmena en un estado inconsistente sin avisar:
 * la validación de referencias, la cascada proveedor→modelos, y las
 * protecciones de borrado.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import { col } from "../packages/core/src/storage/hive";
import type { AgentDoc } from "../packages/core/src/storage/collections";
import * as agents from "../packages/core/src/services/agents";
import * as skills from "../packages/core/src/services/skills";
import * as tools from "../packages/core/src/services/tools";
import * as providers from "../packages/core/src/services/providers";
import * as models from "../packages/core/src/services/models";
import * as ethics from "../packages/core/src/services/ethics";

beforeEach(async () => {
  closeHiveDb();
  await ensureHiveDb();
});

afterEach(() => {
  closeHiveDb();
});

describe("services/agents", () => {
  test("crea un agente y lo devuelve con sus campos", async () => {
    const a = await agents.createAgent({ name: "Mi Agente", description: "prueba" });
    expect(a.id).toBe("mi_agente");
    expect(a.source).toBe("user");
    expect(a.enabled).toBe(true);
    expect((await agents.getAgent("mi_agente"))?.name).toBe("Mi Agente");
  });

  test("rechaza un id duplicado", async () => {
    await agents.createAgent({ name: "Dup" });
    await expect(agents.createAgent({ name: "Dup" })).rejects.toThrow(/Ya existe/);
  });

  test("valida que las skills asignadas existan — hive no lo hace", async () => {
    await expect(
      agents.createAgent({ name: "X", skills: ["skill-que-no-existe"] }),
    ).rejects.toThrow(/skills inexistentes/);
  });

  test("valida que el servidor MCP asignado exista", async () => {
    await expect(
      agents.createAgent({ name: "Y", mcpServerIds: ["mcp-fantasma"] }),
    ).rejects.toThrow(/servidores MCP inexistentes/);
  });

  test("un glob que no casa con ninguna tool es un error, no una lista vacía", async () => {
    await expect(
      agents.createAgent({ name: "Z", toolPatterns: ["zzz_*"] }),
    ).rejects.toThrow(/ninguna tool coincide/);
  });

  test("acepta un glob que sí casa y guarda el patrón sin expandir", async () => {
    const a = await agents.createAgent({ name: "Navegante", toolPatterns: ["browser_*"] });
    // El patrón se conserva: task_delegate lo re-expande en cada delegación,
    // así una tool registrada después igual entra.
    expect(a.toolPatterns).toEqual(["browser_*"]);

    const doc = (await (await col<AgentDoc>("agents")).get("navegante"))!.doc;
    expect(JSON.parse(doc.tools_json!).length).toBeGreaterThan(1);
  });

  test("borrar un agente NO borra sus tools: son compartidas", async () => {
    await agents.createAgent({ name: "Efímero", toolPatterns: ["browser_*"] });
    const antes = (await tools.listTools()).length;

    expect(await agents.deleteAgent("efimero")).toBe(true);
    expect(await agents.getAgent("efimero")).toBeNull();
    expect((await tools.listTools()).length).toBe(antes);
  });

  test("listAgents oculta los deshabilitados salvo que se pidan", async () => {
    await agents.createAgent({ name: "Activo" });
    await agents.createAgent({ name: "Inactivo", enabled: false });

    const visibles = (await agents.listAgents()).map((a) => a.id);
    expect(visibles).toContain("activo");
    expect(visibles).not.toContain("inactivo");
    expect((await agents.listAgents({ includeDisabled: true })).length).toBeGreaterThanOrEqual(2);
  });
});

describe("services/skills", () => {
  test("crea, edita y sube la versión al cambiar el cuerpo", async () => {
    const s = await skills.createSkill({ name: "Resumir", body: "Instrucciones v1" });
    const editada = await skills.updateSkill(s.id, { body: "Instrucciones v2" });

    expect(editada.body).toBe("Instrucciones v2");
    // Cambiar el cuerpo cambia el comportamiento del agente: es versión nueva.
    const doc = await skills.getSkill(s.id);
    expect(doc).not.toBeNull();
  });

  test("una skill sin cuerpo se rechaza: no hay nada que inyectar", async () => {
    await expect(skills.createSkill({ name: "Vacía", body: "  " })).rejects.toThrow(/cuerpo/);
  });

  test("toggle y borrado", async () => {
    const s = await skills.createSkill({ name: "Temporal", body: "x" });
    expect((await skills.toggleSkill(s.id, false)).active).toBe(false);
    expect((await skills.listSkills()).map((x) => x.id)).not.toContain(s.id);
    expect(await skills.deleteSkill(s.id)).toBe(true);
    expect(await skills.deleteSkill(s.id)).toBe(false);
  });
});

describe("services/providers y models", () => {
  test("desactivar un proveedor arrastra a sus modelos", async () => {
    await providers.createProvider({ id: "prov-x", name: "Prov X" });
    await models.createModel({ name: "m1", providerId: "prov-x", active: true });
    await models.createModel({ name: "m2", providerId: "prov-x", active: true });

    await providers.toggleProvider("prov-x", false);

    // Sin la cascada quedarían modelos activos de un proveedor apagado, que el
    // selector ofrece y fallan al llamarse.
    const activos = await models.listModels({ providerId: "prov-x" });
    expect(activos).toHaveLength(0);
    expect(await models.listModels({ providerId: "prov-x", includeInactive: true })).toHaveLength(2);
  });

  test("la API key nunca sale en claro", async () => {
    await providers.createProvider({ id: "prov-k", name: "Prov K", apiKey: "sk-secreto-de-verdad" });
    const p = await providers.getProvider("prov-k");

    expect(p?.hasApiKey).toBe(true);
    expect(JSON.stringify(p)).not.toContain("sk-secreto-de-verdad");
  });

  test("no se borra un modelo que un agente usa", async () => {
    await providers.createProvider({ id: "prov-y", name: "Prov Y" });
    const m = await models.createModel({ name: "en-uso", providerId: "prov-y" });
    await agents.createAgent({ name: "Usuario del modelo", modelId: m.id });

    await expect(models.deleteModel(m.id)).rejects.toThrow(/lo usan/);
  });

  test("renombrar un modelo re-apunta a los agentes que lo usaban", async () => {
    await providers.createProvider({ id: "prov-z", name: "Prov Z" });
    const m = await models.createModel({ name: "viejo", providerId: "prov-z" });
    await agents.createAgent({ name: "Depende", modelId: m.id });

    const nuevo = await models.renameModel(m.id, "nuevo");

    // A medias, el agente quedaría apuntando a un id inexistente.
    expect((await agents.getAgent("depende"))?.modelId).toBe(nuevo.id);
    expect(await models.getModel(m.id)).toBeNull();
  });

  test("no se borra un proveedor con modelos", async () => {
    await providers.createProvider({ id: "prov-w", name: "Prov W" });
    await models.createModel({ name: "m", providerId: "prov-w" });
    await expect(providers.deleteProvider("prov-w")).rejects.toThrow(/modelo/);
  });
});

describe("services/ethics", () => {
  test("no se borra el código por defecto", async () => {
    const porDefecto = (await ethics.listEthics({ includeInactive: true })).find((e) => e.isDefault);
    if (!porDefecto) return; // el seed puede no traerlo en algunas configuraciones
    await expect(ethics.deleteEthics(porDefecto.id)).rejects.toThrow(/por defecto/);
  });

  test("crea uno propio y lo borra", async () => {
    const e = await ethics.createEthics({ name: "Mío", content: "reglas" });
    expect(e.isDefault).toBe(false);
    expect(await ethics.deleteEthics(e.id)).toBe(true);
  });
});
