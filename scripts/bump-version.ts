#!/usr/bin/env bun

/**
 * Bump de versión del SDK.
 *
 * Portado de `hive/scripts/bump-version.ts`, adaptado a este repo: acá el
 * artefacto publicado es **sólo el paquete raíz** (`@johpaz/hive-sdk`);
 * `packages/core` y `packages/cli` son workspaces internos que se versionan en
 * paralelo por consistencia, no se publican.
 *
 * El push del tag `vX.Y.Z` es lo que dispara `.github/workflows/publish.yml`.
 */

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const shouldPush = args.includes("--push");
const npmTagArg = args.find((a) => a.startsWith("--npm-tag="));
const npmTag = npmTagArg ? npmTagArg.split("=")[1] : "latest";
const positional = args.filter((a) => !a.startsWith("--"));
const bumpType = positional[0] as "patch" | "minor" | "major" | string;
const explicitVersion = positional[0]?.match(/^\d+\.\d+\.\d+(-[\w.]+)?$/) ? positional[0] : null;

if (!bumpType || (!["patch", "minor", "major"].includes(bumpType) && !explicitVersion)) {
  console.log("Usage:");
  console.log("  bun scripts/bump-version.ts patch|minor|major [--push] [--dry-run] [--npm-tag=<tag>]");
  console.log("  bun scripts/bump-version.ts 0.1.5 [--push] [--dry-run] [--npm-tag=<tag>]");
  console.log("");
  console.log("  (sin flags)    Solo actualiza archivos locales (package.json, README, CHANGELOG).");
  console.log("                 No toca git. Revisá el diff vos mismo.");
  console.log("  --dry-run      Muestra qué cambiaría, sin escribir nada.");
  console.log("  --push         Además de bumpear: commitea, crea el tag vX.Y.Z y pushea.");
  console.log("                 El tag dispara publish.yml, que publica en npm.");
  console.log("  --npm-tag=X    dist-tag de npm (default: latest). Usá `next` o `beta` para");
  console.log("                 una preview que no se instale con `bun add @johpaz/hive-sdk`.");
  console.log("");
  console.log("Ejemplos:");
  console.log("  bun scripts/bump-version.ts 0.1.5                    # solo archivos");
  console.log("  bun scripts/bump-version.ts 0.1.5 --push             # release a latest");
  console.log("  bun scripts/bump-version.ts 0.2.0-rc.1 --push --npm-tag=next");
  process.exit(1);
}

function bumpVersion(current: string, type: "patch" | "minor" | "major"): string {
  const [major, minor, patch] = current.split("-")[0].split(".").map(Number);
  return type === "major"
    ? `${major + 1}.0.0`
    : type === "minor"
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;
}

