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
import { createAgent } from "@johpaz/hive-sdk";

const agent = await createAgent(config: AgentConfig): Promise<Agent>
```

### AgentConfig

```typescript
interface AgentConfig {
  name: string;
  model?: string;         // id tal como lo nombra su dueño, ej. "claude-opus-5"
  provider?: Provider;    // cualquiera de los 16 del catálogo
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

La config **se persiste en la fila del agente**, que es de donde el loop resuelve
provider y modelo en cada turno. Consecuencias que conviene tener presentes:

- `model` exige `provider`: el mismo modelo lo sirven varios providers y la clave
  del catálogo depende de cuál. Sin provider, `createAgent` lanza.
- El modelo tiene que existir en `SEED_DATA.models`, o lanza con el nombre del
  provider al que no pertenece.
- `name` deriva el id del agente (`"Mi Agente"` → `mi_agente`), así que dos
  `createAgent` con el mismo nombre comparten fila e historial.
- Las tools pasadas acá quedan registradas **y** indexadas, así que el modelo
  puede descubrirlas con `search_knowledge` como a las nativas.

> Hasta 0.1.5 `provider`, `model`, `maxIterations`, `skills` y `workspace` se
> aceptaban y se descartaban: el agente corría con lo que hubiera en la base.

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
import { createAgent, defineTool } from "@johpaz/hive-sdk";

const agent = await createAgent({
  name: "asistente",
  provider: "openai",
  model: "gpt-5.6-luna",
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
import { defineTool } from "@johpaz/hive-sdk";

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
import { defineSkill } from "@johpaz/hive-sdk";

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
import { AgentLoop, buildAgentLoop } from "@johpaz/hive-sdk";

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
import { runAgent, runAgentIsolated } from "@johpaz/hive-sdk";

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

Selección automática de tools por búsqueda BM25 sobre el índice de capacidad.

```typescript
import { selectTools, CORE_TOOL_CATALOG } from "@johpaz/hive-sdk";

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

58 tools built-in organizadas por categoría:

| Categoría | # | Descripción |
|-----------|---|-------------|
| agents | 15 | delegación (`task_delegate`, `task_revise`), memoria, catálogo de modelos |
| web | 10 | `web_search`, `web_fetch`, automatización de browser, `artifact_inspect` |
| cron | 8 | scheduling con Croner |
| office | 8 | PDF, DOCX, XLSX, PPTX |
| filesystem | 7 | read, write, edit, delete, list, glob, exists |
| a2ui | 4 | superficies de UI generadas por el agente |
| core | 4 | `save_note`, `notify`, `report_progress`, `search_knowledge` |
| cli | 1 | ejecución de comandos |
| api | 1 | `api_request` |

Las categorías `projects`, `canvas`, `codebridge`, `voice` y `meeting`
desaparecieron en 0.1.5 junto con sus tools.

---

## Skill Selector

```typescript
import { selectSkills, getMinimalSkills } from "@johpaz/hive-sdk";

// Skills según mensaje
const skills = selectSkills("Analyze the sales data");

// Skills mínimos siempre disponibles
const minimal = getMinimalSkills();
```

---

## LLM Providers

### Providers Soportados

16 providers, todos sembrados con su catálogo de modelos y su precio por millón
de tokens. `provider` en `createAgent` acepta cualquiera de estos ids.

| Provider | Adapter | Notas |
|----------|---------|-------|
| `anthropic` | nativo | extended thinking, round-trip de thinking blocks |
| `gemini` | nativo | REST v1beta |
| `ollama` | nativo | modelos locales, flag `think` |
| `openai` | OpenAI-compat | Sol / Terra / Luna |
| `deepseek`, `kimi` | OpenAI-compat | round-trip de `reasoning_content` |
| `mistral`, `groq`, `qwen`, `minimax` | OpenAI-compat | |
| `z-ai` | OpenAI-compat | sirve en `/api/paas/v4`, no en `/v1` |
| `hiveagents` | OpenAI-compat | |
| `nvidia`, `openrouter`, `opencode-go`, `modelscope` | OpenAI-compat | **revendedores** |

Los cuatro revendedores prefijan sus ids de modelo con su propio id de provider
(`modelscope/Qwen/Qwen3.5-397B-A17B`), porque sirven modelos de terceros que se
solapan entre sí y la colección `models` se indexa por una sola clave. El
prefijo no llega al cable: el adapter lo quita antes del request.

```typescript
import { catalogModelKey, wireModelId } from "@johpaz/hive-sdk";

catalogModelKey("modelscope", "Qwen/Qwen3.5-397B-A17B"); // modelscope/Qwen/Qwen3.5-397B-A17B
wireModelId("modelscope", "modelscope/Qwen/Qwen3.5-397B-A17B"); // Qwen/Qwen3.5-397B-A17B
```

### Errores del provider

`callLLM` nunca lanza: devuelve `stop_reason: "error"` con un campo `error`
tipado. Chequealo antes de persistir `content` en cualquier lado — es texto para
mostrar, no salida del modelo.

```typescript
const response = await callLLM({ ... });

if (response.stop_reason === "error") {
  console.error(response.error?.message);
  // HTTP 404/410 → el proveedor retiró el modelo; reintentar no sirve.
  if (response.error?.modelUnavailable) selectAnotherModel();
}
```

### callLLM

```typescript
import { callLLM, resolveProviderConfig } from "@johpaz/hive-sdk";

const config = await resolveProviderConfig("openai", "gpt-5.6-luna");

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
