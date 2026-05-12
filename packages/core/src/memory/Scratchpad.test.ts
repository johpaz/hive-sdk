import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Scratchpad } from "./Scratchpad.ts";
import { getDb, initializeDatabase, DatabaseService, dbService } from "../storage/SQLiteStorage.ts";

describe("Scratchpad", () => {
	let pad: Scratchpad;

	beforeAll(async () => {
		await initializeDatabase();
		const db = getDb();
		pad = new Scratchpad(db);
	});

	afterAll(() => {
		dbService.close();
	});

	const THREAD = "test-thread";

	it("writes and reads a note", () => {
		pad.write(THREAD, "test-1", "hello world");
		const value = pad.read(THREAD, "test-1");
		expect(value).toBe("hello world");
	});

	it("lists notes as key-value map", () => {
		pad.write(THREAD, "list-a", "aaa");
		pad.write(THREAD, "list-b", "bbb");
		const notes = pad.list(THREAD);
		expect(notes["list-a"]).toBe("aaa");
		expect(notes["list-b"]).toBe("bbb");
	});

	it("deletes a note", () => {
		pad.write(THREAD, "to-delete", "delete me");
		pad.delete(THREAD, "to-delete");
		const value = pad.read(THREAD, "to-delete");
		expect(value).toBeNull();
	});

	it("clear removes all notes for a thread", () => {
		pad.write(THREAD, "clear-a", "a");
		pad.write(THREAD, "clear-b", "b");
		pad.clear(THREAD);
		expect(Object.keys(pad.list(THREAD)).length).toBe(0);
	});
});
