import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ENV_NAME = "INITIAL_ADMIN_EMAILS";

function parseArgs(argv) {
  const modes = new Set();
  let envFile = ".env.local";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dev") {
      modes.add("dev");
    } else if (arg === "--prod") {
      modes.add("prod");
    } else if (arg === "--all") {
      modes.add("dev");
      modes.add("prod");
    } else if (arg === "--env-file") {
      envFile = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!modes.size) {
    modes.add("dev");
  }

  return { modes: [...modes], envFile };
}

function stripInlineComment(value) {
  let quote = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === "\"" || char === "'") && value[index - 1] !== "\\") {
      quote = quote === char ? null : quote ?? char;
    }
    if (char === "#" && !quote && /\s/.test(value[index - 1] ?? " ")) {
      return value.slice(0, index).trim();
    }
  }

  return value.trim();
}

function unquote(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function readEnvValue(filePath, name) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing env file: ${filePath}`);
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  let found;

  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] !== name) {
      continue;
    }
    found = unquote(stripInlineComment(match[2]));
  }

  if (found === undefined) {
    throw new Error(`${name} is not defined in ${filePath}`);
  }

  return found;
}

function normalizeEmailList(value) {
  const emails = value
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!emails.length) {
    throw new Error(`${ENV_NAME} must contain at least one email.`);
  }

  return [...new Set(emails)].join(",");
}

function convexBin() {
  return resolve(process.cwd(), "node_modules/convex/bin/main.js");
}

function syncMode(mode, value) {
  const args = [convexBin(), "env"];
  if (mode === "prod") {
    args.push("--prod");
  }
  args.push("set", ENV_NAME, value);

  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`Failed to sync ${ENV_NAME} to Convex ${mode} env.`);
  }
}

try {
  const { modes, envFile } = parseArgs(process.argv.slice(2));
  const envPath = resolve(process.cwd(), envFile);
  const value = normalizeEmailList(readEnvValue(envPath, ENV_NAME));

  for (const mode of modes) {
    syncMode(mode, value);
  }

  console.log(`Synced ${ENV_NAME}=${value} to Convex ${modes.join(" and ")} env.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
