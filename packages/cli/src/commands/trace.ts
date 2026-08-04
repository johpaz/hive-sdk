export {};

/**
 * `hives trace` — últimas ejecuciones registradas por el ACE Tracer.
 *
 * Los traces pasaron de una tabla SQLite a la colección `traces` de HiveDB en
 * 0.1.5, así que esto ya no es una query SQL.
 */
async function traceCommand() {
	const { ensureHiveDb, col } = await import("@johpaz/hive-sdk");

	await ensureHiveDb();

	const limit = parseInt(process.argv[3] || "20", 10);

	console.log(`\nRecent Trace Logs (last ${limit})\n`);
	console.log("─".repeat(80));

	try {
		const tracesCol = await col<{
			agent_id: string;
			model: string;
			provider?: string;
			tool_calls?: string | null;
			duration_ms?: number;
			tokens_used?: number;
			created_at: number;
		}>("traces");

		const rows = (await tracesCol.scan({}))
			.sort((a, b) => b.doc.created_at - a.doc.created_at)
			.slice(0, limit);

		if (rows.length === 0) {
			console.log("No traces found (run the agent first).");
			return;
		}

		for (const row of rows) {
			console.log(`ID:        ${row.id}`);
			console.log(`Agent:     ${row.doc.agent_id}`);
			console.log(`Model:     ${row.doc.provider ? `${row.doc.provider}/` : ""}${row.doc.model}`);
			console.log(`Duration:  ${row.doc.duration_ms ?? 0}ms`);
			console.log(`Tokens:    ${row.doc.tokens_used ?? 0}`);
			console.log(`Time:      ${new Date(row.doc.created_at).toISOString()}`);
			if (row.doc.tool_calls) {
				const tools = JSON.parse(row.doc.tool_calls);
				console.log(`Tools:     ${Array.isArray(tools) ? tools.join(", ") : row.doc.tool_calls}`);
			}
			console.log("─".repeat(80));
		}
	} catch (err) {
		console.error(`No se pudieron leer los traces: ${(err as Error).message}`);
	}
}

traceCommand();
