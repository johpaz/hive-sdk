# API Reference — Workers y Eventos

## Índice

1. [Workers](#workers)
2. [AgentBus](#agentbus)
3. [EventBus](#eventbus)
4. [Canvas Events](#canvas-events)

---

## Workers

Los workers ejecutan tareas dentro de un swarm.

### AgentExecutor

```typescript
import { AgentExecutor } from "@hive/core";

const executor = new AgentExecutor();
const result = await executor.execute(node, depResults, threadId);
```

### WorkerPool

Pool de workers para ejecución concurrente.

```typescript
import { setSchedulerForCleanup, executeScheduledTask } from "@hive/core/swarm/workers";

// Programar task
await executeScheduledTask(job);
```

### Worker Custom

```typescript
import type { IAgentExecutor } from "@hive/core";

const myWorker: IAgentExecutor = {
  async execute(node, depResults, threadId) {
    const context = Object.entries(depResults)
      .map(([id, r]) => `${id}: ${r}`).join("\n");
    return await processTask(node.taskDescription, context);
  },
};
```

---

## AgentBus

Sistema de eventos singleton para comunicación entre agentes.

```typescript
import { agentBus, getUnreadMessagesForWorker } from "@hive/core";

// Publicar evento
agentBus.publish("worker:task_started", { taskId: "task-1" }, "worker-1");

// Suscribirse
const unsub = agentBus.subscribe("worker:task_completed", (data) => {
  console.log("Task completed:", data);
});

// Unsubscribe
unsub();
```

### Métodos Helper

```typescript
import { 
  getUnreadMessagesForWorker, 
  getProjectMessageHistory 
} from "@hive/core";

// Mensajes no leídos para un worker
const messages = getUnreadMessagesForWorker("worker-1");

// Historial de un proyecto
const history = getProjectMessageHistory("project-1");
```

---

## EventBus

EventBus global singleton (eventos del sistema).

```typescript
import { eventBus } from "@hive/core";

// Escuchar eventos
eventBus.on("agent:start", (data) => {
  console.log("Agent started:", data);
});

// Emitir eventos
eventBus.emit("agent:complete", { agentId: "a1", result: "ok" });
```

---

## Canvas Events

Eventos de actualización visual del canvas.

```typescript
import { emitCanvas } from "@hive/core/canvas";

// Actualizar estado de un nodo
emitCanvas("canvas:node_update", {
  nodeId: "agent-1",
  changes: { status: "thinking" },
});

// Eventos disponibles
emitCanvas("canvas:node_update", { nodeId, changes });
emitCanvas("canvas:graph_update", { graphId, changes });
emitCanvas("canvas:worker_update", { workerId, changes });
```

### CanvasManager

```typescript
import { CanvasManager, canvasManager } from "@hive/core/canvas";

// Singleton
const canvas = canvasManager;

// Suscribirse a updates de un nodo
canvas.subscribe("agent-1", (update) => {
  console.log("Node update:", update);
});
```

### WebSocket Canvas

```typescript
// Cliente se conecta
const ws = new WebSocket("ws://localhost:3000/ws/canvas");

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  // { type: "node_update", nodeId: "...", changes: {...} }
};

// Enviar mensaje al agente
ws.send(JSON.stringify({ type: "user_message", message: "ejecutar tarea" }));
```
