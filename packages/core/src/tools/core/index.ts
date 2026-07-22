/**
 * Core Tools - 4 tools
 *
 * @category core
 */

import type { Tool } from "../types.ts";
import { getDb } from "../../storage/SQLiteStorage.ts";
import { getHiveDB } from "../../storage/HiveDBStorage.ts";
import { logger } from "../../utils/logger.ts";

const log = logger.child("core");

// ─── search_knowledge ────────────────────────────────────────────────────────

function buildSearchQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 8)
    .join(" ");
}

export const searchKnowledgeTool: Tool = {
  name: "search_knowledge",
  description: "Busca herramientas NATIVAS (tools), MCP (tools externas), habilidades (skills) o reglas del playbook en la base de conocimientos. Usa búsqueda híbrida (BM25 + vector). type='mcp' para herramientas MCP, type='all' para buscar en todo.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Término de búsqueda (nombre, descripción, categoría).",
      },
      type: {
        type: "string",
        enum: ["all", "tools", "skills", "playbook", "mcp"],
        description: "Tipo de conocimiento a buscar",
      },
      limit: {
        type: "number",
        description: "Máximo de resultados (default: 10)",
      },
    },
    required: ["query"],
  },
  execute: async (params: Record<string, unknown>) => {
    const db = await getHiveDB();
    const query = params.query as string;
    const type = (params.type as string) ?? "all";
    const limit = (params.limit as number) ?? 10;

    try {
      const searchQuery = buildSearchQuery(query);
      if (!searchQuery) {
        return { ok: true, query, type, tools: [], skills: [], playbook: [], toolsmcp: [], totalResults: 0 };
      }

      const result: any = { query, type, tools: [], skills: [], playbook: [], toolsmcp: [] };

      async function searchByType(docType: string) {
        return db.queryHybrid({
          text: searchQuery,
          k: limit,
          filters: [{ field: "type", value: docType }],
          boosts: { name: 5.0, body: 3.0, tags: 2.0 },
        });
      }

      if (type === "all" || type === "tools") {
        const hits = await searchByType("tool");
        const toolsCol = db.collection<{ name: string; description: string; category: string; enabled: boolean; active: boolean }>("tools");
        for (const hit of hits) {
          const entry = await toolsCol.get(hit.id);
          const doc = entry?.doc;
          result.tools.push({
            id: hit.id,
            name: doc?.name ?? hit.id,
            description: doc?.description ?? "",
            category: doc?.category ?? "core",
            enabled: doc?.enabled ?? true,
            active: doc?.active ?? true,
            rank: hit.score,
          });
        }
      }

      if (type === "all" || type === "skills") {
        const hits = await searchByType("skill");
        const skillsCol = db.collection<{ name: string; description: string; category: string; body: string; tools: string[]; triggers: string[]; active: boolean }>("skills");
        for (const hit of hits) {
          const entry = await skillsCol.get(hit.id);
          const doc = entry?.doc;
          result.skills.push({
            id: hit.id,
            name: doc?.name ?? hit.id,
            description: doc?.description ?? "",
            category: doc?.category ?? "general",
            tools: doc?.tools ?? [],
            triggers: doc?.triggers ?? [],
            body: doc?.body ? (doc.body.length > 400 ? doc.body.substring(0, 400) + "…" : doc.body) : undefined,
            active: doc?.active ?? true,
            rank: hit.score,
          });
        }
      }

      if (type === "all" || type === "playbook") {
        const hits = await searchByType("playbook");
        const playbookCol = db.collection<{ rule: string; category: string; applicableTo?: string[]; active: boolean }>("playbook");
        for (const hit of hits) {
          const entry = await playbookCol.get(hit.id);
          const doc = entry?.doc;
          result.playbook.push({
            id: hit.id,
            rule: doc?.rule ?? "",
            category: doc?.category ?? "",
            applicable_to: doc?.applicableTo ?? null,
            active: doc?.active ?? true,
            rank: hit.score,
          });
        }
      }

      if (type === "all" || type === "mcp") {
        const mcpCol = db.collection<{ serverName: string; toolName: string; description: string; category: string; active: boolean }>("mcp_tools");
        const entries = await mcpCol.scan();
        const q = searchQuery.toLowerCase();
        const matches = entries
          .map(e => e.doc)
          .filter(m => m.active && (
            m.toolName.toLowerCase().includes(q) ||
            m.description.toLowerCase().includes(q) ||
            m.category.toLowerCase().includes(q)
          ))
          .slice(0, limit);
        result.toolsmcp = matches.map(m => ({
          id: `${m.serverName}__${m.toolName}`,
          full_name: `${m.serverName}__${m.toolName}`,
          server_name: m.serverName,
          tool_name: m.toolName,
          description: m.description,
          category: m.category,
          active: true,
          rank: 0,
        }));
      }

      result.totalResults = result.tools.length + result.skills.length + result.playbook.length + result.toolsmcp.length;

      return { ok: true, ...result };
    } catch (error) {
      return {
        ok: false,
        error: `Search failed: ${(error as Error).message}`,
      };
    }
  },
};

