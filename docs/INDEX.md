# Índice de Documentación - Hive SDK

## Documentos de Usuario

| Documento | Descripción |
|-----------|-------------|
| [README.md](./README.md) | Introducción y visión general |
| [API-AGENTS.md](./API-AGENTS.md) | API de Agentes, Tool Selector, Skill Selector, LLM Providers |
| [API-DAG-SCHEDULER.md](./API-DAG-SCHEDULER.md) | DAG Scheduler, TaskGraph, Estrategias, Presets |
| [API-WORKERS-EVENTS.md](./API-WORKERS-EVENTS.md) | Workers, AgentBus, Eventos del Sistema |
| [API-TOOLS-SKILLS-CHANNELS.md](./API-TOOLS-SKILLS-CHANNELS.md) | Tools, Skills, Channels, Canvas, Storage |
| [API-CONTEXT-COMPILER.md](./API-CONTEXT-COMPILER.md) | Context Compiler, MCP, LLM Client |

---

## Guía de Inicio Rápido

### 1. Hola Mundo

```typescript
import { runAgent } from "@hive-sdk/agent";

const result = await runAgent({
  agentId: "assistant",
  userMessage: "Hola",
  threadId: "thread-1",
});
```

### 2. Crear un Swarm

```typescript
import { DAGScheduler, TaskGraph } from "@hive-sdk/scheduler";

const graph = new TaskGraph([
  { id: "task1", agentId: "worker", taskDescription: "Tarea 1", deps: [] },
  { id: "task2", agentId: "worker", taskDescription: "Tarea 2", deps: ["task1"] },
]);

const result = await new DAGScheduler().execute(graph);
```

### 3. Integrar con Slack

```typescript
import { createChannelHandler } from "@hive-sdk/channels";
import { runAgent } from "@hive-sdk/agent";

const handler = createChannelHandler("slack");

app.post("/webhooks/slack", async (req, res) => {
  const msg = handler.parse(req.body);
  const response = await runAgent({ agentId: "main", userMessage: msg.text, threadId: msg.userId });
  await handler.reply(msg, response);
});
```

---

## Estructura de Paquetes

```
packages/
├── agent/               # Core del agente
│   ├── src/
│   │   ├── agent-loop.ts     # runAgent, runAgentIsolated
│   │   ├── tool-selector.ts  # selectTools, FTS5
│   │   ├── skill-selector.ts # selectSkills
│   │   ├── context-compiler.ts# compileContext
│   │   └── llm-providers/    # Anthropic, OpenAI, Ollama, etc.
│   └── test/
│
├── scheduler/          # DAG Scheduler
│   ├── src/
│   │   ├── dag/
│   │   │   ├── DAGScheduler.ts   # Orquestador principal
│   │   │   ├── TaskGraph.ts      # Grafo de tareas
│   │   │   ├── TaskNode.ts       # Nodo individual
│   │   │   ├── strategies/       # Parallel, Priority
│   │   │   └── presets/           # Research, Pipeline
│   │   └── swarm/           # Workers y management
│   └── test/
│
├── events/             # AgentBus
│   └── src/
│       └── agent-bus.ts     # Pub/Sub de eventos
│
├── storage/            # SQLite
│   └── src/
│       └── sqlite.ts        # getDb, schemas
│
├── canvas/             # Canvas (ACE)
│   └── src/
│       └── canvas-manager.ts # Estado visual
│
├── gateway/           # Servidor HTTP/WS
│   └── src/
│       └── server.ts        # API REST + WebSocket
│
└── channels/          # Canales externos
    └── src/
        └── base.ts          # Handler base para canales
```

---

## Conceptos Clave

### Agente
Unidad de ejecución con:
- Configuración (provider, model, system prompt)
- Contexto (historial, tools, skills)
- Ciclo de ejecución (prompt → LLM → tools → response)

### Swarm
Ejecución de un TaskGraph completo con:
- Múltiples workers paralelos
- Gestión de dependencias
- Notificaciones de progreso

### TaskGraph
Grafo acíclico dirigido donde:
- Nodos = tareas
- Aristas = dependencias
- Ejecución = topological sort con paralelismo

### Tool
Función que el agente puede invocar:
- Seleccionada dinámicamente via FTS5
- Ejecutada por el worker
- Retorna resultado al LLM

### Skill
Composición de tools con:
- Triggers semánticos
- Categorización
- Activación automática

### Channel
Integración con sistemas externos:
- Slack, Discord, Telegram, WhatsApp
- Webhooks entrantes
- Mensajes salientes

### Canvas
Visualización en tiempo real:
- Estado de nodos
- Progreso de tareas
- Updates por WebSocket

---

## Variables de Entorno

```bash
# Puerto del servidor
HIVE_PORT=3000

# Directorio de datos
HIVE_DATA_DIR=./data

# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Logging
LOG_LEVEL=info
SILENT=false
```

---

## Tests

```bash
# Todos los tests
bun test packages/

# Tests de carga
bun test test/load/

# Tests de stress
bun test test/stress/

# Benchmarks streaming
bun test test/streaming/
```

---

## Changelog

### v1.1.0 (2026-05-02)
- Streaming TTFT benchmarks
- Worker performance metrics
- E2E streaming + worker distribution
- Fix: DAGScheduler executor option

### v1.0.0 (2026-01-01)
- Lanzamiento inicial

---

*Documentación Hive SDK v1.1.0*
*Generado: 2026-05-02*