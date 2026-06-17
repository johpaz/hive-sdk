# Índice de Documentación — Hive SDK

## Documentos de Usuario

| Documento | Descripción |
|-----------|-------------|
| [README.md](../README.md) | Introducción, instalación, CLI, guía rápida |
| [API-AGENTS.md](./API-AGENTS.md) | createAgent, AgentLoop, Tool/Skill Selector, LLM Providers |
| [API-DAG-SCHEDULER.md](./API-DAG-SCHEDULER.md) | DAGScheduler, TaskGraph, Estrategias, Presets |
| [API-WORKERS-EVENTS.md](./API-WORKERS-EVENTS.md) | **Bun Workers**, createWorker, WorkerPool, AgentBus, EventBus, Canvas |
| [API-TOOLS-SKILLS-CHANNELS.md](./API-TOOLS-SKILLS-CHANNELS.md) | Tools, Skills, MCP, Gateway, Channels, Tool Runtime, Storage |
| [API-CONTEXT-COMPILER.md](./API-CONTEXT-COMPILER.md) | Context Compiler, Message History, Scratchpad, EthicsGuard, ACE |
| [TEMPLATE-HIVE-APP.md](./TEMPLATE-HIVE-APP.md) | **Template hive-app** — estructura, opciones, personalización |
| [HIVE-HARNESS.md](../docs/HIVE-HARNESS.md) | Posicionamiento: Hive como Agent Harness vertical |

---

## Guía de Inicio Rápido

### 1. Crear una app harness completa

```bash
hives create-app my-hive
cd my-hive
bun install
cp .env.example .env
bun run dev
```

### 2. Crear Agente

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
```

### 3. Crear un Bun Worker

```typescript
import { createWorker } from "@johpaz/hive-sdk";

const worker = createWorker({
  name: "researcher",
  systemPrompt: "You are a research specialist...",
});

const result = await worker.run("Research quantum computing");
worker.terminate();
```

### 4. Ejecutar un Swarm (DAG)

```typescript
import { DAGScheduler, TaskGraph } from "@johpaz/hive-sdk";

const graph = new TaskGraph([
  { id: "task1", agentId: "worker", name: "T1", taskDescription: "Tarea 1", deps: [] },
  { id: "task2", agentId: "worker", name: "T2", taskDescription: "Tarea 2", deps: ["task1"] },
]);

const result = await new DAGScheduler().execute(graph);
```

### 5. Gateway + Canales

```typescript
import { startGateway, ChannelManager, TelegramChannel } from "@johpaz/hive-sdk";

const server = await startGateway({ host: "127.0.0.1", port: 18790 });

const channels = new ChannelManager(config);
// channels.register("telegram", new TelegramChannel({ botToken: "..." }));
```

---

## Estructura de Paquetes

```
packages/
├── core/                   # @johpaz/hive-sdk
│   └── src/
│       ├── api/            # createAgent(), Agent interface
│       ├── agent/          # AgentLoop, ContextCompiler, ConversationStore
│       │   ├── providers/  # LLM providers (OpenAI, Anthropic, Gemini, Ollama)
│       │   └── selectors/  # FTS5 ToolSelector, SkillSelector, PlaybookSelector
│       ├── tools/          # 70+ built-in tools + ToolRegistry + ToolExecutor
│       ├── skills/         # SkillLoader, defineSkill()
│       ├── swarm/          # DAGScheduler, TaskGraph, WorkerPool
│       ├── workers/        # Bun Workers: createWorker, WorkerPool, agent.worker.ts
│       ├── gateway/        # HTTP/WebSocket server (Bun.serve)
│       ├── channels/       # Telegram, Discord, WhatsApp, Slack, Webchat
│       ├── mcp/            # MCPClientManager + transports (SSE, WS, STDIO)
│       ├── storage/        # SQLite (bun:sqlite) + FTS5
│       ├── canvas/         # CanvasManager + A2UI emitter
│       ├── scheduler/      # CronScheduler + DAG execution
│       ├── tool-runtime/   # Bun Worker pool para ejecución paralela de tools
│       ├── ethics/         # EthicsGuard
│       ├── memory/         # Scratchpad
│       ├── config/         # loadConfig, loadEnv, getHiveDir
│       ├── utils/          # logger, toon, crypto, retry
│       └── index.ts        # Public API barrel
│
└── cli/                    # Hive CLI
    └── src/
        ├── index.ts        # Entry: hive <command>
        └── commands/
            ├── init.ts
            ├── create-app.ts      # Generar app harness completa
            ├── add-tool.ts        # Generar boilerplate de tool
            ├── add-skill.ts       # Generar boilerplate de skill
            ├── add-worker.ts      # Generar Bun Worker
            ├── run.ts
            ├── test.ts
            └── trace.ts
```

---

## Conceptos Clave

### Agente
Unidad de ejecución con configuración, contexto y ciclo de ejecución.

### Tool
Función invocable por el agente. Definida con `defineTool()`, seleccionada vía FTS5.

### Skill
Composición de tools con triggers semánticos. Definida con `defineSkill()`.

### Bun Worker
Thread aislado que ejecuta un agente con system prompt propio. Creado con `createWorker()`.

### WorkerPool
Gestiona múltiples Bun Workers para ejecución paralela de tareas.

### Swarm (DAG)
Ejecución paralela de múltiples agentes con dependencias. Topological sort automático.

### Gateway
Servidor HTTP/WebSocket que expone el agente como API.

### Channel
Integración con plataformas de mensajería (Telegram, Discord, WhatsApp, Slack, Webchat).

### MCP
Model Context Protocol — herramientas externas via STDIO/SSE/WebSocket.

---

## Variables de Entorno

```bash
HIVE_DATA_DIR=./data          # Directorio de datos
HIVE_HOST=127.0.0.1           # Gateway host
HIVE_PORT=18790               # Gateway port
OPENAI_API_KEY=sk-...         # OpenAI
ANTHROPIC_API_KEY=sk-ant-...  # Anthropic
LOG_LEVEL=info                # debug | info | warn | error
```

---

## Tests

```bash
# Tests unitarios (paralelo)
bun test

# Tests con timeout extendido
bun test --timeout 60000
```

---

*Documentación Hive SDK v0.0.17*
