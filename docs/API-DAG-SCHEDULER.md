# API Reference - DAG Scheduler

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
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  TaskNode   │────▶│  TaskGraph   │────▶│DAGScheduler │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                    ┌──────────────────────────┼──────────────┐
                    │                          │              │
                    ▼                          ▼              ▼
              ┌─────────┐              ┌─────────┐    ┌─────────┐
              │ Worker 1│              │ Worker 2│    │ Worker 3│
              └─────────┘              └─────────┘    └─────────┘
```

---

## TaskNode

Representa una tarea individual en el grafo.

### TaskNodeConfig

```typescript
interface TaskNodeConfig {
  id: string;                    // ID único del nodo
  agentId: string;              // ID del agente que ejecuta
  name: string;                 // Nombre legible
  taskDescription: string;      // Descripción de la tarea
  deps: string[];               // IDs de nodos dependencias
  priority?: number;            // Prioridad (mayor = primero)
  timeout?: number;             // Timeout en ms
  maxRetries?: number;          // Intentos máximos
  onComplete?: (result: string) => void;
  onFail?: (error: string) => void;
}
```

### Estados del Nodo

```typescript
type NodeStatus = "PENDING" | "READY" | "RUNNING" | "COMPLETED" | "FAILED";
```

### Propiedades del Nodo

```typescript
const node = graph.getNode("task-1");

node.id;                    // ID del nodo
node.name;                  // Nombre
node.status;               // Estado actual
node.deps;                 // Dependencias
node.agentId;              // Agente asignado
node.result;               // Resultado (si completado)
node.error;                // Error (si fallido)
node.retryCount;           // Intentos ejecutados
node.elapsedSeconds();     // Tiempo transcurrido
node.canRetry();           // Si puede reintentar
```

### Métodos del Nodo

```typescript
node.markReady();         // Marcar como listo
node.markRunning();       // Marcar como ejecutando
node.markCompleted(result: string);  // Marcar completado
node.markFailed(error: string);      // Marcar fallido
node.reset();             // Resetear estado
```

### Ejemplo

```typescript
const config: TaskNodeConfig = {
  id: "fetch-data",
  agentId: "fetcher",
  name: "Fetch Data",
  taskDescription: "Obtener datos de API",
  deps: [],
  priority: 10,
  timeout: 30000,
  maxRetries: 3,
};

const node = new TaskNode(config);
node.markRunning();
// ... ejecutar tarea ...
node.markCompleted("data fetched");
```

---

## TaskGraph

Grafo acíclico dirigido de tareas.

### Constructor

```typescript
const graph = new TaskGraph(configs: TaskNodeConfig[]);
```

### Métodos Principales

```typescript
// Obtener nodo por ID
const node = graph.getNode(id: string);

// Obtener todos los nodos
const nodes = graph.getAllNodes();

// Obtener nodos listos (sin dependencias pendientes)
const ready = graph.getReadyNodes();

// Obtener nodos recién listos (después de completarse uno)
const newlyReady = graph.getNewlyReadyIds(completedIds: Set<string>);

// Obtener IDs de nodos completados
const completed = graph.getCompletedIds();

// Obtener resultados de dependencias
const depResults = graph.getDepResults(nodeId: string);

// Obtener progreso actual
const progress = graph.getProgress();

// Propagar fallo a nodos dependientes
graph.propagateFailure(nodeId: string, error: string);
```

### Progreso del Grafo

```typescript
interface GraphProgress {
  total: number;           // Total de nodos
  completed: number;       // Completados
  running: number;         // Ejecutando
  failed: number;          // Fallidos
  pending: number;         // Pendientes
  percentComplete: number; // Porcentaje
}
```

### Ejemplo

```typescript
const configs: TaskNodeConfig[] = [
  { id: "a", agentId: "worker", taskDescription: "Tarea A", deps: [] },
  { id: "b", agentId: "worker", taskDescription: "Tarea B", deps: ["a"] },
  { id: "c", agentId: "worker", taskDescription: "Tarea C", deps: ["a"] },
  { id: "d", agentId: "worker", taskDescription: "Tarea D", deps: ["b", "c"] },
];

const graph = new TaskGraph(configs);

// Obtener nodos iniciales (sin deps)
const ready = graph.getReadyNodes(); // [a]

// Después de completar "a"
const newlyReady = graph.getNewlyReadyIds(new Set(["a"])); // [b, c]
```

---

## DAGScheduler

Orquestador principal de la ejecución.

### Constructor

```typescript
const scheduler = new DAGScheduler({
  strategy?: ExecutionStrategy,
  maxConcurrentWorkers?: number,  // Default: 2
  executor?: IAgentExecutor,      // Custom executor
  silent?: boolean,               // Sin logs ASCII
});
```

### Ejecutar Grafo

```typescript
const result = await scheduler.execute(graph, {
  projectId?: string,
  coordinatorId?: string,
  silent?: boolean,
  executor?: IAgentExecutor,
});
```

### DAGResult

```typescript
interface DAGResult {
  swarmId: string;                    // ID del swarm
  totalDurationMs: number;           // Duración total
  completed: NodeSummary[];          // Nodos completados
  failed: NodeSummary[];             // Nodos fallidos
  success: boolean;                  // Si todoOK
}
```

### NodeSummary

```typescript
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

### Control de Ejecución

```typescript
// Abortar ejecución
scheduler.abort();

// Verificar si está abortado
if (scheduler.aborted) {
  //no continuar
}
```

### Ejemplo Completo

