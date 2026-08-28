/**
 * createAgent — la puerta de entrada del SDK.
 *
 * Hasta 0.1.5 esta función aceptaba `provider`, `model`, `maxIterations`,
 * `skills` y `workspace` y los descartaba: construía el agent loop global y
 * corría con lo que hubiera en la base. El agente terminaba respondiendo con un
 * modelo que el llamador nunca eligió. Ahora la config se persiste en la fila
 * del agente, que es de donde el loop resuelve provider y modelo.
 */

import { z } from "zod";
import type { ToolDefinition } from "../tools/ToolRegistry.ts";
import type { SkillDefinition } from "../skills/defineSkill.ts";
import type { Tool, ToolParameter } from "../tools/types.ts";
import type { Provider } from "../agent/providers/index.ts";
import { logger } from "../utils/logger.ts";

const log = logger.child("api");

export interface AgentConfig {
	name: string;
	/** Id del modelo tal como lo nombra su dueño (ej. "claude-opus-5", "Qwen-Ambassador/Qwen3.8-Max"). */
	model?: string;
	/** Cualquiera de los 16 providers del catálogo. */
	provider?: Provider;
	systemPrompt?: string;
	tools?: ToolDefinition[];
	skills?: SkillDefinition[];
	mcpServers?: Record<string, { command?: string; url?: string; args?: string[]; env?: Record<string, string> }>;
	maxIterations?: number;
	workspace?: string;
}

export interface Agent {
	readonly name: string;
	readonly id: string;
	readonly config: AgentConfig;
	chat(message: string, opts?: { threadId?: string; channel?: string }): AsyncGenerator<AgentEvent>;
	run(task: string, opts?: { threadId?: string; channel?: string }): Promise<string>;
}

export type AgentEvent =
	| { type: "text"; content: string }
	| { type: "tool_call"; name: string; args: Record<string, unknown> }
	| { type: "tool_result"; name: string; result: unknown }
	| { type: "done"; response: string };

/** Id estable derivado del nombre, para que dos `createAgent` con el mismo nombre compartan historial. */
function agentIdFrom(name: string): string {
	const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
	return slug || "agent";
}

/**
 * Convierte una tool declarada con `defineTool` (schema de Zod) al shape que
 * espera el runtime (JSON Schema). Sin `schema` queda sin parámetros.
 */
function toRuntimeTool(def: ToolDefinition): Tool {
	let properties: Record<string, ToolParameter> = {};
	let required: string[] = [];

	if (def.schema) {
		const json = z.toJSONSchema(def.schema) as {
			properties?: Record<string, ToolParameter>;
			required?: string[];
		};
		properties = json.properties ?? {};
		required = json.required ?? [];
	}

	return {
		name: def.name,
		description: def.description,
		parameters: { type: "object", properties, required },
		execute: async (params, config) => def.execute(params, config),
	};
}

