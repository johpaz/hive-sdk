#!/usr/bin/env bun

import {
  createAgent,
  startGateway,
  initializeDatabase,
  ChannelManager,
  logger,
  loadConfig,
} from "@johpaz/hive-sdk";
import config from "../hive.config.ts";

const log = logger.child("app");

async function main() {
  log.info(`Starting {{APP_NAME}}...`);

  // Initialize database
  await initializeDatabase();

  // Create the main agent
  const agent = await createAgent({
    name: "coordinator",
    provider: "openai",
    model: "gpt-4o-mini",
    systemPrompt:
      "You are a helpful AI assistant running in a Hive harness. You can use tools, manage tasks, and communicate across channels.",
  });

  log.info(`Agent ready: ${agent.name}`);

  // Initialize channels
  const channelManager = new ChannelManager();
  // TODO: configure channels from hive.config.ts

  // Start the gateway
  const gateway = await startGateway({
    host: config.gateway?.host,
    port: config.gateway?.port,
    agentId: "coordinator",
  });

  log.info(`{{APP_NAME}} is running at http://${gateway.hostname}:${gateway.port}`);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    log.info("Shutting down...");
    gateway.stop(true);
    process.exit(0);
  });
}

main().catch((err) => {
  log.error("Fatal error:", err);
  process.exit(1);
});
