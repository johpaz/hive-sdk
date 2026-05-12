# Índice de Documentación — Hive SDK

## Documentos de Usuario

| Documento | Descripción |
|-----------|-------------|
| [README.md](../README.md) | Introducción y guía rápida |
| [API-AGENTS.md](./API-AGENTS.md) | AgentLoop, Tool/Skill Selector, LLM Providers |
| [API-DAG-SCHEDULER.md](./API-DAG-SCHEDULER.md) | DAGScheduler, TaskGraph, Estrategias, Presets |
| [API-WORKERS-EVENTS.md](./API-WORKERS-EVENTS.md) | Workers, AgentBus, Eventos del sistema |
| [API-TOOLS-SKILLS-CHANNELS.md](./API-TOOLS-SKILLS-CHANNELS.md) | Tools, Skills, Canvas, Storage |
| [API-CONTEXT-COMPILER.md](./API-CONTEXT-COMPILER.md) | Context Compiler, MCP, LLM Client |

---

## Guía de Inicio Rápido

### 1. Crear Agente (nueva API)

```typescript
import { createAgent, defineTool } from "@johpaz/hive-core";

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

### 2. Crear un Swarm

```typescript
import { DAGScheduler, TaskGraph } from "@johpaz/hive-core";

const graph = new TaskGraph([
  { id: "task1", agentId: "worker", taskDescription: "Tarea 1", deps: [] },
  { id: "task2", agentId: "worker", taskDescription: "Tarea 2", deps: ["task1"] },
]);

const result = await new DAGScheduler().execute(graph);
```

---

## Estructura de Paquetes

```
packages/
├── core/                   # @johpaz/hive-core
│   └── src/
│       ├── agent/          # AgentLoop, ContextCompiler
│       │   ├── providers/  # LLM providers (OpenAI, Anthropic, Gemini, Ollama)
│       │   └── selectors/  # FTS5 ToolSelector, SkillSelector
│       ├── tools/          # 66 built-in tools + ToolRegistry
│       ├── skills/         # SkillLoader, defineSkill()
│       ├── swarm/          # DAGScheduler, TaskGraph, WorkerPool
│       │   ├── strategies/ # Parallel, Priority
│       │   └── presets/    # HiveLearn, Research
│       ├── mcp/            # MCPClientManager + transports
│       ├── storage/        # SQLite (bun:sqlite) + FTS5
│       ├── ace/            # Tracer, Reflector, Curator
│       ├── canvas/         # CanvasManager + A2UI
│       ├── memory/         # Scratchpad
│       ├── ethics/         # EthicsGuard
│       ├── config/         # loadConfig
│       ├── utils/          # logger, toon
│       ├── api/            # createAgent()
│       └── index.ts        # Public API
│
└── cli/                    # @johpaz/hive-cli
    └── src/
        └── commands/       # init, run, test, trace
```

---

## Conceptos Clave

### Agente
Unidad de ejecución con:
- Configuración (provider, model, system prompt)
- Contexto (historial, tools, skills)
- Ciclo de ejecución (prompt → LLM → tools → response)

### Tool
Función que el agente puede invocar:
- Definida con `defineTool()`
- Seleccionada dinámicamente via FTS5
- Ejecutada por el worker

### Skill
Composición de tools con triggers semánticos:
- Definida con `defineSkill()`
- Categorización automática

### Swarm (DAG)
Ejecución paralela de múltiples agentes:
- Nodos = tareas con dependencias
- Topological sort automático
- Workers paralelos con estrategias

### MCP
Model Context Protocol:
- Servidores MCP como herramientas externas
- Transports: STDIO, SSE, WebSocket

---

## Variables de Entorno

```bash
HIVE_DATA_DIR=./data          # Directorio de datos
OPENAI_API_KEY=sk-...         # OpenAI
ANTHROPIC_API_KEY=sk-ant-...  # Anthropic
LOG_LEVEL=info                 # debug | info | warn | error
```

---

## Tests

```bash
# Tests unitarios
bun test packages/core/src/

# Tests con timeout extendido
bun test --timeout 60000 packages/core/src/
```

---

*Documentación Hive SDK v2.0.0*
