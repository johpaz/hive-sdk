import { describe, test, expect, beforeEach } from "bun:test";
import { TaskNode, type TaskNodeConfig, type NodeStatus } from "../../src/dag/TaskNode";

describe("TaskNode", () => {
  let defaultConfig: TaskNodeConfig;

  beforeEach(() => {
    defaultConfig = {
      id: "node-1",
      agentId: "agent-1",
      name: "Test Node",
      taskDescription: "Test task description",
      deps: [],
      timeout: 60000,
      maxRetries: 3,
      priority: 5,
    };
  });

  describe("constructor", () => {
    test("should create node with default values", () => {
      const node = new TaskNode(defaultConfig);

      expect(node.id).toBe("node-1");
      expect(node.agentId).toBe("agent-1");
      expect(node.name).toBe("Test Node");
      expect(node.taskDescription).toBe("Test task description");
      expect(node.deps).toEqual([]);
      expect(node.status).toBe("PENDING");
      expect(node.retryCount).toBe(0);
      expect(node.result).toBeUndefined();
      expect(node.error).toBeUndefined();
    });

    test("should use default timeout when not provided", () => {
      const config: TaskNodeConfig = {
        id: "node-1",
        agentId: "agent-1",
        name: "Test",
        taskDescription: "Test",
        deps: [],
      };

      const node = new TaskNode(config);
      expect(node.timeout).toBe(120_000);
    });

    test("should use default maxRetries when not provided", () => {
      const config: TaskNodeConfig = {
        id: "node-1",
        agentId: "agent-1",
        name: "Test",
        taskDescription: "Test",
        deps: [],
      };

      const node = new TaskNode(config);
      expect(node.maxRetries).toBe(1);
    });

    test("should use default priority when not provided", () => {
      const config: TaskNodeConfig = {
        id: "node-1",
        agentId: "agent-1",
        name: "Test",
        taskDescription: "Test",
        deps: [],
      };

      const node = new TaskNode(config);
      expect(node.priority).toBe(0);
    });

    test("should accept custom timeout", () => {
      const config: TaskNodeConfig = {
        ...defaultConfig,
        timeout: 30000,
      };

      const node = new TaskNode(config);
      expect(node.timeout).toBe(30000);
    });

    test("should accept custom maxRetries", () => {
      const config: TaskNodeConfig = {
        ...defaultConfig,
        maxRetries: 5,
      };

      const node = new TaskNode(config);
      expect(node.maxRetries).toBe(5);
    });

    test("should accept custom priority", () => {
      const config: TaskNodeConfig = {
        ...defaultConfig,
        priority: 10,
      };

      const node = new TaskNode(config);
      expect(node.priority).toBe(10);
    });

    test("should accept metadata", () => {
      const config: TaskNodeConfig = {
        ...defaultConfig,
        metadata: { key: "value", count: 42 },
      };

      const node = new TaskNode(config);
      expect(node.metadata).toEqual({ key: "value", count: 42 });
    });
  });

  describe("status transitions", () => {
    test("should start in PENDING state", () => {
      const node = new TaskNode(defaultConfig);
      expect(node.status).toBe("PENDING");
    });

    test("should transition to READY", () => {
      const node = new TaskNode(defaultConfig);
      node.markReady();
      expect(node.status).toBe("READY");
    });

    test("should transition to RUNNING", () => {
      const node = new TaskNode(defaultConfig);
      node.markRunning();
      expect(node.status).toBe("RUNNING");
      expect(node.startedAt).toBeDefined();
    });

    test("should transition to COMPLETED", () => {
      const node = new TaskNode(defaultConfig);
      node.markRunning();
      node.markCompleted("task result");
      expect(node.status).toBe("COMPLETED");
      expect(node.result).toBe("task result");
      expect(node.completedAt).toBeDefined();
    });

    test("should transition to FAILED", () => {
      const node = new TaskNode(defaultConfig);
      node.markRunning();
      node.markFailed("error message");
      expect(node.status).toBe("FAILED");
      expect(node.error).toBe("error message");
      expect(node.completedAt).toBeDefined();
    });
  });

  describe("canStart", () => {
    test("should return true when no deps and empty completed set", () => {
      const node = new TaskNode(defaultConfig);
      const completedIds = new Set<string>();
      expect(node.canStart(completedIds)).toBe(true);
    });

    test("should return true when all deps are in completed set", () => {
      const config: TaskNodeConfig = {
        ...defaultConfig,
        deps: ["dep-1", "dep-2"],
      };
      const node = new TaskNode(config);
      const completedIds = new Set(["dep-1", "dep-2"]);
      expect(node.canStart(completedIds)).toBe(true);
    });

    test("should return false when some deps are not completed", () => {
      const config: TaskNodeConfig = {
        ...defaultConfig,
        deps: ["dep-1", "dep-2"],
      };
      const node = new TaskNode(config);
      const completedIds = new Set(["dep-1"]);
      expect(node.canStart(completedIds)).toBe(false);
    });

    test("should return false when no deps are completed", () => {
      const config: TaskNodeConfig = {
        ...defaultConfig,
        deps: ["dep-1", "dep-2"],
      };
      const node = new TaskNode(config);
      const completedIds = new Set<string>();
      expect(node.canStart(completedIds)).toBe(false);
    });
  });

  describe("canRetry", () => {
    test("should return true when retryCount is less than maxRetries", () => {
      const node = new TaskNode({ ...defaultConfig, maxRetries: 3 });
      node.retryCount = 2;
      expect(node.canRetry()).toBe(true);
    });

    test("should return true when retryCount equals maxRetries - 1", () => {
      const node = new TaskNode({ ...defaultConfig, maxRetries: 3 });
      node.retryCount = 2;
      expect(node.canRetry()).toBe(true);
    });

    test("should return false when retryCount equals maxRetries", () => {
      const node = new TaskNode({ ...defaultConfig, maxRetries: 3 });
      node.retryCount = 3;
      expect(node.canRetry()).toBe(false);
    });

    test("should return false when retryCount exceeds maxRetries", () => {
      const node = new TaskNode({ ...defaultConfig, maxRetries: 3 });
      node.retryCount = 5;
      expect(node.canRetry()).toBe(false);
    });

    test("should return false when maxRetries is 0", () => {
      const node = new TaskNode({ ...defaultConfig, maxRetries: 0 });
      node.retryCount = 0;
      expect(node.canRetry()).toBe(false);
    });
  });

  describe("elapsedSeconds", () => {
    test("should return 0 when not started", () => {
      const node = new TaskNode(defaultConfig);
      expect(node.elapsedSeconds()).toBe(0);
    });

    test("should return elapsed time in seconds when running", () => {
      const node = new TaskNode(defaultConfig);
      node.markRunning();
      const elapsed = node.elapsedSeconds();
      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThanOrEqual(1);
    });

    test("should return total duration when completed", () => {
      const node = new TaskNode(defaultConfig);
      node.markRunning();
      const startedAt = node.startedAt!;
      
      // Simulate time passing by manually setting startedAt to 5 seconds ago
      node.startedAt = Date.now() - 5000;
      node.completedAt = Date.now();
      
      const elapsed = node.elapsedSeconds();
      expect(elapsed).toBeGreaterThanOrEqual(4);
      expect(elapsed).toBeLessThanOrEqual(6);
    });

    test("should return total duration when failed", () => {
      const node = new TaskNode(defaultConfig);
      node.markRunning();
      node.startedAt = Date.now() - 3000;
      node.completedAt = Date.now();
      node.markFailed("error");
      
      const elapsed = node.elapsedSeconds();
      expect(elapsed).toBeGreaterThanOrEqual(2);
      expect(elapsed).toBeLessThanOrEqual(4);
    });
  });
});