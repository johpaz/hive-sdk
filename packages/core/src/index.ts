// ─── API ─────────────────────────────────────────────────────────────────────
export { createAgent } from "./api/index.ts";
export type { AgentConfig, Agent, AgentEvent } from "./api/index.ts";

// ─── Tools ───────────────────────────────────────────────────────────────────
export { defineTool } from "./tools/ToolRegistry.ts";
export type { ToolDefinition } from "./tools/ToolRegistry.ts";
export { ToolRegistry } from "./tools/ToolRegistry.ts";
export { ToolExecutor } from "./tools/ToolExecutor.ts";
export type { ToolExecutionResult } from "./tools/ToolExecutor.ts";
export { createAllTools, createToolsByCategory, registerAppTool, clearAppTools, listAppTools } from "./tools/index.ts";
export type { Tool, ToolParameter, ToolResult } from "./tools/types.ts";
export { apiRequestTool } from "./tools/api/index.ts";

// ─── Skills ──────────────────────────────────────────────────────────────────
export { defineSkill } from "./skills/defineSkill.ts";
export type { SkillDefinition } from "./skills/defineSkill.ts";
export { SkillLoader } from "./skills/index.ts";
export type { Skill, SkillStep, OutputFormat, SkillsConfig } from "./skills/index.ts";

// ─── Agent ───────────────────────────────────────────────────────────────────
export { runAgent, runAgentIsolated, AgentLoop, getAgentLoop, buildAgentLoop, rebuildAgentLoop } from "./agent/agent-loop.ts";
export type { AgentLoopOptions, StepEvent, StreamChunk } from "./agent/agent-loop.ts";
export type { Provider } from "./agent/providers/index.ts";

// El cliente LLM es parte de la superficie pública: hasta 0.1.5 sólo se exportaba
// el wrapper `AgentRunner`, así que no había forma de llamar a un provider ni de
// leer el error tipado sin importar por ruta profunda.
export { callLLM, getDefaultLLM, resolveProviderConfig } from "./agent/llm-client.ts";
export type { LLMMessage, LLMToolCall, LLMToolDef, LLMCallOptions, LLMResponse, ContentPart } from "./agent/llm-client.ts";

// Control de prompt y contexto.
export { buildSystemPrompt, buildSystemPromptWithProjects } from "./agent/prompt-builder.ts";
export { compileContext } from "./agent/context-compiler.ts";
export type { CompiledContext } from "./agent/context-compiler.ts";
export { maybeCompact, clearOldToolResults } from "./agent/compaction.ts";
export { selectTools } from "./agent/tool-selector.ts";
export { selectSkills, getMinimalSkills } from "./agent/skill-selector.ts";
export { selectPlaybookRules } from "./agent/playbook-selector.ts";
export { MINIMAL_TOOLS } from "./agent/minimal-loadout.ts";

// ─── Swarm / Scheduler ───────────────────────────────────────────────────────
export { DAGScheduler } from "./swarm/index.ts";
export type { DAGSchedulerOptions, IAgentExecutor } from "./swarm/index.ts";
export { TaskGraph, TaskNode } from "./swarm/index.ts";
export type { TaskNodeConfig, NodeStatus, DAGResult, NodeSummary } from "./swarm/index.ts";
export { CronScheduler } from "./scheduler/index.ts";
export type { CronJob } from "./scheduler/index.ts";

// ─── MCP ─────────────────────────────────────────────────────────────────────
export { MCPClientManager } from "./mcp/index.ts";
export type { MCPTool, MCPResource, MCPPrompt, MCPConfig, MCPServerConfig } from "./mcp/index.ts";

// ─── Ethics ──────────────────────────────────────────────────────────────────
export { EthicsGuard } from "./ethics/index.ts";
export type { EthicsRule } from "./ethics/index.ts";

// ─── Memory ──────────────────────────────────────────────────────────────────
export { Scratchpad } from "./memory/index.ts";
export type { IStorage } from "./memory/index.ts";

// ─── Storage ─────────────────────────────────────────────────────────────────
// `ensureHiveDb()` reemplaza a `initializeDatabase()`: abre HiveDB, crea los
// índices y siembra el catálogo. Idempotente — se llama en cada arranque.
export { ensureHiveDb, col, seedAllData, SEED_DATA } from "./storage/index.ts";
export type { SeedData } from "./storage/index.ts";
export { catalogModelKey, wireModelId, isResellerProvider } from "./storage/index.ts";
export { calculateCost, invalidateModelPricingCache, recordUsage, getUsageStats } from "./storage/index.ts";
export type { UsageRecord, UsageSummary } from "./storage/index.ts";
export type { AgentDoc, ModelDoc, ProviderDoc, SkillDoc, ToolDoc, EthicsDoc, UserDoc } from "./storage/collections.ts";

// ─── Config ──────────────────────────────────────────────────────────────────
export { loadConfig, loadEnv, getHiveDir } from "./config/index.ts";
export type { Config } from "./config/index.ts";

// ─── Gateway ─────────────────────────────────────────────────────────────────
export { startGateway } from "./gateway/index.ts";
export type { GatewayConfig } from "./gateway/index.ts";

// ─── Channels ────────────────────────────────────────────────────────────────
export { ChannelManager } from "./channels/manager.ts";
export { BaseChannel } from "./channels/base.ts";
export { TelegramChannel } from "./channels/telegram.ts";
export { DiscordChannel } from "./channels/discord.ts";
export { WhatsAppChannel } from "./channels/whatsapp.ts";
export { SlackChannel } from "./channels/slack.ts";
export { WebChatChannel } from "./channels/webchat.ts";

// ─── Canvas ──────────────────────────────────────────────────────────────────
export { CanvasManager } from "./canvas/canvas-manager.ts";
export { emitCanvas } from "./canvas/emitter.ts";

// ─── Tool Runtime ────────────────────────────────────────────────────────────
export { executeToolBatch } from "./tool-runtime/index.ts";
export type { ToolBatchResult, ExecuteToolBatchOptions } from "./tool-runtime/index.ts";

// ─── Events ──────────────────────────────────────────────────────────────────
export { eventBus } from "./events/event-bus.ts";
export { agentBus } from "./events/agent-bus.ts";

// ─── Workers ─────────────────────────────────────────────────────────────────
export { createWorker, WorkerPool } from "./workers/index.ts";
export type { WorkerConfig, WorkerInstance, WorkerChunk, WorkerPoolConfig, PoolTask, PoolTaskResult } from "./workers/index.ts";

// ─── Utils ───────────────────────────────────────────────────────────────────
export { logger } from "./utils/logger.ts";
export { retry } from "./utils/retry.ts";

// ─── Harness (durable task execution) ───────────────────────────────────────
// Namespaced to avoid flooding the top-level barrel with ~50 harness exports —
// see docs/HIVE-HARNESS.md. Also available as a flat import from
// "@johpaz/hive-sdk/harness".
export * as harness from "./harness/index.ts";
