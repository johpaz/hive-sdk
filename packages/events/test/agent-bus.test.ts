import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// Mock the getDb to avoid needing real DB in unit tests
const mockGetDb = {
  query: () => ({
    run: () => ({ lastInsertRowId: 1 }),
    all: () => [],
    get: () => null,
  }),
};

const mockLogger = {
  child: () => mockLogger,
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
};

// Mock dependencies before importing
mock.module("@hive-sdk/storage/sqlite", () => ({
  getDb: () => mockGetDb,
}));

mock.module("@hive-sdk/utils/logger", () => ({
  logger: mockLogger,
}));

// Now import the module under test
import { 
  agentBus, 
  type AgentBusEventKey,
  type AgentBusEventHandler,
  getUnreadMessagesForWorker,
  getProjectMessageHistory,
} from "../src/agent-bus";

describe("AgentBus", () => {
  let receivedEvents: Array<{ event: string; data: any }>;

  beforeEach(() => {
    receivedEvents = [];
    agentBus.removeAllListeners();
  });

  afterEach(() => {
    agentBus.removeAllListeners();
  });

  describe("publish/subscribe", () => {
    test("should receive published event", () => {
      const handler: AgentBusEventHandler<"worker:task_started"> = (data) => {
        receivedEvents.push({ event: "worker:task_started", data });
      };

      agentBus.subscribe("worker:task_started", handler);

      agentBus.publish("worker:task_started", {
        workerId: "worker-1",
        workerName: "Worker 1",
        taskId: 1,
        taskName: "Task 1",
        projectId: "project-1",
        timestamp: Date.now(),
      });

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].data.workerId).toBe("worker-1");
    });

    test("should receive multiple events of same type", () => {
      const handler: AgentBusEventHandler<"worker:task_started"> = (data) => {
        receivedEvents.push({ event: "worker:task_started", data });
      };

      agentBus.subscribe("worker:task_started", handler);

      agentBus.publish("worker:task_started", {
        workerId: "worker-1",
        workerName: "Worker 1",
        taskId: 1,
        taskName: "Task 1",
        projectId: "project-1",
        timestamp: Date.now(),
      });

      agentBus.publish("worker:task_started", {
        workerId: "worker-2",
        workerName: "Worker 2",
        taskId: 2,
        taskName: "Task 2",
        projectId: "project-1",
        timestamp: Date.now(),
      });

      expect(receivedEvents.length).toBe(2);
    });

    test("should not receive unsubscribed events", () => {
      const handler: AgentBusEventHandler<"worker:task_started"> = (data) => {
        receivedEvents.push({ event: "worker:task_started", data });
      };

      agentBus.subscribe("worker:task_started", handler);
      agentBus.unsubscribe("worker:task_started", handler);

      agentBus.publish("worker:task_started", {
        workerId: "worker-1",
        workerName: "Worker 1",
        taskId: 1,
        taskName: "Task 1",
        projectId: "project-1",
        timestamp: Date.now(),
      });

      expect(receivedEvents.length).toBe(0);
    });

    test("should receive events from different event types", () => {
      const taskStartedHandler: AgentBusEventHandler<"worker:task_started"> = (data) => {
        receivedEvents.push({ event: "worker:task_started", data });
      };

      const taskCompletedHandler: AgentBusEventHandler<"worker:task_completed"> = (data) => {
        receivedEvents.push({ event: "worker:task_completed", data });
      };

      agentBus.subscribe("worker:task_started", taskStartedHandler);
      agentBus.subscribe("worker:task_completed", taskCompletedHandler);

      agentBus.publish("worker:task_started", {
        workerId: "worker-1",
        workerName: "Worker 1",
        taskId: 1,
        taskName: "Task 1",
        projectId: "project-1",
        timestamp: Date.now(),
      });

      agentBus.publish("worker:task_completed", {
        workerId: "worker-1",
        workerName: "Worker 1",
        taskId: 1,
        taskName: "Task 1",
        projectId: "project-1",
        result: "completed",
        timestamp: Date.now(),
      });

      expect(receivedEvents.length).toBe(2);
    });
  });

  describe("subscribeOnce", () => {
    test("should only receive event once", () => {
      const handler: AgentBusEventHandler<"worker:task_started"> = (data) => {
        receivedEvents.push({ event: "worker:task_started", data });
      };

      agentBus.subscribeOnce("worker:task_started", handler);

      agentBus.publish("worker:task_started", {
        workerId: "worker-1",
        workerName: "Worker 1",
        taskId: 1,
        taskName: "Task 1",
        projectId: "project-1",
        timestamp: Date.now(),
      });

      agentBus.publish("worker:task_started", {
        workerId: "worker-2",
        workerName: "Worker 2",
        taskId: 2,
        taskName: "Task 2",
        projectId: "project-1",
        timestamp: Date.now(),
      });

      expect(receivedEvents.length).toBe(1);
    });
  });

  describe("helper methods", () => {
    test("notifyTaskStarted should publish correct event", () => {
      const handler: AgentBusEventHandler<"worker:task_started"> = (data) => {
        receivedEvents.push({ event: "worker:task_started", data });
      };

      agentBus.subscribe("worker:task_started", handler);

      agentBus.notifyTaskStarted("worker-1", "Worker 1", 1, "Task 1", "project-1");

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].data.workerId).toBe("worker-1");
      expect(receivedEvents[0].data.workerName).toBe("Worker 1");
      expect(receivedEvents[0].data.taskId).toBe(1);
      expect(receivedEvents[0].data.taskName).toBe("Task 1");
      expect(receivedEvents[0].data.projectId).toBe("project-1");
    });

    test("notifyTaskCompleted should publish correct event", () => {
      const handler: AgentBusEventHandler<"worker:task_completed"> = (data) => {
        receivedEvents.push({ event: "worker:task_completed", data });
      };

      agentBus.subscribe("worker:task_completed", handler);

      agentBus.notifyTaskCompleted("worker-1", "Worker 1", 1, "Task 1", "project-1", "result data");

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].data.workerId).toBe("worker-1");
      expect(receivedEvents[0].data.result).toBe("result data");
    });

    test("notifyTaskFailed should publish correct event", () => {
      const handler: AgentBusEventHandler<"worker:task_failed"> = (data) => {
        receivedEvents.push({ event: "worker:task_failed", data });
      };

      agentBus.subscribe("worker:task_failed", handler);

      agentBus.notifyTaskFailed("worker-1", "Worker 1", 1, "Task 1", "project-1", "error message");

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].data.workerId).toBe("worker-1");
      expect(receivedEvents[0].data.error).toBe("error message");
    });

    test("sendMessage should publish message:custom event", () => {
      const handler: AgentBusEventHandler<"message:custom"> = (data) => {
        receivedEvents.push({ event: "message:custom", data });
      };

      agentBus.subscribe("message:custom", handler);

      agentBus.sendMessage("worker-1", "Worker 1", "Hello world", {
        toWorkerId: "worker-2",
        topic: "greeting",
      });

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].data.fromWorkerId).toBe("worker-1");
      expect(receivedEvents[0].data.content).toBe("Hello world");
      expect(receivedEvents[0].data.toWorkerId).toBe("worker-2");
      expect(receivedEvents[0].data.topic).toBe("greeting");
    });

    test("requestHelp should publish worker:help_request event", () => {
      const handler: AgentBusEventHandler<"worker:help_request"> = (data) => {
        receivedEvents.push({ event: "worker:help_request", data });
      };

      agentBus.subscribe("worker:help_request", handler);

      agentBus.requestHelp("worker-1", "Worker 1", 1, "Need help with task", "coding");

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].data.fromWorkerId).toBe("worker-1");
      expect(receivedEvents[0].data.request).toBe("Need help with task");
      expect(receivedEvents[0].data.requiredSkill).toBe("coding");
    });

    test("respondToHelp should publish worker:help_response event", () => {
      const handler: AgentBusEventHandler<"worker:help_response"> = (data) => {
        receivedEvents.push({ event: "worker:help_response", data });
      };

      agentBus.subscribe("worker:help_response", handler);

      agentBus.respondToHelp("worker-1", "worker-2", "Worker 2", 1, "Here is the help");

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].data.toWorkerId).toBe("worker-1");
      expect(receivedEvents[0].data.fromWorkerId).toBe("worker-2");
      expect(receivedEvents[0].data.response).toBe("Here is the help");
    });
  });

  describe("listenerCount", () => {
    test("should return correct count for event", () => {
      const handler1: AgentBusEventHandler<"worker:task_started"> = () => {};
      const handler2: AgentBusEventHandler<"worker:task_started"> = () => {};

      agentBus.subscribe("worker:task_started", handler1);
      agentBus.subscribe("worker:task_started", handler2);

      expect(agentBus.listenerCount("worker:task_started")).toBe(2);
    });

    test("should return 0 for event with no listeners", () => {
      expect(agentBus.listenerCount("worker:task_started")).toBe(0);
    });
  });

  describe("removeAllListeners", () => {
    test("should remove all listeners for specific event", () => {
      const handler1: AgentBusEventHandler<"worker:task_started"> = () => {};
      const handler2: AgentBusEventHandler<"worker:task_started"> = () => {};

      agentBus.subscribe("worker:task_started", handler1);
      agentBus.subscribe("worker:task_started", handler2);

      agentBus.removeAllListeners("worker:task_started");

      expect(agentBus.listenerCount("worker:task_started")).toBe(0);
    });

    test("should remove all listeners when no event specified", () => {
      const handler1: AgentBusEventHandler<"worker:task_started"> = () => {};
      const handler2: AgentBusEventHandler<"worker:task_completed"> = () => {};

      agentBus.subscribe("worker:task_started", handler1);
      agentBus.subscribe("worker:task_completed", handler2);

      agentBus.removeAllListeners();

      expect(agentBus.listenerCount("worker:task_started")).toBe(0);
      expect(agentBus.listenerCount("worker:task_completed")).toBe(0);
    });
  });

  describe("event enrichment", () => {
    test("should add eventId and timestamp to published events", () => {
      const handler: AgentBusEventHandler<"worker:task_started"> = (data: any) => {
        receivedEvents.push(data);
      };

      agentBus.subscribe("worker:task_started", handler);

      agentBus.publish("worker:task_started", {
        workerId: "worker-1",
        workerName: "Worker 1",
        taskId: 1,
        taskName: "Task 1",
        projectId: "project-1",
        timestamp: Date.now(),
      });

      expect((receivedEvents[0] as any)._eventId).toBeDefined();
      expect((receivedEvents[0] as any)._timestamp).toBeDefined();
      expect((receivedEvents[0] as any)._event).toBe("worker:task_started");
    });
  });
});