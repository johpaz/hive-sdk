import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { getDb, initializeDatabase, dbService } from "../storage/SQLiteStorage.ts";

describe("createAgent API", () => {
	beforeAll(async () => {
		await initializeDatabase();
	});

	afterAll(() => {
		dbService.close();
	});

	it("defineTool and defineSkill exports are available", async () => {
		const { defineTool } = await import("../tools/ToolRegistry.ts");
		const { defineSkill } = await import("../skills/defineSkill.ts");

		const tool = defineTool({
			name: "greet",
			description: "Says hello",
			execute: async (args: { name: string }) => `Hello ${args.name}`,
		});
		expect(tool.name).toBe("greet");

		const skill = defineSkill({
			name: "greeting-skill",
			description: "Greeting skill",
			steps: [{ action: "greet", instruction: "Say hello" }],
		});
		expect(skill.name).toBe("greeting-skill");
	});

	it("createAgent builds an agent instance", async () => {
		const { createAgent } = await import("./createAgent.ts");
		const agent = await createAgent({
			name: "test-agent",
			provider: "openai",
			model: "gpt-4o-mini",
		});
		expect(agent.name).toBe("test-agent");
		expect(agent.config).toBeDefined();
	});

	it("ToolRegistry can be used standalone", async () => {
		const { ToolRegistry } = await import("../tools/ToolRegistry.ts");
		const reg = new ToolRegistry();
		expect(reg.size()).toBe(0);
	});
});
