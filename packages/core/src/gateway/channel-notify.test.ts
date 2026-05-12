import { describe, it, expect } from "bun:test";
import { sendToUserChannel } from "./channel-notify.ts";

describe("sendToUserChannel (stub)", () => {
	it("returns ok without real gateway", async () => {
		const result = await sendToUserChannel("cli:test", "user-1", "hello");
		expect(result.ok).toBe(true);
	});

	it("handles empty message", async () => {
		const result = await sendToUserChannel("cli:test", "user-1", "");
		expect(result.ok).toBe(true);
	});
});
