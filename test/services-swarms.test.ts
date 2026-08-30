/**
 * Enjambres guardados.
 *
 * Antes de `SwarmDoc` un enjambre existía sólo mientras corría: `runRoleSwarm`
 * recibe los agentes en la llamada y no persiste nada. Quien armara uno desde
 * una UI lo perdía al cerrar la ventana — era el bloqueador real para poner una
 * interfaz encima del SDK.
 *
 * Los tests se concentran en la validación al guardar, que es donde está la
 * decisión de diseño: un enjambre mal configurado tiene que fallar al crearse,
 * no semanas después cuando alguien lo ejecuta.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import * as agents from "../packages/core/src/services/agents";
import * as swarms from "../packages/core/src/services/swarms";

async function sembrarAgentes() {
  await agents.createAgent({ name: "Jefe" });
  await agents.createAgent({ name: "Obrero Uno" });
  await agents.createAgent({ name: "Obrero Dos" });
}

beforeEach(async () => {
  closeHiveDb();
  await ensureHiveDb();
  await sembrarAgentes();
});

afterEach(() => {
  closeHiveDb();
});

describe("services/swarms: guardar", () => {
  test("un enjambre secuencial sobrevive a la sesión", async () => {
    const s = await swarms.createSwarm({
      name: "Cadena de revisión",
      strategy: "sequential",
      members: [{ agentId: "obrero_uno" }, { agentId: "obrero_dos" }],
    });

    expect(s.id).toBe("cadena_de_revision");
    // Lo que antes se perdía al cerrar la ventana.
    const recuperado = await swarms.getSwarm(s.id);
    expect(recuperado?.members).toHaveLength(2);
    expect(recuperado?.strategy).toBe("sequential");
  });

  test("el orden se conserva aunque no se declare", async () => {
    const s = await swarms.createSwarm({
      name: "Ordenado",
      strategy: "sequential",
      members: [{ agentId: "obrero_dos" }, { agentId: "obrero_uno" }],
    });
    expect(s.members.map((m) => m.agentId)).toEqual(["obrero_dos", "obrero_uno"]);
    expect(s.members.map((m) => m.orderIndex)).toEqual([0, 1]);
  });

  test("un agente inexistente se rechaza al guardar, no al correr", async () => {
    await expect(
      swarms.createSwarm({ name: "Roto", strategy: "parallel", members: [{ agentId: "fantasma" }] }),
    ).rejects.toThrow(/agentes inexistentes/);
  });

  test("un enjambre vacío se rechaza", async () => {
    await expect(
      swarms.createSwarm({ name: "Vacío", strategy: "parallel", members: [] }),
    ).rejects.toThrow(/al menos un agente/);
  });

  test("jerárquico sin orquestador se rechaza", async () => {
    await expect(
      swarms.createSwarm({
        name: "Sin jefe", strategy: "hierarchical",
        members: [{ agentId: "obrero_uno", role: "worker" }],
      }),
    ).rejects.toThrow(/orquestador/);
  });

  test("jerárquico sin trabajadores se rechaza", async () => {
    await expect(
      swarms.createSwarm({
        name: "Sin obreros", strategy: "hierarchical",
        members: [{ agentId: "jefe", role: "orchestrator" }],
      }),
    ).rejects.toThrow(/worker/);
  });

  test("jerárquico válido guarda su orquestador", async () => {
    const s = await swarms.createSwarm({
      name: "Con jefe", strategy: "hierarchical",
      members: [
        { agentId: "jefe", role: "orchestrator" },
        { agentId: "obrero_uno", role: "worker" },
      ],
    });
    expect(s.orchestratorAgentId).toBe("jefe");
  });

  test("las estrategias no jerárquicas no guardan orquestador", async () => {
    const s = await swarms.createSwarm({
      name: "Paralelo", strategy: "parallel",
      members: [{ agentId: "obrero_uno" }, { agentId: "obrero_dos" }],
    });
    // No hay a quién delegar: guardar un orquestador ahí sería mentir.
    expect(s.orchestratorAgentId).toBeNull();
  });

  test("no se permiten dos enjambres con el mismo id", async () => {
    await swarms.createSwarm({ name: "Único", strategy: "parallel", members: [{ agentId: "obrero_uno" }] });
    await expect(
      swarms.createSwarm({ name: "Único", strategy: "parallel", members: [{ agentId: "obrero_dos" }] }),
    ).rejects.toThrow(/Ya existe/);
  });
});

describe("services/swarms: editar y borrar", () => {
  test("cambiar a jerárquico revalida: sin orquestador falla", async () => {
    const s = await swarms.createSwarm({
      name: "Mutante", strategy: "parallel",
      members: [{ agentId: "obrero_uno" }, { agentId: "obrero_dos" }],
    });

    await expect(swarms.updateSwarm(s.id, { strategy: "hierarchical" })).rejects.toThrow(/orquestador/);
    // Y el enjambre queda intacto, no a medio migrar.
    expect((await swarms.getSwarm(s.id))?.strategy).toBe("parallel");
  });

  test("cambiar los integrantes valida los nuevos", async () => {
    const s = await swarms.createSwarm({
      name: "Editable", strategy: "parallel", members: [{ agentId: "obrero_uno" }],
    });
    await expect(
      swarms.updateSwarm(s.id, { members: [{ agentId: "no-existe" }] }),
    ).rejects.toThrow(/agentes inexistentes/);
  });

  test("deshabilitar lo saca de la lista pero no lo borra", async () => {
    const s = await swarms.createSwarm({
      name: "Pausable", strategy: "parallel", members: [{ agentId: "obrero_uno" }],
    });

    await swarms.toggleSwarm(s.id, false);
    expect((await swarms.listSwarms()).map((x) => x.id)).not.toContain(s.id);
    expect((await swarms.listSwarms({ includeDisabled: true })).map((x) => x.id)).toContain(s.id);
  });

  test("borrar el enjambre no borra sus agentes", async () => {
    const s = await swarms.createSwarm({
      name: "Desechable", strategy: "parallel", members: [{ agentId: "obrero_uno" }],
    });

    expect(await swarms.deleteSwarm(s.id)).toBe(true);
    // Los agentes pertenecen a la colmena, no al enjambre.
    expect(await agents.getAgent("obrero_uno")).not.toBeNull();
  });
});

describe("services/swarms: ejecutar", () => {
  test("un enjambre deshabilitado no corre", async () => {
    const s = await swarms.createSwarm({
      name: "Apagado", strategy: "parallel",
      members: [{ agentId: "obrero_uno" }], enabled: false,
    });
    // Si corriera igual, el interruptor de la UI sería decorativo.
    await expect(swarms.runSwarm(s.id, "hola")).rejects.toThrow(/deshabilitado/);
  });

  test("correr uno inexistente falla con un mensaje claro", async () => {
    await expect(swarms.runSwarm("fantasma", "hola")).rejects.toThrow(/No existe el enjambre/);
  });
});
