# API Reference - Tools, Skills, Channels y Canvas

## Índice

1. [Tools](#tools)
2. [Skills](#skills)
3. [Channels](#channels)
4. [Canvas (ACE)](#canvas-ace)
5. [Storage](#storage)

---

## Tools

Las tools son funciones que los agentes pueden invocar durante la ejecución.

### ToolDescriptor

```typescript
interface ToolDescriptor {
  name: string;           // Nombre único
  description: string;    // Descripción para el LLM
  category: string;       // Categoría semántica
  abstractionLevel?: "atomic" | "orchestration";  // Nivel de abstracción
}
```

### Core Tool Catalog

```typescript
import { CORE_TOOL_CATALOG, MAX_TOOLS_PER_TURN, MIN_RELEVANCE_THRESHOLD } from "@hive-sdk/agent";

console.log(CORE_TOOL_CATALOG.length); // ~50 tools
```

### Categorías de Tools

| Categoría | Descripción | Tools Ejemplo |
|-----------|-------------|---------------|
| scheduling | Gestión de horarios | set_reminder, schedule_meeting |
| projects | Gestión de proyectos | create_task, update_task, list_tasks |
| filesystem | Operaciones de archivo | read_file, write_file, list_directory |
| web | Búsqueda y web | web_search, fetch_url, scrape_html |
| browser | Automatización de navegador | navigate, click_element, take_screenshot |
| memory | Notas y memoria | save_note, recall_memory, search_notes |
| code | Terminal y código | execute_code, run_command, install_package |
| canvas | Rendering UI | render_component, update_state |
| agents | Gestión de agentes | spawn_agent, list_agents, terminate_agent |
| core | Utilidades core | report_progress, notify_user |

### Tool Selection API

```typescript
import { selectTools } from "@hive-sdk/agent";

// Selección básica
const tools = selectTools(userMessage: string): ToolDescriptor[]

// Con parámetros
const tools = selectTools(
  userMessage: string,
  fullToolList: ToolDescriptor[],    // Default: CORE_TOOL_CATALOG
  maxTools: number                    // Default: MAX_TOOLS_PER_TURN (12)
): ToolDescriptor[]
```

### syncToolCatalogToFTS

```typescript
import { syncToolCatalogToFTS } from "@hive-sdk/agent";

await syncToolCatalogToFTS(tools: ToolDescriptor[]): Promise<void>
```

### Ejemplo

```typescript
import { selectTools, CORE_TOOL_CATALOG } from "@hive-sdk/agent";

// Selección simple
const selected = selectTools("Search for files in the project");

// Limitar resultados
const limited = selectTools("search query", CORE_TOOL_CATALOG, 3);

// Filtrar por categoría
const webTools = selected.filter(t => t.category === "web");

console.log("Selected tools:", selected.map(t => t.name));
```

### FTS5 Tool Selection

El sistema usa búsqueda full-text para seleccionar tools:

```sql
-- Query generado internamente
SELECT name, description, category, bm25(tools_fts, 'search files') as score
FROM tools_fts
WHERE tools_fts MATCH 'search OR file'
ORDER BY score
LIMIT 12
```

---

## Skills

Los skills son composiciones de tools con triggers semánticos.

### SkillDescriptor

```typescript
interface SkillDescriptor {
  id: string;
  name: string;
  description: string;
  category: string;
  tools: string[];      // Tools que utiliza
  triggers: string[];   // Palabras clave para activar
  body: string;         // Código o implementación
  active?: boolean;
}
```

### Core Skills

```typescript
import { CORE_SKILLS, DEFAULT_MAX_SKILLS, SKILL_RELEVANCE_THRESHOLD } from "@hive-sdk/agent";

console.log(CORE_SKILLS.length);
```

### API de Skills

```typescript
import { 
  selectSkills, 
  getMinimalSkills, 
  getAllSkillsFromDB,
  initializeSkillSelector,
  getSkillByName,
  getSkillsByCategory 
} from "@hive-sdk/agent";

// Seleccionar skills según mensaje
selectSkills(userMessage: string): SkillDescriptor[]

// Obtener skills mínimos
getMinimalSkills(): SkillDescriptor[]

// Obtener todos los skills de DB
getAllSkillsFromDB(): SkillDescriptor[]

// Inicializar selector
initializeSkillSelector(): void

// Obtener skill por nombre
getSkillByName(name: string): SkillDescriptor | undefined

// Obtener skills por categoría
getSkillsByCategory(category: string): SkillDescriptor[]
```

### Ejemplo

```typescript
import { selectSkills, getMinimalSkills } from "@hive-sdk/agent";

// Skills según mensaje del usuario
const selected = selectSkills("Analyze the sales data and generate a report");

// Skills siempre disponibles
const minimal = getMinimalSkills();

// Filtrar por categoría
const analytics = getSkillsByCategory("analytics");

console.log("Selected:", selected.map(s => s.name));
console.log("Minimal:", minimal.map(s => s.name));
```

---

## Channels

Canales de comunicación externos (ETCs - External Token Channels).

### Tipos de Canales

```typescript
type ChannelProvider = "slack" | "discord" | "telegram" | "whatsapp" | "email" | "web";
```

### ChannelConfig

```typescript
interface ChannelConfig {
  provider: ChannelProvider;
  config: {
    // Slack
    botToken?: string;
    signingSecret?: string;
    
    // Discord
    botToken?: string;
    guildId?: string;
    
    // Telegram
    botToken?: string;
    
    // WhatsApp (Twilio)
    accountSid?: string;
    authToken?: string;
    phoneNumber?: string;
    
    // Email
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
  };
}
```

### ChannelHandler

```typescript
import { createChannelHandler } from "@hive-sdk/channels";

// Crear handler para Slack
const slackHandler = createChannelHandler("slack", {
  botToken: process.env.SLACK_TOKEN,
  signingSecret: process.env.SLACK_SECRET,
});

// Crear handler para Discord
const discordHandler = createChannelHandler("discord", {
  botToken: process.env.DISCORD_TOKEN,
  guildId: process.env.DISCORD_GUILD,
});

// Crear handler para Telegram
const telegramHandler = createChannelHandler("telegram", {
  botToken: process.env.TELEGRAM_TOKEN,
});
```

### Métodos del Handler

```typescript
interface ChannelHandler {
  // Parsear mensaje entrante
  parse(request: Request): ChannelMessage;
  
  // Enviar mensaje
  send(channelId: string, message: string): Promise<void>;
  
  // Responder a mensaje
  reply(message: ChannelMessage, response: string): Promise<void>;
  
  // Enviar con componentes interactivos
  sendWithComponents(channelId: string, message: string, components: Component[]): Promise<void>;
}
```

### ChannelMessage

```typescript
interface ChannelMessage {
  id: string;
  channelId: string;
  userId: string;
  text: string;
  threadId?: string;
  timestamp: number;
  attachments?: Attachment[];
}
```

### Ejemplo: Slack Webhook

```typescript
import { createChannelHandler } from "@hive-sdk/channels";
import { runAgent } from "@hive-sdk/agent";

const handler = createChannelHandler("slack");

app.post("/webhooks/slack", async (req, res) => {
  const message = handler.parse(req.body);
  
  // Ejecutar agente
  const result = await runAgent({
    agentId: "coordinator",
    userMessage: message.text,
    threadId: message.threadId || message.userId,
  });
  
  // Responder
  await handler.reply(message, result);
  
  res.status(200).send("OK");
});
```

### Ejemplo: Discord Bot

```typescript
import { createChannelHandler } from "@hive-sdk/channels";

const handler = createChannelHandler("discord", {
  botToken: process.env.DISCORD_TOKEN,
  guildId: process.env.DISCORD_GUILD,
});

// Evento de mensaje
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  
  const response = await runAgent({
    agentId: "coordinator",
    userMessage: message.content,
    threadId: message.author.id,
  });
  
  await message.reply(response);
});
```

---

## Canvas (ACE)

Canvas (Agent Canvas Engine) proporciona visualización en tiempo real.

### Estados de Nodos

```typescript
type CanvasNodeStatus = 
  | "idle"        // Sin actividad
  | "thinking"   // Procesando con LLM
  | "tool_call"   // Ejecutando tool
  | "completed"   // Completado exitosamente
  | "failed";     // Fallido
```

### CanvasNodeUpdate

```typescript
interface CanvasNodeUpdate {
  nodeId: string;
  changes: {
    status?: CanvasNodeStatus;
    currentTool?: string;
    result?: string;
    error?: string;
    progress?: number;
  };
}
```

### emitCanvas

```typescript
import { emitCanvas } from "@hive-sdk/canvas";

// Actualizar estado del nodo
emitCanvas(event: string, payload: CanvasNodeUpdate): void;

// Eventos disponibles
emitCanvas("canvas:node_update", { nodeId, changes });
emitCanvas("canvas:graph_update", { graphId, changes });
emitCanvas("canvas:worker_update", { workerId, changes });
```

### CanvasManager

```typescript
import { CanvasManager } from "@hive-sdk/canvas";

const canvas = new CanvasManager();

// Obtener estado de un nodo
const nodeState = canvas.getNode(nodeId: string);

// Obtener estado del grafo
const graphState = canvas.getGraph(graphId: string);

// Suscribirse a updates
canvas.subscribe(nodeId: string, callback: (update: CanvasNodeUpdate) => void);
```

### WebSocket Canvas API

```typescript
// Cliente se conecta
const ws = new WebSocket("ws://localhost:3000/ws/canvas");

// Suscribirse a un grafo
ws.send(JSON.stringify({
  type: "subscribe",
  graphId: "swarm-123",
}));

// Recibir updates
ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  // { type: "node_update", nodeId: "...", changes: {...} }
};

// Enviar mensaje al agente
ws.send(JSON.stringify({
  type: "user_message",
  graphId: "swarm-123",
  message: "ejecutar tarea",
}));
```

### Heartbeat

```typescript
// Ping del servidor
const ping = { type: "ping", timestamp: Date.now() };

// El cliente responde
const pong = { type: "pong", timestamp: Date.now() };

// Estado de conexión
type WebSocketState = 
  | "connecting"
  | "connected"
  | "disconnecting"
  | "disconnected"
  | "reconnecting";
```

---

## Storage

Base de datos SQLite para persistencia.

### getDb

```typescript
import { getDb } from "@hive-sdk/storage/sqlite";

const db = getDb();
```

### Operaciones Básicas

```typescript
// Query SELECT - todos los resultados
const users = db.query("SELECT * FROM users").all();

// Query SELECT - un resultado
const user = db.query("SELECT * FROM users WHERE id = ?").get(userId);

// INSERT/UPDATE
db.query("INSERT INTO users (id, name) VALUES (?, ?)").run(userId, name);

// DELETE
db.query("DELETE FROM users WHERE id = ?").run(userId);

// Transacción
db.transaction(() => {
  db.query("INSERT INTO ...").run(...);
  db.query("UPDATE ...").run(...);
});
```

### Tablas Principales

| Tabla | Descripción |
|-------|-------------|
| users | Usuarios del sistema |
| agents | Configuración de agentes |
| providers | Proveedores LLM |
| models | Modelos disponibles |
| tools | Catálogo de tools |
| skills | Catálogo de skills |
| conversations | Historial de conversaciones |
| messages | Mensajes individuales |
| threads | Hilos de conversación |

### Tablas FTS

| Tabna | Propósito |
|-------|-----------|
| tools_fts | Búsqueda full-text de tools |
| skills_fts | Búsqueda full-text de skills |
| messages_fts | Búsqueda en historial |

---

## Errores Comunes

### Tool no encontrada

```typescript
// Tool no existe en catálogo
const tool = CORE_TOOL_CATALOG.find(t => t.name === "nonexistent");

// Solución: agregar al catálogo o usar tool existente
```

### Skill no se activa

```typescript
// El mensaje no coincide con triggers
const skills = selectSkills("hello"); // puede retornar []

// Solución: usar palabras clave de triggers
const skills = selectSkills("analyze data report");
```

### Canal no responde

```typescript
// Webhook no configurado correctamente

// Solución: verificar credenciales y URL del webhook
```

### Canvas no actualiza

```typescript
// WebSocket no conectado

// Solución: reconectar y suscribirse al grafo
```