import { getHiveDB, hiveCollection } from "./HiveDBStorage.ts";
import { logger } from "../utils/logger.ts";
import { SEED_DATA, INITIAL_PLAYBOOK_RULES } from "./seed.ts";
import { SkillLoader } from "../skills/index.ts";
import { enrichToolDescription } from "../agent/selectors/ToolSelector.ts";
import type { ToolDescriptor } from "../agent/selectors/ToolSelector.ts";
import type { IndexDoc, HiveDB } from "@johpaz/hive-db";

const log = logger.child("hive-seed");

export interface HiveToolDoc {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  active: boolean;
}

export interface HiveProviderDoc {
  id: string;
  name: string;
  baseUrl?: string;
  category: string;
  enabled: boolean;
  active: boolean;
}

export interface HiveModelDoc {
  id: string;
  providerId: string;
  name: string;
  modelType: string;
  contextWindow?: number;
  capabilities?: string[];
  enabled: boolean;
  active: boolean;
}

export interface HiveSkillDoc {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  icon: string;
  category: string;
  permissions: string[];
  dependencies: string[];
  tools: string[];
  triggers: string[];
  preferredAgents: string[];
  body: string;
  versionNum: number;
  active: boolean;
}

export interface HiveAgentDoc {
  id: string;
  userId?: string;
  name: string;
  description: string;
  systemPrompt: string;
  toolsJson?: string;
  role: string;
  status: string;
  parentId?: string;
  providerId: string;
  modelId: string;
  tone?: string;
  maxIterations: number;
  workspace?: string;
  enabled: boolean;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface HiveChannelDoc {
  id: string;
  type: string;
  enabled: boolean;
  active: boolean;
  status: string;
}

export interface HiveEthicsDoc {
  id: string;
  name: string;
  description: string;
  content: string;
  isDefault: boolean;
  enabled: boolean;
  active: boolean;
}

export interface HiveCodeBridgeDoc {
  id: string;
  name: string;
  cliCommand: string;
  port: number;
  enabled: boolean;
  active: boolean;
}

export interface HiveCodeBridgeConfigDoc {
  id: string;
  key: string;
  value: string;
}

export interface HivePlaybookDoc {
  rule: string;
  category: string;
  applicableTo?: string[];
  helpfulCount: number;
  harmfulCount: number;
  active: boolean;
}

export async function seedHiveDB(db?: HiveDB): Promise<void> {
  db ??= await getHiveDB();

  log.info("[hive-seed] 🌱 Iniciando seed de HiveDB");

  // 1️⃣ Tools
  const toolsCol = db.collection<HiveToolDoc>("tools");
  await toolsCol.createIndex("name", { unique: true });
  for (const tool of SEED_DATA.tools) {
    await toolsCol.put(tool.id, {
      name: tool.name,
      description: tool.description,
      category: tool.category,
      enabled: tool.enabled ?? true,
      active: true,
    });
  }
  log.info(`[hive-seed] ✅ ${SEED_DATA.tools.length} tools seeded`);

  // 2️⃣ Index tools for hybrid search
  const toolDocs: IndexDoc[] = SEED_DATA.tools.map(tool => ({
    id: tool.name,
    name: tool.name,
    body: enrichToolDescription({ name: tool.name, description: tool.description, category: tool.category } as ToolDescriptor),
    tags: tool.category,
    filters: [{ field: "type", value: "tool" }],
  }));
  await db.upsertBatch(toolDocs);
  log.info(`[hive-seed] ✅ ${toolDocs.length} tools indexed`);

  // 3️⃣ Providers
  const providersCol = db.collection<HiveProviderDoc>("providers");
  await providersCol.createIndex("id", { unique: true });
  for (const provider of SEED_DATA.providers) {
    await providersCol.put(provider.id, {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      category: provider.category ?? "llm",
      enabled: true,
      active: false,
    });
  }
  const ollamaHost = process.env.OLLAMA_HOST;
  if (ollamaHost) {
    const entry = await providersCol.get("ollama");
    if (entry) {
      await providersCol.put("ollama", { ...entry.doc, baseUrl: ollamaHost });
    }
  }
  log.info(`[hive-seed] ✅ ${SEED_DATA.providers.length} providers seeded`);

  // 4️⃣ Models
  const modelsCol = db.collection<HiveModelDoc>("models");
  await modelsCol.createIndex("id", { unique: true });
  await modelsCol.createIndex("providerId");
  for (const model of SEED_DATA.models) {
    await modelsCol.put(model.id, {
      id: model.id,
      providerId: model.providerId,
      name: model.name,
      modelType: model.modelType,
      contextWindow: model.contextWindow,
      capabilities: model.capabilities ? JSON.parse(model.capabilities) : undefined,
      enabled: true,
      active: false,
    });
  }
  log.info(`[hive-seed] ✅ ${SEED_DATA.models.length} models seeded`);

  // 5️⃣ MCP servers
  const mcpCol = db.collection("mcp_servers");
  await mcpCol.createIndex("id", { unique: true });
  for (const mcp of SEED_DATA.mcpServers) {
    await mcpCol.put(mcp.id, { ...mcp, enabled: true, active: false, builtin: mcp.builtin, toolsCount: 0 });
  }
  log.info(`[hive-seed] ✅ ${SEED_DATA.mcpServers.length} MCP servers seeded`);

  // 6️⃣ Channels
  const channelsCol = db.collection<HiveChannelDoc>("channels");
  await channelsCol.createIndex("id", { unique: true });
  for (const channel of SEED_DATA.channels) {
    const isWebChat = channel.id === "webchat";
    await channelsCol.put(channel.id, {
      id: channel.id,
      type: channel.type,
      enabled: true,
      active: isWebChat,
      status: isWebChat ? "connected" : "disconnected",
    });
  }
  log.info(`[hive-seed] ✅ ${SEED_DATA.channels.length} channels seeded`);

  // 7️⃣ Ethics
  const ethicsCol = db.collection<HiveEthicsDoc>("ethics");
  await ethicsCol.createIndex("id", { unique: true });
  for (const ethics of SEED_DATA.ethics) {
    await ethicsCol.put(ethics.id, {
      id: ethics.id,
      name: ethics.name,
      description: ethics.description,
      content: ethics.content,
      isDefault: ethics.isDefault,
      enabled: true,
      active: ethics.isDefault,
    });
  }
  log.info(`[hive-seed] ✅ ${SEED_DATA.ethics.length} ethics templates seeded`);

  // 8️⃣ Code Bridge
  const cbCol = db.collection<HiveCodeBridgeDoc>("code_bridge");
  await cbCol.createIndex("id", { unique: true });
  for (const cb of SEED_DATA.codeBridge) {
    await cbCol.put(cb.id, { ...cb, enabled: false, active: false });
  }
  log.info(`[hive-seed] ✅ ${SEED_DATA.codeBridge.length} Code Bridge entries seeded`);

  // 9️⃣ Code Bridge Config
  const cbConfigCol = db.collection<HiveCodeBridgeConfigDoc>("code_bridge_config");
  await cbConfigCol.createIndex("id", { unique: true });
  for (const config of SEED_DATA.codeBridgeConfig) {
    await cbConfigCol.put(config.id, config);
  }
  log.info(`[hive-seed] ✅ ${SEED_DATA.codeBridgeConfig.length} Code Bridge Config entries seeded`);

  // 🔟 Skills
  const skillLoader = new SkillLoader({ workspacePath: process.env.HIVE_HOME || process.cwd() });
  const realSkills = skillLoader.loadBundledSkills();
  const skillsCol = db.collection("skills");
  await skillsCol.createIndex("id", { unique: true });
  const skillDocs: IndexDoc[] = [];
  for (const s of realSkills) {
    const doc = {
      id: s.name,
      name: s.name,
      description: s.description || "",
      version: typeof s.version === "string" ? s.version : String(s.version || "0.0.1"),
      author: s.author || "Anonymous",
      icon: s.icon || "🧩",
      category: s.category || "general",
      permissions: s.permissions || [],
      dependencies: s.dependencies || [],
      tools: s.tools || [],
      triggers: s.triggers || [],
      preferredAgents: s.preferred_agents || [],
      body: s.content || "",
      versionNum: parseInt(String(s.version || "0.0.1").split(".")[0]) || 1,
      active: true,
    };
    await skillsCol.put(s.name, doc);
    skillDocs.push({
      id: s.name,
      name: s.name,
      body: `${s.description || ""} ${s.content || ""}`,
      tags: [s.category || "general", ...(s.tools || []), ...(s.triggers || [])].join(" "),
      filters: [{ field: "type", value: "skill" }],
    });
  }
  await db.upsertBatch(skillDocs);
  log.info(`[hive-seed] ✅ ${realSkills.length} skills seeded and indexed`);

  // 11. ACE Playbook
  const playbookCol = db.collection<HivePlaybookDoc>("playbook");
  await playbookCol.createIndex("id", { unique: true });
  const playbookDocs: IndexDoc[] = [];
  for (const rule of INITIAL_PLAYBOOK_RULES) {
    const doc = {
      rule: rule.rule,
      category: rule.category,
      applicableTo: rule.applicable_to ? JSON.parse(rule.applicable_to) : undefined,
      helpfulCount: 1,
      harmfulCount: 0,
      active: true,
    };
    const id = `${rule.category}-${rule.rule.slice(0, 32).replace(/\s+/g, "-")}`;
    await playbookCol.put(id, doc);
    playbookDocs.push({
      id,
      name: rule.category,
      body: rule.rule,
      tags: rule.applicable_to || "",
      filters: [{ field: "type", value: "playbook" }],
    });
  }
  await db.upsertBatch(playbookDocs);
  log.info(`[hive-seed] ✅ ${INITIAL_PLAYBOOK_RULES.length} playbook rules seeded and indexed`);

  log.info("[hive-seed] ✨ HiveDB seed completado");
}
