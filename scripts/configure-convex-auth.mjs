import { spawn } from "node:child_process";
import { resolve as resolvePath } from "node:path";

import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const DEFAULT_LOCAL_SITE_URL = "http://localhost:3000";
const DEFAULT_PRODUCTION_SITE_URL = "https://nauciai.com";

function parseArgs(argv) {
  const targetArgs = [];
  let targetLabel = "dev deployment";
  let siteUrl;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--prod") {
      targetArgs.push("--prod");
      targetLabel = "production deployment";
      continue;
    }

    if (arg === "--deployment") {
      const deployment = argv[index + 1];
      if (!deployment) {
        throw new Error("Missing value for --deployment.");
      }
      targetArgs.push("--deployment", deployment);
      targetLabel = `deployment ${deployment}`;
      index += 1;
      continue;
    }

    if (arg === "--site-url") {
      siteUrl = argv[index + 1];
      if (!siteUrl) {
        throw new Error("Missing value for --site-url.");
      }
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { targetArgs, targetLabel, siteUrl };
}

const { targetArgs, targetLabel, siteUrl: siteUrlArg } = parseArgs(process.argv.slice(2));
const isProductionTarget =
  targetArgs.includes("--prod") ||
  targetArgs.some((arg) => arg === "prod" || arg === "quick-yak-270" || arg.includes("quick-yak-270"));
const siteUrl =
  siteUrlArg ??
  process.env.SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  (isProductionTarget ? DEFAULT_PRODUCTION_SITE_URL : DEFAULT_LOCAL_SITE_URL);

function runConvexEnvSet(name, value) {
  if (!/^[A-Z0-9_]+$/.test(name)) {
    throw new Error(`Invalid Convex environment variable name: ${name}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [resolvePath("node_modules/convex/bin/main.js"), "env", ...targetArgs, "set", name], {
      shell: false,
      stdio: ["pipe", "inherit", "inherit"],
    });

    child.stdin.end(value);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`convex env set ${name} exited with code ${code}`));
    });
  });
}

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

await runConvexEnvSet("SITE_URL", siteUrl);
await runConvexEnvSet("JWT_PRIVATE_KEY", privateKey.trimEnd().replace(/\n/g, " "));
await runConvexEnvSet("JWKS", jwks);

console.log(`Convex Auth key material configured for ${siteUrl} on ${targetLabel}.`);