// ─── notify ──────────────────────────────────────────────────────────────────

export const notifyTool: Tool = {
  name: "notify",
  description: "Send a notification or progress update to the user's active channel. Use this to keep the user informed while working on long tasks.",
  parameters: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "Notification message to send to the user",
      },
    },
    required: ["message"],
  },
  execute: async (params: Record<string, unknown>, config?: any) => {
    const { sendToUserChannel } = await import("../../gateway/channel-notify.ts");
    const message = params.message as string;
    const channel = (config?.configurable?.channel as string) ?? "webchat";
    const userId = (config?.configurable?.user_id as string) ?? "";

    log.info(`[notify] Sending to ${channel}/${userId}: ${message.substring(0, 80)}`);

    const result = await sendToUserChannel(channel, userId, message)
    if (!result.ok) throw new Error(`Channel send failed: ${result.error}`)
    return result
  },
};

// ─── save_note (scratchpad) ──────────────────────────────────────────────────

interface ScratchpadDoc {
  threadId: string;
  key: string;
  value: string;
  updatedAt: number;
}

export const saveNoteTool: Tool = {
  name: "save_note",
  description: "Save a note to the scratchpad (survives context compression).",
  parameters: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description: "Unique key for the note",
      },
      value: {
        type: "string",
        description: "Note content",
      },
      thread_id: {
        type: "string",
        description: "Thread ID (optional, uses current thread if not specified)",
      },
    },
    required: ["key", "value"],
  },
  execute: async (params: Record<string, unknown>, config?: any) => {
    const db = await getHiveDB();
    const key = params.key as string;
    const value = params.value as string;
    const threadId = (params.thread_id as string) ?? config?.configurable?.thread_id ?? "default";

    try {
      const col = db.collection<ScratchpadDoc>("scratchpad");
      await col.put(`${threadId}:${key}`, { threadId, key, value, updatedAt: Date.now() });

      return { ok: true, key, message: "Note saved." };
    } catch (error) {
      return {
        ok: false,
        error: `Failed to save note: ${(error as Error).message}`,
      };
    }
  },
};

// ─── report_progress ─────────────────────────────────────────────────────────

export const reportProgressTool: Tool = {
  name: "report_progress",
  description: "Report progress of an ongoing task to the user. Sends a real-time update to the active channel. Use frequently during long operations so the user knows what's happening.",
  parameters: {
    type: "object",
    properties: {
      progress: {
        type: "number",
        description: "Progress percentage (0-100)",
      },
      message: {
        type: "string",
        description: "Progress message describing what you are currently doing",
      },
      task_id: {
        type: "string",
        description: "Task or project ID (optional)",
      },
    },
    required: ["progress", "message"],
  },
  execute: async (params: Record<string, unknown>, config?: any) => {
    const { sendToUserChannel } = await import("../../gateway/channel-notify.ts");
    const progress = params.progress as number;
    const message = params.message as string;
    const taskId = (params.task_id as string) ?? null;
    const channel = (config?.configurable?.channel as string) ?? "webchat";
    const userId = (config?.configurable?.user_id as string) ?? "";

    log.info(`[report_progress] ${progress}% — ${message}`);

    // Update task progress in DB if task_id provided
    if (taskId) {
      const db = getDb();
      db.query(`UPDATE tasks SET progress = ?, updated_at = unixepoch() WHERE id = ?`).run(progress, taskId);
    }

    // Send real-time update to the user's channel
    const progressEmoji = progress >= 100 ? "✅" : progress >= 50 ? "⚙️" : "🔄";
    const result = await sendToUserChannel(channel, userId, `${progressEmoji} ${progress}% — ${message}`)
    if (!result.ok) throw new Error(`Channel send failed: ${result.error}`)

    return { ok: true, progress, message, task_id: taskId };
  },
};

export function createTools(): Tool[] {
  return [searchKnowledgeTool, notifyTool, saveNoteTool, reportProgressTool];
}
