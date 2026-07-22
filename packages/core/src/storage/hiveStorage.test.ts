import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { HiveDB } from "@johpaz/hive-db";
import { seedHiveDB } from "./hiveSeed.ts";

describe("HiveDB integration", () => {
  let db: HiveDB;

  beforeAll(async () => {
    db = await HiveDB.open(":memory:", { vector: { dimension: 384, spaceId: "hive-sdk-v1" } });
    await seedHiveDB(db);
  });

  afterAll(() => {
    db.close();
  });

  it("seeds providers and models", async () => {
    const providers = await db.collection("providers").count();
    const models = await db.collection("models").count();
    expect(providers).toBeGreaterThan(0);
    expect(models).toBeGreaterThan(0);
  });

  it("indexes tools for hybrid search", async () => {
    const hits = await db.queryHybrid({ text: "buscar archivos", k: 10 });
    expect(hits.length).toBeGreaterThan(0);
    const names = hits.map(h => h.id);
    expect(names.some(n => n.startsWith("fs_") || n.includes("research"))).toBe(true);
  });

  it("supports collection CRUD for agents", async () => {
    const agents = db.collection<{ name: string; role: string; status: string }>("agents");
    await agents.put("agent-1", { name: "Test Worker", role: "worker", status: "idle" });
    const entry = await agents.get("agent-1");
    expect(entry).toBeDefined();
    expect(entry!.doc.name).toBe("Test Worker");
  });
});
