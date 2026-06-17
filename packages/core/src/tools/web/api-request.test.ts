import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { apiRequestTool } from "./api-request.ts";

describe("apiRequestTool", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(response: Response) {
    globalThis.fetch = Object.assign(async () => response, { preconnect: async () => undefined }) as typeof fetch;
  }

  function mockResponse(
    body: BodyInit,
    init: ResponseInit & { headers?: Record<string, string> } = {}
  ): Response {
    return new Response(body, {
      status: init.status ?? 200,
      statusText: init.statusText ?? "OK",
      headers: init.headers ?? {},
    });
  }

  it("executes a simple GET request", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit = {};
    globalThis.fetch = Object.assign(async (url, init) => {
      capturedUrl = url.toString();
      capturedInit = init ?? {};
      return mockResponse(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
    }, { preconnect: async () => undefined }) as typeof fetch;

    const result = await apiRequestTool.execute({ url: "https://api.example.com/data" });

    expect(capturedUrl).toBe("https://api.example.com/data");
    expect(capturedInit.method).toBe("GET");
    expect(result).toMatchObject({
      ok: true,
      status: 200,
      data: { ok: true },
    });
  });

  it("sends POST with JSON body", async () => {
    let capturedInit: RequestInit = {};
    globalThis.fetch = Object.assign(async (_url, init) => {
      capturedInit = init ?? {};
      return mockResponse(JSON.stringify({ id: 1 }), { headers: { "content-type": "application/json" } });
    }, { preconnect: async () => undefined }) as typeof fetch;

    const result = await apiRequestTool.execute({
      url: "https://api.example.com/items",
      method: "POST",
      body: { name: "test" },
    });

    expect(capturedInit.method).toBe("POST");
    expect(capturedInit.headers).toMatchObject({ "content-type": "application/json" });
    expect(capturedInit.body).toBe(JSON.stringify({ name: "test" }));
    expect(result).toMatchObject({ ok: true, data: { id: 1 } });
  });

  it("applies bearer auth", async () => {
    let capturedInit: RequestInit = {};
    globalThis.fetch = Object.assign(async (_url, init) => {
      capturedInit = init ?? {};
      return mockResponse("{}");
    }, { preconnect: async () => undefined }) as typeof fetch;

    await apiRequestTool.execute({
      url: "https://api.example.com/private",
      auth: { type: "bearer", token: "secret-token" },
    });

    expect(new Headers(capturedInit.headers).get("Authorization")).toBe("Bearer secret-token");
  });

  it("applies basic auth", async () => {
    let capturedInit: RequestInit = {};
    globalThis.fetch = Object.assign(async (_url, init) => {
      capturedInit = init ?? {};
      return mockResponse("{}");
    }, { preconnect: async () => undefined }) as typeof fetch;

    await apiRequestTool.execute({
      url: "https://api.example.com/private",
      auth: { type: "basic", username: "alice", password: "secret" },
    });

    expect(new Headers(capturedInit.headers).get("Authorization")).toBe(`Basic ${btoa("alice:secret")}`);
  });

  it("applies api_key in header", async () => {
    let capturedInit: RequestInit = {};
    globalThis.fetch = Object.assign(async (_url, init) => {
      capturedInit = init ?? {};
      return mockResponse("{}");
    }, { preconnect: async () => undefined }) as typeof fetch;

    await apiRequestTool.execute({
      url: "https://api.example.com/private",
      auth: { type: "api_key", in: "header", name: "X-API-Key", value: "abc123" },
    });

    expect(new Headers(capturedInit.headers).get("X-API-Key")).toBe("abc123");
  });

  it("applies api_key in query", async () => {
    let capturedUrl = "";
    globalThis.fetch = Object.assign(async (url, _init) => {
      capturedUrl = url.toString();
      return mockResponse("{}");
    }, { preconnect: async () => undefined }) as typeof fetch;

    await apiRequestTool.execute({
      url: "https://api.example.com/private",
      auth: { type: "api_key", in: "query", name: "api_key", value: "abc123" },
    });

    expect(capturedUrl).toBe("https://api.example.com/private?api_key=abc123");
  });

  it("returns error for non-ok HTTP response", async () => {
    globalThis.fetch = Object.assign(async () => mockResponse("Not found", { status: 404, statusText: "Not Found" }), { preconnect: async () => undefined }) as typeof fetch;

    const result = await apiRequestTool.execute({ url: "https://api.example.com/missing" });

    expect(result).toMatchObject({
      ok: false,
      status: 404,
      error: "HTTP 404: Not Found",
    });
  });

  it("rejects non-http URLs", async () => {
    const result = await apiRequestTool.execute({ url: "file:///etc/passwd" });

    expect(result).toMatchObject({
      ok: false,
      error: "Invalid URL. Only http:// and https:// are allowed.",
    });
  });

  it("respects timeout", async () => {
    globalThis.fetch = Object.assign(async (_url, init) => {
      expect(init?.signal).toBeDefined();
      return mockResponse("{}");
    }, { preconnect: async () => undefined }) as typeof fetch;

    const result = await apiRequestTool.execute({ url: "https://api.example.com/data", timeoutMs: 5000 });
    expect(result).toMatchObject({ ok: true });
  });

  it("returns text for non-json responses", async () => {
    globalThis.fetch = Object.assign(async () => mockResponse("hello world", { headers: { "content-type": "text/plain" } }), { preconnect: async () => undefined }) as typeof fetch;

    const result = await apiRequestTool.execute({ url: "https://api.example.com/text" });

    expect(result).toMatchObject({
      ok: true,
      data: "hello world",
    });
  });
});
