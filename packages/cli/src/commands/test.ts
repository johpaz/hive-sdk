export {};

/**
 * `hives test` — corre los tests del proyecto del usuario.
 *
 * Antes hacía glob sobre `packages/core/src/**` — rutas del repo del SDK, no del
 * proyecto donde se ejecuta el comando, así que en la práctica no encontraba
 * nada. Ahora busca en `src/` y `test(s)/` del cwd.
 */
async function testCommand() {
	const filter = process.argv[3];

	console.log("Hive Test Runner\n");

	const { ensureHiveDb } = await import("@johpaz/hive-sdk");
	await ensureHiveDb();

	const { Glob } = await import("bun");
	const patterns = ["src/**/*.{test,spec}.ts", "test/**/*.{test,spec}.ts", "tests/**/*.{test,spec}.ts"];

	const seen = new Set<string>();
	for (const pattern of patterns) {
		for (const file of new Glob(pattern).scanSync({ cwd: process.cwd(), absolute: true })) {
			seen.add(file);
		}
	}

	const tests = [...seen].filter((f) => !filter || f.includes(filter)).sort();

	if (tests.length === 0) {
		console.log("No tests found under src/, test/ or tests/.");
		return;
	}

	console.log(`Found ${tests.length} test(s)\n`);
	let passed = 0;
	let failed = 0;

	for (const test of tests) {
		try {
			await import(test);
			console.log(`  ✓ ${test.split("/").pop()}`);
			passed++;
		} catch (err) {
			console.error(`  ✗ ${test.split("/").pop()}: ${(err as Error).message}`);
			failed++;
		}
	}

	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exitCode = 1;
}

testCommand();
