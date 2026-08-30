/**
 * Procesamiento de imágenes sobre `Bun.Image`.
 *
 * Sirve para dos cosas que conviene no confundir: capacidad de producto (las
 * tools activables) y **control de contexto** — una foto de teléfono son varios
 * megabytes y unos cuantos miles de tokens; a 1024 px el modelo ve lo mismo por
 * una fracción del costo.
 *
 * Un detalle de `Bun.Image` que estos tests fijan: las transformaciones son
 * diferidas, así que `metadata()` sobre una cadena sin materializar informa el
 * origen y no el resultado. Hay que releer los bytes — que es lo que hacen
 * `transformImage` y `measureImage`.
 *
 * Uses HIVE_DB_PATH=":memory:" so no state persists between runs.
 */

process.env.HIVE_DB_PATH = ":memory:";

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeHiveDb } from "../packages/core/src/storage/hivedb";
import { ensureHiveDb } from "../packages/core/src/storage/bootstrap";
import { createArtifact } from "../packages/core/src/artifacts/store";
import {
  measureImage, transformImage, normalizeForModel, imagesSupported,
} from "../packages/core/src/images/index";
import { imageMetadataTool, imageTransformTool } from "../packages/core/src/tools/images/index";

/** PNG 4x4 real, suficiente para verificar el ciclo entero. */
const PNG_4X4 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
  "base64",
);

/** Genera un PNG de NxN para probar el redimensionado hacia abajo. */
async function pngDe(lado: number): Promise<Uint8Array> {
  const I = (Bun as any).Image;
  return new I(PNG_4X4).resize(lado, lado).png().bytes();
}

beforeEach(async () => {
  closeHiveDb();
  await ensureHiveDb();
});

afterEach(() => {
  closeHiveDb();
});

describe("images: medir", () => {
  test("el runtime soporta imágenes", () => {
    expect(imagesSupported()).toBe(true);
  });

  test("lee dimensiones y formato", async () => {
    expect(await measureImage(PNG_4X4)).toEqual({ width: 4, height: 4, format: "png" });
  });

  test("acepta base64 además de bytes", async () => {
    expect((await measureImage(PNG_4X4.toString("base64"))).width).toBe(4);
  });
});

describe("images: transformar", () => {
  test("redimensiona de verdad, no sólo en la promesa", async () => {
    const { metadata } = await transformImage(await pngDe(64), { width: 16, height: 16 });
    // `metadata()` sobre la cadena diferida habría dicho 64: hay que releer.
    expect(metadata.width).toBe(16);
    expect(metadata.height).toBe(16);
  });

  test("convierte de formato", async () => {
    const { metadata } = await transformImage(PNG_4X4, { format: "webp" });
    expect(metadata.format).toBe("webp");
  });

  test("sin nada que hacer devuelve la entrada tal cual", async () => {
    // Recomprimir de gusto sólo empeora la imagen.
    const { bytes } = await transformImage(PNG_4X4, {});
    expect(bytes.length).toBe(PNG_4X4.length);
  });

  test("rota sin romper la imagen", async () => {
    const { metadata } = await transformImage(await pngDe(32), { rotate: 90 });
    expect(metadata.width).toBeGreaterThan(0);
  });
});

describe("images: normalizar para el modelo", () => {
  test("una imagen grande se achica al lado máximo", async () => {
    const grande = await pngDe(2048);
    const r = await normalizeForModel(grande, { maxDimension: 512 });

    expect(r.changed).toBe(true);
    expect(Math.max(r.metadata.width, r.metadata.height)).toBe(512);
    // Que es el punto: menos bytes, mismo contenido útil.
    expect(r.bytes.length).toBeLessThan(r.originalBytes);
  });

  test("mantiene la proporción", async () => {
    const I = (Bun as any).Image;
    const ancho = await new I(PNG_4X4).resize(800, 400).png().bytes();
    const r = await normalizeForModel(ancho, { maxDimension: 400 });

    expect(r.metadata.width).toBe(400);
    expect(r.metadata.height).toBe(200);
  });

  test("una imagen ya chica y en el formato pedido no se toca", async () => {
    const chica = await transformImage(PNG_4X4, { format: "webp" });
    const r = await normalizeForModel(chica.bytes, { maxDimension: 1024, format: "webp" });

    expect(r.changed).toBe(false);
    expect(r.bytes.length).toBe(chica.bytes.length);
  });
});

