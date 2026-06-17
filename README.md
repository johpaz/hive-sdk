# Hive SDK

<p align="center">
  <img src="https://img.shields.io/badge/Bun-v1.3.13-000000?style=flat&logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/TypeScript-6.0-blue?style=flat&logo=typescript">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat">
</p>

**The Hive Agent Harness SDK** — Build, deploy, and scale AI agent applications with multi-channel support, context engineering, and swarm orchestration.

> This Hive SDK powers the [Hive Harness](https://github.com/johpaz/hive-skd). Use it to create your own harness instances without building everything from scratch.

---

## Paquetes

| Paquete | Descripción |
|---------|-------------|
| `@johpaz/hive-sdk` | Core SDK + CLI — agents, tools, skills, MCP, storage, swarm, gateway, channels |

## Instalación

```bash
# Install globally for the CLI
bun install -g @johpaz/hive-sdk

# Or in a project
bun add @johpaz/hive-sdk
```

## CLI Commands

### Create a full harness application

```bash
hives create-app my-hive
```

Generates a complete Hive harness with gateway, channels, and agent configuration.

### Create a lightweight agent project

```bash
hives init my-agent
```

### Add a tool to your project

```bash
cd my-hive
hives add-tool search-docs
```

### Add a skill to your project

```bash
cd my-hive
hives add-skill onboarding
```

### Run your agent

```bash
cd my-agent
hives run
```

---

## Inicio Rápido — Programmatic API

### Create an Agent

```typescript
import { createAgent, defineTool } from "@johpaz/hive-sdk";

const myTool = defineTool({
  name: "saludar",
  description: "Saluda a alguien",
  execute: async (args: { nombre: string }) => `¡Hola ${args.nombre}!`,
});

const agent = await createAgent({
  name: "asistente",
  provider: "openai",
  model: "gpt-4o-mini",
  tools: [myTool],
});

const respuesta = await agent.run("Saluda a Juan");
console.log(respuesta);
```

### Start a Gateway

```typescript
import { startGateway, createAgent, initializeDatabase } from "@johpaz/hive-sdk";

await initializeDatabase();

const agent = await createAgent({
  name: "coordinator",
  provider: "openai",
  model: "gpt-4o-mini",
});

const server = await startGateway({
  host: "127.0.0.1",
  port: 18790,
  agentId: "coordinator",
});

console.log(`Gateway running at http://127.0.0.1:18790`);
```

### Create a Swarm (DAG)

```typescript
import { DAGScheduler, TaskGraph } from "@johpaz/hive-sdk";

const graph = new TaskGraph([
  { id: "fetch", agentId: "fetcher", taskDescription: "Obtener datos", deps: [] },
  { id: "process", agentId: "processor", taskDescription: "Procesar", deps: ["fetch"] },
  { id: "report", agentId: "reporter", taskDescription: "Reportar", deps: ["process"] },
]);

const result = await new DAGScheduler().execute(graph);
```

### Multi-Channel Bot

```typescript
import { ChannelManager, TelegramChannel, DiscordChannel } from "@johpaz/hive-sdk";

const manager = new ChannelManager();

manager.register("telegram", new TelegramChannel({ botToken: process.env.TELEGRAM_BOT_TOKEN! }));
manager.register("discord", new DiscordChannel({ botToken: process.env.DISCORD_BOT_TOKEN! }));

await manager.startAll();
```

---

## Estructura del Proyecto (SDK)

```
hive-sdk/
├── packages/
│   ├── core/                   # @johpaz/hive-sdk core
│   │   └── src/
│   │       ├── api/            # createAgent(), Agent interface
│   │       ├── agent/          # AgentLoop, ContextCompiler, ConversationStore
│   │       │   ├── providers/  # LLM: OpenAI, Anthropic, Gemini, Ollama
│   │       │   └── selectors/  # FTS5: ToolSelector, SkillSelector, PlaybookSelector
│   │       ├── tools/          # ToolRegistry + 70+ built-in tools
│   │       ├── skills/         # SkillLoader, defineSkill()
│   │       ├── swarm/          # DAGScheduler, TaskGraph, WorkerPool
│   │       ├── gateway/        # HTTP/WebSocket server (Bun.serve)
│   │       ├── channels/       # Telegram, Discord, WhatsApp, Slack, Webchat
│   │       ├── mcp/            # MCPClientManager, transports (SSE, WS)
│   │       ├── storage/        # SQLite (bun:sqlite) + FTS5
│   │       ├── canvas/         # CanvasManager + A2UI emitter
│   │       ├── scheduler/      # CronScheduler + DAG execution
│   │       ├── ethics/         # EthicsGuard
│   │       ├── memory/         # Scratchpad
│   │       ├── config/         # loadConfig, loadEnv
│   │       ├── utils/          # logger, toon, crypto, retry
│   │       └── index.ts        # Public API barrel
│   │
│   └── cli/                    # Hive CLI
│       └── src/
│           ├── index.ts        # Entry: hive {init,create-app,add-tool,add-skill,run,test,trace}
│           ├── commands/
│           │   ├── init.ts
│           │   ├── create-app.ts
│           │   ├── add-tool.ts
│           │   ├── add-skill.ts
│           │   ├── run.ts
│           │   ├── test.ts
│           │   └── trace.ts
│           └── templates/
│               └── hive-app/   # Full harness template
│                   ├── package.json
│                   ├── hive.config.ts
│                   ├── docker-compose.yml
│                   ├── .env.example
│                   └── src/
│                       ├── main.ts
│                       └── agents/
│                           └── coordinator.ts
│
├── test/                       # Test helpers
├── docs/                       # Documentation
├── tsconfig.json
└── package.json
```

---

## API Pública

```typescript
import {
  // Agent
  createAgent,
  defineTool,
  defineSkill,
  runAgent,
  runAgentIsolated,

  // Gateway
  startGateway,

  // Channels
  ChannelManager,
  TelegramChannel,
  DiscordChannel,
  WhatsAppChannel,
  SlackChannel,
  WebChatChannel,

  // Swarm
  DAGScheduler,
  TaskGraph,
  TaskNode,

  // MCP
  MCPClientManager,

  // Tools
  ToolRegistry,
  ToolExecutor,
  executeToolBatch,

  // Storage
  initializeDatabase,

  // Config
  loadConfig,

  // Utils
  logger,
  retry,
} from "@johpaz/hive-sdk";
```

---

## Testing

```bash
# All tests
bun test packages/core/src/

# Tests with timeout
bun test --timeout 30000

# Specific tests
bun test packages/core/src/tools/ToolRegistry.test.ts
```

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

## Licencia

MIT © 2024-2025 johpaz
