import { describe, test, expect, beforeEach } from "bun:test";
import { TaskGraph } from "../../src/dag/TaskGraph";
import { TaskNode, type TaskNodeConfig } from "../../src/dag/TaskNode";
import { CyclicDependencyError } from "../../src/dag/errors";

describe("TaskGraph", () => {
  describe("constructor", () => {
    test("should create graph with nodes from configs", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
      ];

      const graph = new TaskGraph(configs);

      expect(graph.nodes.size).toBe(2);
      expect(graph.nodes.has("a")).toBe(true);
      expect(graph.nodes.has("b")).toBe(true);
    });

    test("should set all nodes to PENDING initially", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
      ];

      const graph = new TaskGraph(configs);
      const node = graph.nodes.get("a")!;
      expect(node.status).toBe("PENDING");
    });
  });

  describe("cyclic dependency validation", () => {
    test("should throw CyclicDependencyError for direct cycle", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: ["b"] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["a"] },
      ];

      expect(() => new TaskGraph(configs)).toThrow(CyclicDependencyError);
    });

    test("should throw CyclicDependencyError for indirect cycle", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: ["b"] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["c"] },
        { id: "c", agentId: "agent-3", name: "Node C", taskDescription: "Task C", deps: ["a"] },
      ];

      expect(() => new TaskGraph(configs)).toThrow(CyclicDependencyError);
    });

    test("should throw error for unknown dependency", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: ["unknown"] },
      ];

      expect(() => new TaskGraph(configs)).toThrow(/unknown node/);
    });

    test("should allow valid DAG with sequential deps", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["a"] },
        { id: "c", agentId: "agent-3", name: "Node C", taskDescription: "Task C", deps: ["b"] },
      ];

      const graph = new TaskGraph(configs);
      expect(graph.nodes.size).toBe(3);
    });

    test("should allow valid DAG with parallel branches", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
        { id: "c", agentId: "agent-3", name: "Node C", taskDescription: "Task C", deps: ["a", "b"] },
      ];

      const graph = new TaskGraph(configs);
      expect(graph.nodes.size).toBe(3);
    });
  });

  describe("getCriticalPath", () => {
    test("should return single node for single node graph", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
      ];

      const graph = new TaskGraph(configs);
      expect(graph.getCriticalPath()).toEqual(["a"]);
    });

    test("should return correct path for sequential chain", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["a"] },
        { id: "c", agentId: "agent-3", name: "Node C", taskDescription: "Task C", deps: ["b"] },
      ];

      const graph = new TaskGraph(configs);
      expect(graph.getCriticalPath()).toEqual(["a", "b", "c"]);
    });

    test("should return longest path for branching DAG", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["a"] },
        { id: "c", agentId: "agent-3", name: "Node C", taskDescription: "Task C", deps: ["a"] },
        { id: "d", agentId: "agent-4", name: "Node D", taskDescription: "Task D", deps: ["b", "c"] },
      ];

      const graph = new TaskGraph(configs);
      // Both a->b->d and a->c->d have same length, but either is valid
      const path = graph.getCriticalPath();
      expect(path).toContain("d");
      expect(path[0]).toBe("a");
    });

    test("should return cached path on subsequent calls", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["a"] },
      ];

      const graph = new TaskGraph(configs);
      const path1 = graph.getCriticalPath();
      const path2 = graph.getCriticalPath();

      expect(path1).toBe(path2);
    });
  });

  describe("getNewlyReadyNodes", () => {
    test("should return nodes with all deps in completed set", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["a"] },
      ];

      const graph = new TaskGraph(configs);
      
      // In practice, DAGScheduler calls this with IDs of completed nodes
      const completedIds = new Set(["a"]);
      const readyNodes = graph.getNewlyReadyNodes(completedIds);

      // Node b has dep on a, and a is in completedIds, so b should be ready
      // (Note: node a also returns because it has no deps - this is expected)
      expect(readyNodes.length).toBeGreaterThanOrEqual(1);
      expect(readyNodes.find(n => n.id === "b")).toBeDefined();
    });

    test("should not return already ready nodes", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["a"] },
      ];

      const graph = new TaskGraph(configs);
      // Mark b as already READY
      graph.nodes.get("b")!.markReady();

      const completedIds = new Set(["a"]);
      const readyNodes = graph.getNewlyReadyNodes(completedIds);

      // b is already READY so it won't be returned (only PENDING nodes return)
      // a returns because it has no deps and is PENDING
      expect(readyNodes.length).toBe(1);
      expect(readyNodes[0].id).toBe("a");
    });

    test("should not return nodes with incomplete deps", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["a"] },
        { id: "c", agentId: "agent-3", name: "Node C", taskDescription: "Task C", deps: ["a", "b"] },
      ];

      const graph = new TaskGraph(configs);
      
      const completedIds = new Set(["a"]);
      const readyNodes = graph.getNewlyReadyNodes(completedIds);

      // c depends on both a and b, but b is not in completedIds
      // So c should NOT be in the result
      expect(readyNodes.find(n => n.id === "c")).toBeUndefined();
    });
  });

  describe("getReadyNodes", () => {
    test("should return empty array when no nodes are ready", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
      ];

      const graph = new TaskGraph(configs);
      expect(graph.getReadyNodes()).toEqual([]);
    });

    test("should return only READY nodes", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
      ];

      const graph = new TaskGraph(configs);
      graph.nodes.get("a")!.markReady();

      const readyNodes = graph.getReadyNodes();
      expect(readyNodes.length).toBe(1);
      expect(readyNodes[0].id).toBe("a");
    });
  });

  describe("getCompletedIds", () => {
    test("should return empty set when no nodes completed", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
      ];

      const graph = new TaskGraph(configs);
      expect(graph.getCompletedIds()).toEqual(new Set());
    });

    test("should return ids of completed nodes", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
      ];

      const graph = new TaskGraph(configs);
      graph.nodes.get("a")!.markCompleted("result");

      const completedIds = graph.getCompletedIds();
      expect(completedIds).toEqual(new Set(["a"]));
    });
  });

  describe("getDepResults", () => {
    test("should return empty object for node without deps", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
      ];

      const graph = new TaskGraph(configs);
      expect(graph.getDepResults("a")).toEqual({});
    });

    test("should return results of completed dependencies", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["a"] },
      ];

      const graph = new TaskGraph(configs);
      graph.nodes.get("a")!.markCompleted("result A");

      const results = graph.getDepResults("b");
      expect(results).toEqual({ a: "result A" });
    });

    test("should only include completed dep results", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["a"] },
        { id: "c", agentId: "agent-3", name: "Node C", taskDescription: "Task C", deps: ["a", "b"] },
      ];

      const graph = new TaskGraph(configs);
      graph.nodes.get("a")!.markCompleted("result A");
      // b is still pending

      const results = graph.getDepResults("c");
      expect(results).toEqual({ a: "result A" });
    });
  });

  describe("getProgress", () => {
    test("should return 100 for empty graph", () => {
      const graph = new TaskGraph([]);
      expect(graph.getProgress()).toBe(100);
    });

    test("should return 0 when no nodes are complete", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
      ];

      const graph = new TaskGraph(configs);
      expect(graph.getProgress()).toBe(0);
    });

    test("should return correct percentage", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
      ];

      const graph = new TaskGraph(configs);
      graph.nodes.get("a")!.markCompleted("result");

      expect(graph.getProgress()).toBe(50);
    });

    test("should count failed nodes as done", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
      ];

      const graph = new TaskGraph(configs);
      graph.nodes.get("a")!.markFailed("error");

      expect(graph.getProgress()).toBe(50);
    });
  });

  describe("isComplete", () => {
    test("should return true for empty graph", () => {
      const graph = new TaskGraph([]);
      expect(graph.isComplete()).toBe(true);
    });

    test("should return false when any node is pending", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
      ];

      const graph = new TaskGraph(configs);
      graph.nodes.get("a")!.markCompleted("result");

      expect(graph.isComplete()).toBe(false);
    });

    test("should return true when all nodes are completed", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
      ];

      const graph = new TaskGraph(configs);
      graph.nodes.get("a")!.markCompleted("result");
      graph.nodes.get("b")!.markCompleted("result");

      expect(graph.isComplete()).toBe(true);
    });

    test("should return true when all nodes are failed", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
      ];

      const graph = new TaskGraph(configs);
      graph.nodes.get("a")!.markFailed("error");
      graph.nodes.get("b")!.markFailed("error");

      expect(graph.isComplete()).toBe(true);
    });

    test("should return false when node is running", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
      ];

      const graph = new TaskGraph(configs);
      graph.nodes.get("a")!.markRunning();

      expect(graph.isComplete()).toBe(false);
    });
  });

  describe("propagateFailure", () => {
    test("should mark dependent nodes as failed", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["a"] },
      ];

      const graph = new TaskGraph(configs);
      graph.nodes.get("a")!.markFailed("error");

      graph.propagateFailure("a", "dependency failed");

      expect(graph.nodes.get("b")!.status).toBe("FAILED");
      expect(graph.nodes.get("b")!.error).toBe("dependency_failed: dependency failed");
    });

    test("should propagate failure transitively", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["a"] },
        { id: "c", agentId: "agent-3", name: "Node C", taskDescription: "Task C", deps: ["b"] },
      ];

      const graph = new TaskGraph(configs);
      graph.nodes.get("a")!.markFailed("error");

      graph.propagateFailure("a", "dependency failed");

      expect(graph.nodes.get("b")!.status).toBe("FAILED");
      expect(graph.nodes.get("c")!.status).toBe("FAILED");
    });

    test("should not affect nodes without dependencies on failed node", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: [] },
      ];

      const graph = new TaskGraph(configs);
      graph.nodes.get("a")!.markFailed("error");

      graph.propagateFailure("a", "dependency failed");

      expect(graph.nodes.get("b")!.status).toBe("PENDING");
    });

    test("should not re-mark already completed nodes", () => {
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-1", name: "Node A", taskDescription: "Task A", deps: [] },
        { id: "b", agentId: "agent-2", name: "Node B", taskDescription: "Task B", deps: ["a"] },
      ];

      const graph = new TaskGraph(configs);
      graph.nodes.get("a")!.markFailed("error");
      graph.nodes.get("b")!.markCompleted("result");

      graph.propagateFailure("a", "dependency failed");

      expect(graph.nodes.get("b")!.status).toBe("COMPLETED");
      expect(graph.nodes.get("b")!.result).toBe("result");
    });
  });
});