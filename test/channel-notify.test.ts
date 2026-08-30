/**
 * La salida hacia el usuario.
 *
 * `notifyChannel` era un stub que sólo hacía `console.log` — y está en el camino
 * real: la tool `notify`, los reportes de progreso, el aviso de que una tarea
 * programada terminó, el de un turno interrumpido por un crash. Un agente sobre
 * el SDK no podía hablarle al usuario por ningún canal, mientras existía un
 * `ChannelManager` con adaptadores funcionales y nada que los conectara.
 *
 * Estos tests fijan las dos mitades: que el mensaje sale de verdad cuando hay
 * canales conectados, y que resuelve **a qué conversación** enviarlo — porque un
 * mensaje que llega al chat equivocado es tan inútil como uno que no llega.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import {
  setChannelManager, getChannelManager, notifyChannel, sendToUserChannel,
  type ChannelSender,
} from "../packages/core/src/gateway/channel-notify";
import { createSession } from "../packages/core/src/sessions";

/** Manager falso: registra lo enviado sin salir a ninguna red. */
function managerFalso() {
  const enviados: Array<{ channel: string; sessionId: string; message: unknown }> = [];
  const sender: ChannelSender = {
    async send(channel, sessionId, message) {
      enviados.push({ channel, sessionId, message });
    },
  };
  return { enviados, sender };
}

beforeEach(async () => {
  closeHiveDb();
  setChannelManager(null);
  await ensureHiveDb();
});

afterEach(() => {
  setChannelManager(null);
  closeHiveDb();
});

describe("channel-notify: el mensaje sale de verdad", () => {
  test("con un manager conectado, el mensaje llega al canal", async () => {
    const { enviados, sender } = managerFalso();
    setChannelManager(sender);

    await notifyChannel("telegram", "u1", "hola", { threadId: "u1/telegram/12345" });

    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.channel).toBe("telegram");
    expect(enviados[0]!.message).toBe("hola");
  });

  test("el sessionId sale del threadId: es a qué chat responder", async () => {
    const { enviados, sender } = managerFalso();
    setChannelManager(sender);

    await notifyChannel("telegram", "u1", "hola", { threadId: "u1/telegram/12345" });

    // Sin esto el mensaje llegaría al chat equivocado, que es tan inútil como
    // no llegar.
    expect(enviados[0]!.sessionId).toBe("12345");
  });

  test("sin threadId, se busca la conversación del usuario en ese canal", async () => {
    const { enviados, sender } = managerFalso();
    setChannelManager(sender);
    await createSession({ userId: "u1", channel: "telegram", peerId: "99999" });

    await notifyChannel("telegram", "u1", "hola");

    expect(enviados[0]!.sessionId).toBe("99999");
  });

  test("sendToUserChannel informa el éxito", async () => {
    const { sender } = managerFalso();
    setChannelManager(sender);
    expect(await sendToUserChannel("telegram", "u1", "x", { threadId: "u1/telegram/1" }))
      .toEqual({ ok: true });
  });
});

describe("channel-notify: degradación", () => {
  test("sin manager no lanza — hay procesos que no manejan canales", async () => {
    // Un script o un test no debería fallar por intentar notificar.
    expect(getChannelManager()).toBeNull();
    await expect(notifyChannel("telegram", "u1", "hola")).resolves.toBeUndefined();
  });

  test("un canal caído no tumba el turno que estaba notificando", async () => {
    setChannelManager({
      async send() { throw new Error("telegram caído"); },
    });

    const r = await sendToUserChannel("telegram", "u1", "hola", { threadId: "u1/telegram/1" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("caído");
  });

  test("se puede desconectar", async () => {
    const { enviados, sender } = managerFalso();
    setChannelManager(sender);
    setChannelManager(null);

    await notifyChannel("telegram", "u1", "hola", { threadId: "u1/telegram/1" });
    expect(enviados).toHaveLength(0);
  });
});
