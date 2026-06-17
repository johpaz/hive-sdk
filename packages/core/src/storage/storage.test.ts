import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb, getTestDb, insertTestAgent, insertTestProvider } from "../../../../test/setup-db.ts";

describe("storage", () => {
  beforeAll(() => {
    setupTestDb();
    // Insert a test user to satisfy foreign key constraints
    const db = getTestDb();
    db.query(`INSERT OR IGNORE INTO users (id, name, created_at) VALUES ('test-user', 'Test User', unixepoch())`).run();
  });

  afterAll(() => {
    teardownTestDb();
  });

  it("initializes in-memory test database", () => {
    const db = getTestDb();
    expect(db).toBeDefined();

    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("agents");
    expect(tableNames).toContain("conversations");
  });

  it("inserts test agent", () => {
    const agentId = insertTestAgent({ name: "Test Agent", userId: "test-user" });
    expect(agentId).toBeDefined();
    expect(typeof agentId).toBe("string");
  });

  it("inserts test provider", () => {
    const providerId = insertTestProvider({ name: "test-provider" });
    expect(providerId).toBeDefined();
    expect(typeof providerId).toBe("string");
  });
});
