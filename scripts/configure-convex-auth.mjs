import { spawn } from "node:child_process";

import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const siteUrl = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function runConvexEnvSet(name, value) {
  if (!/^[A-Z0-9_]+$/.test(name)) {
    throw new Error(`Invalid Convex environment variable name: ${name}`);
  }

  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn("cmd.exe", ["/d", "/s", "/c", `npx convex env set ${name}`], {
            stdio: ["pipe", "inherit", "inherit"],
          })
        : spawn("npx", ["convex", "env", "set", name], {
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

console.log(`Convex Auth key material configured for ${siteUrl}.`);
