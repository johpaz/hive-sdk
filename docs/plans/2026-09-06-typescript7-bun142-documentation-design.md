# Cierre de migración a TypeScript 7 y Bun 1.4.2

## Objetivo y decisión

Hive adoptará TypeScript 7.0.2 para su desarrollo y mantendrá Bun 1.4.2 como
runtime mínimo y versión de referencia en CI. La migración debe terminar con el
typecheck limpio; no se conservarán `@ts-ignore` ni conversiones a `any` para
ocultar incompatibilidades. Los puntos donde los tipos DOM y Bun describen de
forma distinta una misma API tendrán adaptadores locales y estrechos que
expresen sólo el contrato usado por Hive.

La documentación se dividirá en dos referencias. `UPGRADING.md` explicará los
requisitos de Bun y TypeScript, los pasos de actualización, los cambios de tipos
y la validación. `SECURITY-GUARDRAILS.md` inventariará los controles que ya
existen en dependencias, documentos Office, transporte y CI. README, el índice,
la API de cron y el changelog enlazarán estas referencias.

Se descartan dos alternativas: documentar únicamente en el changelog dificulta
encontrar instrucciones operativas; mezclar migración y seguridad en una sola
página confunde requisitos de plataforma con controles de entrada.

## Compatibilidad y correcciones de tipos

El lector SSE consumirá un contrato estructural mínimo (`read`) en vez de exigir
la extensión `readMany` que Bun añade al lector global. El cliente WebSocket
usará un constructor tipado localmente con `Bun.WebSocketOptions`, porque al
incluir `DOM` TypeScript selecciona el constructor estándar y omite la
sobrecarga de opciones de Bun. Audio convertirá toda entrada a bytes propios
respaldados por `ArrayBuffer` antes de crear un `Blob`; esto satisface el modelo
genérico de typed arrays de TypeScript 7 y evita compartir memoria mutable.

Los demás cambios de migración se conservarán sólo si el typecheck y las pruebas
demuestran que son compatibles con Bun 1.4.2. Los casts se limitarán a fronteras
con APIs externas y tendrán comentarios que expliquen la divergencia.

## Guardrails y validación

La referencia de guardrails documentará límites exactos y el comportamiento al
rechazar entradas: PDF de 25 MiB, máximo 200 páginas, scripting/eval apagados y
deadline; XLSX de 15 MiB, máximo 25 hojas y 10.000 filas por hoja; PPTX sólo de
texto con artefacto vendorizado; dependencias auditadas y distribuciones
oficiales fijadas. También cubrirá el mínimo de Bun, CI con lockfile congelado y
typecheck de TypeScript 7.

La aceptación requiere `bun --version` 1.4.2, `bun run typecheck` limpio, pruebas
de los componentes modificados, suite completa, `bun audit` sin hallazgos y
`git diff --check` limpio. Cualquier prueba intermitente se repetirá aislada y
se informará explícitamente.
