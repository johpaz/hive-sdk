# API Reference - Workers y Eventos

## Índice

1. [Workers](#workers)
2. [AgentBus](#agentbus)
3. [Eventos del Sistema](#eventos-del-sistema)
4. [Métricas y Benchmarks](#métricas-y-benchmarks)

---

## Workers

Los workers son las unidades de ejecución dentro de un swarm.

### AgentExecutor

Ejecutor por defecto que usa `runAgentIsolated`.

```typescript
import { AgentExecutor } from "@hive-sdk/scheduler";

const executor = new AgentExecutor();

const result = await executor.execute(
  node,           // TaskNode
  depResults,     // Resultados de dependencias
  threadId        // ID del hilo
);
```

### Worker Custom

Puedes implementar workers custom:

```typescript
import type { IAgentExecutor } from "@hive-sdk/scheduler";

const myWorker: IAgentExecutor = {
  async execute(node: TaskNode, depResults: Record<string, string>, threadId: string): Promise<string> {
    // Obtener datos de dependencias
    const depData = Object.values(depResults).join("\n");
    
    // Ejecutar tarea
    const result = await processTask(node.taskDescription, depData);
    
    // Retornar resultado
    return result;
  },
};

// Usar con scheduler
const scheduler = new DAGScheduler();
const result = await scheduler.execute(graph, { executor: myWorker });
```

### Worker Pool

Para ejecutar múltiples workers:

```typescript
class WorkerPool {
  constructor(maxWorkers: number);
  
  async execute(task: TaskNode): Promise<string>;
  abort(): void;
  getStats(): WorkerStats;
}

interface WorkerStats {
  active: number;
  queued: number;
  completed: number;
  failed: number;
}
```

### Worker Lifecycle

```typescript
// 1. El worker recibe la tarea
const worker = {
  async execute(node, depResults, threadId) {
    // 2. Ejecutar con dependencias
    const context = Object.entries(depResults)
      .map(([id, result]) => `${id}: ${result}`)
      .join("\n");
    
    const result = await runAgentIsolated({
      agentId: node.agentId,
      taskDescription: `${node.taskDescription}\n\nContexto:\n${context}`,
      threadId,
    });
    
    // 3. Retornar resultado
    return result;
  },
};
```

### Métricas de Workers

| Métrica | Valor Típico | Descripción |
|---------|--------------|-------------|
| Task Duration | 30-55ms | Tiempo promedio por tarea |
| Throughput | ~12 tasks/s | Tareas por segundo |
| Queue Latency | <100ms (depth<5) | Latencia según profundidad |
| Context Switch | <1ms | Overhead de cambio de contexto |
| Efficiency | >95% | Eficiencia de ejecución paralela |

---

## AgentBus

Sistema de eventos para comunicación entre agentes.

### Constructor

```typescript
import { AgentBus } from "@hive-sdk/events";

const agentBus = new AgentBus({
  enableLogging: true,
});
```

### Métodos Principales

```typescript
// Publicar evento
agentBus.publish(event: string, payload?: object, fromWorkerId?: string): void;

// Suscribirse a evento
agentBus.subscribe(event: string, callback: (data: EventData) => void): () => void;

// Suscribir una sola vez
agentBus.subscribeOnce(event: string, callback: (data: EventData) => void): void;

// Unsubscribe
agentBus.unsubscribe(event: string, callback: Function): void;

// Remover todos los listeners
agentBus.removeAllListeners(event?: string): void;

// Contar listeners
agentBus.listenerCount(event: string): number;
```

### Eventos del Sistema

```typescript
// Tareas
agentBus.publish("worker:task_started", { taskId: "task-1" }, "worker-1");
agentBus.publish("worker:task_completed", { taskId: "task-1", result: "..." }, "worker-1");
agentBus.publish("worker:task_failed", { taskId: "task-1", error: "..." }, "worker-1");

// Mensajes entre workers
agentBus.publish("message:custom", { toWorkerId: "worker-2", data: "..." }, "worker-1");

// Ayuda entre workers
agentBus.publish("worker:help_request", { taskId: "task-1" }, "worker-1");
agentBus.publish("worker:help_response", { taskId: "task-1", result: "..." }, "worker-2");
```

### Métodos Helper

```typescript
// Notificar inicio de tarea
agentBus.notifyTaskStarted(workerId: string, taskId: string);

// Notificar completación
agentBus.notifyTaskCompleted(workerId: string, taskId: string, result: string);

// Notificar fallo
agentBus.notifyTaskFailed(workerId: string, taskId: string, error: string);

// Enviar mensaje entre workers
agentBus.sendMessage(fromWorkerId: string, toWorkerId: string, data: object): void;

// Solicitar ayuda
agentBus.requestHelp(workerId: string, taskId: string): void;

// Responder a solicitud de ayuda
agentBus.respondToHelp(requestingWorkerId: string, helpingWorkerId: string, result: string): void;
```

### Ejemplo Completo

```typescript
import { AgentBus } from "@hive-sdk/events";

const agentBus = new AgentBus();

// Worker 1: ejecutar tarea
async function worker1() {
  agentBus.notifyTaskStarted("worker-1", "task-1");
  
  try {
    const result = await executeTask();
    agentBus.notifyTaskCompleted("worker-1", "task-1", result);
  } catch (error) {
    agentBus.notifyTaskFailed("worker-1", "task-1", error.message);
  }
}

// Worker 2: escuchar eventos
agentBus.subscribe("worker:task_started", (data) => {
  console.log("Task started:", data);
});

agentBus.subscribe("worker:task_completed", (data) => {
  console.log("Task completed:", data);
});
```

---

## Eventos del Sistema

### Canvas Events

```typescript
import { emitCanvas } from "@hive-sdk/canvas";

// Actualizar nodo
emitCanvas("canvas:node_update", {
  nodeId: "agent-1",
  changes: { status: "thinking" },
});

// Nodo ejecutando tool
emitCanvas("canvas:node_update", {
  nodeId: "agent-1",
  changes: { status: "tool_call", currentTool: "search_files" },
});

// Completado
emitCanvas("canvas:node_update", {
  nodeId: "agent-1",
  changes: { status: "completed", result: "..." },
});
```

### DAG Events

```typescript
import { EventBridge } from "@hive-sdk/scheduler";

const bridge = new EventBridge("swarm-1", "project-1", "coordinator-1");

bridge.onSwarmStarted = (nodeCount) => {
  console.log(`Swarm started with ${nodeCount} nodes`);
};

bridge.onTaskStarted = (node) => {
  console.log(`Task ${node.name} started`);
};

bridge.onTaskCompleted = (node, progress) => {
  console.log(`Task ${node.name} completed. Progress: ${progress.percentComplete}%`);
};

bridge.onSwarmCompleted = (result) => {
  console.log(`Swarm completed. Success: ${result.success}`);
};
```

---

## Métricas y Benchmarks

### Time to First Token (TTFT)

| Modelo | TTFT | Categoría |
|--------|------|-----------|
| Fast (gpt-4o-mini) | ~150ms | Rápido |
| Balanced (gpt-4o) | ~800ms | Balanceado |
| Quality (claude-opus) | ~2500ms | Calidad |

### TTFT con Overhead

| Métrica | Valor |
|---------|-------|
| LLM only | ~388ms |
| With context compile | ~487ms |
| Overhead % | ~25% |

### Streaming Throughput

| Métrica | Valor |
|---------|-------|
| Tokens/segundo | ~60 tokens/s |
| 150 tokens en | 2500ms |

### Worker Performance

| Worker | Tasks | Duration Avg |
|--------|-------|--------------|
| worker-1 | 5 | ~54ms |
| worker-2 | 3 | ~33ms |
| worker-3 | 7 | ~45ms |

### Queue Latency

| Queue Depth | Latencia |
|-------------|----------|
| 1-2 | ~25ms |
| 3-5 | ~100ms |
| 6-10 | ~200ms |

### Parallel Efficiency

| Config | Tiempo |
|--------|--------|
| Sequential (4×10) | 4000ms |
| Parallel | ~101ms |
| Efficiency | >95% |

### Swarm Coordination

| Swarm Size | Latencia |
|------------|----------|
| 5 workers | ~16ms |

---

## Patrones de Uso

### Patrón: Master-Worker

```typescript
const agentBus = new AgentBus();

// Master reparte tareas
function distributeTasks(tasks: string[]) {
  tasks.forEach((task, i) => {
    agentBus.publish("worker:task_started", { task }, `worker-${i % 3}`);
  });
}

// Workers escuchan
for (let i = 0; i < 3; i++) {
  agentBus.subscribe(`worker-${i}`, async (data) => {
    const result = await processTask(data.task);
    agentBus.notifyTaskCompleted(`worker-${i}`, data.task, result);
  });
}
```

### Patrón: Request-Response

```typescript
// Worker 1 solicita ayuda
agentBus.requestHelp("worker-1", "task-1");

// Worker 2 responde
agentBus.subscribe("worker:help_request", (data) => {
  if (canHelp(data.taskId)) {
    agentBus.respondToHelp("worker-1", "worker-2", "help result");
  }
});
```

### Patrón: Broadcast

```typescript
// Broadcasting a todos los workers
agentBus.publish("broadcast:shutdown", { reason: "maintenance" });

// Todos los workers escuchan
agentBus.subscribe("broadcast:shutdown", (data) => {
  gracefulShutdown();
});
```

---

## Errores Comunes

### Error: "Cannot read property subscribe of undefined"

```typescript
// El agentBus no está inicializado
const agentBus = new AgentBus(); // ✅ inicializar antes de usar
```

### Error: "Event not firing"

```typescript
// No hay listeners para el evento
agentBus.publish("my-event", {}); // pero nadie escucha

// Solución: verificar listeners
console.log(agentBus.listenerCount("my-event")); // debe ser > 0
```

### Error: "Worker not responding"

```typescript
// El worker no responde a eventos

// Solución: verificar conexión con heartbeat
setInterval(() => {
  agentBus.publish("worker:heartbeat", { workerId: "worker-1" });
}, 30000);
```

### Error: "Memory leak - too many listeners"

```typescript
// Muchos listeners sin cleanup
const unsubscribes = [];
unsubscribes.push(agentBus.subscribe("event", handler));
// ...many more

// Solución: cleanup
unsubscribes.forEach(unsub => unsub());
agentBus.removeAllListeners();
```