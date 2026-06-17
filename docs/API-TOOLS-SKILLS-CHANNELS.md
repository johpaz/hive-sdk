# API Reference — Tools, Skills, MCP, Gateway, Channels y Storage

## Índice

1. [Tools](#tools)
2. [Skills](#skills)
3. [MCP](#mcp)
4. [Gateway](#gateway)
5. [Channels](#channels)
6. [Tool Runtime](#tool-runtime)
7. [Canvas](#canvas)
8. [Storage](#storage)
9. [Config](#config)

---

## Tools

### defineTool

Función para definir herramientas que el agente puede invocar.

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

### ToolRegistry

Registro central de herramientas.

```typescript
import { ToolRegistry, defineTool } from "@johpaz/hive-sdk";

const reg = new ToolRegistry();

reg.register(defineTool({ name: "t1", description: "...", execute: async () => ({}) }));

reg.has("t1");              // true
reg.get("t1");              // ToolDefinition
reg.list();                 // ToolDefinition[]
reg.getByCategory("web");   // Filtrar por categoría
reg.getNames();             // ["t1"]
reg.size();                 // 1
reg.merge(otherRegistry);
reg.clear();
```

### ToolExecutor

Ejecutor de herramientas con validación Zod.

```typescript
import { ToolRegistry, ToolExecutor, defineTool } from "@johpaz/hive-sdk";

const reg = new ToolRegistry();
reg.register(defineTool({
  name: "echo",
  description: "Echo",
  execute: async (args) => args,
}));

const exec = new ToolExecutor(reg);
const result = await exec.execute("echo", { msg: "hola" });
```

### Tool Selection (FTS5)

```typescript
import { selectTools, CORE_TOOL_CATALOG } from "@johpaz/hive-sdk";

const tools = selectTools("Buscar archivos en el proyecto");
const webTools = tools.filter(t => t.category === "web");
```

### Built-in Web + API Tools

El SDK expone herramientas web/browser listas para usar:

```typescript
import {
  webSearchTool,
  webFetchTool,
  apiRequestTool,
  browserNavigateTool,
  browserScreenshotTool,
  browserClickTool,
  browserTypeTool,
  browserExtractTool,
  browserScriptTool,
  browserWaitTool,
} from "@johpaz/hive-sdk";
```

#### Browser automation (agent-browser)

Las herramientas `browser_*` usan [`agent-browser`](https://www.npmjs.com/package/agent-browser), un CLI Rust que gestiona Chrome/Chromium internamente vía CDP. En el primer uso se instala automáticamente en `~/.hive/agent-browser` y se descarga Chrome si es necesario.

```typescript
import { initializeBrowserService, getBrowserService } from "@johpaz/hive-sdk";

const browserService = initializeBrowserService(config);
await browserService.start();

const view = await browserService.getView();
await view.navigate("https://example.com");
const snapshot = await view.snapshot({ compact: true, depth: 3 });
```

#### api_request

Conecta APIs REST con autenticación y métodos HTTP:

```typescript
const result = await apiRequestTool.execute({
  url: "https://api.example.com/items",
  method: "POST",
  headers: { "X-Custom": "value" },
  body: { name: "example" },
  auth: { type: "bearer", token: process.env.API_TOKEN! },
  timeoutMs: 30000,
});

// Auth soportada: bearer, basic, api_key (header o query)
```

---

## Skills

### defineSkill

```typescript
import { defineSkill } from "@johpaz/hive-sdk";

const skill = defineSkill({
  name: "file-manager",
  description: "Gestiona archivos y directorios",
  steps: [
    { action: "fs_list", instruction: "Listar archivos" },
    { action: "fs_read", instruction: "Leer archivo" },
  ],
  tools: ["fs_list", "fs_read"],
  triggers: ["archivo", "directorio", "listar"],
});
```

### SkillLoader

```typescript
import { SkillLoader } from "@johpaz/hive-sdk";

const loader = new SkillLoader({
  allowBundled: ["file-manager", "web-researcher"],
  managedDir: "./skills",
});

const skills = loader.list();
const skill = loader.get("file-manager");
```

### Skills empaquetadas

El SDK incluye skills empaquetadas para casos comunes. Algunas útiles para web y APIs:

- `web_research` — búsqueda y síntesis con `web_search` + `web_fetch`.
- `web_browser_research` — investigación profunda combinando `web_search` con navegación real (`browser_navigate`, `browser_extract`) para sitios dinámicos.
- `browser_scrape` — captura de contenido renderizado con screenshots.
- `browser_automate` — automatización de flujos web (clicks, formularios).

---

## MCP

Model Context Protocol — herramientas externas via STDIO/SSE/WebSocket.

### MCPClientManager

```typescript
import { MCPClientManager } from "@johpaz/hive-sdk";

const mcp = new MCPClientManager({
  servers: {
    "filesystem": {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "./data"],
      enabled: true,
    },
    "weather-api": {
      transport: "sse",
      url: "https://api.weather.com/mcp",
      enabled: true,
    },
  },
});

await mcp.initialize();
const tools = mcp.getTools("filesystem");
```

### Transports

```typescript
import { createTransport, SSETransport, WebSocketTransport } from "@johpaz/hive-sdk";

const transport = createTransport({
  type: "stdio",
  stdio: { command: "npx", args: ["-y", "server"], env: {} },
});
```

---

## Gateway

Servidor HTTP/WebSocket simplificado para exponer el agente como API.

### startGateway

```typescript
import { startGateway } from "@johpaz/hive-sdk";

const server = await startGateway({
  host: "127.0.0.1",
  port: 18790,
  agentId: "coordinator",
  mcpManager: null,
});

console.log(`Gateway at http://127.0.0.1:18790`);
```

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/status` | Health check |
| POST | `/chat` | Chat con el agente |
| WS | `/ws` | WebSocket streaming |

### Ejemplo: Chat HTTP

```typescript
const res = await fetch("http://127.0.0.1:18790/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Hello!", threadId: "t1" }),
});

const data = await res.json();
console.log(data.response);
```

---

## Channels

Integraciones con plataformas de mensajería.

### ChannelManager

```typescript
import { ChannelManager } from "@johpaz/hive-sdk";

const manager = new ChannelManager(config);
await manager.initialize();
```

### Canales soportados

```typescript
import {
  TelegramChannel,
  DiscordChannel,
  WhatsAppChannel,
  SlackChannel,
  WebChatChannel,
} from "@johpaz/hive-sdk";

// Telegram
const telegram = new TelegramChannel({ botToken: process.env.TELEGRAM_BOT_TOKEN! });

// Discord
const discord = new DiscordChannel({ botToken: process.env.DISCORD_BOT_TOKEN! });

// WhatsApp
const whatsapp = new WhatsAppChannel();

// Slack
const slack = new SlackChannel({ botToken: process.env.SLACK_BOT_TOKEN! });

// Webchat
const webchat = new WebChatChannel();
```

---

## Tool Runtime

Ejecución paralela de herramientas vía Bun Workers.

### executeToolBatch

```typescript
import { executeToolBatch, shutdownToolRuntime } from "@johpaz/hive-sdk";

const results = await executeToolBatch({
  toolCalls: [
    { id: "1", function: { name: "search", arguments: JSON.stringify({ q: "AI" }) } },
    { id: "2", function: { name: "fetch", arguments: JSON.stringify({ url: "..." }) } },
  ],
  allTools: [searchTool, fetchTool],
  toolConfig: { user_id: "u1", thread_id: "t1" },
  hiveConfig: loadConfig(),
  workerPool: {
    enabled: true,
    maxWorkers: 4,
    toolTimeoutMs: 30000,
    parallelToolCalls: true,
  },
});

// Limpieza
shutdownToolRuntime();
```

### ToolBatchResult

```typescript
interface ToolBatchResult {
  toolCall: ToolCallLike;
  toolName: string;
  result: unknown;
  ok: boolean;
  durationMs: number;
  error?: SerializedError;
  timedOut?: boolean;
  aborted?: boolean;
}
```

---

## Canvas

Visualización en tiempo real del estado de agentes.

```typescript
import { emitCanvas, subscribeCanvas, unsubscribeCanvas } from "@johpaz/hive-sdk";

const handler = (data: any) => console.log("Canvas:", data);
subscribeCanvas(handler);

emitCanvas("canvas:node_update", {
  nodeId: "agent-1",
  changes: { status: "running", currentTool: "web_search" },
});

unsubscribeCanvas(handler);
```

---

## Storage

Base de datos SQLite con FTS5.

```typescript
import { initializeDatabase, dbService } from "@johpaz/hive-sdk";

await initializeDatabase();
const db = getTestDb();

const results = db.query("SELECT * FROM agents WHERE id = ?").all(agentId);
const single = db.query("SELECT * FROM agents WHERE id = ?").get(agentId);

dbService.close();
```

### Schemas FTS5

```sql
CREATE VIRTUAL TABLE playbook_fts USING fts5(rule, category, applicable_to);
CREATE VIRTUAL TABLE tools_fts USING fts5(tool_name, name, description, category);
CREATE VIRTUAL TABLE skills_fts USING fts5(id, name, description, category, tools, triggers, body);
CREATE VIRTUAL TABLE mcp_tools_fts USING fts5(id, name, description, category);
```

---

## Config

```typescript
import { loadConfig, loadEnv, getHiveDir } from "@johpaz/hive-sdk";

const config = await loadConfig();
const hiveDir = getHiveDir();  // ~/.hive o HIVE_DATA_DIR
```

---

*Documentación Hive SDK v0.0.17*
