# 🐝 Hive SDK

<p align="center">
  <img src="https://img.shields.io/badge/Bun-v1.3.13-000000?style=flat&logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/TypeScript-6.0-blue?style=flat&logo=typescript">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat">
</p>

> **¿LangChain es demasiado lento? ¿Node.js te frena?** Hive SDK es la alternativa de alto rendimiento construida nativamente para Bun, con orquestación DAG integrada y ejecución paralela de agentes.

## ¿Por qué Hive SDK en lugar de LangChain?

| Característica | LangChain | **Hive SDK** |
|----------------|-----------|--------------|
| Runtime | Node.js | **Bun (2-3x más rápido)** |
| Orquestación | LangChain Chains | **DAG Scheduler nativo** |
| Paralelismo | Sequential/LCEL | **Workers paralelos reales** |
| Base de datos | Integraciones externas | **SQLite built-in** |
| Herramientas | Custom | **FTS5 auto-selección** |
| UI/Visualización | LangGraph (beta) | **Canvas (ACE) incluido** |
| Channels | Webhooks manuales | **Slack, Discord, Telegram, WhatsApp** |
| Testing | Jest/Vitest | **Bun native (130+ tests)** |

## 🚀 Performance

```
LangChain:     ~3000ms (Node.js)
Hive SDK:      ~950ms  (Bun)        → 3x más rápido

DAG con 20 tareas:
  LangChain:   ~45s (secuencial)
  Hive SDK:    ~3s  (paralelo)     → 15x más rápido
```

## Instalación

```bash
# Clonar el repositorio
git clone https://github.com/anomalyco/hive-sdk.git
cd hive-sdk

# Instalar dependencias (Bun)
bun install

# Iniciar el servidor
bun run packages/gateway/src/server.ts
```

## Inicio Rápido

### 1. Ejecutar un Agente

```typescript
import { runAgent } from "@hive-sdk/agent";

// Ejecutar agente con streaming
for await (const chunk of runAgent({
  agentId: "assistant",
  userMessage: "Analiza las ventas del mes",
  threadId: "thread-123",
})) {
  if (chunk.agent?.messages) {
    console.log(chunk.agent.messages[0].content);
  }
}
```

### 2. Crear un Swarm (DAG)

```typescript
import { DAGScheduler, TaskGraph } from "@hive-sdk/scheduler";

// Grafo con dependencias
const graph = new TaskGraph([
  { id: "fetch", agentId: "fetcher", taskDescription: "Obtener datos", deps: [] },
  { id: "process", agentId: "processor", taskDescription: "Procesar datos", deps: ["fetch"] },
  { id: "analyze", agentId: "analyzer", taskDescription: "Analizar", deps: ["process"] },
  { id: "report", agentId: "reporter", taskDescription: "Generar reporte", deps: ["analyze"] },
]);

const scheduler = new DAGScheduler({
  maxConcurrentWorkers: 4,
});

const result = await scheduler.execute(graph);

console.log(`✅ Completado: ${result.completed.length}`);
console.log(`❌ Fallido: ${result.failed.length}`);
console.log(`⏱️ Duración: ${result.totalDurationMs}ms`);
```

### 3. Integrar con Slack

```typescript
import { createChannelHandler } from "@hive-sdk/channels";
import { runAgent } from "@hive-sdk/agent";

const handler = createChannelHandler("slack");

app.post("/webhooks/slack", async (req, res) => {
  const message = handler.parse(req.body);
  
  const response = await runAgent({
    agentId: "coordinator",
    userMessage: message.text,
    threadId: message.threadId,
  });
  
  await handler.reply(message, response);
  res.status(200).send("OK");
});
```

## Características Principales

### 🤖 Agentes Inteligentes
- **Multi-provider**: OpenAI, Anthropic, Ollama, DeepSeek, Gemini, Groq, Mistral, OpenRouter
- **Streaming nativo**: Tokens arriving en tiempo real
- **Contexto persistente**: Historial con compactación automática

### 📊 DAG Scheduler
- **Ejecución paralela**: Múltiples workers concurrentes
- **Gestión de dependencias**: Topological sort automático
- **Estrategias**: FIFO, Priority, Critical Path
- **Presets**: Research, Pipeline, Parallel

### 🔧 Tools Dinámicas
- **Selección automática**: FTS5 bm25 scoring
- **Categorización**: filesystem, web, code, memory, canvas, etc.
- **Límite adaptativo**: Max 12 tools por turno

### 🎯 Skills
- **Triggers semánticos**: Activación por palabras clave
- **Composiciones**: Múltiples tools combinadas
- **Categorías**: core, research, analytics, codebridge

### 💬 Channels
- **Slack**, **Discord**, **Telegram**, **WhatsApp**
- **Webhooks** y **bots** integrados
- **Múltiples threads** por usuario

### 📈 Canvas (ACE)
- **Visualización real-time** del estado de agentes
- **WebSocket** para updates instantáneos
- **Heartbeat** para detección de desconexiones

