# API Reference - Context Compiler y Componentes Avanzados

## Índice

1. [Context Compiler](#context-compiler)
2. [Message History](#message-history)
3. [MCP Servers](#mcp-servers)
4. [LLM Client](#llm-client)
5. [Compilación de Contexto](#compilación-de-contexto)
6. [RunAgentIsolated](#runagentisolated)

---

## Context Compiler

El Context Compiler compila todo el contexto necesario para cada ejecución del agente.

### compileContext

```typescript
import { compileContext } from "@hive-sdk/agent";

const ctx = await compileContext(opts: {
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
  systemPrompt: string;     // Prompt del sistema con tools y constraints
  messages: LLMMessage[];   // Historial de conversación
  tools: ToolDescriptor[];  // Tools seleccionados
  skills: SkillDescriptor[]; // Skills seleccionados
}
```

### Proceso de Compilación

```typescript
// 1. Cargar configuración del agente
const agent = db.query("SELECT * FROM agents WHERE id = ?").get(agentId);

// 2. Obtener historial de mensajes
const history = await getRecentMessages(threadId, { 
  maxTokens: 32000,
  maxMessages: 50,
});

// 3. Seleccionar tools relevantes
const tools = selectTools(userMessage);

// 4. Seleccionar skills relevantes
const skills = selectSkills(userMessage);

// 5. Compilar system prompt con tools
const systemPrompt = buildSystemPrompt(agent, tools, skills);

// 6. Retornar contexto compilado
return { systemPrompt, messages: history, tools, skills };
```

---

## Message History

Gestión del historial de conversación.

### getRecentMessages

```typescript
import { getRecentMessages } from "@hive-sdk/agent";

const messages = await getRecentMessages(
  threadId: string,
  options?: {
    maxTokens?: number;    // Default: 32000
    maxMessages?: number;  // Default: 50
    includeSystem?: boolean; // Default: false
  }
): Promise<LLMMessage[]>
```

### addMessage

```typescript
import { addMessage } from "@hive-sdk/agent";

await addMessage(
  threadId: string,
  role: "user" | "assistant" | "system",
  content: string | ContentPart[],
  options?: {
    channel?: string;
    tool_calls?: ToolCall[];
    reasoning_content?: string;
  }
): Promise<void>
```

### maybeCompact

```typescript
import { maybeCompact } from "@hive-sdk/agent";

await maybeCompact(
  threadId: string,
  options?: {
    channel?: string;
    userId?: string;
  }
): Promise<void>
```

La compactación reduce el historial cuando excede el límite de tokens.

### clearOldToolResults

```typescript
import { clearOldToolResults } from "@hive-sdk/agent";

const cleanMessages = clearOldToolResults(messages: LLMMessage[]): LLMMessage[]
```

Elimina resultados de tools de mensajes muy antiguos para ahorrar tokens.

---

## MCP Servers

MCP (Model Context Protocol) permite conectar herramientas externas.

### MCPClientManager

```typescript
import { MCPClientManager } from "@hive-sdk/agent";

const mcpManager = new MCPClientManager();

// Agregar servidor
await mcpManager.addServer({
  name: "filesystem",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
});

// Listar servidores
const servers = mcpManager.listServers(): MCPServer[];

// Obtener tools de un servidor
const tools = mcpManager.getTools(serverName: string): Tool[];

// Ejecutar tool
const result = await mcpManager.callTool(serverName: string, toolName: string, args: object);

// Cleanup
await mcpManager.close();
```

### MCPServer

```typescript
interface MCPServer {
  name: string;
  status: "connecting" | "connected" | "disconnected";
  tools: Tool[];
  resources?: Resource[];
}
```

### Ejemplo

```typescript
import { MCPClientManager } from "@hive-sdk/agent";

const mcpManager = new MCPClientManager();

// Agregar servidor de filesystem
await mcpManager.addServer({
  name: "files",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "./data"],
});

// Usar en agent loop
const agentLoop = new AgentLoop();
agentLoop.setMCPManager(mcpManager);

const result = await agentLoop.stream(
  { messages: [{ role: "user", content: "Lee el archivo data/readme.txt" }] },
  {}
);
```

---

## LLM Client

Cliente de bajo nivel para llamadas a LLM.

### callLLM

```typescript
import { callLLM } from "@hive-sdk/agent";

const response = await callLLM(opts: {
  provider: string;
  model: string;
  messages: LLMMessage[];
  tools?: ToolDescriptor[];
  signal?: AbortSignal;
}): Promise<LLMResponse>
```

### LLMMessage

```typescript
interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
```

### ContentPart

```typescript
interface ContentPart {
  type: "text" | "image" | "tool_result";
  text?: string;
  source?: { type: "image_url"; image_url: { url: string } };
  content?: string;
}
```

### ToolCall

```typescript
interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}
```

### LLMResponse

```typescript
interface LLMResponse {
  content?: string;
  tool_calls?: ToolCall[];
  stop_reason?: "stop" | "tool_calls" | "length";
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  reasoning_content?: string;
}
```

### resolveProviderConfig

```typescript
import { resolveProviderConfig } from "@hive-sdk/agent";

const config = await resolveProviderConfig(
  providerId: string,
  modelId: string
): Promise<ProviderConfig>
```

### ProviderConfig

```typescript
interface ProviderConfig {
  provider: string;
  model: string;
  baseURL: string;
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
  supportsVision?: boolean;
  supportsJsonMode?: boolean;
  supportsFunctionCalling?: boolean;
  supportsStreaming?: boolean;
}
```

---

## Compilación de Contexto Detallada

### Paso 1: Cargar Agente

```typescript
const agent = db.query(`
  SELECT * FROM agents WHERE id = ?
`).get(agentId);

if (!agent) throw new Error(`Agent not found: ${agentId}`);
```

### Paso 2: Compilar System Prompt

```typescript
const systemPrompt = `
Eres ${agent.name}.

${agent.system_prompt || ""}

## Herramientas Disponibles
${tools.map(t => `- ${t.name}: ${t.description}`).join("\n")}

## Skills Activos
${skills.map(s => `- ${s.name}: ${s.description}`).join("\n")}

Responde de forma clara y concisa.
`.trim();
```

### Paso 3: Obtener Historial

```typescript
const history = await getRecentMessages(threadId, {
  maxTokens: 32000,
  maxMessages: 50,
});
```

### Paso 4: Agregar Mensaje del Usuario

```typescript
const messages: LLMMessage[] = [
  { role: "system", content: systemPrompt },
  ...history,
  { role: "user", content: userMessage },
];
```

### Paso 5: Preparar Tools para LLM

```typescript
const llmTools = tools.map(t => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
}));
```

### Paso 6: Llamar al LLM

```typescript
const response = await callLLM({
  provider: providerCfg.provider,
  model: providerCfg.model,
  messages,
  tools: llmTools,
});
```

---

## runAgentIsolated

Ejecuta un agente de forma aislada (para workers).

```typescript
import { runAgentIsolated } from "@hive-sdk/agent";

const result = await runAgentIsolated(opts: {
  agentId: string;
  taskDescription: string | ContentPart[];
  threadId: string;
  mcpManager?: MCPClientManager | null;
}): Promise<string>
```

### Diferencia con runAgent

| Aspecto | runAgent | runAgentIsolated |
|---------|----------|------------------|
| Historial | Usa historial existente | No guarda historial |
| Mensaje | Del input | De taskDescription |
| Context | Context Compiler | Simplificado |
| Uso principal | Usuario final | Workers/DAG |

### Ejemplo

```typescript
import { runAgentIsolated } from "@hive-sdk/agent";

// Worker ejecuta tarea
const result = await runAgentIsolated({
  agentId: "processor",
  taskDescription: "Procesa estos datos: " + data,
  threadId: "dag-" + swarmId + "-" + nodeId,
});

// El resultado se usa como dependencia para otros nodos
return result;
```

---

## Ejemplo Completo: Agent con Todo

```typescript
import { 
  compileContext, 
  callLLM, 
  resolveProviderConfig,
  addMessage 
} from "@hive-sdk/agent";

// 1. Compilar contexto
const ctx = await compileContext({
  agentId: "analyst",
  threadId: "thread-123",
  userMessage: "Analiza las ventas del mes",
  channel: "slack",
});

// 2. Agregar mensaje del usuario al historial (si no isolated)
if (!opts.isolated) {
  await addMessage(threadId, "user", userMessage);
}

// 3. Obtener configuración del proveedor
const providerCfg = await resolveProviderConfig("openai", "gpt-4o-mini");

// 4. Llamar al LLM
const response = await callLLM({
  provider: providerCfg.provider,
  model: providerCfg.model,
  messages: [
    { role: "system", content: ctx.systemPrompt },
    ...ctx.messages,
    { role: "user", content: userMessage },
  ],
  tools: ctx.tools.map(t => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: {} },
  })),
});

// 5. Procesar respuesta
if (response.tool_calls) {
  // Ejecutar tools
  for (const toolCall of response.tool_calls) {
    const result = await executeTool(toolCall.function.name, JSON.parse(toolCall.function.arguments));
    // Continuar...
  }
} else {
  // Respuesta final
  console.log(response.content);
}
```

---

## Errores Comunes

### "Context too large"

```typescript
// El historial excede el límite de tokens

// Solución: usar maybeCompact
await maybeCompact(threadId, { channel, userId });

// O reducir maxTokens
const messages = await getRecentMessages(threadId, { maxTokens: 16000 });
```

### "Provider not found"

```typescript
// El proveedor no está configurado

// Solución: verificar en base de datos
const providers = db.query("SELECT * FROM providers").all();
```

### "Model not supported"

```typescript
// El modelo no soporta la funcionalidad requerida

// Solución: usar otro modelo
const config = await resolveProviderConfig("anthropic", "claude-sonnet-4-6");
```

### "MCP Server not responding"

```typescript
// El servidor MCP no responde

// Solución: verificar y reiniciar
await mcpManager.close();
await mcpManager.addServer({...});
```