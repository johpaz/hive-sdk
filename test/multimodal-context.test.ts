/**
 * Las imágenes dejan de reenviarse en cada turno.
 *
 * `content_multimodal` guardaba el `ContentPart[]` completo —base64 incluido— y
 * `toAPIMessages` lo devolvía al modelo en **cada turno siguiente**: cinco fotos
 * en una conversación eran cinco fotos viajando una y otra vez. Y `token_count`
 * sólo estimaba el texto, así que la compactación creía que un hilo lleno de
 * imágenes ocupaba lo que ocupa su texto y no se disparaba.
 *
 * El arreglo tiene dos mitades y ambas importan: guardar la imagen como archivo
 * y dejar una referencia (deja de crecer), pero volver a ponerla en línea para
 * los últimos mensajes (el modelo todavía puede necesitar mirarla). Es el mismo
 * criterio que `clearOldToolResults`, que ya poda lo viejo y conserva lo reciente.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import {
  addMessage, getHistory, toAPIMessages, inflateRecentImages,
  getTotalTokens, estimateImageTokens,
} from "../packages/core/src/agent/conversation-store";

const PNG_4X4 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
  "base64",
);

async function fotoDe(lado: number): Promise<string> {
  const bytes = await new (Bun as any).Image(PNG_4X4).resize(lado, lado).png().bytes();
  return Buffer.from(bytes).toString("base64");
}

const THREAD = "u1/webchat/c1";

/** Cuánto pesa el historial tal como se le manda al modelo. */
function pesoDelHistorial(mensajes: unknown[]): number {
  return JSON.stringify(mensajes).length;
}

beforeEach(async () => {
  closeHiveDb();
  await ensureHiveDb();
});

afterEach(() => {
  closeHiveDb();
});

describe("la imagen se guarda como archivo, no como base64 en el historial", () => {
  test("el historial guarda una referencia, no la imagen", async () => {
    const foto = await fotoDe(256);
    await addMessage(THREAD, "user", [
      { type: "text", text: "mirá esto" },
      { type: "image_base64", base64: foto, mimeType: "image/png" } as any,
    ]);

    const filas = await getHistory(THREAD);
    const guardado = JSON.stringify(filas);

    expect(guardado).not.toContain(foto);       // el base64 no está en la BD
    expect(guardado).toContain("artifact_ref");  // sí una referencia
  });

  test("la referencia conserva las dimensiones para que el modelo sepa qué había", async () => {
    await addMessage(THREAD, "user", [
      { type: "image_base64", base64: await fotoDe(128), mimeType: "image/png" } as any,
    ]);

    const parte = (await getHistory(THREAD))[0]!.content_multimodal!;
    const ref = JSON.parse(parte).find((p: any) => p.type === "artifact_ref");
    expect(ref.width).toBe(128);
    expect(ref.height).toBe(128);
  });

  test("el texto que acompaña la imagen se conserva intacto", async () => {
    await addMessage(THREAD, "user", [
      { type: "text", text: "¿cuánto dice la factura?" },
      { type: "image_base64", base64: await fotoDe(64), mimeType: "image/png" } as any,
    ]);

    const partes = JSON.parse((await getHistory(THREAD))[0]!.content_multimodal!);
    expect(partes.find((p: any) => p.type === "text").text).toBe("¿cuánto dice la factura?");
  });
});

describe("la ventana de recencia", () => {
  test("una imagen reciente se vuelve a poner en línea: el modelo puede mirarla", async () => {
    await addMessage(THREAD, "user", [
      { type: "image_base64", base64: await fotoDe(64), mimeType: "image/png" } as any,
    ]);

    const inflados = await inflateRecentImages(toAPIMessages(await getHistory(THREAD)));
    const partes = inflados[0]!.content as any[];

    // Una referencia no se mira: un modelo de visión no ve una foto desde un id.
    expect(partes.some((p) => p.type === "image_base64")).toBe(true);
  });

  test("una imagen vieja queda como referencia", async () => {
    await addMessage(THREAD, "user", [
      { type: "image_base64", base64: await fotoDe(64), mimeType: "image/png" } as any,
    ]);
    for (let i = 0; i < 10; i++) await addMessage(THREAD, "assistant", `turno ${i}`);

    const inflados = await inflateRecentImages(toAPIMessages(await getHistory(THREAD)));
    const partes = inflados[0]!.content as any[];

    expect(partes.some((p) => p.type === "image_base64")).toBe(false);
    expect(partes.some((p) => p.type === "artifact_ref")).toBe(true);
  });

  test("el historial NO crece con los turnos — es la prueba que importa", async () => {
    await addMessage(THREAD, "user", [
      { type: "image_base64", base64: await fotoDe(512), mimeType: "image/png" } as any,
    ]);

    const alPrincipio = pesoDelHistorial(
      await inflateRecentImages(toAPIMessages(await getHistory(THREAD))),
    );

    // La conversación sigue; antes, cada uno de estos turnos arrastraba la foto.
    for (let i = 0; i < 12; i++) await addMessage(THREAD, "assistant", `respuesta ${i}`);

    const despues = pesoDelHistorial(
      await inflateRecentImages(toAPIMessages(await getHistory(THREAD))),
    );

    expect(despues).toBeLessThan(alPrincipio);
  });
});

describe("los tokens de la imagen se cuentan", () => {
  test("estimateImageTokens crece con el área, como cobran los proveedores", () => {
    expect(estimateImageTokens(1024, 1024)).toBeGreaterThan(estimateImageTokens(256, 256));
    // Sin dimensiones no puede devolver cero: cero es lo que había antes.
    expect(estimateImageTokens(null, null)).toBeGreaterThan(0);
  });

  test("un mensaje con imagen cuenta más que el mismo texto sin ella", async () => {
    await addMessage(THREAD, "user", "mirá esto");
    const soloTexto = await getTotalTokens(THREAD);

    await addMessage("u1/webchat/c2", "user", [
      { type: "text", text: "mirá esto" },
      { type: "image_base64", base64: await fotoDe(512), mimeType: "image/png" } as any,
    ]);
    const conImagen = await getTotalTokens("u1/webchat/c2");

    // Antes ambos contaban igual y la compactación no se disparaba a tiempo.
    expect(conImagen).toBeGreaterThan(soloTexto * 2);
  });
});

describe("degradación", () => {
  test("si la imagen no se puede guardar, viaja como estaba en vez de perderse", async () => {
    // Un base64 inválido no se puede medir ni guardar como artefacto.
    await addMessage(THREAD, "user", [
      { type: "image_base64", base64: "no-es-una-imagen", mimeType: "image/png" } as any,
    ]);

    const partes = JSON.parse((await getHistory(THREAD))[0]!.content_multimodal!);
    expect(partes[0].type).toBe("image_base64");
  });

  test("una referencia rota queda como referencia, no rompe el turno", async () => {
    const mensajes = [{
      role: "user" as const,
      content: [{ type: "artifact_ref", artifact_id: "no-existe", mime_type: "image/png" }] as any,
    }];

    const inflados = await inflateRecentImages(mensajes);
    expect((inflados[0]!.content as any[])[0].type).toBe("artifact_ref");
  });
});
