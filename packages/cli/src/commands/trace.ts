export {};
async function traceCommand() {
	const { initializeDatabase } = await import("@johpaz/hive-core");
	const { getDb } = await import("@johpaz/hive-core/storage");

	await initializeDatabase();
	const db = getDb();

	const limit = parseInt(process.argv[3] || "20", 10);

	console.log(`\nRecent Trace Logs (last ${limit})\n`);
	console.log("─".repeat(80));

	try {
		const rows = db
			.query(
				`SELECT id, agent_id, model, tool_calls, duration_ms, tokens_used, created_at
         FROM traces
         ORDER BY created_at DESC
         LIMIT ?`
			)
			.all(limit) as Array<{
			id: string;
			agent_id: string;
			model: string;
			tool_calls: string;
			duration_ms: number;
			tokens_used: number;
			created_at: string;
		}>;

		if (rows.length === 0) {
			console.log("No traces found.");
			return;
		}

		for (const row of rows) {
			console.log(`ID:        ${row.id}`);
			console.log(`Agent:     ${row.agent_id}`);
			console.log(`Model:     ${row.model}`);
			console.log(`Duration:  ${row.duration_ms}ms`);
			console.log(`Tokens:    ${row.tokens_used}`);
			console.log(`Time:      ${row.created_at}`);
			if (row.tool_calls) {
				const tools = JSON.parse(row.tool_calls);
				console.log(`Tools:     ${Array.isArray(tools) ? tools.join(", ") : row.tool_calls}`);
			}
			console.log("─".repeat(80));
		}
	} catch (err) {
		console.log("No traces table found (run the agent first).");
	}
}

traceCommand();
