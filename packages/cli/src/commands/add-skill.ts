import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as process from "node:process";

async function runAddSkill() {
  const skillName = process.argv[3];

  if (!skillName) {
    console.error("Usage: hive add-skill <name>");
    process.exit(1);
  }

  const skillsDir = join(process.cwd(), "src", "skills");
  const filePath = join(skillsDir, `${skillName}.ts`);

  if (existsSync(filePath)) {
    console.error(`Skill '${skillName}' already exists.`);
    process.exit(1);
  }

  mkdirSync(skillsDir, { recursive: true });

  const content = `import { defineSkill } from "@johpaz/hive-sdk";

export const ${skillName}Skill = defineSkill({
  name: "${skillName}",
  description: "Description of what ${skillName} skill does.",
  steps: [
    {
      name: "step-1",
      description: "First step of the skill",
      tool: "notify",
    },
  ],
});
`;

  writeFileSync(filePath, content);
  console.log(`✅ Created skill: ${filePath}`);
}

runAddSkill();