describe("tools de imagen: devuelven referencias, no base64", () => {
  test("image_metadata mide sin cargar la imagen", async () => {
    const art = await createArtifact({ bytes: PNG_4X4, mimeType: "image/png", kind: "image", userId: "u1" });
    const res = await imageMetadataTool.execute({ artifact_id: art.id }) as any;

    expect(res.ok).toBe(true);
    expect(res.width).toBe(4);
    // Lo importante: ni un byte de la imagen en la respuesta.
    expect(JSON.stringify(res)).not.toContain("iVBOR");
  });

  test("image_transform devuelve un artefacto nuevo, no los bytes", async () => {
    const art = await createArtifact({
      bytes: await pngDe(256), mimeType: "image/png", kind: "image", userId: "u1",
    });

    const res = await imageTransformTool.execute({
      artifact_id: art.id, width: 64, height: 64, format: "webp",
    }) as any;

    expect(res.ok).toBe(true);
    expect(res.artifact_id).not.toBe(art.id);       // el original no se toca
    expect(res.width).toBe(64);
    expect(res.format).toBe("webp");
    expect(res.bytes).toBeLessThan(res.original_bytes);
    // Devolver la imagen en base64 es justo lo que llena la ventana de contexto.
    expect(JSON.stringify(res).length).toBeLessThan(500);
  });

  test("un artefacto inexistente falla sin lanzar", async () => {
    const res = await imageTransformTool.execute({ artifact_id: "no-existe" }) as any;
    expect(res.ok).toBe(false);
    expect(res.error).toContain("No encontré");
  });

  test("un formato no soportado se rechaza antes de tocar nada", async () => {
    const art = await createArtifact({ bytes: PNG_4X4, mimeType: "image/png", kind: "image", userId: "u1" });
    const res = await imageTransformTool.execute({ artifact_id: art.id, format: "bmp" }) as any;

    expect(res.ok).toBe(false);
    expect(res.error).toContain("Formato no soportado");
  });
});

describe("la imagen entrante se normaliza antes de llegar al modelo", () => {
  test("una foto grande viaja achicada", async () => {
    const { multimodalService } = await import("../packages/core/src/multimodal/index");
    const grande = await pngDe(2048);

    const partes = await multimodalService.processImage({
      type: "buffer", data: Buffer.from(grande), mimeType: "image/png",
    } as any);

    const parte = partes.find((p: any) => p.type === "image_base64") as any;
    expect(parte).toBeDefined();

    // Esa imagen no viaja una sola vez: queda en el historial y se reenvía en
    // cada turno siguiente, así que el ahorro se multiplica.
    const bytesEnviados = Buffer.from(parte.base64, "base64").length;
    expect(bytesEnviados).toBeLessThan(grande.length);
    expect((await measureImage(parte.base64)).width).toBeLessThanOrEqual(1024);
  });

  test("una URL no se toca: no ocupa contexto", async () => {
    const { multimodalService } = await import("../packages/core/src/multimodal/index");
    const partes = await multimodalService.processImage({
      type: "url", data: "https://example.com/foto.jpg",
    } as any);

    expect((partes[0] as any).type).toBe("image_url");
  });

  test("una imagen ilegible se manda tal cual en vez de perderse", async () => {
    const { multimodalService } = await import("../packages/core/src/multimodal/index");
    const basura = Buffer.from("no soy una imagen").toString("base64");

    const partes = await multimodalService.processImage({
      type: "base64", data: basura, mimeType: "image/png",
    } as any);

    // Perder la imagen sería peor que mandarla sin optimizar.
    expect((partes[0] as any).base64).toBe(basura);
  });
});
