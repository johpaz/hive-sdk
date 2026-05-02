/**
 * Load Test: Multiple Swarms Concurrent Execution
 * 
 * Tests the system's ability to handle multiple swarm executions simultaneously.
 * Uses Bun's concurrent test execution for load simulation.
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock dependencies
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

mock.module("@hive-sdk/agent/agent-loop", () => ({
  runAgentIsolated: async () => "load-test-result",
}));

import { DAGScheduler, type IAgentExecutor } from "../../packages/scheduler/src/dag/DAGScheduler";
import { TaskGraph } from "../../packages/scheduler/src/dag/TaskGraph";
import { TaskNode, type TaskNodeConfig } from "../../packages/scheduler/src/dag/TaskNode";
import type { DAGResult } from "../../packages/scheduler/src/dag/TaskResult";

// Mock executor for load testing - simulates realistic worker behavior
const createLoadTestExecutor = (delayMs: number = 10): IAgentExecutor => ({
  execute: async (node: TaskNode, _depResults: Record<string, string>, _threadId: string): Promise<string> => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return `load-test-result-${node.id}`;
  },
});

interface SwarmMetrics {
  swarmId: string;
  durationMs: number;
  nodesCompleted: number;
  nodesFailed: number;
  success: boolean;
}

describe("Load Test: Multiple Concurrent Swarms", () => {
  const CONCURRENT_SWARMS = 5;
  const NODES_PER_SWARM = 4;

  test.concurrent("should execute 5 swarms concurrently with 4 nodes each", async () => {
    const scheduler = new DAGScheduler({ maxConcurrentWorkers: 4 });
    
    const createSwarmGraph = (swarmId: number): TaskGraph => {
      const configs: TaskNodeConfig[] = [];
      
      // Create parallel nodes (no deps)
      for (let i = 0; i < NODES_PER_SWARM - 1; i++) {
        configs.push({
          id: `swarm-${swarmId}-node-${i}`,
          agentId: `agent-${swarmId}-${i}`,
          name: `Node ${i}`,
          taskDescription: `Task for swarm ${swarmId}, node ${i}`,
          deps: [],
        });
      }
      
      // Create dependent node that waits for all others
      configs.push({
        id: `swarm-${swarmId}-synth`,
        agentId: `agent-${swarmId}-synth`,
        name: `Synthesis`,
        taskDescription: `Synthesis for swarm ${swarmId}`,
        deps: configs.map((_, i) => `swarm-${swarmId}-node-${i}`),
      });
      
      return new TaskGraph(configs);
    };

    const startTime = Date.now();
    
    // Execute all swarms concurrently
    const swarmPromises: Promise<DAGResult>[] = [];
    for (let i = 0; i < CONCURRENT_SWARMS; i++) {
      const graph = createSwarmGraph(i);
      swarmPromises.push(scheduler.execute(graph, { 
        executor: createLoadTestExecutor(5),
        silent: true 
      }));
    }

    const results = await Promise.all(swarmPromises);
    const totalDuration = Date.now() - startTime;

    // Verify all swarms completed
    expect(results.length).toBe(CONCURRENT_SWARMS);
    
    // All should succeed
    const successfulSwarms = results.filter(r => r.success).length;
    expect(successfulSwarms).toBe(CONCURRENT_SWARMS);

    // Total nodes should be correct
    const totalNodesCompleted = results.reduce((sum, r) => sum + r.completed.length, 0);
    expect(totalNodesCompleted).toBe(CONCURRENT_SWARMS * NODES_PER_SWARM);

    console.log(`[Load Test] ${CONCURRENT_SWARMS} swarms with ${NODES_PER_SWARM} nodes each completed in ${totalDuration}ms`);
    console.log(`[Load Test] Average swarm duration: ${totalDuration / CONCURRENT_SWARMS}ms`);
  });

  test.concurrent("should handle high load with many small swarms", async () => {
    const scheduler = new DAGScheduler({ maxConcurrentWorkers: 8 });
    const SMALL_SWARMS = 10;
    
    const swarmPromises: Promise<DAGResult>[] = [];
    
    for (let s = 0; s < SMALL_SWARMS; s++) {
      const configs: TaskNodeConfig[] = [
        { id: `small-${s}-a`, agentId: `agent-a`, name: "A", taskDescription: "A", deps: [] },
        { id: `small-${s}-b`, agentId: `agent-b`, name: "B", taskDescription: "B", deps: [] },
      ];
      
      const graph = new TaskGraph(configs);
      swarmPromises.push(scheduler.execute(graph, { 
        executor: createLoadTestExecutor(2),
        silent: true 
      }));
    }

    const results = await Promise.all(swarmPromises);
    const successful = results.filter(r => r.success).length;

    expect(successful).toBe(SMALL_SWARMS);
    console.log(`[Load Test] ${SMALL_SWARMS} small swarms completed successfully`);
  });

  test.concurrent("should scale with increasing node count", async () => {
    const scheduler = new DAGScheduler({ maxConcurrentWorkers: 4 });
    
    const nodeCounts = [2, 4, 8, 16];
    const results: { nodes: number; duration: number }[] = [];

    for (const nodeCount of nodeCounts) {
      const configs: TaskNodeConfig[] = [];
      for (let i = 0; i < nodeCount; i++) {
        configs.push({
          id: `scale-${nodeCount}-${i}`,
          agentId: `agent-${i}`,
          name: `Node ${i}`,
          taskDescription: `Task ${i}`,
          deps: [],
        });
      }

      const graph = new TaskGraph(configs);
      const startTime = Date.now();
      
      const result = await scheduler.execute(graph, { 
        executor: createLoadTestExecutor(1),
        silent: true 
      });
      
      results.push({
        nodes: nodeCount,
        duration: Date.now() - startTime,
      });

      expect(result.success).toBe(true);
    }

    console.log(`[Load Test] Scaling results:`);
    results.forEach(r => {
      console.log(`  ${r.nodes} nodes: ${r.duration}ms`);
    });

    // Should complete in reasonable time even with more nodes
    expect(results[results.length - 1].duration).toBeLessThan(1000);
  });
});

describe("Stress Test: Rapid Swarm Creation", () => {
  test.concurrent("should handle rapid sequential swarm creation", async () => {
    const scheduler = new DAGScheduler({ maxConcurrentWorkers: 2 });
    const RAPID_COUNT = 20;

    const startTime = Date.now();
    let completed = 0;

    for (let i = 0; i < RAPID_COUNT; i++) {
      const configs: TaskNodeConfig[] = [
        { id: `rapid-${i}`, agentId: `agent-1`, name: "Task", taskDescription: "Task", deps: [] },
      ];
      
      const graph = new TaskGraph(configs);
      const result = await scheduler.execute(graph, { 
        executor: createLoadTestExecutor(1),
        silent: true 
      });
      
      if (result.success) completed++;
    }

    const totalDuration = Date.now() - startTime;

    expect(completed).toBe(RAPID_COUNT);
    console.log(`[Stress Test] ${RAPID_COUNT} rapid swarms completed in ${totalDuration}ms (avg: ${totalDuration / RAPID_COUNT}ms/swarm)`);
  });
});