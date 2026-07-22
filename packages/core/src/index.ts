// ─── API ─────────────────────────────────────────────────────────────────────
export { createAgent } from "./api/index.ts";
export type { AgentConfig, Agent, AgentEvent } from "./api/index.ts";

// ─── Tools ───────────────────────────────────────────────────────────────────
export { defineTool } from "./tools/ToolRegistry.ts";
export type { ToolDefinition } from "./tools/ToolRegistry.ts";
export { ToolRegistry } from "./tools/ToolRegistry.ts";
export { ToolExecutor } from "./tools/ToolExecutor.ts";
export type { ToolExecutionResult } from "./tools/ToolExecutor.ts";
export {
  webSearchTool,
  webFetchTool,
  apiRequestTool,
  browserNavigateTool,
  browserScreenshotTool,
  browserClickTool,
  browserTypeTool,
  browserExtractTool,
  browserScriptTool,
  browserWaitTool,
} from "./tools/index.ts";
export type { ApiAuth, HttpMethod, ResponseFormat } from "./tools/web/api-request.ts";

// ─── Skills ──────────────────────────────────────────────────────────────────
export { defineSkill } from "./skills/defineSkill.ts";
export type { SkillDefinition } from "./skills/defineSkill.ts";
export { SkillLoader } from "./skills/index.ts";
export type { Skill, SkillStep, OutputFormat, SkillsConfig } from "./skills/index.ts";

// ─── Agent ───────────────────────────────────────────────────────────────────
export { AgentLoop, runAgent, runAgentIsolated, buildAgentLoop, getAgentLoop, rebuildAgentLoop } from "./agent/index.ts";
export type { AgentLoopOptions, StepEvent, StreamChunk } from "./agent/index.ts";
export type { Tool, ToolParameter, ToolResult } from "./agent/index.ts";

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
export { initializeDatabase, dbService } from "./storage/index.ts";
// HiveDB-backed catalogs (tools/skills/providers/models/playbook) that the
// selectors and other HiveDB-backed features read from. Idempotent (upsert-
// based) — safe to call on every boot, same "reseed so code changes take
// effect" pattern as `initializeDatabase`. Not required to avoid crashes
// (selectors degrade to empty results when unseeded), but needed for
// dynamic skill/playbook discovery.
export { seedHiveDB } from "./storage/index.ts";

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
export { CanvasManager } from "./canvas/CanvasManager.ts";
export { emitCanvas, subscribeCanvas, unsubscribeCanvas } from "./canvas/emitter.ts";

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
export { logger } from "./utils/index.ts";
export { retry } from "./utils/retry.ts";

// ─── Harness (durable task execution) ───────────────────────────────────────
// Namespaced to avoid flooding the top-level barrel with ~50 harness exports —
// see docs/HIVE-HARNESS.md. Also available as a flat import from
// "@johpaz/hive-sdk/harness".
export * as harness from "./harness/index.ts";
