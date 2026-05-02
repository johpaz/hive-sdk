import { describe, test, expect, beforeEach } from "bun:test";
import { ParallelStrategy, type ExecutionStrategy } from "../../src/dag/strategies/ParallelStrategy";
import { PriorityStrategy } from "../../src/dag/strategies/PriorityStrategy";
import { TaskNode, type TaskNodeConfig } from "../../src/dag/TaskNode";

const createNode = (id: string, priority: number = 0): TaskNode => {
  return new TaskNode({
    id,
    agentId: `agent-${id}`,
    name: `Node ${id}`,
    taskDescription: `Task ${id}`,
    deps: [],
    priority,
  });
};

describe("ParallelStrategy", () => {
  let strategy: ExecutionStrategy;

  beforeEach(() => {
    strategy = new ParallelStrategy();
  });

  describe("pick", () => {
    test("should return first node from queue (FIFO)", () => {
      const queue = [createNode("a"), createNode("b"), createNode("c")];

      const picked = strategy.pick(queue);

      expect(picked?.id).toBe("a");
      expect(queue.length).toBe(2);
    });

    test("should return undefined for empty queue", () => {
      const queue: TaskNode[] = [];

      const picked = strategy.pick(queue);

      expect(picked).toBeUndefined();
    });

    test("should remove picked node from queue", () => {
      const queue = [createNode("a"), createNode("b")];

      strategy.pick(queue);

      expect(queue.find(n => n.id === "a")).toBeUndefined();
      expect(queue.length).toBe(1);
    });
  });
});

describe("PriorityStrategy", () => {
  let strategy: PriorityStrategy;

  describe("initialize", () => {
    test("should initialize without throwing for nodes with deps", () => {
      strategy = new PriorityStrategy();

      const nodes = new Map<string, TaskNode>();
      nodes.set("a", createNode("a", 0));
      nodes.set("b", createNode("b", 0));
      nodes.set("c", createNode("c", 0));

      // Should not throw - initialize computes critical path
      expect(() => strategy.initialize(nodes)).not.toThrow();
    });

    test("should handle sequential chain for critical path", () => {
      strategy = new PriorityStrategy();

      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-a", name: "A", taskDescription: "A", deps: [] },
        { id: "b", agentId: "agent-b", name: "B", taskDescription: "B", deps: ["a"] },
        { id: "c", agentId: "agent-c", name: "C", taskDescription: "C", deps: ["b"] },
      ];

      const nodes = new Map(configs.map(c => [c.id, new TaskNode(c)]));
      
      // Should not throw
      expect(() => strategy.initialize(nodes)).not.toThrow();
    });
  });

  describe("pick", () => {
    test("should return defined node from non-empty queue", () => {
      strategy = new PriorityStrategy();

      const nodes = new Map<string, TaskNode>();
      nodes.set("a", createNode("a", 5));
      
      strategy.initialize(nodes);

      const queue = [nodes.get("a")!];
      const picked = strategy.pick(queue);

      expect(picked).toBeDefined();
      expect(picked?.id).toBe("a");
    });

    test("should return undefined for empty queue", () => {
      strategy = new PriorityStrategy();

      const picked = strategy.pick([]);

      expect(picked).toBeUndefined();
    });

    test("should modify queue by removing picked node", () => {
      strategy = new PriorityStrategy();

      const nodes = new Map<string, TaskNode>();
      nodes.set("a", createNode("a", 1));
      nodes.set("b", createNode("b", 2));

      strategy.initialize(nodes);

      const queue = [nodes.get("a")!, nodes.get("b")!];
      strategy.pick(queue);

      // After pick, queue should have one less item
      expect(queue.length).toBe(1);
    });

    test("should sort nodes by effective priority", () => {
      strategy = new PriorityStrategy();

      // Nodes with explicit deps to establish a critical path
      const configs: TaskNodeConfig[] = [
        { id: "a", agentId: "agent-a", name: "A", taskDescription: "A", deps: [], priority: 1 },
        { id: "b", agentId: "agent-b", name: "B", taskDescription: "B", deps: ["a"], priority: 5 },
      ];

      const nodes = new Map(configs.map(c => [c.id, new TaskNode(c)]));
      strategy.initialize(nodes);

      // Both nodes on critical path get boost, b has higher priority
      const queue = [nodes.get("a")!, nodes.get("b")!];
      const picked = strategy.pick(queue);

      // b should be picked due to higher priority
      expect(picked?.id).toBe("b");
    });
  });
});