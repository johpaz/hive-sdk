import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Scratchpad } from "./Scratchpad.ts";
import { initializeDatabase, dbService } from "../storage/SQLiteStorage.ts";
import { getHiveDB, closeHiveDB } from "../storage/HiveDBStorage.ts";

describe("Scratchpad", () => {
	let pad: Scratchpad;

	beforeAll(async () => {
		initializeDatabase();
		await getHiveDB();
		pad = new Scratchpad();
	});

	afterAll(() => {
		closeHiveDB();
		dbService.close();
	});

	const THREAD = "test-thread";

	it("writes and reads a note", async () => {
		await pad.write(THREAD, "test-1", "hello world");
		const value = await pad.read(THREAD, "test-1");
		expect(value).toBe("hello world");
	});

	it("lists notes as key-value map", async () => {
		await pad.write(THREAD, "list-a", "aaa");
		await pad.write(THREAD, "list-b", "bbb");
		const notes = await pad.list(THREAD);
		expect(notes["list-a"]).toBe("aaa");
		expect(notes["list-b"]).toBe("bbb");
	});

	it("deletes a note", async () => {
		await pad.write(THREAD, "to-delete", "delete me");
		await pad.delete(THREAD, "to-delete");
		const value = await pad.read(THREAD, "to-delete");
		expect(value).toBeUndefined();
	});

	it("clear removes all notes for a thread", async () => {
		await pad.write(THREAD, "clear-a", "a");
		await pad.write(THREAD, "clear-b", "b");
		await pad.clear(THREAD);
		expect(Object.keys(await pad.list(THREAD)).length).toBe(0);
	});
});
