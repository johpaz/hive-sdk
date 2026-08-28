# Changelog

## Sin publicar

### Seguridad

- **La lista blanca de tools no se aplicaba al descubrimiento dinámico.**
  `compileContext` sólo recortaba `allTools` cuando el agente era de catálogo
  (`source === "catalog"`). Un agente creado por el usuario veía su loadout
  inicial restringido, pero `search_knowledge` busca contra el índice completo y
  el agent loop inyecta lo que encuentre resolviéndolo contra `allTools`: la
  tool excluida terminaba siendo llamable igual. Ahora la restricción depende de
  que el agente declare una lista, no de su origen. Cubierto por
  `test/tool-allowlist-discovery.test.ts`.

- **Aislamiento de credenciales entre inquilinos.** `AgentLoopOptions` no tenía
  forma de recibir la key del proveedor, así que la única fuente era el secret
  store de HiveDB o `process.env[PROVIDER_API_KEY]`, ambos globales al proceso.
  Un host multi-tenant que corriera dos workspaces en el mismo proceso les daba
  la misma credencial. Se agregó `credentials` en `AgentLoopOptions`,
  `IsolatedAgentOptions` y `resolveProviderConfig`; la credencial de la llamada
  gana y corta ahí, sin consultar las fuentes globales ni mutar `process.env`.
  Retrocompatible: sin `credentials` el comportamiento es el de siempre.
  Cubierto por `test/tenant-isolation.test.ts`.


- **`sanitizeDiagnostic` dejaba el token en claro detrás del esquema de auth.**
  La regex consumía sólo la palabra `Bearer`, así que un diagnóstico con
  `authorization: Bearer <token>` quedaba como `authorization: [REDACTED] <token>`
  y la credencial viajaba al prompt del coordinador. Afecta a **0.1.5 y
  anteriores**: el archivo viaja en el tarball publicado.

### Cambiado

- **Automatización web: un solo backend, `Bun.WebView`.** Se retiró
  `AgentBrowserBackend`, que hablaba con el CLI de agent-browser por
  subproceso. El motivo no es de estilo: medido en Bun 1.4 el WebView **sí**
  corre headless (Bun lanza Chromium con `--headless`), que era la única razón
  por la que agent-browser seguía siendo el default. Lo que quedaba era su
  costo — ~40 ms de `Bun.spawn` por operación contra ~0,3 ms, y ~88 MB con su
  propia copia de Chrome.

  Lo importante para quien consume el paquete: el backend viejo ejecutaba
  **`bun add agent-browser@latest` en el entorno del consumidor**, al primer uso
  de una browser tool. Una versión flotante bajada de npm en runtime, en
  producción. Eso ya no existe.

  Requisitos ahora: un Chromium instalado (o `BUN_CHROME_PATH`) y **Bun ≥ 1.4**,
  declarado en `engines`. La clave de config `tools.browser.backend` sobrevive:
  `"agent-browser"` se acepta, avisa una vez y usa el WebView, así que las
  configuraciones viejas no se rompen.

- **Sesión de navegador persistente** (`tools/web/browser-session.ts`). El
  perfil de Chrome que abre Bun es efímero —su ruta lleva un hash que cambia
  entre procesos— así que las cookies se guardan y restauran a mano. Sin esto
  cada reinicio empezaba sin logins. Se controla con `tools.browser.persistSession`
  (activo por defecto).

- **Nueva tool `computer_use_task`**: operar el navegador mirando la pantalla
  —clic por coordenadas, escribir, navegar— cuando no hay un selector CSS
  estable (canvas, UIs generadas, visores embebidos).

- CI actualizado a **Bun 1.4.0**, alineado con `hive`.

### Añadido

- **`@johpaz/hive-sdk/sessions`** — la conversación de un usuario como una sola
  cosa. Hasta acá "sesión" estaba repartida entre `thread-store` (identidad),
  `conversation-store` (mensajes), `run-store` (ejecución) y un `Map` en memoria
  que moría con el proceso; no existía la consulta "qué sesiones tiene este
  usuario". `Session` es una vista compuesta sobre las colecciones que ya
  existían — no agrega una tercera persistencia — y `Session.id` ES el
  `threadId`. Incluye `createSession`, `listSessions`, `appendMessage`,
  `resumeSession`, `closeSession`/`reopenSession` y `deleteSession`.

- **`@johpaz/hive-sdk/models`** — el seed de modelos con nombre propio. El
  catálogo (18 proveedores, 110 modelos), las claves de modelo y el cálculo de
  costo seguían viviendo bajo `storage/`; esto les da un punto de entrada sin
  mover la implementación.

- **Enjambre por roles** (`runRoleSwarm` en `@johpaz/hive-sdk/swarm`) —
  orquestador/trabajadores con estrategias `sequential`, `parallel` y
  `hierarchical`. Es la tercera forma de armar un enjambre, junto a la
  delegación por catálogo y al DAG de tareas, y la única que expresa un enjambre
  como *configuración persistida* en vez de un grafo conocido de antemano. No
  persiste nada: `onMessage` es el punto de enganche del consumidor.

