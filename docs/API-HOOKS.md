# API-HOOKS — engancharse al ciclo de vida

## Por qué existe

`HooksConfigSchema` declaraba 14 hooks en la configuración y **ninguno se
invocaba**: era un esquema sin implementación. Quien lo encontrara asumiría que
funciona, que es peor que no tenerlo.

Ahora están conectados, con dos formas:

- **Callbacks en proceso** (`registerHook`) — tipados, sin costo de arranque, y
  pueden **devolver una decisión**. Es el primitivo: quien consume el SDK ya está
  en el mismo proceso.
- **Scripts externos** (`hooks.scripts` en la configuración) — para quien no
  escribe TypeScript. Se montan encima del primitivo. Cuestan un `Bun.spawn` por
  invocación, así que conviene reservarlos para lo que no ocurre en cada tool call.

Sólo están los cinco con un uso claro. Los otros nueve del esquema original
quedaron fuera a propósito: cada hook es una promesa que después hay que
sostener, y uno que nadie usa es superficie que envejece mal.

```typescript
import { registerHook } from "@johpaz/hive-sdk/hooks";
```

## Los cinco

| Hook | Cuándo | Puede bloquear |
|---|---|---|
| `beforeToolCall` | Antes de ejecutar una tool | **sí** |
| `afterToolCall` | Con el resultado, haya salido bien o mal | no |
| `beforeCompaction` | Antes de comprimir el historial | no |
| `sessionStart` | Al abrir una conversación (crearla o reabrirla) | no |
| `sessionEnd` | Al cerrarla (archivarla o borrarla) | no |

## Bloquear una tool

```typescript
registerHook("beforeToolCall", (ctx) => {
  if (ctx.toolName === "cli_exec" && String(ctx.args.command).includes("curl")) {
    return { block: true, reason: "las llamadas de red salen por api_request" };
  }
});
```

La tool **no se ejecuta**, y el motivo le llega al modelo como resultado, para
que sepa por qué no se hizo en vez de reintentar a ciegas.

Detalles que importan:

- **El primero que bloquea gana.** No tiene sentido seguir preguntando cuando ya
  hay una negativa.
- **Un hook que lanza no bloquea.** Un observador roto no debería frenar el
  trabajo; se registra el error y se sigue.
- **Se aplica a las tools que corren en un worker también.** El enganche está en
  `executeToolBatch`, no en la ejecución del hilo principal: engancharlo abajo
  dejaría la mitad de las llamadas sin revisar, que en un hook de política es
  peor que no tenerlo.
- **Bloquear una no impide las demás**, y el orden se conserva: el modelo espera
  una respuesta por cada llamada que hizo, en el orden en que las hizo.

## Auditar

```typescript
registerHook("afterToolCall", (ctx) => {
  auditoria.registrar({
    tool: ctx.toolName, ok: ctx.ok, ms: ctx.durationMs,
    agente: ctx.agentId, usuario: ctx.userId,
  });
});
```

`afterToolCall` **también ve las bloqueadas**: auditar incluye lo que no pasó.

## Sesiones

```typescript
registerHook("sessionStart", async ({ threadId, userId, channel }) => {
  await miPanel.registrarConversacion(userId, threadId, channel);
});

registerHook("sessionEnd", async ({ threadId, userId }) => {
  await miPanel.cerrarConversacion(userId, threadId);
});
```

Se disparan en las cuatro transiciones del ciclo de vida de un hilo, todas en
`agent/thread-store.ts`:

| Transición | Hook | API pública |
|---|---|---|
| Se crea el hilo | `sessionStart` | `createSession` · `createWebSession` |
| Se reabre | `sessionStart` | `reopenSession` |
| Se archiva | `sessionEnd` | `closeSession` |
| Se borra | `sessionEnd` | `deleteSession` |

Detalles que importan:

- **`sessionStart` no se dispara en cada turno.** `createSession` es idempotente
  y se llama con cada mensaje entrante; el enganche está en el `put` que crea la
  fila, no en la función. Quien use el hook para inicializar estado o para
  cobrar por conversación cuenta conversaciones, no mensajes.
- **Dos turnos concurrentes lo disparan una sola vez.** El `put` con
  `expectedVersion: 0` es el punto de serialización: el que pierde la carrera no
  dispara nada.
- **Archivar o reabrir dos veces seguidas dispara una sola vez**: el estado se
  compara antes de escribir, y un no-op no anuncia nada.
- **`sessionEnd` por borrado lleva `userId` y `channel`.** La fila se lee antes
  de borrarla; si no, el hook recibiría un `threadId` y nada más, y quien lo use
  para limpiar no sabría de quién era lo que se fue.
- **Cubre a los canales que llaman `ensureThread` directo**, sin pasar por el
  módulo `sessions`.

## Scripts

```jsonc
// hive.config.json
{ "hooks": { "scripts": { "before_tool_call": "./hooks/politica.ts" } } }
```

```typescript
loadConfiguredHookScripts();   // opt-in: ejecutar procesos externos no debería
                               // pasar por el solo hecho de importar el SDK
```

El contexto llega por stdin como JSON. Para `before_tool_call`, **salir con
código distinto de 0 bloquea** y lo que el script escriba en stdout es el motivo
— el equivalente en procesos a devolver `{ block }`.

## Utilidades

`hasHooks(nombre)` para saltarse trabajo cuando no hay ninguno registrado;
`clearHooks(nombre?)` para tests. `registerHook` devuelve la función que lo quita.

## Los disparadores

`runBeforeToolCall` · `runAfterToolCall` · `runBeforeCompaction` ·
`runSessionStart` · `runSessionEnd`

Los llama el SDK en cada punto del ciclo; están exportados para quien integre los
hooks en su propio flujo —un gateway con su propia noción de sesión, por ejemplo—
pero **no hay que llamarlos** para que los hooks funcionen en un turno normal.

`runBeforeToolCall` devuelve el motivo del bloqueo o `null`; los demás no
devuelven nada, porque son observadores.

*Documentación Hive SDK — ver `version` en package.json*
