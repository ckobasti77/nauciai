/**
 * Ograničenje broja zahteva po ključu (MCP-P1-SKELET, tačka 5; MCP-P2-STUDIO,
 * tačka 4), razdvojeno po opsegu:
 *
 * - `mcp:read`: 60 zahteva/min po ključu - broji SVAKI HTTP zahtev, u
 *   `handler.ts`, pre protokolskog sloja (`mcpRateLimiter`).
 * - `mcp:write`: 10 poziva/min po ključu - broji svaki `tools/call` alata sa
 *   tim opsegom, u `tools.ts` (`mcpWriteRateLimiter`). `create_generation`
 *   troši prave kredite; to nije ista klasa saobraćaja kao čitanje, a jedan
 *   batch može da nosi više poziva, pa se broji po pozivu, ne po zahtevu.
 *
 * Brojači žive u memoriji izolata - to je NAMERNO labavo: Convex sme da
 * podigne više izolata, pa je stvarna granica višekratnik. Interfejs
 * `RateLimiter` je ono što handler vidi; tabela (ili
 * `@convex-dev/rate-limiter`) menja implementaciju bez dodira u `handler.ts`.
 */

import { MCP_SCOPE_WRITE } from "./apiKey";

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type RateLimiter = {
  /** `subject` je identitet ključa (id reda), NIKAD sam ključ ni njegov hash. */
  check(subject: string, now: number): RateLimitDecision;
};

export const MCP_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
export const MCP_WRITE_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;

/** JSON-RPC kod (serverski opseg) koji i transport vraća za 429 - isti kod za obe granice. */
export const RATE_LIMIT_ERROR_CODE = -32002;

/** Iznad ovoliko subjekata u mapi, istekli prozori se čiste pri sledećoj proveri. */
const PRUNE_ABOVE = 10_000;

export function createMemoryRateLimiter(config: { limit: number; windowMs: number }): RateLimiter {
  const windows = new Map<string, { startedAt: number; count: number }>();

  return {
    check(subject, now) {
      if (windows.size > PRUNE_ABOVE) {
        for (const [key, bucket] of windows) {
          if (now - bucket.startedAt >= config.windowMs) windows.delete(key);
        }
      }

      const bucket = windows.get(subject);
      if (!bucket || now - bucket.startedAt >= config.windowMs) {
        windows.set(subject, { startedAt: now, count: 1 });

        return { allowed: true };
      }
      if (bucket.count >= config.limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((bucket.startedAt + config.windowMs - now) / 1000)),
        };
      }
      bucket.count += 1;

      return { allowed: true };
    },
  };
}

export const mcpRateLimiter: RateLimiter = createMemoryRateLimiter(MCP_RATE_LIMIT);
export const mcpWriteRateLimiter: RateLimiter = createMemoryRateLimiter(MCP_WRITE_RATE_LIMIT);

/**
 * Dodatna granica po opsegu alata, iznad one koju transport već naplaćuje
 * svakom zahtevu. `null` znači "nema dodatne" - čitanje je već pokriveno.
 */
export function rateLimiterForScope(scope: string): RateLimiter | null {
  return scope === MCP_SCOPE_WRITE ? mcpWriteRateLimiter : null;
}
