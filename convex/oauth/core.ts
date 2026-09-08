/**
 * OAuth 2.1 jezgro za MCP (MCP-P4-OAUTH): format tokena, PKCE, politika
 * `redirect_uri`-ja, opsezi, `resource` (RFC 8707). ČIST modul - bez Convex
 * zavisnosti - da bi ga uvozili i HTTP sloj i UI ekran pristanka, kao što UI
 * već uvozi `mcp/apiKey.ts`.
 *
 * Isti princip kao za API ključ: pun token postoji samo u odgovoru token
 * endpointa, baza čuva sha256 heks. Prefiksi razlikuju OAuth token od
 * `nai_live_` ključa na istom `Authorization: Bearer` zaglavlju.
 */

import {
  base62Encode,
  isKnownScope,
  KEY_BASE62_LENGTH,
  KEY_RANDOM_BYTES,
  MCP_SCOPE_READ,
  MCP_SCOPES,
  parseBearerKey,
} from "../mcp/apiKey";

export const ACCESS_TOKEN_PREFIX = "nai_oat_";
export const REFRESH_TOKEN_PREFIX = "nai_ort_";
export const AUTH_CODE_PREFIX = "nai_oac_";

/** Kod važi 60 s i koristi se tačno jednom (tačka 3). */
export const AUTH_CODE_TTL_MS = 60_000;
export const ACCESS_TOKEN_TTL_SECONDS = 3600;
export const ACCESS_TOKEN_TTL_MS = ACCESS_TOKEN_TTL_SECONDS * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const MAX_CLIENT_NAME_LENGTH = 128;
export const MAX_REDIRECT_URIS = 10;

export const GRANT_TYPES_SUPPORTED = ["authorization_code", "refresh_token"] as const;
export const RESPONSE_TYPES_SUPPORTED = ["code"] as const;
export const CODE_CHALLENGE_METHODS_SUPPORTED = ["S256"] as const;
/** Javni klijent: `client_id` ide u telo, tajne nema (Claude Desktop, Claude Code, mcp-remote). */
export const TOKEN_ENDPOINT_AUTH_METHODS_SUPPORTED = ["none"] as const;

/** Putanja ekrana pristanka na Next aplikaciji (`SITE_URL`), bez jezičkog prefiksa. */
export const AUTHORIZE_PATH = "/oauth/authorize";
/** Putanje na Convex site-u (`CONVEX_SITE_URL`). */
export const TOKEN_PATH = "/oauth/token";
export const REGISTER_PATH = "/oauth/register";
export const MCP_PATH = "/mcp";
export const PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
export const AUTHORIZATION_SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";

export type BearerCredential = { kind: "apiKey" | "oauth"; secret: string };

/**
 * `Authorization: Bearer <...>` -> vrsta kredencijala po prefiksu, ili `null`.
 * `nai_live_` ključ prolazi kroz postojeći `parseBearerKey` NEPROMENJEN; OAuth
 * access token ima isti oblik (prefiks + 43 base62) sa `nai_oat_`. Refresh
 * token (`nai_ort_`) se ovde NE prihvata - on ide samo na token endpoint.
 */
export function parseBearerCredential(header: string | null): BearerCredential | null {
  const apiKey = parseBearerKey(header);
  if (apiKey) return { kind: "apiKey", secret: apiKey };
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  if (!hasOpaqueFormat(token, ACCESS_TOKEN_PREFIX)) return null;

  return { kind: "oauth", secret: token };
}

/** Prefiks + 43 base62 znaka - isti generator kao `generateApiKey`. */
export function generateOpaqueSecret(prefix: string): string {
  const bytes = new Uint8Array(KEY_RANDOM_BYTES);
  crypto.getRandomValues(bytes);

  return prefix + base62Encode(bytes).padStart(KEY_BASE62_LENGTH, "0");
}

export function hasOpaqueFormat(value: string, prefix: string): boolean {
  return (
    value.startsWith(prefix) &&
    value.length === prefix.length + KEY_BASE62_LENGTH &&
    /^[0-9A-Za-z]+$/.test(value.slice(prefix.length))
  );
}

// ── PKCE (RFC 7636) ────────────────────────────────────────────────────────

/** `code_verifier` i `code_challenge`: 43-128 znakova iz unreserved skupa. */
const PKCE_VALUE = /^[A-Za-z0-9._~-]{43,128}$/;

