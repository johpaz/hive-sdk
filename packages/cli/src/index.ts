#!/usr/bin/env bun

export {};
const command = process.argv[2];

switch (command) {
	case "init":
		await import("./commands/init.ts");
		break;
	case "run":
		await import("./commands/run.ts");
		break;
	case "test":
		await import("./commands/test.ts");
		break;
	case "trace":
		await import("./commands/trace.ts");
		break;
	case "--help":
	case "-h":
	case undefined:
		printHelp();
		break;
	default:
		console.error(`Unknown command: ${command}`);
		printHelp();
		process.exit(1);
}

function printHelp() {
	console.log(`
Usage: hive <command> [options]

Commands:
  init         Initialize a new Hive project
  run          Run the agent
  test         Test tools or skills
  trace        View trace execution logs

Options:
  --help, -h   Show this help message
`);
}
