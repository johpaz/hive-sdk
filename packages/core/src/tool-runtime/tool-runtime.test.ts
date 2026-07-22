import { afterEach, describe, expect, it } from "bun:test";
import { executeToolBatch, shutdownToolRuntime, type RuntimeTool, type ToolCallLike } from "./index.ts";
import { loadConfig } from "../config/loader.ts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toolCall(id: string, name: string, args: unknown = {}): ToolCallLike {
  return {
    id,
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

describe("tool runtime worker pool", () => {
  afterEach(() => {
    shutdownToolRuntime();
  });

  it("runs multiple tools in parallel through worker scheduling", async () => {
    // Per-tool delay + threshold sized for CI headroom: worker spawn/scheduling
    // overhead is roughly fixed, so a larger delay keeps that overhead a small
    // fraction of the budget instead of dominating it on a loaded runner.
    // Serial execution would take ~3x the delay; the threshold stays well
    // under that so the assertion still proves parallelism, not just patience.
    const TOOL_DELAY_MS = 200;
    const PARALLEL_THRESHOLD_MS = 450;

    const tools: RuntimeTool[] = ["slow_a", "slow_b", "slow_c"].map((name) => ({
      name,
      execute: async () => {
        await delay(TOOL_DELAY_MS);
        return { name };
      },
    }));

    const startedAt = performance.now();
    const results = await executeToolBatch({
      toolCalls: [
        toolCall("1", "slow_a"),
        toolCall("2", "slow_b"),
        toolCall("3", "slow_c"),
      ],
      allTools: tools,
      toolConfig: {},
      hiveConfig: loadConfig(),
      workerPool: { enabled: true, maxWorkers: 3, toolTimeoutMs: 5000, parallelToolCalls: true },
    });
    const elapsed = performance.now() - startedAt;

    expect(results.map((result) => (result.result as any).name)).toEqual(["slow_a", "slow_b", "slow_c"]);
    expect(elapsed).toBeLessThan(PARALLEL_THRESHOLD_MS);
  });

  it("preserves input order when tools complete out of order", async () => {
    const tools: RuntimeTool[] = [
      { name: "first", execute: async () => { await delay(120); return { value: 1 } } },
      { name: "second", execute: async () => { await delay(20); return { value: 2 } } },
      { name: "third", execute: async () => { await delay(60); return { value: 3 } } },
    ];

    const results = await executeToolBatch({
      toolCalls: [toolCall("1", "first"), toolCall("2", "second"), toolCall("3", "third")],
      allTools: tools,
      toolConfig: {},
      hiveConfig: loadConfig(),
      workerPool: { enabled: true, maxWorkers: 3, toolTimeoutMs: 1000, parallelToolCalls: true },
    });

    expect(results.map((r) => (r.result as any).value)).toEqual([1, 2, 3]);
  });

  it("handles tool errors gracefully", async () => {
    const tools: RuntimeTool[] = [
      {
        name: "fail",
        execute: async () => {
          throw new Error("intentional failure");
        },
      },
    ];

    const results = await executeToolBatch({
      toolCalls: [toolCall("1", "fail")],
      allTools: tools,
      toolConfig: {},
      hiveConfig: loadConfig(),
      workerPool: { enabled: true, maxWorkers: 1, toolTimeoutMs: 1000, parallelToolCalls: false },
    });

    expect(results[0].ok).toBe(false);
    expect(results[0].result).toBeDefined();
    const result = results[0].result as any;
    expect(result.error).toBe(true);
    expect(result.message).toContain("intentional failure");
  });
});
