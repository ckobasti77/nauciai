import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ENV_NAMES = ["AUTH_RESEND_KEY", "AUTH_RESEND_FROM"];

function parseArgs(argv) {
  const modes = new Set();
  let envFile = ".env.local";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dev") modes.add("dev");
    else if (arg === "--prod") modes.add("prod");
    else if (arg === "--all") { modes.add("dev"); modes.add("prod"); }
    else if (arg === "--env-file") { envFile = argv[index + 1]; index += 1; }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!modes.size) modes.add("dev");
  return { modes: [...modes], envFile };
}

function readEnv(filePath) {
  if (!existsSync(filePath)) throw new Error(`Missing env file: ${filePath}`);
  const values = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || !ENV_NAMES.includes(match[1])) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  for (const name of ENV_NAMES) {
    if (!values[name]) throw new Error(`${name} must be filled in ${filePath}`);
  }
  return values;
}

function sync(mode, name, value) {
  const args = [resolve(process.cwd(), "node_modules/convex/bin/main.js"), "env"];
  if (mode === "prod") args.push("--prod");
  args.push("set", name, value);
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Failed to sync ${name} to Convex ${mode} env.`);
}

try {
  const { modes, envFile } = parseArgs(process.argv.slice(2));
  const values = readEnv(resolve(process.cwd(), envFile));
  for (const mode of modes) for (const name of ENV_NAMES) sync(mode, name, values[name]);
  console.log(`Synced Resend env to Convex ${modes.join(" and ")} env.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