- **`bun run drift`** (`scripts/check-drift.ts`) — compara los módulos del
  cerebro contra `hive` y reporta qué falta y qué difiere, indicando de qué lado
  está el avance. El SDK es la fuente de verdad pero nada lo garantizaba
  estructuralmente: la última vez la divergencia llegó a compartir sólo 87 de
  224 nombres de archivo.

- **`test/exports-contract.test.ts`** — importa de verdad cada subpath declarado
  en `exports`. Los deep-imports se han roto entre versiones sin aviso, y el
  consumidor se defendía pineando la versión exacta.

### Corregido

- **`touchThread` perdía mensajes en el contador.** El incremento se calculaba
  fuera del reintento de `updateDoc`, así que ante un conflicto de versión el
  reintento volvía a escribir el valor viejo. Como `addMessage` la llama sin
  esperarla, dos mensajes seguidos del mismo hilo bastaban para que el conteo se
  quedara corto de forma permanente. Ahora el valor se recalcula dentro del
  bucle.

- **El paquete publicaba su propia suite de tests.** Sin campo `files`, el
  tarball llevaba 329 archivos y 2.3 MB, incluidos `test/`, `docs/`, `scripts/`
  y los `*.test.ts` que conviven con el código. Ahora son 260 archivos y 448 kB.

- **`prepublish` no verificaba nada** (era un `echo`), y además es el hook
  deprecado. Se reemplazó por `prepublishOnly` con typecheck + tests.

- **Sintaxis TypeScript que ningún runtime salvo Bun puede procesar.** Las 5
  *parameter properties* (`constructor(private x)`) rompían incluso el
  type-stripping nativo de Node, y como las clases se re-exportan desde el barrel
  raíz tumbaban cualquier import del paquete. Se reescribieron a mano, sin
  cambiar la API, y se normalizaron 355 imports relativos a extensión `.ts`
  explícita. El paquete sigue requiriendo Bun por el uso de `Bun.*` en 18
  archivos del core — ahora documentado en el README.


- Se fijaron las 8 dependencias que estaban en `latest` (`zod`, `discord.js`,
  `grammy`, `@slack/bolt`, `@whiskeysockets/baileys`, `@modelcontextprotocol/sdk`,
  `qrcode-terminal`, `@sapphire/snowflake`). Como `bun.lock` no se publica, cada
  instalación resolvía `latest` de nuevo: el SDK ya estaba corriendo
  `@slack/bolt` **5.0.0** mientras hive, con el mismo código de canales, corría
  **4.7.x**. Ahora quedan alineados.

### Añadido

- **Backend de navegador intercambiable.** Las tools hablan con la interfaz
  `BrowserBackend`; además del `agent-browser` de siempre (default, sin cambios)
  hay un `WebViewBackend` sobre `Bun.WebView`, in-process, sin instalación de
  ~75 MB ni descarga de Chrome. Se elige con `tools.browser.backend`
  (`"agent-browser" | "webview" | "auto"`) o `HIVE_BROWSER_BACKEND`.
- Cobertura de `acceptance-checks` (27 tests), del backend de navegador (27) y
  del selector con tools registradas en runtime (6).
- Workflow de CI: typecheck, tests, verificación de aislamiento de la base, y un
  job que genera un scaffold con `create-app` y lo typechequea contra el SDK de
  ese commit.

## 0.1.5

Sincronización del SDK con el runtime de agentes de `hive`. **Trae rupturas de
API** (permitidas en 0.x, pero léelas antes de actualizar): el SDK y hive habían
divergido hasta compartir sólo 87 de 224 nombres de archivo, y quien instalaba
`@johpaz/hive-sdk` recibía un runtime más viejo y con bugs que en hive ya estaban
arreglados.

### Corregido

- **Las caídas del provider ya no se guardan como respuestas del agente.**
  `callLLM` devolvía `{ content: "[LLM Error] …", stop_reason: "error" }` y nadie
  chequeaba `stop_reason`: el texto del error se persistía con `addMessage` y —
  peor — la compactación lo guardaba como **el resumen permanente** que reemplaza
  N mensajes de historial. `LLMResponse` ahora tiene un campo `error` tipado y hay
  guardas en el loop, en la síntesis terminal y en la compactación.
- **HTTP 404/410 se distinguen del resto.** Un modelo retirado por el proveedor
  produce un mensaje accionable con `error.modelUnavailable`, en vez de un error
  opaco y reintentos que no pueden funcionar.
- **Las claves de modelo ya no colisionan.** Dos providers que sirven el mismo
  modelo (`z-ai/glm-5.2` bajo NVIDIA y bajo OpenRouter) se pisaban la fila. Los
  cuatro revendedores (`nvidia`, `openrouter`, `opencode-go`, `modelscope`,
  `groq`) prefijan sus ids; el prefijo no llega al cable.
