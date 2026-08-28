export { DAGScheduler } from "./Coordinator.ts";
export type { DAGSchedulerOptions, IAgentExecutor } from "./Coordinator.ts";

export { TaskGraph } from "./TaskGraph.ts";
export { TaskNode } from "./TaskNode.ts";
export type { TaskNodeConfig, NodeStatus } from "./TaskNode.ts";
export type { DAGResult, NodeSummary } from "./TaskResult.ts";

export { AgentExecutor } from "./AgentExecutor.ts";
export { EventBridge } from "./EventBridge.ts";

export { CyclicDependencyError, TaskTimeoutError, TaskFailureError } from "./errors.ts";

// Los buses viven en events/. `swarm/AgentBus.ts` y `swarm/EventBus.ts` eran
// copias que escribían a SQLite; se re-exportan desde acá para no romper a quien
// los importaba por el subpath ./swarm.
export type { AgentBusEventMap, AgentBusEventKey, AgentBusEventHandler, AgentBusMessage, AgentBus } from "../events/agent-bus.ts";
export { getUnreadMessagesForWorker, agentBus } from "../events/agent-bus.ts";

export type { EventMap, EventKey, EventHandler, TypedEventBus } from "../events/event-bus.ts";
export { eventBus } from "../events/event-bus.ts";

// Ejecución de tareas agendadas: `swarm/WorkerPool.ts` era una copia rezagada de
// scheduler/integration.ts (mismo archivo, 18 líneas de deriva).
export { setSchedulerForCleanup, notifyTaskCompletion, createTaskHandler } from "../scheduler/integration.ts";

export type { ExecutionStrategy } from "./strategies/index.ts";
export { ParallelStrategy, PriorityStrategy } from "./strategies/index.ts";

export { createHiveLearnGraph } from "./presets/index.ts";
export type { HiveLearnAgentIds, HiveLearnInput } from "./presets/index.ts";
export { createResearchGraph } from "./presets/index.ts";
export type { ResearchAgentIds } from "./presets/index.ts";

// ─── Enjambre por roles (orquestador/trabajadores) ───────────────────────────
export { runRoleSwarm, defaultInvoker } from "./RoleSwarm.ts";
export type {
  SwarmStrategy, RoleAgent, SwarmMessage, AgentInvoker,
  RoleSwarmOptions, RoleSwarmResult,
} from "./RoleSwarm.ts";
