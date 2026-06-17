# Documentación — Hive SDK

> **Agent Harness SDK** — Build, deploy, and scale AI agent applications with multi-channel support, Bun Workers, and swarm orchestration.

## Documentos

| Documento | Descripción |
|-----------|-------------|
| [API-AGENTS.md](API-AGENTS.md) | createAgent, AgentLoop, Tool/Skill Selector, LLM Providers |
| [API-DAG-SCHEDULER.md](API-DAG-SCHEDULER.md) | DAGScheduler, TaskGraph, TaskNode, Estrategias, Presets |
| [API-WORKERS-EVENTS.md](API-WORKERS-EVENTS.md) | **Bun Workers**, createWorker, WorkerPool, AgentBus, EventBus, Canvas |
| [API-TOOLS-SKILLS-CHANNELS.md](API-TOOLS-SKILLS-CHANNELS.md) | Tools, Skills, MCP, **Gateway**, **Channels**, **Tool Runtime**, Storage |
| [API-CONTEXT-COMPILER.md](API-CONTEXT-COMPILER.md) | Context Compiler, Message History, Scratchpad, EthicsGuard, ACE |
| [TEMPLATE-HIVE-APP.md](TEMPLATE-HIVE-APP.md) | **Template hive-app** — estructura, opciones, personalización |
| [HIVE-HARNESS.md](../docs/HIVE-HARNESS.md) | Posicionamiento de producto: Hive como Agent Harness |

## Instalación

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

const tool = defineTool({
  name: "saludar",
  description: "Saluda a alguien",
  execute: async (args: { nombre: string }) => `¡Hola ${args.nombre}!`,
});

const agent = await createAgent({
  name: "asistente",
  provider: "openai",
  model: "gpt-4o-mini",
  tools: [tool],
});

const respuesta = await agent.run("Saluda a Juan");
console.log(respuesta);
```

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
HIVE_DATA_DIR=./data          # Directorio de datos SQLite
HIVE_HOST=127.0.0.1           # Gateway host
HIVE_PORT=18790               # Gateway port
OPENAI_API_KEY=sk-...         # OpenAI
ANTHROPIC_API_KEY=sk-ant-...  # Anthropic
GOOGLE_API_KEY=...            # Gemini
LOG_LEVEL=info                # debug | info | warn | error
```

## Tests

```bash
# Todos los tests (paralelo)
bun test

# Tests con timeout extendido
bun test --timeout 60000
```

## Changelog

### v0.0.17
- **Bun Workers individuales**: `createWorker()`, `WorkerPool`, `agent.worker.ts`
- **Gateway simplificado**: HTTP/WebSocket server con `Bun.serve()`
- **Channels**: Telegram, Discord, WhatsApp, Slack, Webchat
- **Tool Runtime**: Ejecución paralela de tools vía Bun Workers
- **CLI mejorado**: `hives create-app`, `hives add-tool`, `hives add-skill`, `hives add-worker`
- **Template hive-app**: Proyecto harness completo con Docker
- **39 tests pasando** en 12 archivos

### v0.0.15
- Core de agentes con Context Engineering, FTS5, ACE
- DAGScheduler con ejecución paralela
- API pública: `createAgent`, `defineTool`, `defineSkill`

---

*Documentación Hive SDK v0.0.17*
