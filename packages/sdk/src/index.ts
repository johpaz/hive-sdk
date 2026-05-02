/**
 * @johpaz/hive-sdk
 *
 * Hive SDK — Crear agentes IA con todo incluido.
 *
 * @example
 * import { AgentService, createAllTools, SkillLoader, MCPClientManager } from "@johpaz/hive-sdk";
 *
 * const tools = createAllTools(config);
 * const skills = new SkillLoader();
 * const mcp = new MCPClientManager({ servers: {} });
 */

// Agents
export {
  AgentService,
  getAgentService,
  createAgentService,
  runAgent,
  runAgentIsolated,
  rebuildAgentLoop,
  getAgentLoop,
  compileContext,
  buildSystemPromptWithProjects,
  addMessage,
  getHistory,
  getRecentMessages,
  getMessageCount,
  getTotalTokens,
  getMessagesAfter,
  selectTools,
  selectSkills,
  selectPlaybookRules,
  callLLM,
  resolveProviderConfig,
  createAgentRunner,
} from "@hive-sdk/agent";

export type {
  AgentServiceConfig,
  AgentDBRecord,
  AgentLoopOptions,
  StepEvent,
  StreamChunk,
  LLMMessage,
  LLMResponse,
  LLMCallOptions,
  LLMToolCall,
  StoredMessage,
  Provider,
  ModelOptions,
  ModelResponse,
} from "@hive-sdk/agent";

// Tools
export {
  createAllTools,
  createToolsByCategory,
  fsEditTool,
  fsReadTool,
  fsWriteTool,
  fsDeleteTool,
  fsListTool,
  fsGlobTool,
  fsExistsTool,
  webSearchTool,
  webFetchTool,
  browserNavigateTool,
  browserScreenshotTool,
  browserClickTool,
  browserTypeTool,
  projectCreateTool,
  projectListTool,
  projectUpdateTool,
  projectDoneTool,
  projectFailTool,
  taskCreateTool,
  taskUpdateTool,
  taskEvaluateTool,
  cronCreateTool,
  cronListTool,
  cronPauseTool,
  cronResumeTool,
  cronDeleteTool,
  cronTriggerTool,
  cronHistoryTool,
  resolveBestChannel,
  cliExecTool,
  canvasRenderTool,
  canvasAskTool,
  canvasConfirmTool,
  canvasShowCardTool,
  canvasShowProgressTool,
  canvasShowListTool,
  canvasClearTool,
  codebridgeLaunchTool,
  codebridgeStatusTool,
  codebridgeCancelTool,
  voiceTranscribeTool,
  voiceSpeakTool,
  searchKnowledgeTool,
  notifyTool,
  saveNoteTool,
  reportProgressTool,
  memoryWriteTool,
  memoryReadTool,
  memoryListTool,
  memorySearchTool,
  memoryDeleteTool,
  agentCreateTool,
  agentFindTool,
  agentArchiveTool,
  taskDelegateTool,
  taskDelegateCodeTool,
  taskStatusTool,
  busPublishTool,
  busReadTool,
  projectUpdatesTool,
} from "@hive-sdk/tools";

export type { Tool, ToolResult } from "@hive-sdk/tools";

// Skills
export { SkillLoader, createSkillLoader } from "@hive-sdk/skills";

export type {
  SkillsConfig,
  SkillStep,
  OutputFormat,
  SkillExample,
  SkillMetadata,
  Skill,
} from "@hive-sdk/skills";

// MCP
export { MCPClientManager } from "@hive-sdk/mcp";

export type {
  MCPTool,
  MCPResource,
  MCPPrompt,
} from "@hive-sdk/mcp";

export type {
  MCPConfig,
} from "@hive-sdk/mcp/config";

// Channels
export {
  ChannelManager,
  TelegramChannel,
  DiscordChannel,
  WhatsAppChannel,
  SlackChannel,
  WebChatChannel,
} from "@hive-sdk/channels";

export type {
  OutboundMessage,
  IncomingMessage,
  ChannelConfig,
  IChannel,
  MessageHandler,
  TelegramConfig,
  DiscordConfig,
  WhatsAppConfig,
  WhatsAppConnectionState,
  SlackConfig,
  SlackConnectionState,
  WebChatConfig,
} from "@hive-sdk/channels";

// Storage / Database
export {
  getDb,
  initializeDatabase,
  getDbPathLazy,
  dbService,
  seedAllData,
  seedToolsAndSkills,
  getAllElements,
  getActiveElements,
  encrypt,
  decrypt,
  encryptApiKey,
  decryptApiKey,
  encryptConfig,
  decryptConfig,
  hashPassword,
  verifyPassword,
  maskApiKey,
  getAllProviders,
  getAllModels,
  getAllCodeBridge,
  getAllSkills,
  getAllDbTools,
  getAllMcpServers,
  getAllChannels,
  getActiveTools,
  getUserAgents,
  getSingleUserId,
  getCoordinatorAgentId,
  getDefaultAgentId,
  getAgentConfig,
  resolveAgentId,
  resolveUserId,
} from "@hive-sdk/storage";

export type {
  SCHEMA,
  PROJECTS_SCHEMA,
  CONTEXT_ENGINE_SCHEMA,
} from "@hive-sdk/storage";

// Gateway
export { startGateway } from "@hive-sdk/gateway";

// Scheduler
export {
  CronScheduler,
  executeScheduledTask,
  createTaskHandler,
  notifyTaskCompletion,
  setSchedulerForCleanup,
} from "@hive-sdk/scheduler";

export type {
  CronJob,
  TaskRun,
  CreateCronJobInput,
  UpdateCronJobInput,
  CronJobStatus,
  CronJobExecutionHandler,
  CronJobExecutionResult,
  TaskType,
  TaskStatus,
  TaskRunStatus,
  CronerOptions,
} from "@hive-sdk/scheduler";

// Events
export { eventBus } from "@hive-sdk/events";

// State
export { stateStore } from "@hive-sdk/state";

// Security
export {
  TokenBucketRateLimiter,
  SlidingWindowRateLimiter,
  createTokenBucketLimiter,
  createSlidingWindowLimiter,
} from "@hive-sdk/security";

// Config
export {
  getHiveDir,
  loadConfig,
  expandConfigPath,
  expandPath,
  type Config,
  type ProviderConfig,
  type MCPServerConfig,
  type AgentEntry,
  type Binding,
  type ConfigUserConfig,
} from "@hive-sdk/config";

// Canvas
export { canvasManager } from "@hive-sdk/canvas";

// Voice
export { voiceService } from "@hive-sdk/voice";

export type {
  VoiceConfig,
  AudioInput,
  AudioOutput,
} from "@hive-sdk/voice";

// Multimodal
export { multimodalService } from "@hive-sdk/multimodal";

export type {
  ContentPart,
  ImageInput,
  DocumentInput,
  VisionConfig,
  MultimodalMessageType,
} from "@hive-sdk/multimodal";

// Utils
export { logger, retry } from "@hive-sdk/utils";

// TTS
export {
  isTTSAvailable,
  synthesize,
  synthesizeToFile,
  listVoices,
  detectPlatform,
} from "@hive-sdk/tts";

export const SDK_VERSION = "1.0.0";
