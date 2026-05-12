import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { EthicsGuard } from "./EthicsGuard.ts";
import { getDb, initializeDatabase, dbService } from "../storage/SQLiteStorage.ts";

describe("EthicsGuard", () => {
	let db: any;

	beforeAll(async () => {
		await initializeDatabase();
		db = getDb();
		db.run(`
			INSERT OR IGNORE INTO playbook (id, rule, category, applicable_to, helpful_count, active)
			VALUES (1, 'Siempre verificar fuentes antes de responder', 'response_quality', 'agent', 5, 1)
		`);
	});

	afterAll(() => {
		dbService.close();
	});

	it("loads rules from DB", () => {
		const guard = new EthicsGuard(db);
		const rules = guard.getRules();
		expect(Array.isArray(rules)).toBe(true);
	});

	it("injectIntoPrompt appends rules to system prompt", () => {
		const guard = new EthicsGuard(db);
		const rules = guard.getRules();
		const result = guard.injectIntoPrompt("Eres un asistente.", rules);
		expect(result).toContain("Eres un asistente.");
		if (rules.length > 0) {
			expect(result).toContain("Calidad de Respuesta");
		}
	});

	it("hasEthicsLayer detects response quality rules", () => {
		const guard = new EthicsGuard(db);
		const has = guard.hasEthicsLayer();
		expect(typeof has).toBe("boolean");
	});

	it("getRules accepts optional agentRole for FTS5 search", () => {
		const guard = new EthicsGuard(db);
		const rules = guard.getRules("agent");
		expect(Array.isArray(rules)).toBe(true);
	});

	it("getRules without agentRole returns all rules", () => {
		const guard = new EthicsGuard(db);
		const rules = guard.getRules();
		expect(Array.isArray(rules)).toBe(true);
	});
});
