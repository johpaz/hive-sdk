# Documentación — Hive SDK

## Documentos

| Documento | Descripción |
|-----------|-------------|
| [API-AGENTS.md](API-AGENTS.md) | createAgent, defineTool, defineSkill, AgentLoop, Tool/Skill Selector, LLM Providers |
| [API-DAG-SCHEDULER.md](API-DAG-SCHEDULER.md) | DAGScheduler, TaskGraph, TaskNode, Estrategias, Presets, EventBridge |
| [API-WORKERS-EVENTS.md](API-WORKERS-EVENTS.md) | Workers, AgentBus, EventBus, Canvas Events |
| [API-TOOLS-SKILLS-CHANNELS.md](API-TOOLS-SKILLS-CHANNELS.md) | ToolRegistry, ToolExecutor, SkillLoader, MCP, Canvas, Storage, Config |
| [API-CONTEXT-COMPILER.md](API-CONTEXT-COMPILER.md) | compileContext, Message History, Scratchpad, EthicsGuard, ACE, MCP Internals |

## Inicio Rápido

```bash
# Instalar
git clone https://github.com/anomalyco/hive-sdk.git
cd hive-sdk
bun install

# Test
bun test packages/core/src/
```

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
console.log(respuesta);
```

## Variables de Entorno

```bash
HIVE_DATA_DIR=./data          # Directorio de datos SQLite
OPENAI_API_KEY=sk-...         # OpenAI
ANTHROPIC_API_KEY=sk-ant-...  # Anthropic
LOG_LEVEL=info                 # debug | info | warn | error
```

## Changelog

### v2.0.0
- Restructura completa a @johpaz/hive-core, @johpaz/hive-cli
- Nueva API: createAgent, defineTool, defineSkill
- Eliminados: gateway, channels, tts, voice service (migrados a hive-app)
- FTS5 preservado como ventaja competitiva

### v1.1.0
- Streaming TTFT benchmarks
- Worker performance metrics
- DAGScheduler executor option fix

### v1.0.0
- Lanzamiento inicial
