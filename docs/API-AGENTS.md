# API Reference — Agentes

## Índice

1. [createAgent](#createagent)
2. [AgentLoop](#agentloop)
3. [Tool Selector](#tool-selector)
4. [Skill Selector](#skill-selector)
5. [LLM Providers](#llm-providers)

---

## createAgent

Función de alto nivel para crear y ejecutar agentes.

### Firma

```typescript
import { createAgent } from "@johpaz/hive-core";

const agent = await createAgent(config: AgentConfig): Promise<Agent>
```

### AgentConfig

```typescript
interface AgentConfig {
  name: string;
  model?: string;                           // default: gpt-4o-mini
  provider?: "openai" | "anthropic" | "gemini" | "ollama";
  systemPrompt?: string;
  tools?: ToolDefinition[];                 // Tools custom
  skills?: SkillDefinition[];               // Skills custom
  mcpServers?: Record<string, {             // Servidores MCP
    command?: string;                       // STDIO transport
    url?: string;                           // SSE transport
    args?: string[];
    env?: Record<string, string>;
  }>;
  maxIterations?: number;
  workspace?: string;
}
```

### Agent

```typescript
interface Agent {
  readonly name: string;
  readonly config: AgentConfig;

  // Streaming chat
  chat(message: string, opts?: {
    threadId?: string;
    channel?: string;
  }): AsyncGenerator<AgentEvent>;

  // Run to completion (devuelve string final)
  run(task: string, opts?: {
    threadId?: string;
    channel?: string;
  }): Promise<string>;
}
```

### AgentEvent

```typescript
type AgentEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "done"; response: string };
```

### Ejemplo

```typescript
import { createAgent, defineTool } from "@johpaz/hive-core";

const agent = await createAgent({
  name: "asistente",
  provider: "openai",
  model: "gpt-4o-mini",
  systemPrompt: "Eres un asistente útil.",
});

// Streaming
for await (const event of agent.chat("Hola!")) {
  if (event.type === "text") process.stdout.write(event.content);
}

// Run to completion
const respuesta = await agent.run("Analiza las ventas del mes");
```

---

## defineTool

Define una herramienta que el agente puede invocar.

```typescript
import { defineTool } from "@johpaz/hive-core";

const tool = defineTool({
  name: "saludar",
  description: "Saluda a alguien por su nombre",
  execute: async (args: { nombre: string }) => {
    return { mensaje: `¡Hola ${args.nombre}!` };
  },
});
```

### ToolDefinition

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  schema?: z.ZodType;             // Validación Zod opcional
  execute: (args: any, config?: any) => Promise<any>;
  category?: string;
}
```

---

## defineSkill

Define una composición de herramientas con triggers semánticos.

```typescript
import { defineSkill } from "@johpaz/hive-core";

const skill = defineSkill({
  name: "analisis-datos",
  description: "Analiza datos y genera reportes",
  steps: [
    { action: "web_search", instruction: "Buscar datos relevantes" },
    { action: "create_report", instruction: "Generar reporte" },
  ],
  tools: ["web_search", "create_report"],
  triggers: ["analizar", "reporte", "datos"],
});
```

---

## AgentLoop

Clase de bajo nivel para control directo del bucle del agente.

```typescript
import { AgentLoop, buildAgentLoop } from "@johpaz/hive-core";

const loop = buildAgentLoop({ mcpManager });

const stream = loop.stream(
  { messages: [{ role: "user", content: "Hola" }] },
  { configurable: { thread_id: "thread-1" } }
);

for await (const chunk of stream) {
  if (chunk.agent?.messages) {
    console.log(chunk.agent.messages[0].content);
  }
  if (chunk.tools?.messages) {
    console.log("Tool result:", chunk.tools.messages);
  }
}
```

### StreamChunk

```typescript
interface StreamChunk {
  agent?: { messages: any[] };
  tools?: { messages: any[] };
  usage?: { input_tokens: number; output_tokens: number };
}
```

### runAgent (bajo nivel)

```typescript
import { runAgent, runAgentIsolated } from "@johpaz/hive-core";

// Streaming
for await (const chunk of runAgent({
  agentId: "assistant",
  userMessage: "Analiza las ventas",
  threadId: "thread-123",
})) {
  // procesar chunk
}

// Modo aislado (para workers DAG)
const result = await runAgentIsolated({
  agentId: "processor",
  taskDescription: "Procesa estos datos",
  threadId: "dag-thread",
});
```

---

## Tool Selector

Selección automática de tools basada en FTS5.

```typescript
import { selectTools, CORE_TOOL_CATALOG } from "@johpaz/hive-core";

// Seleccionar tools relevantes
const tools = selectTools("Buscar archivos en el proyecto");
console.log(tools.map(t => t.name));

// Con límite personalizado
const limited = selectTools("search query", CORE_TOOL_CATALOG, 3);
```

### Constantes

```typescript
const MIN_RELEVANCE_THRESHOLD = -30;
```

### CORE_TOOL_CATALOG

~50 tools built-in organizadas por categoría:

| Categoría | Descripción |
|-----------|-------------|
| filesystem | read, write, edit, delete, list, glob |
| web | web_search, web_fetch, browser automation |
| projects | project/task CRUD |
| cron | Croner-based scheduling |
| cli | Shell command execution |
| agents | Agent management, task delegation |
| canvas | UI rendering, A2UI |
| codebridge | Code execution bridge |
| voice | TTS/STT |
| core | save_note, notify, report_progress |
| office | PDF, DOCX, XLSX, PPTX |
| meeting | Meeting management |

---

## Skill Selector

```typescript
import { selectSkills, getMinimalSkills } from "@johpaz/hive-core";

// Skills según mensaje
const skills = selectSkills("Analyze the sales data");

// Skills mínimos siempre disponibles
const minimal = getMinimalSkills();
```

---

## LLM Providers

### Providers Soportados

| Provider | Modelos | Streaming |
|----------|---------|-----------|
| openai | gpt-4o, gpt-4o-mini | ✅ |
| anthropic | claude-sonnet, claude-haiku | ✅ |
| gemini | gemini-2.5-flash | ✅ |
| ollama | modelos locales | ✅ |

### callLLM

```typescript
import { callLLM, resolveProviderConfig } from "@johpaz/hive-core";

const config = await resolveProviderConfig("openai", "gpt-4o-mini");

const response = await callLLM({
  provider: config.provider,
  model: config.model,
  messages: [{ role: "user", content: "Hola" }],
});
```

---

## Errores Comunes

### createAgent: no se encuentra el agente

```typescript
// El agente no necesita existir en DB — createAgent lo gestiona internamente
// Si falla, verificar API keys en variables de entorno
```

### Tool no encontrada

```typescript
// Verificar que la tool está registrada
const reg = new ToolRegistry();
reg.register(myTool);
reg.has("my_tool"); // true
```

### Context too large

```typescript
// Usar maybeCompact para reducir historial
const { maybeCompact } = await import("../agent/Compaction.ts");
await maybeCompact(threadId, { channel, userId });
```
