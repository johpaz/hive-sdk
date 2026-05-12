export {};
async function testCommand() {
	const filter = process.argv[3];

	console.log("Hive Test Runner\n");

	const { initializeDatabase, dbService } = await import("@johpaz/hive-core");
	await initializeDatabase();

	const { Glob } = await import("bun");
	const glob = new Glob("packages/core/src/**/*.{test,spec}.ts");
	const testFiles = Array.from(glob.scanSync({ cwd: process.cwd(), absolute: true }));

	const tests = filter
		? testFiles.filter((f: string) => f.includes(filter))
		: testFiles;

	if (tests.length === 0) {
		console.log("No tests found.");
	} else {
		console.log(`Found ${tests.length} test(s)\n`);
		let passed = 0;
		let failed = 0;

		for (const test of tests as string[]) {
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
	}

	dbService.close();
}

testCommand();
