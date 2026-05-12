# Hive SDK

<p align="center">
  <img src="https://img.shields.io/badge/Bun-v1.3.13-000000?style=flat&logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/TypeScript-6.0-blue?style=flat&logo=typescript">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat">
</p>

Framework de agentes AI con Context Engineering, FTS5, ACE y Swarm — construido nativamente para Bun.

## Paquetes

| Paquete | Descripción |
|---------|-------------|
| `@johpaz/hive-core` | Core del framework: agente, tools, skills, MCP, storage, swarm, canvas, ACE |
| `@johpaz/hive-cli` | CLI: `hive init`, `hive run`, `hive test`, `hive trace` |

## Instalación

```bash
git clone https://github.com/anomalyco/hive-sdk.git
cd hive-sdk
bun install
```

## Inicio Rápido

```typescript
import { createAgent, defineTool } from "@johpaz/hive-core";

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

## Crear un Swarm (DAG)

```typescript
import { DAGScheduler, TaskGraph } from "@johpaz/hive-core";

const graph = new TaskGraph([
  { id: "fetch", agentId: "fetcher", taskDescription: "Obtener datos", deps: [] },
  { id: "process", agentId: "processor", taskDescription: "Procesar", deps: ["fetch"] },
  { id: "report", agentId: "reporter", taskDescription: "Reportar", deps: ["process"] },
]);

const result = await new DAGScheduler().execute(graph);
```

## Estructura del Proyecto

```
hive-sdk/
├── packages/
│   ├── core/                   # @johpaz/hive-core
│   │   └── src/
│   │       ├── agent/          # AgentLoop, ContextCompiler, ConversationStore
│   │       │   ├── providers/  # LLM: OpenAI, Anthropic, Gemini, Ollama
│   │       │   └── selectors/  # FTS5: ToolSelector, SkillSelector, PlaybookSelector
│   │       ├── tools/          # ToolRegistry + 66 built-in tools
│   │       │   ├── filesystem/ web/ projects/ cron/ cli/ agents/
│   │       │   ├── canvas/ codebridge/ voice/ core/ office/ meeting/
│   │       │   ├── ToolRegistry.ts   # defineTool()
│   │       │   └── ToolExecutor.ts
│   │       ├── skills/         # SkillLoader, defineSkill()
│   │       ├── swarm/          # DAGScheduler, TaskGraph, WorkerPool
│   │       │   ├── strategies/ # ParallelStrategy, PriorityStrategy
│   │       │   └── presets/    # HiveLearnPreset, ResearchPreset
│   │       ├── mcp/            # MCPClientManager, transports (SSE, WS)
│   │       ├── storage/        # SQLite (bun:sqlite) + FTS5
│   │       ├── ace/            # Tracer, Reflector, Curator
│   │       ├── canvas/         # CanvasManager + A2UI tools
│   │       ├── memory/         # Scratchpad
│   │       ├── ethics/         # EthicsGuard
│   │       ├── config/         # loadConfig, loadEnv
│   │       ├── utils/          # logger, toon, crypto, retry
│   │       ├── api/            # createAgent()
│   │       └── index.ts        # Public API barrel
│   │
│   └── cli/                    # @johpaz/hive-cli
│       └── src/
│           ├── index.ts        # Entry: hive {init,run,test,trace}
│           └── commands/
│               ├── init.ts     # hive init
│               ├── run.ts      # hive run
│               ├── test.ts     # hive test
│               └── trace.ts    # hive trace
│
├── test/                       # Test helpers
│   └── setup-db.ts             # DB preload for tests
│
├── docs/                       # Documentación
├── tsconfig.json
└── package.json
```

## API Pública

```typescript
import {
  createAgent,           // Crear agente con configuración
  defineTool,            // Definir herramienta
  defineSkill,           // Definir skill
  ToolRegistry,          // Registro de herramientas
  ToolExecutor,          // Ejecutor de herramientas
  AgentLoop,             // Bucle principal del agente
  runAgent,              // Ejecutar agente (streaming)
  runAgentIsolated,      // Ejecutar agente aislado (workers)
  DAGScheduler,          // Orquestador DAG
  TaskGraph,             // Grafo de tareas
  TaskNode,              // Nodo del grafo
  MCPClientManager,      // Cliente MCP
  EthicsGuard,           // Guardián ético
  Scratchpad,            // Memoria temporal
  SkillLoader,           // Cargador de skills
  initializeDatabase,    // Inicializar BD
  loadConfig,            // Cargar configuración
  logger,                // Logger
} from "@johpaz/hive-core";
```

## Testing

```bash
# Todos los tests
bun test packages/core/src/

# Tests con timeout
bun test --timeout 30000

# Tests específicos
bun test packages/core/src/tools/ToolRegistry.test.ts
```

## Variables de Entorno

```bash
HIVE_DATA_DIR=./data          # Directorio de datos
OPENAI_API_KEY=sk-...         # OpenAI
ANTHROPIC_API_KEY=sk-ant-...  # Anthropic
LOG_LEVEL=info                 # debug | info | warn | error
```

## Licencia

MIT © 2024 Anomaly Co.
