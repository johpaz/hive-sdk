# Remediación de `image-size` en la generación PPTX

## Contexto y decisión

`pptxgenjs@4.0.1` declara `image-size@^1.2.1`, afectado por
GHSA-w3rx-r6r6-pgpr y GHSA-5p2g-fcmc-qvqq. No existe una versión corregida de
`image-size`, y el repositorio oficial de PptxGenJS todavía conserva la
dependencia. Sin embargo, el artefacto ESM publicado de PptxGenJS no importa
`image-size`: sólo usa `jszip`. Hive tampoco expone imágenes en
`office_escribir_pptx`; el flujo acepta texto, viñetas y notas del presentador.

Se conservará una copia vendorizada del artefacto ESM oficial de
PptxGenJS 4.0.1, junto con su licencia MIT y un archivo de procedencia. El
wrapper de Hive importará ese artefacto local y mantendrá deliberadamente una
API limitada a texto y notas. Se eliminará `pptxgenjs` de los manifiestos y del
lockfile, lo que también elimina `image-size` y `queue` del grafo instalable.

Se descartan dos alternativas. Mantener la excepción conserva funcionalidad,
pero deja el auditor en rojo. Reimplementar directamente el paquete OOXML
evitaría código vendorizado, pero introduce un riesgo mayor de incompatibilidad
con PowerPoint, Keynote y LibreOffice, especialmente para notas y relaciones
internas.

## Integración, errores y mantenimiento

El código vendorizado vivirá bajo `packages/core/src/vendor/pptxgenjs/` y no
tendrá un `package.json` con dependencias. Un módulo TypeScript local expondrá
únicamente los métodos que usa la herramienta (`addSlide`, `addText`,
`addNotes`, `writeFile`), evitando que el resto del SDK dependa de la API amplia
de PptxGenJS. La herramienta conservará su manejo actual de directorios,
errores y forma de respuesta.

El archivo de procedencia fijará versión, URL oficial y licencia. Las futuras
actualizaciones deben reemplazar el artefacto desde una versión oficial,
verificar su hash y volver a ejecutar las pruebas y el audit. No se añadirá
soporte para imágenes mediante esta copia: cualquier ampliación de esa API
requiere una revisión de seguridad nueva.

## Verificación

Una prueba funcional generará una presentación temporal con portada, texto,
viñetas y notas. Después abrirá el resultado como ZIP y comprobará las partes
OOXML principales, el número de diapositivas y la presencia del contenido y de
las notas. Esto protege el comportamiento que Hive usa realmente, sin probar
detalles internos del proveedor.

La aceptación requiere:

1. La prueba PPTX nueva y la suite de Office pasan.
2. El typecheck del workspace pasa.
3. `bun audit` reporta cero vulnerabilidades.
4. `rg` no encuentra `image-size` ni `pptxgenjs` como dependencias en los
   manifiestos o el lockfile.

