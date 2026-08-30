/**
 * Imágenes como servicio para el usuario final.
 *
 * A diferencia de las tools del agente —que trabajan con ids porque devolverle
 * bytes a un modelo llena la ventana de contexto— esto entra y sale por bytes:
 * una app sube un archivo y descarga el resultado.
 *
 * El test que más importa es el de retención. Los artefactos internos se limpian
 * a los 7 días, pero borrarle a la semana una imagen que alguien subió convierte
 * un servicio en una pérdida de datos.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import { expireArtifacts, createArtifact } from "../packages/core/src/artifacts/store";
import * as images from "../packages/core/src/services/images";
import { measureImage } from "../packages/core/src/images/index";

const PNG_4X4 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
  "base64",
);

async function pngDe(lado: number): Promise<Uint8Array> {
  return new (Bun as any).Image(PNG_4X4).resize(lado, lado).png().bytes();
}

beforeEach(async () => {
  closeHiveDb();
  await ensureHiveDb();
});

afterEach(() => {
  closeHiveDb();
});

describe("services/images: subir y descargar", () => {
  test("sube bytes y devuelve la ficha, sin los bytes", async () => {
    const img = await images.uploadImage(await pngDe(64), { userId: "u1" });

    expect(img.width).toBe(64);
    expect(img.mimeType).toBe("image/png");
    // La ficha va a una UI: los bytes se piden aparte.
    expect(JSON.stringify(img)).not.toContain("data");
  });

  test("acepta base64 además de bytes", async () => {
    const img = await images.uploadImage(PNG_4X4.toString("base64"), { userId: "u1" });
    expect(img.width).toBe(4);
  });

  test("se descargan los bytes para que la UI los sirva", async () => {
    const img = await images.uploadImage(await pngDe(32), { userId: "u1" });
    const datos = await images.getImageBytes(img.id);

    expect(datos).not.toBeNull();
    expect((await measureImage(datos!.data)).width).toBe(32);
  });

  test("descargar algo inexistente devuelve null", async () => {
    expect(await images.getImageBytes("no-existe")).toBeNull();
  });
});

describe("services/images: transformar", () => {
  test("transforma una guardada y devuelve ficha Y bytes", async () => {
    const orig = await images.uploadImage(await pngDe(256), { userId: "u1" });
    const r = await images.transformStoredImage({ imageId: orig.id }, { width: 64, format: "webp" });

    // Quien pide una conversión quiere el archivo, no otra llamada.
    expect(r.data.length).toBeGreaterThan(0);
    expect(r.width).toBe(64);
    expect(r.mimeType).toBe("image/webp");
    expect(r.id).not.toBe(orig.id);          // el original no se toca
    expect((await images.getImageBytes(orig.id))).not.toBeNull();
  });

  test("transforma bytes sueltos sin guardarlos antes", async () => {
    const r = await images.transformStoredImage(
      { data: await pngDe(128) },
      { width: 32, userId: "u1" },
    );
    expect(r.width).toBe(32);
  });

  test("la fuente es explícita: un id no se confunde con un base64", async () => {
    // Adivinar por longitud fallaría con una imagen de 4x4, cuyo base64 es más
    // corto que un UUID.
    const b64 = PNG_4X4.toString("base64");
    const r = await images.transformStoredImage({ data: b64 }, { width: 2, userId: "u1" });
    expect(r.width).toBe(2);

    await expect(
      images.transformStoredImage({ imageId: b64 }, { width: 2 }),
    ).rejects.toThrow(/No encontré/);
  });

  test("los presets aplican tamaños de uso corriente", async () => {
    const orig = await images.uploadImage(await pngDe(1024), { userId: "u1" });
    const thumb = await images.applyPreset({ imageId: orig.id }, "thumbnail");

    expect(thumb.width).toBe(256);
    expect(thumb.mimeType).toBe("image/webp");
  });

  test("un preset desconocido falla con las opciones disponibles", async () => {
    await expect(
      images.applyPreset({ data: PNG_4X4 }, "gigante" as any),
    ).rejects.toThrow(/Preset desconocido/);
  });
});

describe("services/images: retención bajo control del usuario", () => {
  test("lo que sube el usuario NO expira por defecto", async () => {
    const img = await images.uploadImage(await pngDe(16), { userId: "u1" });
    expect(img.expiresAt).toBeNull();
  });

  test("sobrevive a la limpieza que borra los artefactos internos", async () => {
    const delUsuario = await images.uploadImage(await pngDe(16), { userId: "u1" });

    // Un artefacto interno ya vencido: capturas, resultados de tools.
    const interno = await createArtifact({
      bytes: PNG_4X4, mimeType: "image/png", kind: "screenshot", userId: "u1",
      expiresAt: Date.now() - 1000,
    });

    await expireArtifacts();

    // `null > now` es false en JS: sin la comprobación explícita del null, la
    // limpieza habría borrado justamente lo que el usuario pidió conservar.
    expect(await images.getImageBytes(delUsuario.id)).not.toBeNull();
    expect(await images.getImageBytes(interno.id)).toBeNull();
  });

  test("el usuario puede ponerle fecha a algo que ya no quiere", async () => {
    const img = await images.uploadImage(await pngDe(16), { userId: "u1" });
    const vencida = await images.setImageRetention(img.id, Date.now() - 1000);
    expect(vencida.expiresAt).toBeLessThan(Date.now());

    await expireArtifacts();
    expect(await images.getImageBytes(img.id)).toBeNull();
  });

  test("y volver permanente algo que nació temporal", async () => {
    const temporal = await images.uploadImage(await pngDe(16), {
      userId: "u1", expiresAt: Date.now() - 1000,
    });
    await images.setImageRetention(temporal.id, null);

    await expireArtifacts();
    expect(await images.getImageBytes(temporal.id)).not.toBeNull();
  });

  test("borrar es inmediato y no deja rastro", async () => {
    const img = await images.uploadImage(await pngDe(16), { userId: "u1" });
    expect(await images.deleteImage(img.id)).toBe(true);

    // A diferencia de expirar, que conserva la fila como registro: si alguien
    // pidió borrar, dejar el rastro es lo contrario de lo que pidió.
    expect(await images.getImageBytes(img.id)).toBeNull();
    expect((await images.listImages("u1")).map((i) => i.id)).not.toContain(img.id);
    expect(await images.deleteImage(img.id)).toBe(false);
  });
});

describe("services/images: la galería", () => {
  test("lista de la más reciente a la más vieja", async () => {
    const a = await images.uploadImage(await pngDe(8), { userId: "u1" });
    await new Promise((r) => setTimeout(r, 2));
    const b = await images.uploadImage(await pngDe(16), { userId: "u1" });

    expect((await images.listImages("u1")).map((i) => i.id)).toEqual([b.id, a.id]);
  });

  test("un usuario no ve la galería de otro", async () => {
    await images.uploadImage(await pngDe(8), { userId: "ana" });
    await images.uploadImage(await pngDe(8), { userId: "beto" });

    expect(await images.listImages("ana")).toHaveLength(1);
    expect(await images.listImages("beto")).toHaveLength(1);
  });

  test("no mezcla imágenes con otros artefactos", async () => {
    await images.uploadImage(await pngDe(8), { userId: "u1" });
    await createArtifact({
      bytes: Buffer.from("un informe"), mimeType: "text/plain", kind: "document", userId: "u1",
    });

    expect(await images.listImages("u1")).toHaveLength(1);
  });
});
