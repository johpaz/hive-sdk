# Actualización a Bun 1.4.2 y TypeScript 7

Hive SDK requiere **Bun 1.4.2 o posterior** y usa **TypeScript 7.0.2** para
desarrollo y verificación. El SDK se publica como TypeScript, por lo que estas
versiones también importan al compilar una aplicación consumidora.

## Actualizar un checkout del SDK

```bash
bun --version                 # debe ser 1.4.2 o posterior
bun install --frozen-lockfile
bun run typecheck
bun test
bun audit
```

El `package.json` raíz fija TypeScript 7.0.2 para que CI y desarrollo resuelvan
el mismo compilador. `@hive/core` acepta versiones compatibles desde 7.0.2
mediante su peer `^7.0.2`, porque publica sus fuentes. `@types/bun` permanece en
1.4.1: es la versión publicada de tipos correspondiente disponible al cerrar
esta migración.

## Actualizar una aplicación consumidora

1. Instala Bun 1.4.2 o una versión posterior compatible.
2. Actualiza el compilador de la aplicación:

   ```bash
   bun add --dev typescript@7.0.2 @types/bun@^1.4.1
   ```

3. Regenera la instalación con `bun install` y ejecuta el typecheck propio.
4. No añadas `skipLibCheck` para ocultar errores nuevos del SDK. Hive ya lo usa
   internamente para declaraciones de terceros, pero su código fuente debe
   seguir compilando completo.

## Cambios de tipos relevantes

TypeScript 7 distingue el respaldo de memoria de los typed arrays. Un
`Uint8Array<ArrayBufferLike>` podría usar `SharedArrayBuffer` y ya no es válido
automáticamente como `BlobPart`; Hive conserva bytes respaldados por
`ArrayBuffer` al construir audio para APIs de transcripción.

Con `DOM` y los tipos de Bun activos simultáneamente también aparecen dos APIs
con definiciones superpuestas:

- `ReadableStreamDefaultReader` de Bun añade `readMany()`, aunque el transporte
  SSE sólo necesita `read()`. El transporte depende de ese contrato mínimo.
- El constructor DOM de `WebSocket` sólo conoce subprotocolos; Bun permite
  `Bun.WebSocketOptions`, incluidos headers. El transporte delimita esa
  extensión en un tipo de constructor local.

Estos adaptadores están en la frontera con el runtime. No deben reemplazarse por
`any`, `@ts-ignore` o `@ts-expect-error`: hacerlo convertiría una incompatibilidad
real de plataforma en un falso resultado verde.

## Compatibilidad y CI

Los workflows fijan Bun 1.4.2, instalan con `--frozen-lockfile`, ejecutan el
typecheck de TypeScript 7 y la suite. También generan una aplicación nueva y la
compilan enlazada contra el SDK del commit, no contra la última versión de npm.

Antes de elevar Bun o TypeScript otra vez, actualiza primero CI, reproduce el
typecheck localmente y documenta cualquier cambio de tipos observable para los
consumidores.
