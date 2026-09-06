# PptxGenJS vendorizado

- Proyecto: PptxGenJS
- Versión: 4.0.1
- Fuente: https://www.npmjs.com/package/pptxgenjs/v/4.0.1
- Repositorio: https://github.com/gitbrent/PptxGenJS/tree/v4.0.1
- Licencia: MIT (`LICENSE`)
- Artefacto: `dist/pptxgen.es.js` de la distribución oficial
- SHA-256: `05844c5625e2cda3b449eb967c2246dd57ca57341886a7c28eeebca263b29bd4`

Hive conserva únicamente el artefacto ESM, que importa `jszip` y no importa
`image-size`. No copie el `package.json` upstream: declara `image-size` para las
funciones de imágenes que Hive no expone.

Para actualizar esta copia, descargue una versión oficial, compruebe su licencia
y procedencia, reemplace el artefacto, actualice el hash y ejecute la prueba de
`office_escribir_pptx`, el typecheck y `bun audit`.
