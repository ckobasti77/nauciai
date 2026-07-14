import { spawnSync } from "node:child_process";
import { resolve as resolvePath } from "node:path";

const targetArgs = process.argv.slice(2);
for (let index = 0; index < targetArgs.length; index += 1) {
  const arg = targetArgs[index];
  if (arg === "--prod") continue;
  if (arg === "--deployment" && targetArgs[index + 1]) {
    index += 1;
    continue;
  }
  throw new Error(`Unknown or incomplete argument: ${arg}`);
}

function readConvexEnv(name) {
  const result = spawnSync(
    process.execPath,
    [resolvePath("node_modules/convex/bin/main.js"), "env", ...targetArgs, "get", name],
    { encoding: "utf8", shell: false },
  );
  return result.status === 0 ? result.stdout.trim() : "";
}

const required = [
  "SITE_URL",
  "JWT_PRIVATE_KEY",
  "JWKS",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_RESEND_KEY",
  "AUTH_RESEND_FROM",
];
const values = new Map(required.map((name) => [name, readConvexEnv(name)]));
const missing = required.filter((name) => !values.get(name));
const production = targetArgs.includes("--prod");
const expectedSiteUrl = production ? "https://nauciai.com" : "http://localhost:3000";
const siteUrl = values.get("SITE_URL")?.replace(/\/$/, "");

if (siteUrl && siteUrl !== expectedSiteUrl) {
  console.error(`SITE_URL is configured, but it is ${siteUrl} instead of ${expectedSiteUrl}.`);
  process.exitCode = 1;
}
if (missing.length) {
  console.error(`Missing Convex auth environment variables: ${missing.join(", ")}.`);
  process.exitCode = 1;
}
if (!process.exitCode) {
  console.log(`Convex auth environment is complete for ${production ? "production" : "development"}. Secret values were not printed.`);
}