```typescript
import { DAGScheduler, TaskGraph, TaskNodeConfig } from "@hive-sdk/scheduler";

const configs: TaskNodeConfig[] = [
  { id: "fetch", agentId: "fetcher", taskDescription: "Fetch data", deps: [] },
  { id: "process", agentId: "processor", taskDescription: "Process", deps: ["fetch"] },
  { id: "save", agentId: "saver", taskDescription: "Save", deps: ["process"] },
];

const graph = new TaskGraph(configs);

const scheduler = new DAGScheduler({
  maxConcurrentWorkers: 2,
});

const result = await scheduler.execute(graph, {
  projectId: "my-project",
  coordinatorId: "coordinator-1",
});

console.log(`Success: ${result.success}`);
console.log(`Completed: ${result.completed.length}`);
console.log(`Failed: ${result.failed.length}`);
console.log(`Duration: ${result.totalDurationMs}ms`);
```

---

## Estrategias

### ParallelStrategy (FIFO)

Ejecuta nodos en orden de llegada.

```typescript
import { ParallelStrategy } from "@hive-sdk/scheduler";

const strategy = new ParallelStrategy();
```

### PriorityStrategy

Ejecuta nodos según prioridad y path crítico.

```typescript
import { PriorityStrategy } from "@hive-sdk/scheduler";

const strategy = new PriorityStrategy();

// Configurar con opciones
const priority = new PriorityStrategy({
  preferCriticalPath: true,
  dynamicPriority: true,
});
```

### Custom Strategy

```typescript
import type { ExecutionStrategy } from "@hive-sdk/scheduler";

const myStrategy: ExecutionStrategy = {
  initialize(nodes: Map<string, TaskNode>) {
    // Precomputar prioridades
  },
  pick(nodes: TaskNode[]): TaskNode {
    // Seleccionar siguiente nodo
    return nodes[0]; // FIFO
  },
};
```

---

## Presets

Grafos predefinidos para casos comunes.

### ResearchPreset

```typescript
import { ResearchPreset } from "@hive-sdk/scheduler";

const graph = ResearchPreset({
  query: "Análisis de mercado",
  maxDepth: 2,       // Profundidad de búsqueda
  maxBranches: 3,    // Ramas por nivel
});
```

### ParallelPreset

```typescript
import { ParallelPreset } from "@hive-sdk/scheduler";

const graph = ParallelPreset({
  tasks: ["task1", "task2", "task3"],
  agentId: "worker",
});
```

### PipelinePreset

```typescript
import { PipelinePreset } from "@hive-sdk/scheduler";

const graph = PipelinePreset({
  steps: ["fetch", "process", "save"],
  agentId: "worker",
});
```

---

## EventBridge

Puente de eventos para notificaciones.

### Eventos Emitidos

```typescript
// Inicio de swarm
bridge.onSwarmStarted(nodeCount: number);

// Inicio de tarea
bridge.onTaskStarted(node: TaskNode);

// Progreso de tarea
bridge.onTaskProgress(node: TaskNode, progress: number);

// Completado de tarea
bridge.onTaskCompleted(node: TaskNode, progress: GraphProgress);

// Fallo de tarea
bridge.onTaskFailed(node: TaskNode, progress: GraphProgress);

// Completado de swarm
bridge.onSwarmCompleted(result: DAGResult);
```

### Suscribirse a Eventos

```typescript
import { EventBridge } from "@hive-sdk/scheduler";

const bridge = new EventBridge("swarm-123", "project-1", "coordinator-1");

bridge.onTaskCompleted = (node, progress) => {
  console.log(`Task ${node.name} completed. Progress: ${progress.percentComplete}%`);
};

bridge.onSwarmCompleted = (result) => {
  console.log(`Swarm finished. Success: ${result.success}`);
};
```

---

## IAgentExecutor

Interfaz para ejecutores custom.

```typescript
interface IAgentExecutor {
  execute(
    node: TaskNode,
    depResults: Record<string, string>,
    threadId: string
  ): Promise<string>;
}
```

### Ejemplo: Custom Executor

```typescript
import type { IAgentExecutor } from "@hive-sdk/scheduler";

const myExecutor: IAgentExecutor = {
  async execute(node, depResults, threadId) {
    console.log(`Executing ${node.name} with deps:`, Object.keys(depResults));
    
    // Custom execution logic
    const result = await myCustomFunction(node.taskDescription);
    
    return result;
  },
};

// Usar con scheduler
const result = await scheduler.execute(graph, { executor: myExecutor });
```

---

## Errores Comunes

### Error: "Cyclic dependency detected"

```typescript
// Incorrecto: ciclo en dependencias
const configs = [
  { id: "a", deps: ["b"] },
  { id: "b", deps: ["a"] }, // ciclo!
];

// Solución: eliminar ciclos
const configs = [
  { id: "a", deps: [] },
  { id: "b", deps: ["a"] },
];
```

### Error: "Node not found"

```typescript
// Referencia a nodo que no existe
const deps = graph.getDepResults("nonexistent"); // error

// Solución: verificar existencia
if (graph.getNode("task-1")) {
  // usar nodo
}
```

### Error: "Too many concurrent workers"

```typescript
// workers > nodos disponibles
const scheduler = new DAGScheduler({ maxConcurrentWorkers: 100 });

// Solución: limitar workers
const scheduler = new DAGScheduler({ maxConcurrentWorkers: 4 });
```

### Error: "Task timeout"

```typescript
// Nodo con timeout muy bajo
const config = { id: "task", timeout: 1 }; // 1ms muy bajo

// Solución: timeout razonable
const config = { id: "task", timeout: 30000 }; // 30s
```

### Error: "Executor result not string"

```typescript
// El executor debe retornar string
const executor = {
  async execute() {
    return { result: "data" }; // ❌ objeto
  },
};

// Solución: retornar string
const executor = {
  async execute() {
    return JSON.stringify({ result: "data" }); // ✅ string
  },
};
```