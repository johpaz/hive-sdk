# Changelog

## Sin publicar

### Seguridad

- **`sanitizeDiagnostic` dejaba el token en claro detrás del esquema de auth.**
  La regex consumía sólo la palabra `Bearer`, así que un diagnóstico con
  `authorization: Bearer <token>` quedaba como `authorization: [REDACTED] <token>`
  y la credencial viajaba al prompt del coordinador. Afecta a **0.1.5 y
  anteriores**: el archivo viaja en el tarball publicado.

### Corregido

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
