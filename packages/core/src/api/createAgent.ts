import type { ToolDefinition } from "../tools/ToolRegistry.ts";
import type { SkillDefinition } from "../skills/defineSkill.ts";
import { logger } from "../utils/logger.ts";

const log = logger.child("api");

export interface AgentConfig {
	name: string;
	model?: string;
	provider?: "openai" | "anthropic" | "gemini" | "ollama";
	systemPrompt?: string;
	tools?: ToolDefinition[];
	skills?: SkillDefinition[];
	mcpServers?: Record<string, { command?: string; url?: string; args?: string[]; env?: Record<string, string> }>;
	maxIterations?: number;
	workspace?: string;
}

export interface Agent {
	readonly name: string;
	readonly config: AgentConfig;
	chat(message: string, opts?: { threadId?: string; channel?: string }): AsyncGenerator<AgentEvent>;
	run(task: string, opts?: { threadId?: string; channel?: string }): Promise<string>;
}

export type AgentEvent =
	| { type: "text"; content: string }
	| { type: "tool_call"; name: string; args: Record<string, unknown> }
	| { type: "tool_result"; name: string; result: unknown }
	| { type: "done"; response: string };

export async function createAgent(config: AgentConfig): Promise<Agent> {
	const { initializeDatabase } = await import("../storage/SQLiteStorage.ts");
	const { createAllTools } = await import("../tools/index.ts");
	const { loadConfig } = await import("../config/loader.ts");

	await initializeDatabase();

	const coreConfig = await loadConfig();
	const allBuiltInTools = createAllTools(coreConfig);

	const customTools = (config.tools ?? []).map(t => ({
		name: t.name,
		description: t.description,
		execute: t.execute,
	}));

	const mergedTools = [...allBuiltInTools, ...customTools];

	let mcpManager = null;
	if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
		const { MCPClientManager } = await import("../mcp/index.ts");
		const mcpConfig = {
			servers: Object.fromEntries(
				Object.entries(config.mcpServers).map(([name, serverConfig]) => [
					name,
					{
						transport: (serverConfig.command ? "stdio" : "sse") as "stdio" | "sse",
						command: serverConfig.command,
						url: serverConfig.url,
						args: serverConfig.args ?? [],
						env: serverConfig.env ?? {},
						enabled: true,
					},
				])
			),
		};
		mcpManager = new MCPClientManager(mcpConfig);
		await mcpManager.initialize();
	}

	const loop = await (async () => {
		const { buildAgentLoop } = await import("../agent/AgentRunner.ts");
		const agentLoop = buildAgentLoop({ mcpManager });
		return agentLoop;
	})();

	return {
		name: config.name,
		config,
		async *chat(message, opts) {
			const threadId = opts?.threadId ?? crypto.randomUUID();
			const iter = loop.stream(
				{ messages: [{ role: "user", content: message }] },
				{
					configurable: {
						thread_id: threadId,
						channel: opts?.channel ?? "cli",
						system_prompt: config.systemPrompt,
					},
				}
			);
			for await (const chunk of iter) {
				if (chunk.agent?.messages) {
					for (const msg of chunk.agent.messages) {
						if (msg.content && typeof msg.content === "string") {
							yield { type: "text" as const, content: msg.content };
						}
						if (msg.tool_calls) {
							for (const tc of msg.tool_calls) {
								yield { type: "tool_call" as const, name: tc.function?.name ?? tc.name ?? "unknown", args: typeof tc.function?.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function?.arguments ?? {} };
							}
						}
					}
				}
				if (chunk.tools?.messages) {
					for (const msg of chunk.tools.messages) {
						yield { type: "tool_result" as const, name: msg.name ?? msg.tool_name ?? "unknown", result: msg.content };
					}
				}
			}
			yield { type: "done" as const, response: "" };
		},
		async run(task, opts) {
			let response = "";
			for await (const event of this.chat(task, opts)) {
				if (event.type === "text") response += event.content;
			}
			return response;
		},
	};
}
