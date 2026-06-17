import { describe, it, expect } from "bun:test";
import {
  AgentBrowserView,
  BrowserService,
  initializeBrowserService,
  getBrowserService,
  waitForSelector,
  waitForCondition,
} from "./browser-service.ts";
import type { Config } from "../../config/loader.ts";

describe("AgentBrowserView", () => {
  it("has the expected API surface", () => {
    const view = new AgentBrowserView("test-session");
    expect(view.url).toBe("");
    expect(typeof view.navigate).toBe("function");
    expect(typeof view.evaluate).toBe("function");
    expect(typeof view.click).toBe("function");
    expect(typeof view.type).toBe("function");
    expect(typeof view.typeIn).toBe("function");
    expect(typeof view.fill).toBe("function");
    expect(typeof view.press).toBe("function");
    expect(typeof view.scroll).toBe("function");
    expect(typeof view.scrollTo).toBe("function");
    expect(typeof view.back).toBe("function");
    expect(typeof view.forward).toBe("function");
    expect(typeof view.reload).toBe("function");
    expect(typeof view.resize).toBe("function");
    expect(typeof view.screenshot).toBe("function");
    expect(typeof view.snapshot).toBe("function");
    expect(typeof view.cdp).toBe("function");
    expect(typeof view.close).toBe("function");
  });
});

describe("BrowserService singleton", () => {
  it("initializes and returns the same instance", () => {
    const config = { tools: { browser: { enabled: true, sessionName: "test" } } } as Config;
    const service = initializeBrowserService(config);
    expect(service).toBeInstanceOf(BrowserService);
    expect(getBrowserService()).toBe(service);
  });

  it("exposes expected service methods", () => {
    const config = { tools: { browser: { enabled: true, sessionName: "test" } } } as Config;
    const service = BrowserService.getInstance(config);
    expect(typeof service.start).toBe("function");
    expect(typeof service.getView).toBe("function");
    expect(typeof service.isAvailable).toBe("function");
    expect(typeof service.stop).toBe("function");
  });
});

describe("wait helpers", () => {
  it("waitForSelector resolves when element appears", async () => {
    let found = false;
    const view = {
      evaluate: async (script: string) => {
        if (script.includes("document.querySelector")) {
          found = true;
          return true;
        }
        return false;
      },
    } as unknown as AgentBrowserView;

    await waitForSelector(view, "#test", 1000);
    expect(found).toBe(true);
  });

  it("waitForCondition resolves when expression is truthy", async () => {
    let calls = 0;
    const view = {
      evaluate: async () => {
        calls++;
        return calls >= 2;
      },
    } as unknown as AgentBrowserView;

    await waitForCondition(view, "window.ready", 1000);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
