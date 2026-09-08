import { expect, test } from "vitest";

import { createMemoryRateLimiter } from "./rateLimit";

test("60 zahteva u minutu prolazi, 61. pada sa Retry-After, novi prozor resetuje", () => {
  const limiter = createMemoryRateLimiter({ limit: 60, windowMs: 60_000 });
  const start = 1_000_000;

  for (let index = 0; index < 60; index += 1) {
    expect(limiter.check("key-a", start + index * 10)).toEqual({ allowed: true });
  }

  const denied = limiter.check("key-a", start + 30_000);
  expect(denied.allowed).toBe(false);
  if (!denied.allowed) expect(denied.retryAfterSeconds).toBe(30);

  expect(limiter.check("key-a", start + 60_000)).toEqual({ allowed: true });
});

test("subjekti su nezavisni", () => {
  const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 60_000 });

  expect(limiter.check("key-a", 0).allowed).toBe(true);
  expect(limiter.check("key-a", 1).allowed).toBe(false);
  expect(limiter.check("key-b", 1).allowed).toBe(true);
});
