import { expect, test } from "vitest";

import {
  base62Encode,
  generateApiKey,
  KEY_BASE62_LENGTH,
  KEY_PREFIX,
  keyDisplayPrefix,
  parseBearerKey,
  sha256Hex,
  timingSafeEqual,
} from "./apiKey";

test("base62Encode: poznate vrednosti", () => {
  expect(base62Encode(new Uint8Array([0]))).toBe("0");
  expect(base62Encode(new Uint8Array([61]))).toBe("z");
  expect(base62Encode(new Uint8Array([62]))).toBe("10");
  // 65535 = 17*62^2 + 3*62 + 1
  expect(base62Encode(new Uint8Array([255, 255]))).toBe("H31");
});

test("generateApiKey: nai_live_ + 43 base62 znaka, svaki put drugačiji", () => {
  const first = generateApiKey();
  const second = generateApiKey();

  expect(first).toMatch(new RegExp(`^${KEY_PREFIX}[0-9A-Za-z]{${KEY_BASE62_LENGTH}}$`));
  expect(first).not.toBe(second);
  expect(keyDisplayPrefix(first)).toHaveLength(12);
  expect(keyDisplayPrefix(first).startsWith(KEY_PREFIX)).toBe(true);
});

test("sha256Hex: poznati digest", async () => {
  expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("timingSafeEqual: jednako, različito, različite dužine", () => {
  expect(timingSafeEqual("abc", "abc")).toBe(true);
  expect(timingSafeEqual("abc", "abd")).toBe(false);
  expect(timingSafeEqual("abc", "abcd")).toBe(false);
  expect(timingSafeEqual("", "")).toBe(true);
});

test("parseBearerKey: prihvata samo `Bearer <naš ključ>`", () => {
  const key = generateApiKey();

  expect(parseBearerKey(`Bearer ${key}`)).toBe(key);
  expect(parseBearerKey(`bearer ${key}`)).toBe(key);
  expect(parseBearerKey(null)).toBeNull();
  expect(parseBearerKey("")).toBeNull();
  expect(parseBearerKey("Bearer")).toBeNull();
  expect(parseBearerKey(`Basic ${key}`)).toBeNull();
  expect(parseBearerKey("Bearer nai_live_kratak")).toBeNull();
  expect(parseBearerKey(`Bearer ${key.replace(KEY_PREFIX, "sk_live_x")}`)).toBeNull();
  expect(parseBearerKey(`Bearer ${key} extra`)).toBeNull();
});
