import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

const TEMPLATE_DIR = join(import.meta.dir, "..", "..", "templates", "hive-app");

export function copyTemplate(dest: string, replacements: Record<string, string>) {
  if (!existsSync(TEMPLATE_DIR)) {
    throw new Error("Template not found: " + TEMPLATE_DIR);
  }

  copyDir(TEMPLATE_DIR, dest, replacements);
}

function copyDir(src: string, dest: string, replacements: Record<string, string>) {
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath, replacements);
    } else {
      let content = readFileSync(srcPath, "utf-8");
      for (const [key, value] of Object.entries(replacements)) {
        content = content.replaceAll(key, value);
      }
      mkdirSync(dirname(destPath), { recursive: true });
      writeFileSync(destPath, content);
    }
  }
}
