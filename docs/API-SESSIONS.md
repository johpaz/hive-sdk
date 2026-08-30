# API-SESSIONS — la conversación de un usuario, como una sola cosa

## Por qué existe

"Sesión" estaba repartida en cuatro capas que nadie unía:

| Pieza | Qué guardaba |
|---|---|
| `agent/thread-store.ts` | Identidad y catálogo del hilo |
| `agent/conversation-store.ts` | Los mensajes |
| `agent/run-store.ts` | La ejecución: checkpoint, lease, reanudación |
| `state/store.ts` | Un `Map` en memoria que moría con el proceso |

El resultado eran dos identificadores para lo mismo —`thread_id` para la
conversación, `run_id` para la ejecución— y **ninguna forma de preguntar "qué
sesiones tiene este usuario"** sin escanear mensajes.

```typescript
import { createSession, listSessions, appendMessage, resumeSession } from "@johpaz/hive-sdk/sessions";
```

`Session` es una **vista compuesta** sobre las colecciones que ya existían: no
agrega una tercera persistencia. Agregar una colección propia habría recreado
exactamente la duplicación que este módulo viene a cerrar. `Session.id` **es** el
`threadId`.

## Un hilo por canal y por contacto

```typescript
const s = await createSession({ userId: "u1", channel: "telegram", peerId: "12345" });
s.id;  // "u1/telegram/12345"
```

La web es un caso más: `createWebSession()` abre una conversación nueva con su
propio id, y `mostRecentWebSession()` devuelve en la que el usuario seguiría
escribiendo.

Antes de la separación por canal todos compartían un único hilo por usuario. Esa
fila legacy sigue siendo legible: se registra como una conversación más sin
mover un solo mensaje.

## Listar, que es lo que no se podía

```typescript
await listSessions("u1");                          // activas, de la más reciente a la más vieja
await listSessions("u1", { channel: "webchat" });
await listSessions("u1", { includeArchived: true });
await listSessions("u1", { withRuns: true });      // adjunta la última ejecución
```

`withRuns` cuesta una consulta por sesión, así que está apagado por defecto: la
lista de conversaciones de una UI no lo necesita.

## Retomar lo que quedó a medias

```typescript
const pendiente = await resumeSession(s.id);
if (pendiente) {
  pendiente.run.runId;              // la ejecución interrumpida
  pendiente.checkpoint.messages;    // dónde se quedó
}
```

Devuelve `null` cuando no hay nada que retomar, que es el caso normal. Una
ejecución `running` sin checkpoint tampoco sirve: murió antes de guardar estado.

## Cerrar no es borrar

```typescript
await closeSession(s.id);    // sale de la lista, el historial queda
await reopenSession(s.id);
await deleteSession(s.id);   // borra mensajes, resumen, notas y la fila
```

## Identidad entre canales

Un mensaje de Telegram trae un id de Telegram, no un usuario de la colmena.
`resolveContext` traduce: busca la identidad en `userIdentities` y devuelve el
usuario, el hilo y el agente que deben atenderlo, creando el hilo si hace falta.

```typescript
import { resolveContext } from "@johpaz/hive-sdk/sessions";

const { userId, threadId, agentId, isNewUser } = await resolveContext({
  channel: "telegram",
  channelUserId: "12345",
  accountId: "mi-bot",
});
```

> **Ojo con la auto-vinculación.** Si la identidad no existe, se asocia al
> **único usuario existente** — coherente con hive, que es mono-usuario, pero en
> un despliegue con varios significa que el primer desconocido que escriba por
> un canal quedaría vinculado a quien estuviera. Para eso está
> `security/pairing.ts`, que exige aprobación antes de crear la identidad: un
> host multi-usuario debe ponerlo delante.

## La memoria está aislada por usuario

```typescript
import { writeMemory, listMemories } from "@johpaz/hive-sdk/services";

await writeMemory("presupuesto", "5000", "ana");
await writeMemory("presupuesto", "900", "beto");   // otra memoria, no un pisotón
```

La colección era **global al proceso**: el id era sólo el título, así que dos
usuarios no podían tener una memoria con el mismo nombre y cualquiera veía la
del otro. Ahora el id es `${userId}:${title}` y toda lectura filtra por dueño.

`userId` es opcional: sin él se resuelve el del contexto, para que las tools del
modelo sigan funcionando igual. Las filas anteriores se migran al arrancar
asignándolas al usuario existente — no se pierde ninguna.

## Consistencia eventual del catálogo

`appendMessage` persiste el mensaje **al instante**, pero la actualización del
catálogo (título, contador, orden) es deliberadamente *fire-and-forget*: nunca
se bloquea la escritura de un mensaje detrás de un contador.

En la práctica, `messageCount` y `title` son de consistencia eventual — leer la
sesión inmediatamente después de escribir puede devolver el valor anterior.
`getSessionHistory()` sí es consistente al instante.

## El identificador del hilo

`Session.id` **es** el `threadId`, con forma `${userId}/${canal}/${peer}`.

| | |
|---|---|
| `makeThreadId(userId, canal, peer)` | Construirlo. |
| `parseThreadId(id)` | Devuelve las tres partes, o `null` si no tiene esa forma. |
| `isStructuredThreadId(id)` | Si sigue el formato. La fila del hilo legacy —anterior a la separación por canal— no lo sigue: su id es el `userId` pelado. |
| `sanitizeSegment(v)` | Limpia un segmento; el separador es `/`, así que un `:` en el peer rompería el parseo. |
| `newWebConversationId()` | Un id de conversación web nuevo. |

## Resto de la superficie

`renameSession(id, título)` — el título se deriva solo del primer mensaje del
usuario, pero se puede fijar a mano.

`sessionForChannel(userId, canal)` — a qué hilo escribirle a alguien cuando no
venimos de un mensaje suyo: el aviso de una tarea programada, por ejemplo.
Devuelve `null` si no hay ninguno, y quien llame decide el respaldo.

*Documentación Hive SDK — ver `version` en package.json*
