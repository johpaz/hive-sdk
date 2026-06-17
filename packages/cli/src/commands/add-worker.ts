import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as process from "node:process";

function toPascalCase(str: string): string {
  return str.replace(/[-_](.)/g, (_, char) => char.toUpperCase()).replace(/^(.)/, (_, char) => char.toUpperCase());
}

async function runAddWorker() {
  const workerName = process.argv[3];

  if (!workerName) {
    console.error("Usage: hive add-worker <name>");
    process.exit(1);
  }

  const workersDir = join(process.cwd(), "src", "workers");
  const filePath = join(workersDir, `${workerName}.worker.ts`);

  if (existsSync(filePath)) {
    console.error(`Worker '${workerName}' already exists.`);
    process.exit(1);
  }

  mkdirSync(workersDir, { recursive: true });

  const className = toPascalCase(workerName) + "Worker";

  const content = `import { createWorker } from "@johpaz/hive-sdk";

export const ${workerName}Worker = createWorker({
  name: "${workerName}",
  systemPrompt: \`
    You are the ${className} specialist.
    You handle tasks related to ${workerName} with precision and expertise.
    Always provide clear, actionable results.
  \`,
});

// Example usage:
// const result = await ${workerName}Worker.run("Your task here");
// console.log(result);
`;

  writeFileSync(filePath, content);
  console.log(`Created worker: ${filePath}`);
}

runAddWorker();
