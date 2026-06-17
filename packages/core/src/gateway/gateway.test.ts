import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { startGateway } from "./index.ts";

describe("gateway", () => {
  let server: ReturnType<typeof startGateway> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    server = await startGateway({ host: "127.0.0.1", port: 18791, agentId: "test" });
  });

  afterAll(() => {
    server?.stop(true);
  });

  it("returns health status", async () => {
    const res = await fetch("http://127.0.0.1:18791/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.gateway).toBe(true);
    expect(body.agentId).toBe("test");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await fetch("http://127.0.0.1:18791/unknown");
    expect(res.status).toBe(404);
  });

  it("chat endpoint requires database setup", async () => {
    const res = await fetch("http://127.0.0.1:18791/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });
    // Will fail because no DB/agent configured, but endpoint exists
    expect(res.status).toBe(500);
  });
});
