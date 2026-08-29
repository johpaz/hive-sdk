// Auto-generado — NO EDITAR.
//
// En este paquete el valor es SIEMPRE null, y así debe quedarse: el SDK se
// publica como fuente, no como ejecutable standalone, así que el worker se
// resuelve desde disco (tool-worker.ts al lado de este archivo, o
// dist/tool-worker.js junto al bundle).
//
// El archivo existe porque el gateway de hive sí compila un binario, y ahí su
// `scripts/build-gateway.ts` reescribe este stub antes de compilar con:
//
//   import workerFile from "./tool-worker.generated.js" with { type: "file" }
//   export const embeddedToolWorkerPath: string | null = workerFile
//
// Ese `with { type: "file" }` es lo que mete el bundle del worker dentro del
// ejecutable, porque `new Worker(new URL("./tool-worker.ts", import.meta.url))`
// NO se embebe solo: el path se resuelve en runtime y el bundler no lo ve.
// Sin eso la app de escritorio se instalaba sin worker y cualquier turno con
// más de una tool call moría con "Tool worker entry not found" (v1.0.3 y
// anteriores). Mantener el símbolo acá deja que `tool-runtime/index.ts` sea el
// mismo archivo en los dos repos.
export const embeddedToolWorkerPath: string | null = null
