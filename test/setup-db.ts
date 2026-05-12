/**
 * Test Database Setup with Real SQLite
 * 
 * Uses the project's real database if available, or creates an in-memory one.
 */

import { Database } from "bun:sqlite";
import * as path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { SCHEMA, PROJECTS_SCHEMA, CONTEXT_ENGINE_SCHEMA, MEETING_SCHEMA } from "../packages/core/src/storage/schema.ts";

let testDb: Database | null = null;

export function getTestDb(): Database {
  if (!testDb) {
    throw new Error("Test DB not initialized. Call setupTestDb() first.");
  }
  return testDb;
}

export function setupTestDb(options?: { useRealDb?: boolean; dbPath?: string }): Database {
  const useRealDb = options?.useRealDb ?? false;
  
  if (useRealDb) {
    // Use real database from project
    try {
      const hiveDir = process.env.HIVE_DATA_DIR || path.join(process.cwd(), ".hive");
      const dataDir = path.join(hiveDir, "data");
      
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      
      const dbPath = options?.dbPath || path.join(dataDir, "hive.db");
      testDb = new Database(dbPath);
      
      // Initialize schema if needed
      testDb.run(SCHEMA);
      testDb.run(PROJECTS_SCHEMA);
      testDb.run(CONTEXT_ENGINE_SCHEMA);
      testDb.run(MEETING_SCHEMA);
      
      console.log("[test] Using real database at:", dbPath);
    } catch (err) {
      console.warn("[test] Could not use real DB, falling back to in-memory:", err);
      testDb = createInMemoryDb();
    }
  } else {
    testDb = createInMemoryDb();
  }
  
  return testDb;
}

function createInMemoryDb(): Database {
  testDb = new Database(":memory:");
  
  testDb.run(SCHEMA);
  testDb.run(PROJECTS_SCHEMA);
  testDb.run(CONTEXT_ENGINE_SCHEMA);
  testDb.run(MEETING_SCHEMA);
  
  console.log("[test] Using in-memory database");
  
  return testDb;
}

export function teardownTestDb() {
  if (testDb) {
    testDb.close();
    testDb = null;
  }
}

export function insertTestAgent(overrides: Record<string, any> = {}): string {
  const db = getTestDb();
  const id = overrides.id ?? crypto.randomUUID();
  
  db.query(`
    INSERT INTO agents (id, name, description, role, status, enabled, max_iterations, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    overrides.name ?? "Test Agent",
    overrides.description ?? "Test agent description",
    overrides.role ?? "worker",
    overrides.status ?? "idle",
    overrides.enabled ?? 1,
    overrides.maxIterations ?? 10,
    overrides.userId ?? "test-user"
  );
  
  return id;
}

export function insertTestProvider(overrides: Record<string, any> = {}): string {
  const db = getTestDb();
  const id = overrides.id ?? crypto.randomUUID();
  
  db.query(`
    INSERT INTO providers (id, name, category, enabled, active)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    id,
    overrides.name ?? "test-provider",
    overrides.category ?? "llm",
    overrides.enabled ?? 1,
    overrides.active ?? 0
  );
  
  return id;
}

export function insertTestTool(overrides: Record<string, any> = {}): string {
  const db = getTestDb();
  const id = overrides.id ?? crypto.randomUUID();
  
  db.query(`
    INSERT INTO tools (id, name, description, category, enabled, active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    overrides.name ?? "test_tool",
    overrides.description ?? "Test tool description",
    overrides.category ?? "bundled",
    overrides.enabled ?? 1,
    overrides.active ?? 1
  );
  
  try {
    db.query(`
      INSERT OR REPLACE INTO tools_fts (tool_name, name, description, category)
      VALUES (?, ?, ?, ?)
    `).run(
      overrides.name ?? "test_tool",
      overrides.name ?? "test_tool",
      overrides.description ?? "Test tool description",
      overrides.category ?? "bundled"
    );
  } catch {
    // FTS table might not exist in minimal schema
  }
  
  return id;
}

export function insertTestSkill(overrides: Record<string, any> = {}): string {
  const db = getTestDb();
  const id = overrides.id ?? crypto.randomUUID();
  
  db.query(`
    INSERT INTO skills (id, name, description, category, tools, triggers, body, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    overrides.name ?? "test_skill",
    overrides.description ?? "Test skill description",
    overrides.category ?? "core",
    overrides.tools ?? "[]",
    overrides.triggers ?? "[]",
    overrides.body ?? "# Test Skill",
    overrides.active ?? 1
  );
  
  try {
    db.query(`
      INSERT OR REPLACE INTO skills_fts (id, name, description, category, tools, triggers, body)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      overrides.name ?? "test_skill",
      overrides.description ?? "Test skill description",
      overrides.category ?? "core",
      overrides.tools ?? "[]",
      overrides.triggers ?? "[]",
      overrides.body ?? "# Test Skill"
    );
  } catch {
    // FTS table might not exist
  }
  
  return id;
}

export function insertTestPlaybookRule(overrides: Record<string, any> = {}): number {
  const db = getTestDb();
  
  const result = db.query(`
    INSERT INTO playbook (rule, category, applicable_to, active)
    VALUES (?, ?, ?, ?)
  `).run(
    overrides.rule ?? "Test rule",
    overrides.category ?? "tool_selection",
    overrides.applicableTo ?? null,
    overrides.active ?? 1
  );
  
  return result.lastInsertRowId as number;
}

export function insertTestConversation(threadId: string, role: string, content: string): number {
  const db = getTestDb();
  
  const result = db.query(`
    INSERT INTO conversations (thread_id, channel, role, content, token_count)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    threadId,
    "test",
    role,
    content,
    Math.floor(content.length / 4)
  );
  
  return result.lastInsertRowId as number;
}