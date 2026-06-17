import { describe, expect, it } from "bun:test";
import { emitCanvas, subscribeCanvas, unsubscribeCanvas } from "./emitter.ts";

describe("canvas emitter", () => {
  it("subscribes and unsubscribes websocket-like objects", () => {
    let received: any = null;
    const ws = {
      send: (data: string) => { received = JSON.parse(data); },
    };

    subscribeCanvas(ws);
    emitCanvas("canvas:render", { component: { id: "test", type: "card" } });
    unsubscribeCanvas(ws);

    expect(received).toBeDefined();
    expect(received.type).toBe("canvas:render");
  });

  it("stops receiving after unsubscribe", () => {
    let count = 0;
    const ws = {
      send: () => { count++; },
    };

    subscribeCanvas(ws);
    emitCanvas("canvas:render", { component: { id: "a", type: "card" } });
    unsubscribeCanvas(ws);
    emitCanvas("canvas:render", { component: { id: "b", type: "card" } });

    expect(count).toBe(1);
  });
});
