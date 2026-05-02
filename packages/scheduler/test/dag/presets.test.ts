import { describe, test, expect } from "bun:test";
import { createResearchGraph, type ResearchAgentIds } from "../../src/dag/presets/ResearchPreset";

describe("ResearchPreset", () => {
  describe("createResearchGraph", () => {
    test("should create graph with 4 nodes", () => {
      const agentIds: ResearchAgentIds = {
        research: "agent-research",
        strategy: "agent-strategy",
        design: "agent-design",
        synthesis: "agent-synthesis",
      };

      const graph = createResearchGraph(agentIds, "Test topic");

      expect(graph.nodes.size).toBe(4);
    });

    test("should have research, strategy, design as independent (no deps)", () => {
      const agentIds: ResearchAgentIds = {
        research: "agent-research",
        strategy: "agent-strategy",
        design: "agent-design",
        synthesis: "agent-synthesis",
      };

      const graph = createResearchGraph(agentIds, "Test topic");

      const researchNode = graph.nodes.get("research")!;
      const strategyNode = graph.nodes.get("strategy")!;
      const designNode = graph.nodes.get("design")!;

      expect(researchNode.deps).toEqual([]);
      expect(strategyNode.deps).toEqual([]);
      expect(designNode.deps).toEqual([]);
    });

    test("should have synthesis depending on research, strategy, design", () => {
      const agentIds: ResearchAgentIds = {
        research: "agent-research",
        strategy: "agent-strategy",
        design: "agent-design",
        synthesis: "agent-synthesis",
      };

      const graph = createResearchGraph(agentIds, "Test topic");

      const synthesisNode = graph.nodes.get("synthesis")!;

      expect(synthesisNode.deps).toEqual(["research", "strategy", "design"]);
    });

    test("should set correct agentIds on nodes", () => {
      const agentIds: ResearchAgentIds = {
        research: "agent-research",
        strategy: "agent-strategy",
        design: "agent-design",
        synthesis: "agent-synthesis",
      };

      const graph = createResearchGraph(agentIds, "Test topic");

      expect(graph.nodes.get("research")!.agentId).toBe("agent-research");
      expect(graph.nodes.get("strategy")!.agentId).toBe("agent-strategy");
      expect(graph.nodes.get("design")!.agentId).toBe("agent-design");
      expect(graph.nodes.get("synthesis")!.agentId).toBe("agent-synthesis");
    });

    test("should set correct names on nodes", () => {
      const agentIds: ResearchAgentIds = {
        research: "agent-research",
        strategy: "agent-strategy",
        design: "agent-design",
        synthesis: "agent-synthesis",
      };

      const graph = createResearchGraph(agentIds, "Test topic");

      expect(graph.nodes.get("research")!.name).toBe("ResearchAgent");
      expect(graph.nodes.get("strategy")!.name).toBe("StrategyAgent");
      expect(graph.nodes.get("design")!.name).toBe("DesignAgent");
      expect(graph.nodes.get("synthesis")!.name).toBe("SynthesisAgent");
    });

    test("should include topic in task descriptions", () => {
      const agentIds: ResearchAgentIds = {
        research: "agent-research",
        strategy: "agent-strategy",
        design: "agent-design",
        synthesis: "agent-synthesis",
      };

      const topic = "Distributed caching strategy for HiveLearn";
      const graph = createResearchGraph(agentIds, topic);

      expect(graph.nodes.get("research")!.taskDescription).toContain(topic);
      expect(graph.nodes.get("strategy")!.taskDescription).toContain(topic);
      expect(graph.nodes.get("design")!.taskDescription).toContain(topic);
      expect(graph.nodes.get("synthesis")!.taskDescription).toContain(topic);
    });

    test("should set appropriate priorities", () => {
      const agentIds: ResearchAgentIds = {
        research: "agent-research",
        strategy: "agent-strategy",
        design: "agent-design",
        synthesis: "agent-synthesis",
      };

      const graph = createResearchGraph(agentIds, "Test topic");

      // Parallel agents should have high priority (8)
      expect(graph.nodes.get("research")!.priority).toBe(8);
      expect(graph.nodes.get("strategy")!.priority).toBe(8);
      expect(graph.nodes.get("design")!.priority).toBe(8);

      // Synthesis should have lower priority (0)
      expect(graph.nodes.get("synthesis")!.priority).toBe(0);
    });

    test("should set appropriate maxRetries", () => {
      const agentIds: ResearchAgentIds = {
        research: "agent-research",
        strategy: "agent-strategy",
        design: "agent-design",
        synthesis: "agent-synthesis",
      };

      const graph = createResearchGraph(agentIds, "Test topic");

      // Most agents have 1 retry
      expect(graph.nodes.get("research")!.maxRetries).toBe(1);
      expect(graph.nodes.get("strategy")!.maxRetries).toBe(1);
      expect(graph.nodes.get("design")!.maxRetries).toBe(1);

      // Synthesis has more retries (2)
      expect(graph.nodes.get("synthesis")!.maxRetries).toBe(2);
    });

    test("should apply custom timeouts from options", () => {
      const agentIds: ResearchAgentIds = {
        research: "agent-research",
        strategy: "agent-strategy",
        design: "agent-design",
        synthesis: "agent-synthesis",
      };

      const graph = createResearchGraph(agentIds, "Test topic", {
        researchTimeout: 30000,
        strategyTimeout: 45000,
        designTimeout: 60000,
        synthesisTimeout: 180000,
      });

      expect(graph.nodes.get("research")!.timeout).toBe(30000);
      expect(graph.nodes.get("strategy")!.timeout).toBe(45000);
      expect(graph.nodes.get("design")!.timeout).toBe(60000);
      expect(graph.nodes.get("synthesis")!.timeout).toBe(180000);
    });

    test("should use default timeouts when not provided", () => {
      const agentIds: ResearchAgentIds = {
        research: "agent-research",
        strategy: "agent-strategy",
        design: "agent-design",
        synthesis: "agent-synthesis",
      };

      const graph = createResearchGraph(agentIds, "Test topic");

      // Default timeouts: research=120s, strategy/design=90s, synthesis=150s
      expect(graph.nodes.get("research")!.timeout).toBe(120_000);
      expect(graph.nodes.get("strategy")!.timeout).toBe(90_000);
      expect(graph.nodes.get("design")!.timeout).toBe(90_000);
      expect(graph.nodes.get("synthesis")!.timeout).toBe(150_000);
    });
  });
});