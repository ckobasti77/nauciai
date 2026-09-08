/**
 * API ključ za MCP (MCP-P1-SKELET, tačke 1 i 2): format, generisanje, hash.
 * Čist modul - koriste ga i mutacija `mcpKeys.createKey` i HTTP handler.
 *
 * Format: `nai_live_` + 32 nasumična bajta u base62 (43 znaka, fiksna širina).
 * Pun ključ se NIKAD ne upisuje u bazu - samo `sha256` heks; korisnik ga vidi
 * tačno jednom, pri kreiranju.
 */

export const KEY_PREFIX = "nai_live_";
/** Koliko znakova ključa sme u UI (`mcpApiKeys.prefix`) - obuhvata i `nai_live_`. */
export const KEY_DISPLAY_PREFIX_LENGTH = 12;
export const KEY_RANDOM_BYTES = 32;
/** 62^43 > 256^32, pa 32 bajta uvek stanu u 43 base62 znaka. */
export const KEY_BASE62_LENGTH = 43;

export const MCP_SCOPE_READ = "mcp:read";
export const DEFAULT_KEY_SCOPES: readonly string[] = [MCP_SCOPE_READ];

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Bajtovi -> base62 dugim deljenjem po bazi 256. Bez BigInt-a: `tsconfig`
 * cilja ES2017, gde `0n` literali ne prolaze.
 */
export function base62Encode(bytes: Uint8Array): string {
  const digits: number[] = [];
  let remaining = Array.from(bytes);
  while (remaining.length > 0) {
    let carry = 0;
    const quotient: number[] = [];
    for (const byte of remaining) {
      const value = carry * 256 + byte;
      const q = Math.floor(value / 62);
      carry = value % 62;
      if (quotient.length > 0 || q > 0) quotient.push(q);
    }
    digits.push(carry);
    remaining = quotient;
  }

  let out = "";
  for (let index = digits.length - 1; index >= 0; index -= 1) out += BASE62[digits[index]];

  return out;
}

export function generateApiKey(): string {
  const bytes = new Uint8Array(KEY_RANDOM_BYTES);
  crypto.getRandomValues(bytes);

  return KEY_PREFIX + base62Encode(bytes).padStart(KEY_BASE62_LENGTH, "0");
}

export function keyDisplayPrefix(key: string): string {
  return key.slice(0, KEY_DISPLAY_PREFIX_LENGTH);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));

  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

/**
 * Poređenje u konstantnom vremenu (tačka 5.2): bez ranog izlaza, prolazi celu
 * dužinu; dužina se procuri (neizbežno za stringove), sadržaj ne.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    const ca = index < a.length ? a.charCodeAt(index) : 0;
    const cb = index < b.length ? b.charCodeAt(index) : 0;
    mismatch |= ca ^ cb;
  }

  return mismatch === 0;
}

/**
 * `Authorization: Bearer <key>` -> ključ, ili `null` za odsutno/neispravno
 * zaglavlje. Vraća samo string koji LIČI na naš ključ, da se tuđi tokeni ne
 * bi ni hešovali.
 */
export function parseBearerKey(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const key = match[1];
  if (!key.startsWith(KEY_PREFIX) || key.length !== KEY_PREFIX.length + KEY_BASE62_LENGTH) return null;

  return key;
}
