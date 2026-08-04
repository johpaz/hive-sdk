export type { MCPTool, MCPResource, MCPPrompt } from "./MCPClient.ts";
export { MCPClientManager } from "./MCPClient.ts";
// `tool-sync.ts` reemplaza al viejo `MCPToolAdapter.ts`: aquel escribía a SQLite
// y sincronizaba a FTS5; éste escribe a la colección `mcpTools` de HiveDB y
// reindexa con `syncMCPToolsToIndex`.
export type { MCPToolDefinition } from "./tool-sync.ts";
export { syncMCPToolsToDB, syncMCPToolsToIndex, clearMCPToolsFromDB } from "./tool-sync.ts";
export type { MCPConfig, MCPServerConfig } from "./config.ts";
export { setMCPManager, getMCPManager } from "./singleton.ts";
export { startMCPHotReload, stopMCPHotReload } from "./hot-reload.ts";
export type { LogLevel as MCPLogLevel, LogHandler as MCPLogHandler } from "./logger.ts";
export { logger as mcpLogger } from "./logger.ts";
export type { SSETransportConfig, WebSocketTransportConfig, StdioTransportConfig, TransportType, TransportOptions } from "./transports/index.ts";
export { SSETransport, WebSocketTransport, createTransport } from "./transports/index.ts";