async function confirm(message: string): Promise<boolean> {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${message} (escribe "si" para confirmar): `);
  rl.close();
  return answer.trim().toLowerCase() === "si";
}

/** El raíz es el que se publica; los workspaces van en paralelo por consistencia. */
const packageFiles = [
  "package.json",
  "packages/core/package.json",
  "packages/cli/package.json",
];

/** Menciones de versión en prosa que no salen de ningún package.json. */
function textReplacements(newVersion: string) {
  return [
    {
      path: "README.md",
      pattern: /\*Hive SDK v[\d.]+(?:-[\w.]+)? — MIT\*/g,
      replacement: `*Hive SDK v${newVersion} — MIT*`,
    },
  ];
}

async function main() {
  const rootPkg = JSON.parse(await Bun.file("package.json").text());
  const currentVersion: string = rootPkg.version;
  const newVersion = explicitVersion || bumpVersion(currentVersion, bumpType as "patch" | "minor" | "major");

  console.log(`\n📦 Bumping version: ${currentVersion} → ${newVersion}`);
  console.log(`   npm dist-tag: ${npmTag}\n`);

  if (newVersion === currentVersion && !explicitVersion) {
    console.log("⚠️  La versión nueva es igual a la actual. Abortando.");
    process.exit(1);
  }

  // npm rechaza republicar una versión existente: mejor enterarse acá que en CI.
  try {
    const published = await fetch(`https://registry.npmjs.org/${rootPkg.name}`)
      .then((r) => (r.ok ? r.json() : null)) as { versions?: Record<string, unknown> } | null;
    if (published?.versions?.[newVersion]) {
      console.log(`⚠️  ${rootPkg.name}@${newVersion} YA está publicada en npm.`);
      console.log(`   Un publish con esta versión falla con 403. Elegí otra.\n`);
      if (!dryRun) process.exit(1);
    }
  } catch {
    console.log("   (no se pudo consultar npm — sigo igual)\n");
  }

  if (dryRun) {
    console.log("🔎 Dry run — nada se escribe.\n");
    for (const filePath of packageFiles) {
      try {
        const json = JSON.parse(await Bun.file(filePath).text());
        console.log(`  ${filePath}: ${json.version} → ${newVersion}`);
      } catch (e) {
        console.log(`  ⚠️  ${filePath}: ${(e as Error).message}`);
      }
    }
    for (const file of textReplacements(newVersion)) {
      try {
        const content = await Bun.file(file.path).text();
        const matches = content.match(file.pattern);
        console.log(`  ${file.path}: ${matches ? `${matches.length} coincidencia(s)` : "sin coincidencias (revisar patrón)"}`);
      } catch (e) {
        console.log(`  ⚠️  ${file.path}: ${(e as Error).message}`);
      }
    }
    if (shouldPush) {
      console.log(`\n  Luego: git add -A && git commit -m "chore: release v${newVersion}"`);
      console.log(`         git tag v${newVersion} && git push origin main && git push origin v${newVersion}`);
      console.log(`         → publish.yml publica con dist-tag "${npmTag}"`);
    } else {
      console.log(`\n  Sin --push: no se toca git.`);
    }
    return;
  }

  for (const filePath of packageFiles) {
    try {
      const json = JSON.parse(await Bun.file(filePath).text());
      const oldVersion = json.version;
      json.version = newVersion;
      await Bun.write(filePath, JSON.stringify(json, null, 2) + "\n");
      console.log(`✅ ${filePath}`);
      console.log(`   ${json.name}: ${oldVersion} → ${newVersion}`);
    } catch (e) {
      console.log(`⚠️  ${filePath}: ${(e as Error).message}`);
    }
  }

  for (const file of textReplacements(newVersion)) {
    try {
      const content = await Bun.file(file.path).text();
      const matched = file.pattern.test(content);
      file.pattern.lastIndex = 0; // test() con /g deja estado — resetear
      const newContent = content.replace(file.pattern, file.replacement);

      if (!matched) {
        console.log(`⚠️  ${file.path}: el patrón no matcheó nada — revisar manualmente`);
      } else if (newContent !== content) {
        await Bun.write(file.path, newContent);
        console.log(`✅ ${file.path}`);
      } else {
        console.log(`✅ ${file.path} (ya estaba en ${newVersion})`);
      }
    } catch (e) {
      console.log(`⚠️  ${file.path}: ${(e as Error).message}`);
    }
  }

  // El CHANGELOG lo escribe una persona; acá sólo avisamos si falta la entrada.
  try {
    const changelog = await Bun.file("CHANGELOG.md").text();
    if (!changelog.includes(`## ${newVersion}`)) {
      console.log(`\n⚠️  CHANGELOG.md no tiene una sección "## ${newVersion}". Agregala antes de publicar.`);
    }
  } catch {
    console.log("\n⚠️  No hay CHANGELOG.md.");
  }

  const { execSync } = await import("child_process");
  const run = (cmd: string) => execSync(cmd, { stdio: "inherit" });

  console.log(`\n✨ Archivos actualizados. Versión: ${newVersion}\n`);

  if (!shouldPush) {
    console.log("Sin --push: no se tocó git. Revisá `git diff`, y cuando estés conforme:");
    console.log(`  bun scripts/bump-version.ts ${explicitVersion || bumpType} --push${npmTag !== "latest" ? ` --npm-tag=${npmTag}` : ""}\n`);
    return;
  }

  // ── Git: commit, tag y push — con confirmación antes de publicar ──────────
  console.log("Antes de publicar corro typecheck y tests.\n");
  try {
    run("bun run typecheck");
    run("bun test");
  } catch {
    console.log("\n❌ typecheck o tests fallaron. No se publica.");
    process.exit(1);
  }

  console.log("\nEsto es lo que se va a commitear (git add -A):\n");
  run("git status --short");

  const tagExists = (() => {
    try {
      execSync(`git rev-parse v${newVersion}`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  if (tagExists) {
    console.log(`\n⚠️  El tag v${newVersion} ya existe localmente. Suele indicar que esta`);
    console.log(`   versión ya se publicó. Abortando — si es intencional, borralo primero`);
    console.log(`   (git tag -d v${newVersion}) y volvé a correr con --push.`);
    process.exit(1);
  }

  const branch = execSync("git branch --show-current").toString().trim();

  console.log(`\nEsto va a: commitear todo lo de arriba como "chore: release v${newVersion}",`);
  console.log(`crear el tag v${newVersion}, y pushear ${branch} + el tag a origin.`);
  console.log(`El push del tag dispara publish.yml, que publica en npm con dist-tag "${npmTag}".\n`);

  const ok = await confirm(`¿Publicar v${newVersion} como "${npmTag}"?`);
  if (!ok) {
    console.log("Cancelado. No se tocó git.");
    return;
  }

  console.log("🔧 Committing changes...");
  run("git add -A");
  try {
    run(`git commit -m "chore: release v${newVersion}"`);
  } catch {
    console.log("   (nothing to commit, skipping)");
  }

  console.log(`🏷️  Creating tag v${newVersion}...`);
  // El dist-tag viaja en el mensaje del tag: publish.yml lo lee de ahí.
  run(`git tag -a v${newVersion} -m "release v${newVersion} [npm-tag:${npmTag}]"`);

  console.log("🚀 Pushing commit and tag...");
  run(`git push origin ${branch}`);
  run(`git push origin v${newVersion}`);

  console.log(`\n🎉 Released v${newVersion} (dist-tag: ${npmTag})\n`);
  console.log(`Verificá en unos minutos:  npm view ${rootPkg.name} dist-tags\n`);
}

main().catch(console.error);
