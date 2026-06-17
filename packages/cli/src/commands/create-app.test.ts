import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as process from "node:process";

const TEST_DIR = join(process.cwd(), "test-create-app-output");

describe("hive create-app", () => {
  beforeEach(() => {
    // Clean up before each test
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up after each test
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("generates a hive-app template with correct structure", async () => {
    const { copyTemplate } = await import("./create-app-utils.ts");

    copyTemplate(TEST_DIR, { "{{APP_NAME}}": "my-test-app" });

    // Check all expected files exist
    expect(existsSync(join(TEST_DIR, "package.json"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "hive.config.ts"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "docker-compose.yml"))).toBe(true);
    expect(existsSync(join(TEST_DIR, ".env.example"))).toBe(true);
    expect(existsSync(join(TEST_DIR, ".gitignore"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "src", "main.ts"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "src", "agents", "coordinator.ts"))).toBe(true);
  });

  it("replaces {{APP_NAME}} placeholder in all files", async () => {
    const { copyTemplate } = await import("./create-app-utils.ts");

    copyTemplate(TEST_DIR, { "{{APP_NAME}}": "my-awesome-app" });

    const packageJson = readFileSync(join(TEST_DIR, "package.json"), "utf-8");
    expect(packageJson).toContain('"name": "my-awesome-app"');

    const config = readFileSync(join(TEST_DIR, "hive.config.ts"), "utf-8");
    expect(config).toContain('name: "my-awesome-app"');

    const main = readFileSync(join(TEST_DIR, "src", "main.ts"), "utf-8");
    expect(main).toContain("Starting my-awesome-app...");
    expect(main).toContain("my-awesome-app is running at");
  });

  it("generates valid package.json", async () => {
    const { copyTemplate } = await import("./create-app-utils.ts");

    copyTemplate(TEST_DIR, { "{{APP_NAME}}": "test-app" });

    const packageJson = JSON.parse(readFileSync(join(TEST_DIR, "package.json"), "utf-8"));

    expect(packageJson.name).toBe("test-app");
    expect(packageJson.version).toBe("0.1.0");
    expect(packageJson.type).toBe("module");
    expect(packageJson.scripts.dev).toBe("bun run src/main.ts");
    expect(packageJson.scripts.build).toBeDefined();
    expect(packageJson.dependencies["@johpaz/hive-sdk"]).toBe("latest");
  });

  it("generates hive.config.ts with correct defaults", async () => {
    const { copyTemplate } = await import("./create-app-utils.ts");

    copyTemplate(TEST_DIR, { "{{APP_NAME}}": "config-test" });

    const config = readFileSync(join(TEST_DIR, "hive.config.ts"), "utf-8");

    expect(config).toContain('host: process.env.HIVE_HOST ?? "127.0.0.1"');
    expect(config).toContain('port: Number(process.env.HIVE_PORT ?? 18790)');
    expect(config).toContain("webchat: { enabled: true }");
    expect(config).toContain("telegram: { enabled: false }");
    expect(config).toContain("discord: { enabled: false }");
    expect(config).toContain("whatsapp: { enabled: false }");
    expect(config).toContain("slack: { enabled: false }");
    expect(config).toContain('path: process.env.HIVE_DATA_DIR ?? "./data/hive.db"');
  });

  it("generates main.ts with all required imports", async () => {
    const { copyTemplate } = await import("./create-app-utils.ts");

    copyTemplate(TEST_DIR, { "{{APP_NAME}}": "main-test" });

    const main = readFileSync(join(TEST_DIR, "src", "main.ts"), "utf-8");

    expect(main).toContain('from "@johpaz/hive-sdk"');
    expect(main).toContain("createAgent");
    expect(main).toContain("startGateway");
    expect(main).toContain("initializeDatabase");
    expect(main).toContain("ChannelManager");
    expect(main).toContain("logger");
    expect(main).toContain('import config from "../hive.config.ts"');
    expect(main).toContain("await initializeDatabase()");
    expect(main).toContain('await startGateway({');
    expect(main).toContain('process.on("SIGINT"');
  });

  it("generates coordinator agent with correct config", async () => {
    const { copyTemplate } = await import("./create-app-utils.ts");

    copyTemplate(TEST_DIR, { "{{APP_NAME}}": "agent-test" });

    const agent = readFileSync(join(TEST_DIR, "src", "agents", "coordinator.ts"), "utf-8");

    expect(agent).toContain('import { createAgent } from "@johpaz/hive-sdk"');
    expect(agent).toContain('name: "coordinator"');
    expect(agent).toContain('provider: "openai"');
    expect(agent).toContain('model: "gpt-4o-mini"');
  });

  it("generates docker-compose.yml with correct ports", async () => {
    const { copyTemplate } = await import("./create-app-utils.ts");

    copyTemplate(TEST_DIR, { "{{APP_NAME}}": "docker-test" });

    const docker = readFileSync(join(TEST_DIR, "docker-compose.yml"), "utf-8");

    expect(docker).toContain('image: oven/bun:latest');
    expect(docker).toContain('"${HIVE_PORT:-18790}:18790"');
    expect(docker).toContain('HIVE_HOST=0.0.0.0');
    expect(docker).toContain('HIVE_PORT=18790');
    expect(docker).toContain('command: ["bun", "run", "src/main.ts"]');
    expect(docker).toContain('restart: unless-stopped');
  });

  it("generates .env.example with all required variables", async () => {
    const { copyTemplate } = await import("./create-app-utils.ts");

    copyTemplate(TEST_DIR, { "{{APP_NAME}}": "env-test" });

    const env = readFileSync(join(TEST_DIR, ".env.example"), "utf-8");

    expect(env).toContain("HIVE_HOST=");
    expect(env).toContain("HIVE_PORT=");
    expect(env).toContain("HIVE_DATA_DIR=");
    expect(env).toContain("OPENAI_API_KEY=");
    expect(env).toContain("ANTHROPIC_API_KEY=");
    expect(env).toContain("GOOGLE_API_KEY=");
    expect(env).toContain("TELEGRAM_BOT_TOKEN=");
    expect(env).toContain("DISCORD_BOT_TOKEN=");
    expect(env).toContain("SLACK_BOT_TOKEN=");
    expect(env).toContain("LOG_LEVEL=");
  });
});
