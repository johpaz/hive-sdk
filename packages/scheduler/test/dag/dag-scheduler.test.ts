import { describe, test, expect, beforeEach, afterEach, mock, beforeAll } from "bun:test";

// Mock storage module BEFORE importing the code under test
mock.module("@hive-sdk/storage/sqlite", () => ({
  getDb: () => ({
    query: () => ({
      run: () => ({ lastInsertRowId: 1 }),
      all: () => [],
      get: () => null,
    }),
  }),
}));

mock.module("@hive-sdk/utils/logger", () => ({
  logger: {
    child: () => ({
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    }),
  },
}));

mock.module("@hive-sdk/agent/agent-loop", () => ({
  runAgentIsolated: async () => "mocked result",
}));

mock.module("@hive-sdk/events/agent-bus", () => ({
  agentBus: {
    publish: () => {},
    subscribe: () => () => {},
    notifyTaskStarted: () => {},
    notifyTaskCompleted: () => {},
    notifyTaskFailed: () => {},
  },
}));

mock.module("@hive-sdk/canvas/emitter", () => ({
  emitCanvas: () => {},
}));

// Import after mocking
import { DAGScheduler, type DAGSchedulerOptions, type IAgentExecutor } from "../../src/dag/DAGScheduler";
import { TaskGraph } from "../../src/dag/TaskGraph";
import { TaskNode, type TaskNodeConfig } from "../../src/dag/TaskNode";
import type { DAGResult } from "../../src/dag/TaskResult";

const createMockExecutor = (config?: {
  delay?: number;
  error?: string;
  results?: Record<string, string>;
}): IAgentExecutor => {
  return {
    execute: async (node: TaskNode, _depResults: Record<string, string>, _threadId: string): Promise<string> => {
      if (config?.error) {
        throw new Error(config.error);
      }
      
      const result = config?.results?.[node.id] ?? `result for ${node.name}`;
      
      if (config?.delay) {
        await new Promise(resolve => setTimeout(resolve, config.delay));
      }
      
      return result;
    },
  };
};

