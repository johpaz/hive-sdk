# API-ARTIFACTS — archivos fuera de la ventana de contexto

## Por qué existe

Cuando algo grande entra al turno —una imagen, un PDF, la salida enorme de un
servidor MCP— serializarlo al prompt es lo peor que se puede hacer: se come el
contexto y no aporta. En su lugar se guarda como **artefacto** y al modelo le
llega una referencia (`artifact_ref`) que puede abrir con `artifact_read` si de
verdad necesita el contenido.

Es el mismo mecanismo que sostiene tres cosas distintas: los resultados grandes
de MCP (`mcp-result-normalizer.ts`), las capturas de navegador, y las imágenes
que manda el usuario en una conversación.

```typescript
import { createArtifact, listArtifacts } from "@johpaz/hive-sdk/artifacts";
```

## Guardar y leer

| | |
|---|---|
| `createArtifact(input)` | Guarda bytes y devuelve la ficha. `expiresAt: null` = no caduca. |
| `readArtifactBytes(id)` | Los bytes crudos — lo que usa un canal para adjuntar una imagen. |
| `readArtifactText(id, opts?)` | El contenido como texto, para consumo en proceso. Rechaza lo binario y lo que supere 25 MB: un artefacto más grande que eso ya no es algo que quepa en una ventana de contexto. |
| `inspectArtifact(id, opts?)` | Metadatos sin abrirlo. |
| `listArtifacts(userId, opts?)` | Lo que tiene un usuario, de lo más reciente a lo más viejo. Filtra por `kind`. |

## Retención

Los artefactos **internos** —capturas, resultados de tools— son basura
transitoria y se limpian solos a los 7 días. Lo que **sube o transforma un
usuario** no lo es: borrárselo a la semana convierte un servicio en una pérdida
de datos.

| | |
|---|---|
| `setArtifactRetention(id, expiresAt)` | `null` = conservarlo indefinidamente. |
| `deleteArtifact(id)` | Borra la fila y el archivo, ahora. |
| `expireArtifacts(now?)` | La limpieza. Salta los `expires_at: null`. |

`deleteArtifact` elimina la fila; `expireArtifacts` la conserva marcada como
`expired`. La diferencia es intencional: si alguien pidió borrar, dejar el rastro
es lo contrario de lo que pidió.

> **Cuidado al tocar la limpieza**: en JavaScript `null > now` es `false`, así
> que una comprobación de caducidad escrita a la ligera trataría "no expira
> nunca" como "ya venció" y **borraría el archivo**. La comprobación del `null`
> va antes de comparar fechas.

Para trabajar con imágenes concretamente, `@johpaz/hive-sdk/services` expone
`uploadImage`, `listImages` y `setImageRetention`, que es esta misma capa con la
forma que espera una UI.

*Documentación Hive SDK — ver `version` en package.json*
