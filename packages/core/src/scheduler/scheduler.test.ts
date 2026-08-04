process.env.HIVE_DB_PATH = ":memory:";

import { describe, expect, it } from "bun:test";
import { CronScheduler } from "./CronScheduler.ts";

// `new CronScheduler(db, handler)` pasó a `new CronScheduler(handler)`: los jobs
// viven en la colección `cronJobs` de HiveDB y el scheduler la abre solo, así
// que ya no recibe un handle de base.

describe("CronScheduler", () => {
  it("creates a scheduler instance with a handler", () => {
    const scheduler = new CronScheduler(async () => ({ success: true }));
    expect(scheduler).toBeDefined();
  });
});
