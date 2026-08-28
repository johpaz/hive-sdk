<p align="center">
  <img src="docs/assets/logoblack.png" alt="Hive SDK" width="180" />
</p>

# @johpaz/hive-sdk

> **Hive Agent Harness SDK** — construí, desplegá y escalá aplicaciones de agentes de IA, con soporte multi-canal, Bun Workers y orquestación en swarm.

[![npm](https://img.shields.io/npm/v/@johpaz/hive-sdk)](https://www.npmjs.com/package/@johpaz/hive-sdk)

```bash
bun add @johpaz/hive-sdk
```

## ¿Qué es Hive SDK?

**Hive SDK es un Agent Harness**: un marco de trabajo completo para construir, desplegar y escalar aplicaciones de agentes de IA. A diferencia de un simple wrapper de LLM, un *harness* provee todo lo necesario para que un agente opere en producción:

- **Agentes**: ciclo ReAct nativo con checkpoint durable, 16 providers LLM y descubrimiento de tools/skills por búsqueda BM25.
- **Catálogo**: 18 providers y 106 modelos sembrados, cada uno con su precio por millón de tokens — una sola fuente de verdad para el costo.
- **Tools**: 58 tools incluidas — filesystem, web search, browser automation (`agent-browser`), APIs (`api_request`), a2ui, office, cron, delegación.
- **Skills**: 23 workflows bundled, más los tuyos con `defineSkill` y `SkillLoader`.
- **Canales**: Telegram, Discord, WhatsApp, Slack y WebChat con `ChannelManager`.
- **Swarm**: orquestación multi-agente con `DAGScheduler`, `TaskGraph` y `WorkerPool`.
- **Runtime**: ejecución paralela de tools vía Bun Workers.
- **Gateway**: servidor HTTP/WebSocket para exponer agentes como API.
- **Memoria y estado**: HiveDB (colecciones + índice BM25), scratchpad, context compiler con compactación.

Con Hive SDK no montas un agente desde cero: **enganchas tu lógica de negocio en un harness ya armado**.

## Instalación

> **Requiere Bun.** El paquete se publica como TypeScript y usa APIs de Bun
> (`Bun.secrets`, `Bun.spawn`, Workers) en 18 archivos del core, así que no
> corre sobre Node aunque se le apliquen los flags de type-stripping. Si tu
> backend es Node, hoy la vía es un proceso Bun aparte; el build a JS que
> levantaría esa restricción todavía no existe.

```bash
# Instalar globalmente para el CLI
bun install -g @johpaz/hive-sdk

# O en un proyecto
bun add @johpaz/hive-sdk
```

## CLI Commands

```bash
hives init <name>         # Inicializar proyecto agente
hives create-app <name>   # Crear aplicación harness completa
hives add-tool <name>     # Añadir tool
hives add-skill <name>    # Añadir skill
hives add-worker <name>   # Añadir Bun Worker
hives run                 # Ejecutar agente
hives test                # Test tools/skills
hives trace               # Ver logs de ejecución
```

## Inicio Rápido

### 1. Crear una app harness completa

```bash
hives create-app my-hive
cd my-hive
bun install
cp .env.example .env
bun run dev
```

### 2. Crear un agente simple

```typescript
import { createAgent, defineTool } from "@johpaz/hive-sdk";
import { z } from "zod";

const tool = defineTool({
  name: "saludar",
  description: "Saluda a alguien por su nombre",
  schema: z.object({ nombre: z.string().describe("a quién saludar") }),
  execute: async (args: { nombre: string }) => `¡Hola ${args.nombre}!`,
});

const agent = await createAgent({
  name: "asistente",
  provider: "openai",       // cualquiera de los 16 del catálogo
  model: "gpt-5.6-luna",    // tiene que existir en el catálogo sembrado
  tools: [tool],
});

const respuesta = await agent.run("Saluda a Juan");
console.log(respuesta);
```

`createAgent` abre HiveDB, siembra el catálogo de providers y modelos, persiste
la configuración en la fila del agente y deja tus tools indexadas para que el
modelo pueda descubrirlas. El `schema` de Zod es lo que se traduce a los
parámetros que ve el LLM — sin él, la tool se ofrece sin argumentos.

### 3. Crear un worker especializado

```typescript
import { createWorker } from "@johpaz/hive-sdk";

const researcher = createWorker({
  name: "researcher",
  systemPrompt: "You are a research specialist. Provide concise, factual summaries.",
});

const result = await researcher.run("Research quantum computing advances");
console.log(result);
researcher.terminate();
```

### 4. Ejecutar workers en paralelo

```typescript
import { WorkerPool } from "@johpaz/hive-sdk";

const pool = new WorkerPool({ maxWorkers: 4 });

const tasks = [
  { id: "t1", message: "Summarize article A" },
  { id: "t2", message: "Summarize article B" },
  { id: "t3", message: "Summarize article C" },
];

const results = await pool.executeBatch(tasks);
console.log(results);
pool.shutdown();
```

### 5. Gateway HTTP/WebSocket

```typescript
import { startGateway } from "@johpaz/hive-sdk";

const server = await startGateway({
  host: "127.0.0.1",
  port: 18790,
  agentId: "coordinator",
});

console.log(`Gateway at http://127.0.0.1:18790`);
```

## Variables de Entorno

```bash
HIVE_HOME=~/.hive             # Directorio de datos (HiveDB vive en <HIVE_HOME>/data)
HIVE_DB_PATH=                 # Ruta explícita de la base; ":memory:" para efímera
HIVE_HOST=127.0.0.1           # Gateway host
HIVE_PORT=18790               # Gateway port
LOG_LEVEL=info                # debug | info | warn | error
```

La API key de cada provider se guarda cifrada en la base. Como alternativa, el
SDK cae a `<PROVIDER>_API_KEY` del entorno, en mayúsculas y con el id del
provider tal cual:

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...            # provider "gemini"
MODELSCOPE_API_KEY=ms-...
NVIDIA_API_KEY=nvapi-...
OPENROUTER_API_KEY=sk-or-...
```

## Tests

```bash
# Todos los tests (paralelo)
bun test

# Tests con timeout extendido
bun test --timeout 60000
```

La suite usa una base efímera (`HIVE_DB_PATH=":memory:"`, fijado en
`test/preload.ts`) para no escribir en la del usuario.

## Publicar

```bash
# 1. Actualizar archivos, sin tocar git — revisá el diff
bun run version:set 0.1.6

# 2. Cuando estés conforme: typecheck + tests + commit + tag + push
bun run version:set 0.1.6 --push

# Preview que no se instala por defecto
bun run version:set 0.2.0-rc.1 --push --npm-tag=next
```

`--push` corre `typecheck` y `bun test` antes de tocar git, y pide confirmación
explícita. El tag `vX.Y.Z` es lo que dispara `.github/workflows/publish.yml`, que
publica **sólo el paquete raíz** (`packages/*` son workspaces internos). El
dist-tag viaja en el mensaje del tag, así que `--npm-tag=next` publica bajo `next`
y no mueve `latest`.

El script aborta si la versión ya existe en npm — republicar da 403 — y si el tag
local ya existe.

```bash
npm view @johpaz/hive-sdk dist-tags   # verificar después del release
```

## Documentación

| Documento | Descripción |
|-----------|-------------|
| [API-AGENTS.md](docs/API-AGENTS.md) | createAgent, AgentLoop, Tool/Skill Selector, los 16 LLM Providers |
| [API-CONTEXT-COMPILER.md](docs/API-CONTEXT-COMPILER.md) | Context Compiler, historial, Scratchpad, EthicsGuard, ACE |
| [API-TOOLS-SKILLS-CHANNELS.md](docs/API-TOOLS-SKILLS-CHANNELS.md) | Tools, Skills, MCP, Gateway, Channels, Tool Runtime, Storage |
| [API-DAG-SCHEDULER.md](docs/API-DAG-SCHEDULER.md) | DAGScheduler, TaskGraph, TaskNode, estrategias, presets |
| [API-WORKERS-EVENTS.md](docs/API-WORKERS-EVENTS.md) | Bun Workers, createWorker, WorkerPool, AgentBus, EventBus, Canvas |
| [HIVE-HARNESS.md](docs/HIVE-HARNESS.md) | Ejecución durable: cola de jobs, checkpoints, leases, proof packets |
| [TEMPLATE-HIVE-APP.md](docs/TEMPLATE-HIVE-APP.md) | Template `hive-app` — estructura, opciones, personalización |
| [CHANGELOG.md](CHANGELOG.md) | Cambios por versión |

---

*Hive SDK v0.1.6 — MIT*
