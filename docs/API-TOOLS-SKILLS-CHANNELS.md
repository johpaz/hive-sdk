# API Reference — Tools, Skills, MCP y Storage

## Índice

1. [Tools](#tools)
2. [Skills](#skills)
3. [MCP](#mcp)
4. [Canvas](#canvas)
5. [Storage](#storage)
6. [Config](#config)
7. [Gateway (stub)](#gateway)

---

## Tools

### defineTool

Función para definir herramientas que el agente puede invocar.

```typescript
import { defineTool } from "@hive/core";

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
import { ToolRegistry, defineTool } from "@hive/core";

const reg = new ToolRegistry();

// Registrar
reg.register(defineTool({ name: "t1", description: "...", execute: async () => ({}) }));

// Consultar
reg.has("t1");              // true
reg.get("t1");              // ToolDefinition
reg.list();                  // ToolDefinition[]
reg.getByCategory("web");   // Filtrar por categoría
reg.getNames();             // ["t1"]
reg.size();                 // 1

// Merge con otro registry
reg.merge(otherRegistry);

// Limpiar
reg.clear();
```

### ToolExecutor

Ejecutor de herramientas con validación Zod.

```typescript
import { ToolRegistry, ToolExecutor, defineTool } from "@hive/core";

const reg = new ToolRegistry();
reg.register(defineTool({
  name: "echo",
  description: "Echo",
  execute: async (args) => args,
}));

const exec = new ToolExecutor(reg);

// Ejecutar una tool
const result = await exec.execute("echo", { msg: "hola" });
// { toolName: "echo", args: { msg: "hola" }, result: { msg: "hola" }, durationMs: 1 }

// Ejecución batch
const results = await exec.executeBatch([
  { name: "echo", args: { msg: "a" } },
  { name: "echo", args: { msg: "b" } },
]);
```

### Tool Selection (FTS5)

```typescript
import { selectTools, CORE_TOOL_CATALOG } from "@hive/core";

// Selección automática por relevancia
const tools = selectTools("Buscar archivos en el proyecto");

// Filtrar por categoría
const webTools = tools.filter(t => t.category === "web");
```

---

## Skills

### defineSkill

```typescript
import { defineSkill } from "@hive/core";

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

Carga skills desde archivos YAML o datos bundled.

```typescript
import { SkillLoader } from "@hive/core";

const loader = new SkillLoader({
  allowBundled: ["file-manager", "web-researcher"],
  managedDir: "./skills",
});

const skills = loader.list();
const skill = loader.get("file-manager");
```

---

## MCP

Model Context Protocol — herramientas externas via STDIO/SSE.

### MCPClientManager

```typescript
import { MCPClientManager } from "@hive/core";

// Configurar con servidores
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

// Inicializar y conectar
await mcp.initialize();

// Obtener tools de servidores MCP
const tools = mcp.getTools("filesystem");

// Actualizar configuración
await mcp.updateConfig({ servers: { ... } });
```

### MCPToolAdapter

Sincroniza tools MCP con la base de datos FTS5.

```typescript
import { syncMCPToolsToDB, syncMCPToolsToFTS, clearMCPToolsFromDB } from "@hive/core/mcp";

await syncMCPToolsToDB(mcpManager);
await syncMCPToolsToFTS();
```

### Transports

```typescript
import { createTransport, SSETransport, WebSocketTransport } from "@hive/core/mcp/transports";

// STDIO
const transport = createTransport({
  type: "stdio",
  stdio: { command: "npx", args: ["-y", "server"], env: {} },
});

// SSE
const sse = new SSETransport({ url: "https://api.example.com/mcp" });

// WebSocket
const ws = new WebSocketTransport({ url: "wss://api.example.com/mcp" });
```

---

## Canvas

Visualización en tiempo real del estado de agentes.

```typescript
import { CanvasManager, canvasManager, emitCanvas } from "@hive/core/canvas";

// Singleton
canvasManager.subscribe("agent-1", (update) => {
  console.log("Estado:", update.changes.status);
});

// Emitir eventos
emitCanvas("canvas:node_update", {
  nodeId: "agent-1",
  changes: { status: "running", currentTool: "web_search" },
});
```

### A2UI Tools

```typescript
import { createA2UISurfaceTool, createA2UIUpdateComponentsTool } from "@hive/core/canvas";

// Crear tools A2UI para UI generada por agentes
const surfaceTool = createA2UISurfaceTool();
const updateTool = createA2UIUpdateComponentsTool();
```

---

## Storage

Base de datos SQLite con FTS5.

```typescript
import { initializeDatabase, getDb, dbService } from "@hive/core";

// Inicializar (crea tablas si no existen)
await initializeDatabase();

// Obtener instancia DB
const db = getDb();

// Queries
const results = db.query("SELECT * FROM agents WHERE id = ?").all(agentId);
const single = db.query("SELECT * FROM agents WHERE id = ?").get(agentId);

// Insert/Update
db.query("INSERT INTO agents (id, name) VALUES (?, ?)").run("a1", "Agent 1");

// Cerrar
dbService.close();
```

### Schemas FTS5

```sql
-- 4 tablas virtuales FTS5 para búsqueda full-text
CREATE VIRTUAL TABLE playbook_fts USING fts5(rule, category, applicable_to);
CREATE VIRTUAL TABLE tools_fts USING fts5(tool_name, name, description, category);
CREATE VIRTUAL TABLE skills_fts USING fts5(id, name, description, category, tools, triggers, body);
CREATE VIRTUAL TABLE mcp_tools_fts USING fts5(id, name, description, category);
```

---

## Config

```typescript
import { loadConfig, loadEnv, getHiveDir } from "@hive/core";

const config = await loadConfig();
// { HIVE_DATA_DIR: "./data", LOG_LEVEL: "info", ... }

const hiveDir = getHiveDir();  // ~/.hive o HIVE_DATA_DIR
```

---

## Gateway (stub)

```typescript
import { sendToUserChannel } from "@hive/core/gateway";

// Stub — logs al console, retorna { ok: true }
// Reemplazar cuando se integre con un sistema de notificaciones real
const result = await sendToUserChannel("cli:user-1", "user-1", "Hello!");
```