export function isValidCodeVerifier(value: string): boolean {
  return PKCE_VALUE.test(value);
}

export function isValidCodeChallenge(value: string): boolean {
  return PKCE_VALUE.test(value);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `S256`: BASE64URL(SHA256(code_verifier)) - jedina podržana metoda; `plain` se odbija. */
export async function s256Challenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));

  return base64UrlEncode(new Uint8Array(digest));
}

// ── redirect_uri ──────────────────────────────────────────────────────────

/**
 * Šta sme da se registruje (MCP spec, "Communication Security"): `https:` na
 * bilo kom hostu, ili `http:` samo na loopback-u (Claude Code, mcp-remote).
 * Bez fragmenta. Poklapanje pri autorizaciji je znak-za-znak, bez wildcard-a.
 */
export function isAllowedRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash !== "" || value.endsWith("#")) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") {
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  }

  return false;
}

const MAX_REDIRECT_URI_LENGTH = 2048;

export type ClientRegistration = { clientName: string; redirectUris: string[] };

export type RegistrationParseResult =
  | { ok: true; registration: ClientRegistration }
  | { ok: false; error: "invalid_client_metadata" | "invalid_redirect_uri"; description: string };

/**
 * Znakovi koji u imenu klijenta nemaju šta da traže (P4b, nalaz 3). Ime ide u
 * `<h1>` ekrana pristanka i glavni je anti-phishing signal, a bira ga
 * NEAUTENTIFIKOVAN pozivalac registracije. Kod-tačke, ne regex sa `\p{..}`:
 * `tsconfig` cilja ES2017, gde Unicode property escape ne prolazi.
 */
function isDisallowedInClientName(code: number): boolean {
  return (
    // C0 kontrolni, DEL, C1 kontrolni.
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    // Soft hyphen, arabic letter mark, mongolian vowel separator.
    code === 0xad ||
    code === 0x61c ||
    code === 0x180e ||
    // Hangul/halfwidth fileri koji se crtaju kao prazno.
    code === 0x115f ||
    code === 0x1160 ||
    code === 0x3164 ||
    code === 0xffa0 ||
    // Zero-width space/joiner/non-joiner, LRM, RLM.
    (code >= 0x200b && code <= 0x200f) ||
    // Line/paragraph separator i bidi embeddings/overrides (uključujući U+202E RLO).
    (code >= 0x2028 && code <= 0x202e) ||
    // Word joiner, nevidljivi operatori, bidi isolates, deprecated format znakovi.
    (code >= 0x2060 && code <= 0x206f) ||
    // BOM / zero-width no-break space, interlinear annotation, tag znakovi.
    code === 0xfeff ||
    (code >= 0xfff9 && code <= 0xfffb) ||
    (code >= 0xe0000 && code <= 0xe007f) ||
    // „Generički" kombinujući dijakritici (Zalgo). Posle NFC normalizacije
    // legitiman „é" je jedan precomposed znak, pa ovde ne strada; ostaju samo
    // nagomilani/nespojivi znakovi. Skriptama specifični znakovi (devanagari,
    // arapske harakate...) nisu u ovim blokovima i prolaze.
    (code >= 0x300 && code <= 0x36f) ||
    (code >= 0x1ab0 && code <= 0x1aff) ||
    (code >= 0x1dc0 && code <= 0x1dff) ||
    (code >= 0x20d0 && code <= 0x20ff) ||
    (code >= 0xfe20 && code <= 0xfe2f)
  );
}

function isControlChar(code: number): boolean {
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
}

/**
 * NFC, pa: kontrolni znakovi (tab, novi red...) postaju razmak, ostale
 * nedozvoljene kod-tačke (bidi, nevidljivi, kombinujući) nestaju bez traga -
 * „Cla<ZWSP>ude" mora da ostane „Claude", ne „Cla ude". Na kraju sažimanje
 * razmaka.
 */
export function sanitizeClientName(value: string): string {
  let out = "";
  for (const ch of value.normalize("NFC")) {
    const code = ch.codePointAt(0) ?? 0;
    if (isControlChar(code)) out += " ";
    else if (!isDisallowedInClientName(code)) out += ch;
  }

  return out.replace(/\s+/g, " ").trim();
}

function metadataError(description: string): RegistrationParseResult {
  return { ok: false, error: "invalid_client_metadata", description };
}