export async function createAgent(config: AgentConfig): Promise<Agent> {
	const { ensureHiveDb } = await import("../storage/bootstrap.ts");
	const { col, toIndexable } = await import("../storage/hive.ts");
	const { catalogModelKey } = await import("../storage/model-id.ts");
	const { registerAppTool } = await import("../tools/index.ts");
	const { loadConfig } = await import("../config/loader.ts");
	const { resolveUserId } = await import("../storage/onboarding.ts");
	type AgentDoc = import("../storage/collections.ts").AgentDoc;
	type ModelDoc = import("../storage/collections.ts").ModelDoc;
	type ProviderDoc = import("../storage/collections.ts").ProviderDoc;

	// Abre HiveDB, crea los índices y siembra el catálogo de providers/modelos.
	await ensureHiveDb();

	const coreConfig = await loadConfig();

	// Browser automation (Bun.WebView) si está habilitado.
	try {
		const { initializeBrowserService } = await import("../tools/web/browser-service.ts");
		const browserService = initializeBrowserService(coreConfig);
		await browserService.start();
	} catch (err) {
		log.warn(`Browser service initialization skipped: ${(err as Error).message}`);
	}

	// Las tools de la app necesitan dos cosas para ser usables, y hasta 0.1.5 no
	// tenían ninguna:
	//   1. un ejecutor en el registry que arma el context compiler, y
	//   2. una fila en la colección `tools`, que es sobre la que corre la
	//      búsqueda por capacidad.
	// Sin (2) la tool existe pero el modelo no la descubre nunca: el loadout
	// inicial es mínimo a propósito y el resto se encuentra vía `search_knowledge`.
	if (config.tools?.length) {
		type ToolDoc = import("../storage/collections.ts").ToolDoc;
		const toolsCol = await col<ToolDoc>("tools");
		const ts = Date.now();

		for (const tool of config.tools) {
			registerAppTool(toRuntimeTool(tool));
			await toolsCol.put(tool.name, {
				id: tool.name,
				name: tool.name,
				description: tool.description,
				category: tool.category ?? "app",
				enabled: true,
				active: true,
				created_at: ts,
				updated_at: ts,
			});
		}
	}

	// ─── Provider y modelo ────────────────────────────────────────────────────
	// El loop los lee de la fila del agente, así que hay que dejarlos escritos.
	const providerId = config.provider ?? "";
	let modelKey = "";

	if (config.model) {
		if (!providerId) {
			throw new Error(
				`createAgent({ model: "${config.model}" }) necesita también \`provider\`: el mismo modelo lo sirven varios providers y la clave del catálogo depende de cuál.`
			);
		}
		modelKey = catalogModelKey(providerId, config.model);

		const modelsCol = await col<ModelDoc>("models");
		const modelEntry = await modelsCol.get(modelKey);
		if (!modelEntry) {
			throw new Error(
				`El modelo "${config.model}" no está en el catálogo de ${providerId}. `
				+ `Agregalo a SEED_DATA.models o elegí uno de los sembrados.`
			);
		}
		// Activarlo, o `resolveProviderConfig` no encuentra base_url ni la key.
		await modelsCol.put(
			modelKey,
			{ ...modelEntry.doc, enabled: true, active: true },
			{ expectedVersion: modelEntry.version }
		);

		const providersCol = await col<ProviderDoc>("providers");
		const providerEntry = await providersCol.get(providerId);
		if (providerEntry) {
			await providersCol.put(
				providerId,
				{ ...providerEntry.doc, enabled: true, active: true },
				{ expectedVersion: providerEntry.version }
			);
		}
	}

	// ─── Fila del agente ──────────────────────────────────────────────────────
	const agentId = agentIdFrom(config.name);
	const agentsCol = await col<AgentDoc>("agents");
	const existing = await agentsCol.get(agentId);
	const now = Date.now();
	const userId = (await resolveUserId({})) || "default";

	await agentsCol.put(
		agentId,
		{
			...(existing?.doc ?? {}),
			id: agentId,
			user_id: existing?.doc.user_id ?? userId,
			name: config.name,
			description: existing?.doc.description ?? null,
			system_prompt: config.systemPrompt ?? existing?.doc.system_prompt ?? null,
			tone: existing?.doc.tone ?? null,
			role: existing?.doc.role ?? "coordinator",
			status: "idle",
			enabled: true,
			provider_id: toIndexable(providerId || null),
			model_id: toIndexable(modelKey || null),
			tools_json: existing?.doc.tools_json ?? null,
			skills_json: existing?.doc.skills_json ?? null,
			parent_id: toIndexable(null),
			max_iterations: config.maxIterations ?? existing?.doc.max_iterations ?? 25,
			workspace: config.workspace ?? existing?.doc.workspace ?? null,
			lastTraceAt: existing?.doc.lastTraceAt ?? null,
			created_at: existing?.doc.created_at ?? now,
			updated_at: now,
		} as AgentDoc,
		existing ? { expectedVersion: existing.version } : undefined
	);

	// ─── Índice de capacidades ────────────────────────────────────────────────
	// Sin esto el agente queda limitado al loadout mínimo para siempre: el resto
	// de las tools y skills se descubren con `search_knowledge`, que corre sobre
	// el índice BM25, y ese índice no se llena solo. En hive lo hace
	// `gateway/initializer.ts` al arrancar; por la vía del SDK nadie lo llamaba.
	await syncCapabilityIndexes();

	// ─── MCP ──────────────────────────────────────────────────────────────────
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

	const { runAgent } = await import("../agent/agent-loop.ts");

	return {
		name: config.name,
		id: agentId,
		config,
		async *chat(message, opts) {
			const threadId = opts?.threadId ?? crypto.randomUUID();
			let response = "";

			for await (const chunk of runAgent({
				agentId,
				userMessage: message,
				threadId,
				channel: opts?.channel ?? "cli",
				mcpManager,
				userId,
			})) {
				for (const msg of chunk.agent?.messages ?? []) {
					if (typeof msg.content === "string" && msg.content) {
						response = msg.content;
						yield { type: "text" as const, content: msg.content };
					}
					for (const tc of msg.tool_calls ?? []) {
						const raw = tc.function?.arguments;
						yield {
							type: "tool_call" as const,
							name: tc.function?.name ?? "unknown",
							args: typeof raw === "string" ? safeParse(raw) : (raw ?? {}),
						};
					}
				}
				for (const msg of chunk.tools?.messages ?? []) {
					yield { type: "tool_result" as const, name: msg.name ?? "unknown", result: msg.content };
				}
			}

			yield { type: "done" as const, response };
		},
		async run(task, opts) {
			// El loop emite el texto acumulado del turno, no deltas: quedarse con el
			// último evento evita duplicar la respuesta al concatenar.
			let response = "";
			for await (const event of this.chat(task, opts)) {
				if (event.type === "text") response = event.content;
				if (event.type === "done" && event.response) response = event.response;
			}
			return response;
		},
	};
}

function safeParse(raw: string): Record<string, unknown> {
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

/**
 * Llena el índice BM25 de capacidades (tools, skills, reglas de playbook,
 * agentes del catálogo) sobre el que corre `search_knowledge`.
 *
 * Es el equivalente de lo que hace `gateway/initializer.ts` en hive al arrancar.
 * Los errores no se propagan: sin índice el agente sigue funcionando con el
 * loadout mínimo, y romper `createAgent` por una reindexación sería peor.
 */
export async function syncCapabilityIndexes(): Promise<void> {
	const { syncToolsToIndex, syncSkillsToIndex, syncPlaybookToIndex } = await import(
		"../agent/context-compiler.ts"
	);
	const { syncCatalogAgentsToIndex } = await import("../agent/catalog-selector.ts");

	const results = await Promise.allSettled([
		syncToolsToIndex(),
		syncSkillsToIndex(),
		syncPlaybookToIndex(),
		syncCatalogAgentsToIndex(),
	]);

	for (const result of results) {
		if (result.status === "rejected") {
			log.warn(`Capability index sync failed: ${result.reason}`);
		}
	}
}
