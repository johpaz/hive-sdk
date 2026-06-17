import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { CronScheduler } from "./CronScheduler.ts";
import { getTestDb, setupTestDb, teardownTestDb } from "../../../../test/setup-db.ts";

describe("CronScheduler", () => {
  beforeAll(() => {
    setupTestDb();
  });

  afterAll(() => {
    teardownTestDb();
  });

  it("creates a scheduler instance with db and handler", () => {
    const db = getTestDb();
    const scheduler = new CronScheduler(db, async () => ({ success: true }));
    expect(scheduler).toBeDefined();
  });
});
