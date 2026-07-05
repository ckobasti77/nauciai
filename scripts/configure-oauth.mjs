import { spawn } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline";

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log("=== Convex OAuth Configuration ===");
  console.log("This script will configure Google and Apple logins on your Convex deployment.");
  console.log("Press Enter to skip any provider you do not want to configure right now.\n");

  // Google
  const googleId = await question("Google Client ID (AUTH_GOOGLE_ID): ");
  if (googleId.trim()) {
    const googleSecret = await question("Google Client Secret (AUTH_GOOGLE_SECRET): ");
    if (googleSecret.trim()) {
      await runConvexEnvSet("AUTH_GOOGLE_ID", googleId.trim());
      await runConvexEnvSet("AUTH_GOOGLE_SECRET", googleSecret.trim());
      console.log("✓ Google credentials configured successfully on Convex.\n");
    } else {
      console.log("Skipping Google: Client Secret was not provided.\n");
    }
  } else {
    console.log("Skipping Google.\n");
  }

  // Apple
  const appleId = await question("Apple Services ID (AUTH_APPLE_ID): ");
  if (appleId.trim()) {
    const appleTeamId = await question("Apple Team ID (AUTH_APPLE_TEAM_ID): ");
    const appleKeyId = await question("Apple Key ID (AUTH_APPLE_KEY_ID): ");
    const applePrivateKeyPath = await question("Path to Apple Private Key file (.p8): ");
    
    if (appleTeamId.trim() && appleKeyId.trim() && applePrivateKeyPath.trim()) {
      try {
        const privateKey = fs.readFileSync(applePrivateKeyPath.trim(), "utf8");
        await runConvexEnvSet("AUTH_APPLE_ID", appleId.trim());
        await runConvexEnvSet("AUTH_APPLE_TEAM_ID", appleTeamId.trim());
        await runConvexEnvSet("AUTH_APPLE_KEY_ID", appleKeyId.trim());
        await runConvexEnvSet("AUTH_APPLE_PRIVATE_KEY", privateKey.trim());
        console.log("✓ Apple credentials configured successfully on Convex.\n");
      } catch (err) {
        console.error("✗ Failed to read Apple private key file:", err.message);
      }
    } else {
      console.log("Skipping Apple: missing required fields.\n");
    }
  } else {
    console.log("Skipping Apple.\n");
  }

  rl.close();
  console.log("Configuration finished.");
}

main().catch(console.error);
