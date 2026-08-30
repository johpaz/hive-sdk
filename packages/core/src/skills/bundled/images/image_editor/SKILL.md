---
name: image_editor
description: "Convertir, redimensionar y rotar imágenes con Bun.Image. Inspeccionar dimensiones y formato sin cargar la imagen al contexto."
version: 1.0.0
author: Hive Team
icon: "🖼️"
category: images
permissions:
  - image_processing
dependencies: []
tools: [image_metadata, image_transform, artifact_inspect]

# Structured skill fields
triggers:
  - "convertí la imagen"
  - "convert image"
  - "redimensioná la imagen"
  - "resize image"
  - "achicá la foto"
  - "make it smaller"
  - "pasala a webp"
  - "convert to webp"
  - "rotá la imagen"
  - "rotate image"
  - "qué tamaño tiene"
  - "image dimensions"
  - "comprimí la imagen"
  - "compress image"
  - "hacé una miniatura"
  - "make a thumbnail"

preferred_agents: []

steps:
  - step: 1
    action: image_metadata
    instruction: "Leer ancho, alto y formato ANTES de transformar. Sin esto no se puede decidir un tamaño con criterio, y redimensionar a ciegas agranda imágenes chicas"
    params:
      artifact_id: "id del artefacto con la imagen"
    output: dimensiones_originales

  - step: 2
    action: image_transform
    instruction: "Transformar. Dando sólo ancho O sólo alto se mantiene la proporción; dando los dos, la imagen se deforma"
    params:
      artifact_id: "id del artefacto de origen"
      width: "ancho en píxeles (opcional)"
      format: "jpeg | png | webp | avif | heic (opcional)"
      quality: "1-100, sólo para formatos con pérdida (opcional)"
    output: artefacto_nuevo

  - step: 3
    action: notify
    instruction: "Avisar con el id del artefacto resultante y su tamaño"
    output: aviso

rules:
  - "Las imágenes se manejan por `artifact_id`, nunca por base64 en el mensaje: una imagen incrustada llena la ventana de contexto y se reenvía en cada turno."
  - "`image_transform` NO modifica el original: crea un artefacto nuevo y devuelve su id. El original queda intacto."
  - "Para conservar la proporción, dar sólo `width` o sólo `height`. Dar los dos deforma la imagen; hacelo únicamente si el usuario lo pidió."
  - "`quality` sólo aplica a formatos con pérdida (jpeg, webp, avif). En png se ignora."
  - "`rotate` acepta 90, 180 o 270. Otros valores se rechazan."
  - "Si no sabés qué formato quiere el usuario, webp es la mejor opción por defecto: pesa menos que jpeg y png con calidad equivalente."

output_format:
  structure: markdown
  sections:
    - "artifact_id resultante"
    - "formato y dimensiones"
    - "tamaño en bytes"
  max_length: "Breve — la imagen no se incrusta en la respuesta"

examples:
  - user_input: "convertí esta imagen a webp"
    expected_behavior: "image_metadata para ver el formato → image_transform con format=webp → devolver el id nuevo"

  - user_input: "hacela de 800 de ancho"
    expected_behavior: "image_transform con width=800 y SIN height, para no deformarla"

  - user_input: "hacé una miniatura"
    expected_behavior: "image_transform con width≈200, format=webp, quality≈80"

  - user_input: "qué tamaño tiene esta imagen"
    expected_behavior: "image_metadata solo — no hace falta transformar nada"
---

# Image Editor Skill

## Cuándo se Activa

Cuando el usuario quiere **cambiar** una imagen (formato, tamaño, rotación) o
**saber** sus características. Corre sobre `Bun.Image`, nativo del runtime.

## Herramientas Disponibles

| Tool | Qué hace | Cuándo usarla |
|------|----------|---------------|
| `image_metadata` | Ancho, alto y formato | Siempre antes de transformar |
| `image_transform` | Convierte, redimensiona, rota | El trabajo en sí |
| `artifact_inspect` | Tipo MIME, integridad, tamaño | Cuando no está claro si el artefacto es una imagen |

## Lo Que Hay Que Entender

**Todo pasa por artefactos.** Una imagen no viaja en el mensaje: vive como
artefacto y se la nombra por su `artifact_id`. Es lo que evita que una foto de 4
MB entre a la ventana de contexto y se reenvíe en cada turno de la conversación.

**Transformar no destruye.** `image_transform` devuelve un artefacto **nuevo**.
El original sigue disponible, así que se puede probar un tamaño, ver que no
gustó y probar otro sin haber perdido nada.

**La proporción se pierde en silencio.** Si se pasan `width` y `height` juntos,
la imagen se estira sin avisar. Pasando uno solo, el otro se calcula.

## Formatos

`jpeg` · `png` · `webp` · `avif` · `heic`

Ante la duda, **webp**: pesa bastante menos que jpeg y png a calidad comparable,
y lo entienden todos los navegadores actuales.
