#!/usr/bin/env bun

export {};
const command = process.argv[2];

switch (command) {
	case "init":
		await import("./commands/init.ts");
		break;
	case "create-app":
		await import("./commands/create-app.ts");
		break;
	case "add-tool":
		await import("./commands/add-tool.ts");
		break;
	case "add-skill":
		await import("./commands/add-skill.ts");
		break;
	case "add-worker":
		await import("./commands/add-worker.ts");
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
Usage: hives <command> [options]

Commands:
  init <name>         Initialize a new Hive agent project
  create-app <name>   Create a full Hive harness application
  add-tool <name>     Add a new tool to the current project
  add-skill <name>    Add a new skill to the current project
  add-worker <name>   Add a new Bun Worker to the current project
  run                 Run the agent
  test                Test tools or skills
  trace               View trace execution logs

Options:
  --help, -h          Show this help message
`);
}
