export function getSiteUrl(): string {
  const publicSiteUrl = readEnv("NEXT_PUBLIC_SITE_URL");
  if (publicSiteUrl) {
    return publicSiteUrl;
  }

  const vercelUrl = readEnv("VERCEL_PROJECT_PRODUCTION_URL");
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return "http://localhost:3000";
}

export function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function requireServerEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function missingServerEnvName(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const prefix = "Missing required environment variable: ";
  return error.message.startsWith(prefix) ? error.message.slice(prefix.length) : null;
}

export function requireWebhookSyncSecret(): string {
  return requireServerEnv("WEBHOOK_SYNC_SECRET");
}
