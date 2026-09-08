/**
 * Ograničenje broja zahteva po ključu (MCP-P1-SKELET, tačka 5): 60/min.
 *
 * P1 drži brojače u memoriji izolata - to je NAMERNO labavo: Convex sme da
 * podigne više izolata, pa je stvarna granica višekratnik. Interfejs
 * `RateLimiter` je ono što handler vidi; P2 menja implementaciju za tabelu
 * (ili `@convex-dev/rate-limiter`) bez dodira u `handler.ts`.
 */

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type RateLimiter = {
  /** `subject` je identitet ključa (id reda), NIKAD sam ključ ni njegov hash. */
  check(subject: string, now: number): RateLimitDecision;
};

export const MCP_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;

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
