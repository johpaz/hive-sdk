# API Reference — Context Compiler y Componentes Avanzados

## Índice

1. [Context Compiler](#context-compiler)
2. [Message History](#message-history)
3. [Scratchpad](#scratchpad)
4. [EthicsGuard](#ethicsguard)
5. [ACE (Tracer, Reflector, Curator)](#ace)
6. [MCP Internals](#mcp)

---

## Context Compiler

Compila todo el contexto necesario para cada ejecución del agente.

### compileContext

```typescript
import { compileContext } from "@johpaz/hive-core";

const ctx = await compileContext({
  agentId: "analyst",
  threadId: "thread-123",
  userMessage: "Analiza esto",
  channel: "slack",
  mcpManager: mcpClient,
  isolated: false,
});

// Resultado
console.log(ctx.systemPrompt);
console.log(ctx.messages);   // Historial compilado
```

### Estrategias

El Context Compiler implementa 4 estrategias de Context Engineering:

| Estrategia | Descripción |
|------------|-------------|
| **ESCRIBIR** | Guardar información fuera del contexto (Scratchpad, trazas) |
| **SELECCIONAR** | Traer solo lo relevante (FTS5 tool/skill/playbook selection) |
| **COMPRIMIR** | Reducir tokens (compaction, tool result clearing) |
| **AISLAR** | Separar contextos por agente (workers reciben contexto mínimo) |

---

## Message History

### addMessage

```typescript
import { addMessage } from "@johpaz/hive-core";

await addMessage(
  threadId: string,
  role: "user" | "assistant" | "system",
  content: string | ContentPart[],
  options?: {
    channel?: string;
    tool_calls?: ToolCall[];
  }
);
```

### getRecentMessages

```typescript
import { getRecentMessages } from "@johpaz/hive-core";

const messages = await getRecentMessages(threadId, {
  maxTokens: 32000,
  maxMessages: 50,
});
```

### maybeCompact

Reduce el historial cuando excede el límite de tokens.

```typescript
import { maybeCompact } from "@johpaz/hive-core";

await maybeCompact(threadId, { channel: "slack", userId: "U123" });
```

### clearOldToolResults

```typescript
import { clearOldToolResults } from "@johpaz/hive-core";

const clean = clearOldToolResults(messages);
```

### ConversationStore

```typescript
import { getSummary, saveSummary, getScratchpad, saveScratchpadNote } from "@johpaz/hive-core";

// Resumen de conversación
const summary = getSummary(threadId);

// Notas del scratchpad
const notes = getScratchpad(threadId, "worker-1");
```

---

## Scratchpad

Memoria temporal por hilo de conversación.

```typescript
import { Scratchpad } from "@johpaz/hive-core";
import { getDb } from "@johpaz/hive-core";

const db = getDb();
const pad = new Scratchpad(db);

// Escribir nota
pad.write("thread-1", "mi-nota", "contenido");

// Leer nota
const value = pad.read("thread-1", "mi-nota");

// Listar notas de un hilo
const all = pad.list("thread-1");

// Eliminar nota
pad.delete("thread-1", "mi-nota");

// Limpiar todas las notas de un hilo
pad.clear("thread-1");
```

---

## EthicsGuard

Guardián de reglas de calidad de respuesta desde la base de datos.

```typescript
import { EthicsGuard } from "@johpaz/hive-core";
import { getDb } from "@johpaz/hive-core";

const db = getDb();
const guard = new EthicsGuard(db);

// Obtener reglas
const rules = guard.getRules();              // Todas
const rulesForRole = guard.getRules("agent"); // Con FTS5

// Inyectar en system prompt
const prompt = guard.injectIntoPrompt(
  "Eres un asistente.",
  rules
);

// Verificar si hay reglas
if (guard.hasEthicsLayer()) {
  console.log("Reglas de calidad activas");
}
```

---

## ACE (Tracer, Reflector, Curator)

Sistema de Auto-Corrección por Experiencia.

### Tracer

```typescript
import { saveTrace, recordLLMUsage } from "@johpaz/hive-core/ace";

// Guardar traza de ejecución
saveTrace({
  agentId: "analyst",
  model: "gpt-4o-mini",
  messages: 5,
  toolCalls: ["web_search", "read_file"],
  durationMs: 1200,
  tokensUsed: 450,
  success: true,
});

// Registrar uso de LLM
recordLLMUsage({
  model: "gpt-4o-mini",
  inputTokens: 200,
  outputTokens: 250,
  durationMs: 800,
});
```

### Reflector + Curator

```typescript
import { runReflector, runCurator } from "@johpaz/hive-core/ace";

// Analizar trazas y generar insights
await runReflector();

// Curar insights en reglas del playbook
await runCurator();
```

---

## MCP Internals

### Config

```typescript
import type { MCPConfig, MCPServerConfig } from "@johpaz/hive-core";

const config: MCPConfig = {
  servers: {
    "my-server": {
      transport: "stdio",        // "stdio" | "sse" | "websocket"
      command: "npx",
      args: ["-y", "@server/pkg"],
      env: { KEY: "value" },
      enabled: true,
    },
  },
};
```

### Singleton

```typescript
import { setMCPManager, getMCPManager, hasMCPManager } from "@johpaz/hive-core";

setMCPManager(mcpManager);
const mcp = getMCPManager();     // MCPClientManager | undefined
const exists = hasMCPManager();   // boolean
```

### Hot Reload

```typescript
import { startMCPHotReload, stopMCPHotReload } from "@johpaz/hive-core";

// Watch de configuración MCP
startMCPHotReload();

// Detener watch
stopMCPHotReload();
```