- **Los precios salen de la base.** `MODEL_PRICING` era un mapa hardcodeado de
  ~62 entradas en paralelo al catálogo, y mantener dos listas fallaba en silencio.
  Ahora el precio vive en la fila del modelo (`input_per_1m` / `output_per_1m`) y
  un modelo sin tarifa avisa una vez en vez de reportar $0 como si fuera gratis.
- **`createAgent` honra su configuración.** `provider`, `model`, `maxIterations`,
  `skills` y `workspace` se aceptaban y se descartaban: el agente corría con lo
  que hubiera en la base. Ahora se persisten en la fila del agente.
- **Las tools de la app son usables.** `defineTool` registraba la declaración pero
  no el ejecutor, así que una llamada moría con "no matching executor found". Y
  aunque lo tuviera, el índice de capacidad no se llenaba nunca por la vía del
  SDK, así que el agente quedaba limitado al loadout mínimo para siempre.
- **El selector ya no descarta tools que el índice sí encontró.** `selectTools`
  resolvía los resultados contra `CORE_TOOL_CATALOG` mientras el índice se
  construía con ése **más** la colección `tools`: una tool registrada en runtime
  podía puntuar primera en BM25 y aun así nunca ofrecerse al modelo.
- **`Scratchpad` escribe el documento completo.** Compartía colección e id con
  `conversation-store` pero guardaba un doc sin `source`, `createdAt` ni `seq`,
  así que sus notas se ordenaban mal dentro del prompt.
- **La suite de tests dejó de escribir en la base real del usuario.** Un preload
  fija `HIVE_DB_PATH=":memory:"` antes de que cargue cualquier módulo.
- **`tool_choice` de Mistral.** Estaba en `"any"`, que según docs.mistral.ai
  *fuerza* una llamada a tool en cada turno; ahora es `"auto"`.

### Ruptura

| Antes | Ahora |
|---|---|
| `initializeDatabase()`, `dbService`, `getDb()` | `ensureHiveDb()`, `col()` |
| `seedHiveDB()` | `seedAllData()` (lo llama `ensureHiveDb`) |
| `getAverageTokenCost()`, `getProviderPricing()`, `estimateCostForTokens()` | `calculateCost()` |
| `new EthicsGuard(db)`, métodos sync | `new EthicsGuard()`, métodos async |
| `new CronScheduler(db, handler)` | `new CronScheduler(handler)` |
| `new Scratchpad(db)` | `new Scratchpad()` |
| subpath `./ace` | `curator`, `reflector`, `tracer` desde `./agent` |
| subpath `./agent/selectors` | selectores desde `./agent` |
| `AgentConfig.provider: "openai" \| "anthropic" \| "gemini" \| "ollama"` | los 16 providers del catálogo |
| `api_request` con `auth`, `body` objeto, `timeoutMs` | headers, `body` string, `timeout_ms` |
| evento de canvas `canvas:render` | `canvas:node_add` / `node_update` / `edge_*` |

Módulos eliminados: `auth/` (sin un solo import), `agent/ContextGuard.ts` y
`agent/Hooks.ts` (muertos), `storage/SQLiteStorage.ts`, `storage/schema.ts`,
`storage/hiveSeed.ts`, `scheduler/dag/` (copia byte-idéntica de `swarm/`),
`swarm/WorkerPool.ts` (copia rezagada de `scheduler/integration.ts`),
`swarm/AgentBus.ts` y `swarm/EventBus.ts` (duplicaban `events/`), y las tools
`canvas/`, `codebridge/`, `meeting/`, `projects/`, `voice/`.

`harness/` pasó de tener implementación propia a ser un barrel sobre la
implementación única. El subpath `@johpaz/hive-sdk/harness` exporta lo mismo.

### Agregado

- 16 providers LLM con `OpenAICompatBase`, incluidos `nvidia`, `z-ai`,
  `modelscope`, `opencode-go`, `minimax`, `hiveagents`.
- Catálogo sembrado de 18 providers y 106 modelos con precio, actualizable
  editando `SEED_DATA.models`: las filas de catálogo se borran y se recrean en
  cada arranque, preservando qué modelo tenía activo el usuario.
- `registerAppTool()` / `clearAppTools()` como punto de extensión del registry.
- `catalogModelKey()`, `wireModelId()`, `isResellerProvider()`.
- `callLLM` y los tipos de `llm-client` en la superficie pública: antes sólo se
  exportaba el wrapper `AgentRunner`.
- `bun run skills:bundle` regenera el catálogo de skills desde los `SKILL.md`
  (el generador apuntaba a una ruta que no existe en este repo).
- Subpaths `./scheduler`, `./workers` y `./events`.
- De 18 a 44 archivos de test (77 → 314 casos), incluyendo agent loop, context
  compiler, compactación, seed, precios y claves de modelo, que no tenían ninguno.

### Corregido en el CLI

`init`, `run`, `test` y `trace` importaban `@hive/core`, un nombre de workspace
que no está publicado en npm: los cuatro comandos estaban rotos para cualquier
usuario. `hives test` además hacía glob sobre `packages/core/src/**`, rutas del
repo del SDK y no del proyecto donde se ejecuta.
