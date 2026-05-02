import { describe, test, expect } from "bun:test";
import { WebSocketState } from "../src/canvas-manager";

describe("WebSocketState", () => {
  test("should have correct state values", () => {
    expect(WebSocketState.CONNECTING).toBe(0);
    expect(WebSocketState.OPEN).toBe(1);
    expect(WebSocketState.CLOSING).toBe(2);
    expect(WebSocketState.CLOSED).toBe(3);
  });
});

describe("CanvasManager Heartbeat Format", () => {
  const testSessionId = "test-session-123";

  test("should have correct ping message format", () => {
    const pingMessage = JSON.stringify({
      type: "canvas:ping",
      sessionId: testSessionId,
    });
    
    const parsed = JSON.parse(pingMessage);
    expect(parsed.type).toBe("canvas:ping");
    expect(parsed.sessionId).toBe(testSessionId);
  });

  test("should have correct pong response format", () => {
    const pongMessage = JSON.stringify({
      type: "canvas:pong",
      sessionId: testSessionId,
    });
    
    const parsed = JSON.parse(pongMessage);
    expect(parsed.type).toBe("canvas:pong");
    expect(parsed.sessionId).toBe(testSessionId);
  });
});