/**
 * Telo `POST /oauth/register` (RFC 7591) -> ime i redirect URI-ji, ili greška
 * po RFC-u. `client_name` je obavezan: ekran pristanka mora da pokaže KO
 * traži pristup. Prihvata se samo javni klijent (`token_endpoint_auth_method`
 * `none`) sa našim tipovima odobrenja; nepoznata polja se zanemaruju.
 */
export function parseClientRegistration(body: unknown): RegistrationParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return metadataError("body must be a JSON object");
  }
  const record = body as Record<string, unknown>;

  const rawName = record.client_name;
  const clientName = typeof rawName === "string" ? sanitizeClientName(rawName) : "";
  if (clientName === "" || clientName.length > MAX_CLIENT_NAME_LENGTH) {
    return metadataError(`client_name is required (1-${MAX_CLIENT_NAME_LENGTH} characters)`);
  }

  const rawUris = record.redirect_uris;
  if (
    !Array.isArray(rawUris) ||
    rawUris.length === 0 ||
    rawUris.length > MAX_REDIRECT_URIS ||
    rawUris.some((uri) => typeof uri !== "string" || uri.length > MAX_REDIRECT_URI_LENGTH)
  ) {
    return {
      ok: false,
      error: "invalid_redirect_uri",
      description: `redirect_uris must be an array of 1-${MAX_REDIRECT_URIS} strings`,
    };
  }
  const redirectUris = Array.from(new Set(rawUris as string[]));
  if (redirectUris.some((uri) => !isAllowedRedirectUri(uri))) {
    return {
      ok: false,
      error: "invalid_redirect_uri",
      description: "redirect_uris must use https, or http on localhost / 127.0.0.1, without a fragment",
    };
  }

  const authMethod = record.token_endpoint_auth_method;
  if (authMethod !== undefined && authMethod !== "none") {
    return metadataError('only token_endpoint_auth_method "none" is supported (public client)');
  }
  const grantTypes = record.grant_types;
  if (
    grantTypes !== undefined &&
    (!Array.isArray(grantTypes) || grantTypes.some((type) => !(GRANT_TYPES_SUPPORTED as readonly unknown[]).includes(type)))
  ) {
    return metadataError("grant_types may only contain authorization_code and refresh_token");
  }
  const responseTypes = record.response_types;
  if (responseTypes !== undefined && (!Array.isArray(responseTypes) || responseTypes.some((type) => type !== "code"))) {
    return metadataError('response_types may only contain "code"');
  }

  return { ok: true, registration: { clientName, redirectUris } };
}

/** Dodaje parametre na `redirect_uri` čuvajući postojeći query; `undefined` se preskače. */
export function appendRedirectParams(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }

  return url.toString();
}

// ── opsezi ────────────────────────────────────────────────────────────────

/**
 * `scope` parametar (razmakom razdvojen) -> spisak, ili `null` za nepoznat
 * opseg. Bez parametra klijent dobija samo čitanje - `mcp:write` (troši
 * kredite) mora da se zatraži izričito, isto kao kod ključa.
 */
export function parseScopeParam(scope: string | undefined): string[] | null {
  if (scope === undefined || scope.trim() === "") return [MCP_SCOPE_READ];
  const scopes = Array.from(new Set(scope.trim().split(/\s+/)));
  if (scopes.some((value) => !isKnownScope(value))) return null;

  return scopes;
}

export const SCOPES_SUPPORTED: readonly string[] = MCP_SCOPES;

// ── resource (RFC 8707) ───────────────────────────────────────────────────

/** Kanonski URI MCP servera: origin Convex site-a + `/mcp`, bez završne kose crte. */
export function canonicalResource(issuer: string): string {
  return `${issuer.replace(/\/+$/, "")}${MCP_PATH}`;
}

/**
 * Da li `resource` iz zahteva označava NAŠ MCP server. Shema i host se porede
 * bez obzira na velika slova (spec: prihvati i uppercase), završna kosa crta
 * se zanemaruje, fragment i query ga diskvalifikuju.
 */
export function resourceMatches(candidate: string, issuer: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.hash !== "" || url.search !== "") return false;
  const expected = new URL(canonicalResource(issuer));

  return (
    url.protocol.toLowerCase() === expected.protocol.toLowerCase() &&
    url.host.toLowerCase() === expected.host.toLowerCase() &&
    url.pathname.replace(/\/+$/, "") === expected.pathname
  );
}
