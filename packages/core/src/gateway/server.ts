/**
 * Hive Gateway — simplified HTTP/WebSocket server for the SDK harness.
 *
 * Provides:
 * - POST /chat — chat with an agent
 * - GET /status — health check
 * - WebSocket /ws — real-time streaming
 */

import { logger } from "../utils/logger";
import { runAgent } from "../agent/AgentRunner";
import type { MCPClientManager } from "../mcp/index";

const log = logger.child("gateway");

export interface GatewayConfig {
  host?: string;
  port?: number;
  agentId?: string;
  mcpManager?: MCPClientManager | null;
}

export async function startGateway(config: GatewayConfig = {}) {
  const host = config.host ?? "127.0.0.1";
  const port = config.port ?? 18790;
  const agentId = config.agentId ?? "main";

  log.info(`Starting gateway on ${host}:${port}`);

  const server = Bun.serve({
    hostname: host,
    port,
    fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket upgrade
      if (url.pathname === "/ws") {
        const success = server.upgrade(req);
        if (success) return undefined as any;
      }

      // Health check
      if (url.pathname === "/status" && req.method === "GET") {
        return Response.json({
          status: "ok",
          gateway: true,
          agentId,
          uptime: process.uptime(),
        });
      }

      // Chat endpoint
      if (url.pathname === "/chat" && req.method === "POST") {
        return handleChat(req, agentId, config.mcpManager);
      }

      return new Response("Not Found", { status: 404 });
    },
    websocket: {
      async message(ws, message) {
        try {
          const data = JSON.parse(String(message));
          const threadId = data.threadId ?? crypto.randomUUID();

          const stream = runAgent({
            agentId,
            userMessage: data.message ?? "",
            threadId,
            channel: "webchat",
            mcpManager: config.mcpManager,
          });

          for await (const chunk of stream) {
            ws.send(JSON.stringify(chunk));
          }
          ws.send(JSON.stringify({ done: true }));
        } catch (err) {
          log.error("WebSocket error:", err);
          ws.send(JSON.stringify({ error: (err as Error).message }));
        }
      },
      open(ws) {
        log.info("WebSocket client connected");
      },
      close(ws, code, reason) {
        log.info("WebSocket client disconnected");
      },
    },
  });

  log.info(`Gateway ready at http://${host}:${port}`);
  return server;
}

async function handleChat(
  req: Request,
  agentId: string,
  mcpManager?: MCPClientManager | null
): Promise<Response> {
  try {
    const body = await req.json();
    const message = body.message ?? "";
    const threadId = body.threadId ?? crypto.randomUUID();

    const stream = runAgent({
      agentId,
      userMessage: message,
      threadId,
      channel: "webchat",
      mcpManager,
    });

    const chunks: any[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    // Extract text from the last agent message
    let responseText = "";
    for (const chunk of chunks) {
      if (chunk.agent?.messages) {
        for (const msg of chunk.agent.messages) {
          if (msg.content && typeof msg.content === "string") {
            responseText = msg.content;
          }
        }
      }
    }

    return Response.json({
      response: responseText,
      threadId,
      chunks,
    });
  } catch (err) {
    log.error("Chat error:", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
