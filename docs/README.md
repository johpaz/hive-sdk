# Hive SDK - Documentación del Usuario

## Índice General

1. [Introducción](#introducción)
2. [Arquitectura General](#arquitectura-general)
3. [Instalación y Configuración](#instalación-y-configuración)
4. [Componentes del Sistema](#componentes-del-sistema)
   - [Agentes](#agentes)
   - [DAG Scheduler](#dag-scheduler)
   - [Workers](#workers)
   - [Tools](#tools)
   - [Skills](#skills)
   - [Channels (ETCs)](#channels)
   - [Context Compiler](#context-compiler)
   - [Canvas (ACE)](#canvas-ace)
5. [API Reference](#api-reference)
6. [Ejemplos de Uso](#ejemplos-de-uso)
7. [Testing](#testing)
8. [Changelog](#changelog)

---

## Introducción

Hive SDK es un framework de agentes inteligentes desarrollado en TypeScript/Node.js con runtime Bun. Permite crear, orquestar y gestionar agentes AI que pueden ejecutarse en paralelo, coordinar mediante enjambres (swarms), y comunicarse entre sí.

### Características Principales

- **Agentes Autónomos**: Agentes AI con contexto persistente y herramientas dinámicas
- **Orquestación DAG**: Ejecución paralela de tareas con gestión de dependencias
- **Swarms**: Coordinación de múltiples agentes para tareas complejas
- **Herramientas Dinámicas**: Selección de tools en tiempo de ejecución via FTS5
- **Skills**: Composiciones de herramientas con triggers semánticos
- **Canvas (ACE)**: Visualización en tiempo real del estado de ejecución
- **Context Compiler**: Compilación de contexto con historial, tools y skills

---

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Gateway                                   │
│                   (WebSocket + REST API Server)                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
   ┌─────────┐           ┌─────────┐           ┌─────────┐
   │ Agent 1 │           │ Agent 2 │           │ Agent N │
   └────┬────┘           └────┬────┘           └────┬────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   DAG Scheduler   │
                    └────────┬──────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
      ┌─────────┐      ┌─────────┐      ┌─────────┐
      │ Worker 1 │      │ Worker 2│      │ Worker 3│
      └─────────┘      └─────────┘      └─────────┘
```

### Flujo de Ejecución

1. **Usuario** envía mensaje via Gateway (WebSocket/REST)
2. **AgentLoop** recibe y procesa el mensaje
3. **Context Compiler** compila contexto (historial + tools + skills)
4. **Tool Selector** selecciona herramientas relevantes via FTS5
5. **Skill Selector** selecciona skills según triggers
6. **LLM** procesa con contexto y retorna tool calls o respuesta
7. **Tools** se ejecutan y retornan resultados
8. **Canvas** actualiza estado visual
9. **AgentBus** notifica eventos a otros agentes

---

## Instalación y Configuración

### Requisitos

- **Runtime**: Bun 1.3.x o Node.js 18+
- **Base de datos**: SQLite o PostgreSQL (requerido)
- **Seed de datos**: tools, skills, agentes inicializados
- **Puerto**: 3000 (default)

> ⚠️ **IMPORTANTE**: Para que las tools y skills funcionen correctamente, debes tener una base de datos con el schema y datos seedados. Ver sección [Configuración de Base de Datos](#configuración-de-base-de-datos).

### Estructura del Proyecto

```
hive-sdk/
├── packages/
│   ├── agent/              # Core del agente
│   ├── scheduler/         # DAG Scheduler y Workers
│   ├── events/            # AgentBus (eventos)
│   ├── storage/           # SQLite storage
│   ├── canvas/            # Canvas (ACE)
│   ├── gateway/           # Servidor HTTP/WS
│   └── channels/          # Canales de comunicación
├── test/
│   ├── load/              # Tests de carga
│   ├── stress/            # Tests de stress
│   └── streaming/         # Benchmarks streaming
└── docs/                  # Documentación
```

### Configuración de Base de Datos

El SDK requiere una base de datos SQLite o PostgreSQL con el schema y datos seedados.

#### Schema Requerido

```sql
-- Tablas principales
CREATE TABLE users (...);
CREATE TABLE agents (...);
CREATE TABLE providers (...);
CREATE TABLE models (...);
CREATE TABLE tools (...);
CREATE TABLE skills (...);
CREATE TABLE conversations (...);
CREATE TABLE messages (...);

-- Índices FTS5 para búsqueda
CREATE VIRTUAL TABLE tools_fts USING fts5(tool_name, name, description, category);
CREATE VIRTUAL TABLE skills_fts USING fts5(id, name, description, category, tools, triggers, body);
```

#### Seed de Datos

El SDK incluye un script de seed para populate la base de datos:

```typescript
// Ejecutar seed
import { seedDatabase } from "@hive-sdk/storage/seed";

await seedDatabase();
```

Esto crea:
- **Providers**: OpenAI, Anthropic, Ollama, DeepSeek, Gemini, etc.
- **Models**: gpt-4o, gpt-4o-mini, claude-sonnet, etc.
- **Core Tools**: ~50 herramientas básicas
- **Core Skills**: Skills predefinidos
- **Agentes**: Agentes por defecto

#### Configuración de conexión

```typescript
// SQLite (default)
import { getDb } from "@hive-sdk/storage/sqlite";
const db = getDb(); // usa HIVE_DATA_DIR o ./data

// PostgreSQL (alternativo)
import { getPgDb } from "@hive-sdk/storage/postgres";
const db = getPgDb({ host: "localhost", port: 5432, database: "hive" });
```

> ⚠️ **NOTA**: Sin el seed de datos, el Tool Selector y Skill Selector retornarán arrays vacíos porque no encontrarán tools/skills en la base de datos.

### Iniciar el Servidor

```bash
# Desarrollo
bun run packages/gateway/src/server.ts

# Producción
NODE_ENV=production bun run packages/gateway/src/server.ts
```

### Variables de Entorno

```bash
# Puerto del servidor
HIVE_PORT=3000

# Directorio de datos
HIVE_DATA_DIR=./data

# Nivel de logging
LOG_LEVEL=info

#Modo silencioso (sin logs ASCII)
SILENT=true
```

---

## Componentes del Sistema

### Agentes

Los agentes son la unidad central de ejecución. Cada agente tiene:

- **ID**: Identificador único
- **Nombre**: Nombre legible
- **Provider**: Proveedor LLM (openai, anthropic, ollama, etc.)
- **Model**: Modelo específico
- **Max Iterations**: Límite de iteraciones por ejecución
- **System Prompt**: Prompt del sistema

#### Crear un Agente

```typescript
import { runAgent } from "@hive-sdk/agent";

const result = await runAgent({
  agentId: "coordinator-1",
  userMessage: "Analiza las ventas del mes",
  threadId: "thread-123",
});
```

#### Configuración de Agente

```typescript
const agentConfig = {
  id: "analyst-agent",
  name: "Analista de Datos",
  provider_id: "openai",
  model_id: "gpt-4o",
  max_iterations: 10,
  system_prompt: "Eres un analista de datos experto...",
};
```

---

### DAG Scheduler

El DAG Scheduler orquesta la ejecución paralela de tareas con gestión de dependencias.

#### Conceptos

- **TaskNode**: Una tarea individual en el grafo
- **TaskGraph**: Grafo acíclico dirigido de tareas
- **Swarm**: Ejecución de un grafo completo

#### Crear un Grafo

```typescript
import { TaskGraph, TaskNodeConfig } from "@hive-sdk/scheduler";

const configs: TaskNodeConfig[] = [
  { id: "fetch", agentId: "fetcher", taskDescription: "Obtener datos", deps: [] },
  { id: "process", agentId: "processor", taskDescription: "Procesar", deps: ["fetch"] },
  { id: "report", agentId: "reporter", taskDescription: "Generar reporte", deps: ["process"] },
];

const graph = new TaskGraph(configs);
```

#### Ejecutar Grafo

```typescript
import { DAGScheduler } from "@hive-sdk/scheduler";

const scheduler = new DAGScheduler({
  maxConcurrentWorkers: 4,
  strategy: new PriorityStrategy(),
});

const result = await scheduler.execute(graph, {
  projectId: "my-project",
  coordinatorId: "coordinator-1",
});

console.log(`Completados: ${result.completed.length}`);
console.log(`Fallidos: ${result.failed.length}`);
```

#### Estrategias de Ejecución

```typescript
import { ParallelStrategy, PriorityStrategy } from "@hive-sdk/scheduler";

// FIFO - Ejecución en orden de llegada
const parallel = new ParallelStrategy();

// Priority - Según prioridad y path crítico
const priority = new PriorityStrategy();

// Configurar scheduler
const scheduler = new DAGScheduler({
  strategy: priority,
  maxConcurrentWorkers: 2,
});
```

---

### Workers

Los workers son los ejecutores de tareas dentro de un swarm.

#### Worker Default

El `AgentExecutor` usa `runAgentIsolated` para ejecutar cada nodo:

```typescript
import { AgentExecutor } from "@hive-sdk/scheduler";

const executor = new AgentExecutor();

const result = await executor.execute(node, depResults, threadId);
```

#### Custom Executor

Puedes implementar tu propio executor:

```typescript
import type { IAgentExecutor } from "@hive-sdk/scheduler";

const myExecutor: IAgentExecutor = {
  async execute(node, depResults, threadId) {
    // Lógica custom
    return await myCustomExecution(node);
  },
};

const result = await scheduler.execute(graph, { executor: myExecutor });
```

#### Métricas de Workers

| Métrica | Valor Típico |
|---------|-------------|
| Task Duration | 30-55ms |
| Throughput | ~12 tasks/sec |
| Queue Depth | <5 para latencia aceptable |
| Context Switch | <1ms overhead |
| Swarm Coordination | ~16ms (5 workers) |

---

### Tools

Las tools son funciones que los agentes pueden invocar. Se seleccionan dinámicamente via FTS5.

#### Tool Descriptor

```typescript
interface ToolDescriptor {
  name: string;           // Nombre único
  description: string;    // Descripción para el LLM
  category: string;      // Categoría (filesystem, web, etc.)
  abstractionLevel?: "atomic" | "orchestration";
}
```

#### Tool Catalog (Core Tools)

```typescript
import { CORE_TOOL_CATALOG } from "@hive-sdk/agent";

// Tools disponibles automáticamente
console.log(CORE_TOOL_CATALOG.length); // ~50 tools
```

#### Categorías de Tools

| Categoría | Descripción | Ejemplos |
|----------|-------------|----------|
| scheduling | Gestión de horarios | cron, alarm |
| projects | Gestión de proyectos | create_task, update_task |
| filesystem | Operaciones de archivo | read_file, write_file |
| web | Búsqueda/web | web_search, fetch |
| browser | Automatización de navegador | navigate, click |
| memory | Notas y memoria | save_note, recall |
| code | Terminal y código | exec, bash |
| canvas | Rendering UI | render_component |
| agents | Gestión de agentes | spawn_agent |

#### Tool Selection Automática

El sistema selecciona tools automáticamente basándose en el mensaje del usuario:

```typescript
import { selectTools } from "@hive-sdk/agent";

const tools = selectTools("Search for files in the project");

// Retorna: [search_files, read_file] (si son relevantes)
```

---

### Skills

Los skills son composiones de tools con triggers semánticos.

#### Skill Descriptor

```typescript
interface SkillDescriptor {
  id: string;
  name: string;
  description: string;
  category: string;
  tools: string[];      // Tools que usa
  triggers: string[];   // Palabras clave para activar
  body: string;        // Código del skill
}
```

#### Core Skills

```typescript
import { CORE_SKILLS } from "@hive-sdk/agent";

console.log(CORE_SKILLS);
// [
//   { name: "file_manager", category: "core", ... },
//   { name: "web_researcher", category: "research", ... },
// ]
```

#### Skill Selection

```typescript
import { selectSkills, getMinimalSkills } from "@hive-sdk/agent";

// Seleccionar según mensaje
const skills = selectSkills("Analyze sales data");

// Skills mínimos siempre disponibles
const minimal = getMinimalSkills();
```

---

### Channels

Los channels (ETCs - External Token Channels) gestionan la comunicación externa.

#### Tipos de Channels

```typescript
// Slack
const slackChannel = {
  provider: "slack",
  config: {
    botToken: "xoxb-...",
    signingSecret: "...",
  },
};

// Discord
const discordChannel = {
  provider: "discord",
  config: {
    botToken: "...",
    guildId: "...",
  },
};

// Telegram
const telegramChannel = {
  provider: "telegram",
  config: {
    botToken: "...",
  },
};

// WhatsApp (Twilio)
const whatsappChannel = {
  provider: "whatsapp",
  config: {
    accountSid: "...",
    authToken: "...",
    phoneNumber: "...",
  },
};
```

#### Recibir Mensajes

```typescript
import { createChannelHandler } from "@hive-sdk/channels";

const handler = createChannelHandler("slack");

app.post("/webhook/slack", async (req, res) => {
  const message = await handler.parse(req);
  const response = await runAgent({
    agentId: "coordinator",
    userMessage: message.text,
    threadId: message.threadId,
  });
  await handler.send(response);
});
```

---

### Context Compiler

El Context Compiler compila el contexto para cada ejecución del agente.

#### Proceso de Compilación

```typescript
import { compileContext } from "@hive-sdk/agent";

const ctx = await compileContext({
  agentId: "analyst",
  threadId: "thread-123",
  userMessage: "Analiza esto",
  channel: "slack",
  mcpManager: mcpClient,
  isolated: false,
});

// Resultado:
/*
{
  systemPrompt: "...",  // Prompt con tools y constraints
  messages: [...],       // Historial de conversación
  tools: [...],         // Tools seleccionados
  skills: [...],        // Skills seleccionados
}
*/
```

#### Compilación de Historial

```typescript
// El historial se recupera de la BD y se recorta si es muy largo
const messages = await getRecentMessages(threadId, {
  maxTokens: 32000,
  maxMessages: 50,
});

// Se aplica "compacción" si el historial supera el límite
await maybeCompact(threadId, { channel: "slack", userId: "U123" });
```

#### Integración con Tools/Skills

```typescript
// 1. Seleccionar tools relevantes
const tools = selectTools(userMessage);

// 2. Seleccionar skills relevantes
const skills = selectSkills(userMessage);

// 3. Compilar contexto con ambos
const ctx = await compileContext({
  agentId,
  threadId,
  userMessage,
  tools,   // Se injectan automáticamente
  skills,  // Se injectan automáticamente
});
```

---

### Canvas (ACE)

Canvas (Agent Canvas Engine) proporciona visualización en tiempo real del estado de ejecución.

#### Estados de Nodos

```typescript
type NodeStatus = "PENDING" | "READY" | "RUNNING" | "COMPLETED" | "FAILED";

// El canvas se actualiza automáticamente
emitCanvas("canvas:node_update", {
  nodeId: "agent-1",
  changes: {
    status: "thinking",
    currentTool: "search_files",
  },
});
```

#### WebSocket Updates

```typescript
// Cliente recibe updates en tiempo real
const ws = new WebSocket("ws://localhost:3000/ws/canvas");

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  // { type: "node_update", nodeId: "...", changes: {...} }
};
```

#### Heartbeat

El sistema envía heartbeats para detectar desconexiones:

```typescript
// Ping cada 30 segundos
const heartbeat = { type: "ping", timestamp: Date.now() };

// El cliente debe responder con pong
const pong = { type: "pong", timestamp: Date.now() };
```

---

## API Reference

### Agent API

```typescript
// Ejecutar agente
runAgent(opts: {
  agentId: string;
  userMessage: string | ContentPart[];
  threadId: string;
  channel?: string;
  mcpManager?: MCPClientManager;
  isolated?: boolean;
}): AsyncGenerator<StreamChunk>;

// Selección de tools
selectTools(
  userMessage: string,
  fullToolList?: ToolDescriptor[],
  maxTools?: number
): ToolDescriptor[];

// Selección de skills
selectSkills(userMessage: string): SkillDescriptor[];
```

### Scheduler API

```typescript
// Crear grafo
new TaskGraph(configs: TaskNodeConfig[]);

// Ejecuter grafo
scheduler.execute(graph: TaskGraph, options?: DAGSchedulerOptions): Promise<DAGResult>;

// Opciones
interface DAGSchedulerOptions {
  strategy?: ExecutionStrategy;
  maxConcurrentWorkers?: number;
  projectId?: string;
  coordinatorId?: string;
  executor?: IAgentExecutor;
}

// Resultado
interface DAGResult {
  swarmId: string;
  totalDurationMs: number;
  completed: NodeSummary[];
  failed: NodeSummary[];
  success: boolean;
}
```

### Events API

```typescript
// Publicar evento
agentBus.publish(event: string, payload: object, fromWorkerId?: string);

// Suscribirse
agentBus.subscribe(event: string, callback: Function): () => void;

// Métodos helper
agentBus.notifyTaskStarted(workerId: string, taskId: string);
agentBus.notifyTaskCompleted(workerId: string, taskId: string, result: string);
agentBus.notifyTaskFailed(workerId: string, taskId: string, error: string);
agentBus.requestHelp(workerId: string, taskId: string);
agentBus.respondToHelp(requestingWorkerId: string, helpingWorkerId: string, result: string);
```

### Storage API

```typescript
// Obtener instancia
const db = getDb();

// Query básico
const users = db.query("SELECT * FROM users WHERE id = ?").all(userId);

// Insert/Update
db.query("INSERT INTO agents (id, name) VALUES (?, ?)").run(agentId, name);

// Transacciones
db.transaction(() => {
  db.query("INSERT INTO ...").run(...);
  db.query("UPDATE ...").run(...);
});
```

---

## Ejemplos de Uso

### Ejemplo 1: Agente Simple

```typescript
import { runAgent } from "@hive-sdk/agent";

const result = await runAgent({
  agentId: "assistant",
  userMessage: "Hola, ¿cómo estás?",
  threadId: "thread-001",
});

console.log(result);
```

### Ejemplo 2: Swarm Paralelo

```typescript
import { DAGScheduler, TaskGraph, TaskNodeConfig } from "@hive-sdk/scheduler";

const configs: TaskNodeConfig[] = [
  { id: "task1", agentId: "worker", taskDescription: "Tarea 1", deps: [] },
  { id: "task2", agentId: "worker", taskDescription: "Tarea 2", deps: [] },
  { id: "task3", agentId: "worker", taskDescription: "Tarea 3", deps: [] },
];

const graph = new TaskGraph(configs);
const scheduler = new DAGScheduler({ maxConcurrentWorkers: 3 });

const result = await scheduler.execute(graph);
console.log(result.success); // true
```

### Ejemplo 3: Dependencias Secuenciales

```typescript
const configs: TaskNodeConfig[] = [
  { id: "fetch", agentId: "fetcher", taskDescription: "Fetch data", deps: [] },
  { id: "process", agentId: "processor", taskDescription: "Process", deps: ["fetch"] },
  { id: "save", agentId: "saver", taskDescription: "Save", deps: ["process"] },
];

// Solo se ejecutan cuando sus dependencias completan
```

### Ejemplo 4: Integración con Slack

```typescript
import { createChannelHandler } from "@hive-sdk/channels";

const handler = createChannelHandler("slack");

// Webhook
app.post("/webhooks/slack", async (req, res) => {
  const message = handler.parse(req.body);
  const response = await runAgent({
    agentId: "coordinator",
    userMessage: message.text,
    threadId: message.threadId,
  });
  await handler.reply(message.channel, response);
});
```

### Ejemplo 5: Tool Selection Custom

```typescript
import { selectTools } from "@hive-sdk/agent";

const customTools = [
  { name: "my_tool", description: "Custom tool", category: "custom" },
];

const selected = selectTools(
  "Use my custom tool for something",
  customTools,
  2  // maxTools
);
```

---

## Testing

### Ejecutar Tests

```bash
# Todos los tests
bun test packages/

# Tests de carga
bun test test/load/

# Tests de stress
bun test test/stress/

# Streaming benchmarks
bun test test/streaming/

# Tests paralelos
bun test --parallel --isolate
```

### Benchmarks

| Métrica | Valor |
|---------|-------|
| Swarms concurrentes | 10-20 recommended, 50 max |
| Workers concurrentes | 2-4 recommended |
| WebSocket conexiones | 25-50 recommended |
| TTFT (fast model) | ~150ms |
| TTFT (balanced) | ~800ms |
| TTFT (quality) | ~2500ms |
| Context overhead | ~25% |
| Streaming throughput | ~60 tokens/sec |

### Configuración de Tests

```typescript
// bunfig.toml
{
  "test": {
    "timeout": 30000,
    "preload": ["./test/setup-db.ts"],
    "randomize": true,
    "parallel": true,
    "isolate": true
  }
}
```

---

## Changelog

### v1.1.0 (2026-05-02)

**Nuevas Funcionalidades**
- Streaming TTFT benchmarks
- Worker performance metrics
- E2E streaming + worker distribution

**Correcciones**
- DAGScheduler: Corregido uso de `options.executor`
- tool-selector: Exportado `MIN_RELEVANCE_THRESHOLD`
- Tests: Simplificación de mocks

**Tests**
- 130+ tests passing
- Tests de carga, stress y streaming

### v1.0.0 (2026-01-01)

- Lanzamiento inicial
- Agentes con LLM
- DAG Scheduler
- Tools y Skills
- Canvas (ACE)
- Multi-channel support

---

## Contacto y Soporte

- **GitHub**: https://github.com/anomalyco/hive-sdk
- **Documentación**: https://docs.hive.ai
- **Discord**: https://discord.gg/hive-sdk

---

*Documento generado: 2026-05-02*
*Versión: Hive SDK v1.1.0*