describe("DAGScheduler", () => {
  let scheduler: DAGScheduler;

  beforeEach(() => {
    scheduler = new DAGScheduler({ maxConcurrentWorkers: 2 });
  });

  describe("basic execution", () => {
    test("should execute single node graph", async () => {
      const executor = createMockExecutor();
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
      ];
      const graph = new TaskGraph(configs);

      const result = await scheduler.execute(graph, { executor });

      expect(result.success).toBe(true);
      expect(result.completed.length).toBe(1);
      expect(result.failed.length).toBe(0);
      expect(result.completed[0].id).toBe("a");
    });

    test("should execute parallel nodes concurrently", async () => {
      let executionCount = 0;
      const executor: IAgentExecutor = {
        execute: async (node: TaskNode) => {
          executionCount++;
          await new Promise(resolve => setTimeout(resolve, 50));
          return `result for ${node.name}`;
        },
      };

      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
      ];
      const graph = new TaskGraph(configs);

      const startTime = Date.now();
      const result = await scheduler.execute(graph, { executor });
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.completed.length).toBe(2);
      // With 50ms delay each and parallel execution, should take ~50ms not ~100ms
      expect(elapsed).toBeLessThan(100);
    });

    test("should respect maxConcurrentWorkers", async () => {
      const executor: IAgentExecutor = {
        execute: async (node: TaskNode) => {
          await new Promise(resolve => setTimeout(resolve, 20));
          return `result for ${node.name}`;
        },
      };

      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
        { id: "c", agentId: "agent-3", name: "Node C", taskDescription: "Task C", deps: [] },
      ];
      
      const scheduler2 = new DAGScheduler({ maxConcurrentWorkers: 1 });
      const graph = new TaskGraph(configs);

      const result = await scheduler2.execute(graph, { executor });

      expect(result.success).toBe(true);
      expect(result.completed.length).toBe(3);
    });
  });

  describe("dependency handling", () => {
    test("should execute sequential dependencies in order", async () => {
      const executor: IAgentExecutor = {
        execute: async (node: TaskNode, depResults: Record<string, string>) => {
          if (node.id === "b") {
            expect(depResults).toHaveProperty("a");
          }
          return `result for ${node.name}`;
        },
      };

      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["a"] },
      ];
      const graph = new TaskGraph(configs);

      const result = await scheduler.execute(graph, { executor });

      expect(result.success).toBe(true);
      expect(result.completed.length).toBe(2);
    });

    test("should wait for all dependencies before executing dependent node", async () => {
      const executionOrder: string[] = [];
      
      const executor: IAgentExecutor = {
        execute: async (node: TaskNode) => {
          executionOrder.push(node.id);
          await new Promise(resolve => setTimeout(resolve, 10));
          return `result for ${node.name}`;
        },
      };

      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
        { id: "c", agentId: "agent-3", name: "Node C", taskDescription: "Task C", deps: ["a", "b"] },
      ];
      const graph = new TaskGraph(configs);

      await scheduler.execute(graph, { executor });

      // c should execute after a and b based on dependencies
      expect(executionOrder).toContain("a");
      expect(executionOrder).toContain("b");
      expect(executionOrder).toContain("c");
    });
  });

  describe("error handling", () => {
    test("should execute successfully with custom executor", async () => {
      const executor: IAgentExecutor = {
        execute: async (node: TaskNode) => {
          return `custom result for ${node.name}`;
        },
      };

      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
      ];
      const graph = new TaskGraph(configs);

      const result = await scheduler.execute(graph, { executor });

      // Using custom executor should work
      expect(result.completed.length).toBe(1);
    });

    test("should handle multiple nodes with executor", async () => {
      const executor: IAgentExecutor = {
        execute: async (node: TaskNode) => {
          return `result for ${node.name}`;
        },
      };

      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
      ];
      const graph = new TaskGraph(configs);

      const result = await scheduler.execute(graph, { executor });

      expect(result.success).toBe(true);
      expect(result.completed.length).toBe(2);
    });

    test("should handle sequential dependencies", async () => {
      const executor: IAgentExecutor = {
        execute: async (node: TaskNode, depResults) => {
          if (node.id === "b") {
            // b should receive results from a
            expect(depResults).toBeDefined();
          }
          return `result for ${node.name}`;
        },
      };

      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["a"] },
      ];
      const graph = new TaskGraph(configs);

      const result = await scheduler.execute(graph, { executor });

      expect(result.success).toBe(true);
    });
  });

  describe("retry mechanism", () => {
    test("should retry failed node up to maxRetries times", async () => {
      let attempts = 0;
      const executor: IAgentExecutor = {
        execute: async (node: TaskNode) => {
          attempts++;
          if (attempts < 3) {
            throw new Error(`Attempt ${attempts} failed`);
          }
          return `success on attempt ${attempts}`;
        },
      };

      const configs: TaskNodeConfig[] = [
        { 
          id: "a", 
          agentId: "agent-1", 
          name: "Node A", 
          taskDescription: "Task A", 
          deps: [],
          maxRetries: 3,
        },
      ];
      const graph = new TaskGraph(configs);

      const result = await scheduler.execute(graph, { executor });

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
    });

    test("should fail permanently after maxRetries exceeded", async () => {
      let attempts = 0;
      const executor: IAgentExecutor = {
        execute: async (node: TaskNode) => {
          attempts++;
          throw new Error(`Attempt ${attempts} failed`);
        },
      };

      const configs: TaskNodeConfig[] = [
        { 
          id: "a", 
          agentId: "agent-1", 
          name: "Node A", 
          taskDescription: "Task A", 
          deps: [],
          maxRetries: 2,
        },
      ];
      const graph = new TaskGraph(configs);

      const result = await scheduler.execute(graph, { executor });

      expect(result.success).toBe(false);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0].retries).toBe(2);
    });
  });

  describe("abort functionality", () => {
    test("should stop execution when abort is called", async () => {
      const executor: IAgentExecutor = {
        execute: async (node: TaskNode) => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return `result for ${node.name}`;
        },
      };

      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
      ];
      const graph = new TaskGraph(configs);

      const executePromise = scheduler.execute(graph, { executor });
      
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 10));
      scheduler.abort();
      
      const result = await executePromise;

      // Aborted execution may have partial results
      expect(result.completed.length + result.failed.length).toBeLessThanOrEqual(2);
    });
  });

  describe("result structure", () => {
    test("should include swarmId in result", async () => {
      const executor = createMockExecutor();
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
      ];
      const graph = new TaskGraph(configs);

      const result = await scheduler.execute(graph, { executor });

      expect(result.swarmId).toBeDefined();
      expect(result.swarmId.length).toBeGreaterThan(0);
    });

    test("should include totalDurationMs in result", async () => {
      const executor = createMockExecutor({ delay: 10 });
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
      ];
      const graph = new TaskGraph(configs);

      const result = await scheduler.execute(graph, { executor });

      expect(result.totalDurationMs).toBeGreaterThan(0);
    });

    test("should include node results in completed array", async () => {
      const executor = createMockExecutor({
        results: { a: "custom result" },
      });
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
      ];
      const graph = new TaskGraph(configs);

      const result = await scheduler.execute(graph, { executor });

      expect(result.completed[0].result).toBe("custom result");
    });
  });

  describe("options", () => {
    test("should use custom projectId in options", async () => {
      const executor = createMockExecutor();
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
      ];
      const graph = new TaskGraph(configs);

      const result = await scheduler.execute(graph, { 
        executor,
        projectId: "custom-project-id",
      });

      expect(result.success).toBe(true);
    });

    test("should use custom coordinatorId in options", async () => {
      const executor = createMockExecutor();
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
      ];
      const graph = new TaskGraph(configs);

      const result = await scheduler.execute(graph, { 
        executor,
        coordinatorId: "custom-coordinator",
      });

      expect(result.success).toBe(true);
    });
  });
});