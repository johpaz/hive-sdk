import { describe, test, expect } from "bun:test";

describe("Tool Selector Module", () => {
  test("should load tool-selector module", async () => {
    const mod = await import("../src/tool-selector");
    expect(mod).toBeDefined();
  });

  test("should export MIN_RELEVANCE_THRESHOLD constant", async () => {
    const { MIN_RELEVANCE_THRESHOLD } = await import("../src/tool-selector");
    expect(MIN_RELEVANCE_THRESHOLD).toBe(-30);
  });

  test("should export CORE_TOOL_CATALOG", async () => {
    const { CORE_TOOL_CATALOG } = await import("../src/tool-selector");
    expect(CORE_TOOL_CATALOG).toBeDefined();
    expect(Array.isArray(CORE_TOOL_CATALOG)).toBe(true);
    expect(CORE_TOOL_CATALOG.length).toBeGreaterThan(0);
  });

  test("should have CORE_TOOL_CATALOG with valid structure", async () => {
    const { CORE_TOOL_CATALOG } = await import("../src/tool-selector");
    const tool = CORE_TOOL_CATALOG[0];
    expect(tool).toHaveProperty("name");
    expect(tool).toHaveProperty("description");
    expect(tool).toHaveProperty("category");
  });
});