### 📦 Storage
- **SQLite** nativo (bun:sqlite)
- **FTS5** para búsqueda full-text
- **Transacciones** atomic

## Estructura del Proyecto

```
hive-sdk/
├── packages/
│   ├── agent/              # Core del agente
│   │   ├── src/
│   │   │   ├── agent-loop.ts      # runAgent, runAgentIsolated
│   │   │   ├── tool-selector.ts   # FTS5 tool selection
│   │   │   ├── skill-selector.ts  # Skill selection
│   │   │   ├── context-compiler.ts# Context compilation
│   │   │   └── llm-providers/     # OpenAI, Anthropic, Ollama...
│   │   └── test/                  # 130+ tests
│   │
│   ├── scheduler/           # DAG Scheduler
│   │   ├── src/
│   │   │   ├── dag/
│   │   │   │   ├── DAGScheduler.ts   # Orquestador
│   │   │   │   ├── TaskGraph.ts       # Grafo de tareas
│   │   │   │   ├── TaskNode.ts        # Nodo individual
│   │   │   │   ├── strategies/        # Parallel, Priority
│   │   │   │   └── presets/           # Research, Pipeline
│   │   │   └── swarm/           # Workers
│   │   └── test/
│   │
│   ├── events/             # AgentBus
│   ├── storage/            # SQLite
│   ├── canvas/             # Canvas (ACE)
│   ├── gateway/            # Servidor HTTP/WS
│   └── channels/           # Slack, Discord, etc.
│
├── test/
│   ├── load/               # Tests de carga
│   ├── stress/             # Tests de stress
│   └── streaming/          # Benchmarks
│
└── docs/                   # Documentación completa
```

## Benchmarks

### Time to First Token (TTFT)

| Modelo | TTFT | Categoría |
|--------|------|-----------|
| gpt-4o-mini | ~150ms | Rápido |
| gpt-4o | ~800ms | Balanceado |
| claude-opus | ~2500ms | Calidad |

### Worker Performance

| Métrica | Valor |
|---------|-------|
| Task duration | 30-55ms |
| Throughput | ~12 tasks/sec |
| Parallel efficiency | >95% |
| Swarm coordination | ~16ms |

## Documentación

| Documento | Descripción |
|-----------|-------------|
| [docs/README.md](docs/README.md) | Guía completa del usuario |
| [docs/INDEX.md](docs/INDEX.md) | Índice y referencias |
| [docs/API-AGENTS.md](docs/API-AGENTS.md) | API de Agentes |
| [docs/API-DAG-SCHEDULER.md](docs/API-DAG-SCHEDULER.md) | API del DAG |
| [docs/API-WORKERS-EVENTS.md](docs/API-WORKERS-EVENTS.md) | Workers y Eventos |
| [docs/API-TOOLS-SKILLS-CHANNELS.md](docs/API-TOOLS-SKILLS-CHANNELS.md) | Tools, Skills, Channels |
| [docs/API-CONTEXT-COMPILER.md](docs/API-CONTEXT-COMPILER.md) | Context Compiler |
| [test/BENCHMARKS.md](test/BENCHMARKS.md) | Benchmarks detallados |

## Testing

```bash
# Todos los tests
bun test packages/

# Tests de carga
bun test test/load/

# Tests de stress WebSocket
bun test test/stress/

# Benchmarks streaming
bun test test/streaming/

# Tests paralelos (recomendado)
bun test --parallel --isolate
```

**Resultado**: 130+ tests passing

## Comparativa de APIs

### LangChain vs Hive SDK

```typescript
// LangChain
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor } from "langchain/agents";

const model = new ChatOpenAI({ model: "gpt-4" });
const executor = AgentExecutor.fromAgentAndTools({
  agent,
  tools,
  verbose: true,
});
const result = await executor.invoke({ input: "..." });

// Hive SDK
import { runAgent } from "@hive-sdk/agent";

const result = await runAgent({
  agentId: "assistant",
  userMessage: "...",
  threadId: "...",
});
```

```typescript
// LangChain: DAG con LangGraph (complejo)
import { createReactAgent } from "@langchain/langgraph-prebuilt";
import { ToolNode } from "@langchain/langgraph-prebuilt";

const graph = createReactAgent({ llm: model, tools });
const result = await graph.invoke({ messages: [...] });

// Hive SDK: DAG nativo (simple)
import { DAGScheduler, TaskGraph } from "@hive-sdk/scheduler";

const graph = new TaskGraph(configs);
const result = await new DAGScheduler().execute(graph);
```

## Variables de Entorno

```bash
# Puerto
HIVE_PORT=3000

# Directorio de datos
HIVE_DATA_DIR=./data

# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Logging
LOG_LEVEL=info
```

## Licencia

MIT © 2024 Anomaly Co.

---

<p align="center">
  <strong>¿Necesitas ayuda?</strong><br>
  <a href="https://github.com/anomalyco/hive-sdk/issues">GitHub Issues</a> •
  <a href="https://discord.gg/hive-sdk">Discord</a>
</p>

*Construido con Bun 1.3.13*