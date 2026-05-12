# API Reference — DAG Scheduler

## Índice

1. [Arquitectura](#arquitectura)
2. [TaskNode](#tasknode)
3. [TaskGraph](#taskgraph)
4. [DAGScheduler](#dagscheduler)
5. [Estrategias](#estrategias)
6. [Presets](#presets)
7. [EventBridge](#eventbridge)
8. [Errores Comunes](#errores-comunes)

---

## Arquitectura

El DAG Scheduler orquesta la ejecución de grafos acíclicos dirigidos (DAG) de tareas.

```
TaskNode → TaskGraph → DAGScheduler
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
        Worker 1        Worker 2       Worker 3
       (agente)        (agente)       (agente)
```

---

## TaskNode

Representa una tarea individual en el grafo.

### TaskNodeConfig

```typescript
import { TaskNode } from "@johpaz/hive-core";

interface TaskNodeConfig {
  id: string;
  agentId: string;
  name?: string;
  taskDescription: string;
  deps: string[];
  priority?: number;
  timeout?: number;
  maxRetries?: number;
}
```

### Estados

```typescript
type NodeStatus = "PENDING" | "READY" | "RUNNING" | "COMPLETED" | "FAILED";
```

### Ejemplo

```typescript
const node = new TaskNode({
  id: "fetch-data",
  agentId: "fetcher",
  taskDescription: "Obtener datos de API",
  deps: [],
});
node.markRunning();
// ... ejecutar ...
node.markCompleted("datos obtenidos");
```

---

## TaskGraph

Grafo acíclico dirigido de tareas.

```typescript
import { TaskGraph } from "@johpaz/hive-core";

const graph = new TaskGraph([
  { id: "a", agentId: "worker", taskDescription: "Tarea A", deps: [] },
  { id: "b", agentId: "worker", taskDescription: "Tarea B", deps: ["a"] },
  { id: "c", agentId: "worker", taskDescription: "Tarea C", deps: ["a"] },
  { id: "d", agentId: "worker", taskDescription: "Tarea D", deps: ["b", "c"] },
]);

// Nodos listos para ejecutar (sin deps pendientes)
const ready = graph.getReadyNodes();

// IDs de nodos completados
const completed = graph.getCompletedIds();

// Nodos recién listos tras completar uno
const newlyReady = graph.getNewlyReadyIds(new Set(["a"]));

// Resultados de dependencias
const depResults = graph.getDepResults("d");

// Progreso
const progress = graph.getProgress();
// { total: 4, completed: 1, running: 0, failed: 0, pending: 3, percentComplete: 25 }
```

---

## DAGScheduler

Orquestador principal de la ejecución.

```typescript
import { DAGScheduler, TaskGraph } from "@johpaz/hive-core";

const graph = new TaskGraph([
  { id: "fetch", agentId: "fetcher", taskDescription: "Fetch data", deps: [] },
  { id: "process", agentId: "processor", taskDescription: "Process", deps: ["fetch"] },
  { id: "save", agentId: "saver", taskDescription: "Save", deps: ["process"] },
]);

const scheduler = new DAGScheduler({
  maxConcurrentWorkers: 2,
});

const result = await scheduler.execute(graph);

console.log(`Success: ${result.success}`);
console.log(`Duration: ${result.totalDurationMs}ms`);
```

### DAGResult

```typescript
interface DAGResult {
  swarmId: string;
  totalDurationMs: number;
  completed: NodeSummary[];
  failed: NodeSummary[];
  success: boolean;
}

interface NodeSummary {
  id: string;
  name: string;
  status: "COMPLETED" | "FAILED";
  durationMs: number;
  result?: string;
  error?: string;
  retries: number;
}
```

### Control

```typescript
scheduler.abort();    // Abortar ejecución en curso
```

---

## Estrategias

### ParallelStrategy (FIFO)

```typescript
import { ParallelStrategy } from "@johpaz/hive-core";

const strategy = new ParallelStrategy();  // Orden de llegada
```

### PriorityStrategy

```typescript
import { PriorityStrategy } from "@johpaz/hive-core";

const strategy = new PriorityStrategy();  // Por prioridad + path crítico
```

### Custom Strategy

```typescript
import type { ExecutionStrategy } from "@johpaz/hive-core";

const myStrategy: ExecutionStrategy = {
  initialize(nodes) { /* precomputar */ },
  pick(nodes) { return nodes[0]; },  // FIFO
};
```

---

## Presets

Grafos predefinidos.

### ResearchPreset

```typescript
import { createResearchGraph } from "@johpaz/hive-core/swarm/presets";

const graph = createResearchGraph({
  agents: { researcher: "researcher-id", writer: "writer-id" },
  query: "Análisis de mercado",
});
```

### HiveLearnPreset

```typescript
import { createHiveLearnGraph } from "@johpaz/hive-core/swarm/presets";

const graph = createHiveLearnGraph({
  agents: { teacher: "teacher-id", student: "student-id" },
  topic: "Machine Learning",
});
```

---

## EventBridge

Puente de eventos entre el scheduler y el resto del sistema.

```typescript
import { EventBridge } from "@johpaz/hive-core";

const bridge = new EventBridge("swarm-123", "project-1", "coordinator-1");

bridge.onTaskCompleted = (node, progress) => {
  console.log(`${node.name}: ${progress.percentComplete}%`);
};

bridge.onSwarmCompleted = (result) => {
  console.log(`Swarm completed. Success: ${result.success}`);
};
```

---

## IAgentExecutor

```typescript
import type { IAgentExecutor } from "@johpaz/hive-core";

const myExecutor: IAgentExecutor = {
  async execute(node, depResults, threadId) {
    const context = Object.values(depResults).join("\n");
    return await myCustomFunction(node.taskDescription, context);
  },
};

const result = await scheduler.execute(graph, { executor: myExecutor });
```

---

## Errores Comunes

### Cyclic dependency detected

```typescript
// ❌ Ciclo: a→b→a
[{ id: "a", deps: ["b"] }, { id: "b", deps: ["a"] }];

// ✅ Sin ciclo
[{ id: "a", deps: [] }, { id: "b", deps: ["a"] }];
```

### Task timeout

```typescript
// Configurar timeout razonable
const config = { id: "task", agentId: "w", taskDescription: "...", deps: [], timeout: 30000 };
```
