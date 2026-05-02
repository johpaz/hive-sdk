# API Reference - Agentes

## Índice

1. [runAgent](#runagent)
2. [AgentLoop](#agentloop)
3. [Tool Selector](#tool-selector)
4. [Skill Selector](#skill-selector)
5. [Context Compiler](#context-compiler)
6. [LLM Providers](#llm-providers)

---

## runAgent

Función principal para ejecutar un agente.

### Firma

```typescript
export async function* runAgent(
  opts: AgentLoopOptions
): AsyncGenerator<StreamChunk>
```

### Opciones

```typescript
interface AgentLoopOptions {
  agentId: string;           // ID del agente
  userMessage: string | ContentPart[];  // Mensaje del usuario
  threadId: string;         // ID del hilo de conversación
  channel?: string;         // Canal (slack:channel, etc.)
  systemPromptOverride?: string;  // Override del system prompt
  mcpManager?: MCPClientManager;   // Manager de MCP servers
  userId?: string;          // ID del usuario
  signal?: AbortSignal;     // Señal de cancelación
  isolated?: boolean;       // Modo aislado (sin guardar historial)
  taskContext?: string | ContentPart[];  // Contexto para tareas
  onStep?: (step: StepEvent) => void;   // Callback por paso
}
```

### StreamChunk

```typescript
interface StreamChunk {
  agent?: { messages: AIMessage[] };
  tools?: { messages: ToolMessage[] };
  usage?: { input_tokens: number; output_tokens: number };
}
```

### Ejemplo

```typescript
import { runAgent } from "@hive-sdk/agent";

for await (const chunk of runAgent({
  agentId: "coordinator",
  userMessage: "Analiza las ventas",
  threadId: "thread-123",
})) {
  if (chunk.agent?.messages) {
    console.log(chunk.agent.messages[0].content);
  }
  if (chunk.tools?.messages) {
    console.log("Tool call:", chunk.tools.messages);
  }
}
```

---

## AgentLoop

Clase wrapper que proporciona la API de `stream()` compatible con providers.

### Métodos

```typescript
class AgentLoop {
  constructor();

  // Configurar MCP Manager
  setMCPManager(m: MCPClientManager): void;

  // Stream compatible con providers/index.ts
  stream(
    input: { messages: Array<{ role: string; content: string | ContentPart[] }> },
    config: { configurable?: ConfigurableOptions; signal?: AbortSignal }
  ): AsyncIterable<StreamChunk>;
}
```

### Ejemplo

```typescript
import { AgentLoop } from "@hive-sdk/agent";

const agentLoop = new AgentLoop();
agentLoop.setMCPManager(mcpManager);

const stream = agentLoop.stream(
  { messages: [{ role: "user", content: "Hola" }] },
  { configurable: { thread_id: "thread-1", agent_id: "main" } }
);

for await (const chunk of stream) {
  // procesar chunk
}
```

---

## Tool Selector

Selección automática de tools basada en relevancia FTS5.

### selectTools

```typescript
export function selectTools(
  userMessage: string,
  fullToolList: ToolDescriptor[] = CORE_TOOL_CATALOG,
  maxTools: number = MAX_TOOLS_PER_TURN
): ToolDescriptor[]
```

### Constantes

```typescript
export const MAX_TOOLS_PER_TURN = 12;
export const MIN_RELEVANCE_THRESHOLD = -30;
```

### ToolDescriptor

```typescript
interface ToolDescriptor {
  name: string;
  description: string;
  category: string;
  abstractionLevel?: "atomic" | "orchestration";
}
```

### Categorías

- `scheduling`: Herramientas de calendario y tareas
- `projects`: Gestión de proyectos
- `filesystem`: Lectura/escritura de archivos
- `web`: Búsqueda y fetch web
- `browser`: Automatización de navegador
- `memory`: Notas y memoria
- `code`: Terminal y código
- `canvas`: Rendering de componentes
- `agents`: Creación de agentes

### Ejemplo

```typescript
import { selectTools, CORE_TOOL_CATALOG } from "@hive-sdk/agent";

// Selección básica
const tools = selectTools("Search for files in project");

// Con límite
const limited = selectTools("Search find query", CORE_TOOL_CATALOG, 3);

// Por categoría
const fsTools = tools.filter(t => t.category === "filesystem");
```

---

## Skill Selector

Selección de skills basada en triggers semánticos.

### selectSkills

```typescript
export function selectSkills(userMessage: string): SkillDescriptor[]
```

### getMinimalSkills

```typescript
export function getMinimalSkills(): SkillDescriptor[]
```

### getAllSkillsFromDB

```typescript
export function getAllSkillsFromDB(): SkillDescriptor[]
```

### SkillDescriptor

```typescript
interface SkillDescriptor {
  id: string;
  name: string;
  description: string;
  category: string;
  tools: string[];
  triggers: string[];
  body: string;
}
```

### Constantes

```typescript
export const DEFAULT_MAX_SKILLS = 3;
export const SKILL_RELEVANCE_THRESHOLD = -20;
```

### Ejemplo

```typescript
import { selectSkills, getMinimalSkills } from "@hive-sdk/agent";

// Skills según mensaje
const skills = selectSkills("Analyze the sales data");

// Skills mínimos siempre disponibles
const minimal = getMinimalSkills();

// Filtrar por categoría
const coreSkills = skills.filter(s => s.category === "core");
```

---

## Context Compiler

Compilación de contexto para cada ejecución de agente.

### compileContext

```typescript
export async function compileContext(opts: {
  agentId: string;
  threadId: string;
  userMessage: string | ContentPart[];
  channel?: string;
  mcpManager?: MCPClientManager;
  isolated?: boolean;
  taskContext?: string | ContentPart[];
  userId?: string;
}): Promise<ContextCompilation>
```

### ContextCompilation

```typescript
interface ContextCompilation {
  systemPrompt: string;
  messages: LLMMessage[];
  tools: ToolDescriptor[];
  skills: SkillDescriptor[];
}
```

### Ejemplo

```typescript
import { compileContext } from "@hive-sdk/agent";

const ctx = await compileContext({
  agentId: "analyst",
  threadId: "thread-123",
  userMessage: "Generate report",
  channel: "slack",
  mcpManager: mcpClient,
});

console.log(ctx.systemPrompt);
console.log(ctx.tools);
console.log(ctx.messages);
```

---

## LLM Providers

Proveedores de LLM soportados.

### Providers Soportados

| Provider | Modelos | Streaming |
|----------|---------|-----------|
| openai | gpt-4o, gpt-4o-mini, gpt-5.x | ✅ |
| anthropic | claude-opus, claude-sonnet, claude-haiku | ✅ |
| ollama | local models | ✅ |
| deepseek | deepseek-chat, deepseek-reasoner | ✅ |
| gemini | gemini-2.5-pro, gemini-2.5-flash | ✅ |
| mistral | mistral-large, codestral | ✅ |
| openrouter | Multi-provider | ✅ |
| groq | llama, qwen | ✅ |

### Configuración

```typescript
import { resolveProviderConfig } from "@hive-sdk/agent";

const config = await resolveProviderConfig("openai", "gpt-4o-mini");

// Resultado:
/*
{
  provider: "openai",
  model: "gpt-4o-mini",
  baseURL: "https://api.openai.com/v1",
  apiKey: "sk-...",
  maxTokens: 4096,
  temperature: 0.7,
}
*/
```

### callLLM

```typescript
export async function callLLM(opts: {
  provider: string;
  model: string;
  messages: LLMMessage[];
  tools?: ToolDescriptor[];
  signal?: AbortSignal;
}): Promise<LLMResponse>
```

### LLMResponse

```typescript
interface LLMResponse {
  content?: string;
  tool_calls?: ToolCall[];
  stop_reason?: string;
  usage?: { input_tokens: number; output_tokens: number };
  reasoning_content?: string;
}
```

---

## Errores Comunes

### Error: "Agent not found"

El agente con el ID especificado no existe en la base de datos.

```typescript
// Solución: Crear el agente primero
db.query("INSERT INTO agents (id, name, provider_id, model_id) VALUES (?, ?, ?, ?)")
  .run("my-agent", "My Agent", "openai", "gpt-4o-mini");
```

### Error: "Model not found"

El modelo especificado no está configurado.

```typescript
// Solución: Verificar modelos disponibles
const models = db.query("SELECT * FROM models").all();
```

### Error: "API key missing"

Falta la API key del proveedor.

```typescript
// Solución: Configurar variable de entorno
// OPENAI_API_KEY=sk-...
// ANTHROPIC_API_KEY=sk-ant-...
```

### Error: "Context too large"

El contexto excede el límite del modelo.

```typescript
// Solución: Reducir historial o usar maybeCompact
await maybeCompact(threadId, { channel, userId });
```