/**
 * Parametri `/oauth/authorize` zahteva (MCP-P4-OAUTH, tačka 4): koje ulaze
 * ekran pristanka prosleđuje serveru i kako se proveravaju ono što NE zavisi od
 * baze (odgovor, PKCE, opsezi). Da li klijent postoji i da li je `redirect_uri`
 * registrovan proverava `oauth/server.ts` - ovde je samo čist deo, zajednički
 * serveru i UI-ju, plus povratak na prijavu koji čuva sve parametre.
 */

import type { Locale } from "../../lib/i18n";
import { toPublicPath } from "../../lib/routes";
import { AUTHORIZE_PATH, isValidCodeChallenge, parseScopeParam } from "./core";

/** Jedini parametri koje ekran pristanka šalje serveru - ostatak URL-a se ne prenosi. */
export const AUTHORIZE_PARAM_NAMES = [
  "client_id",
  "redirect_uri",
  "response_type",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
  "resource",
] as const;

export type AuthorizeParamName = (typeof AUTHORIZE_PARAM_NAMES)[number];
export type AuthorizeParams = Partial<Record<AuthorizeParamName, string>>;

export type AuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string | undefined;
  codeChallenge: string;
  resource: string | undefined;
};

export type AuthorizeError = "invalid_request" | "unsupported_response_type" | "invalid_scope";

export type AuthorizeParseResult =
  | { ok: true; request: AuthorizeRequest }
  | { ok: false; error: AuthorizeError; description: string };

/** Iz `URLSearchParams` (ili sličnog) uzima samo poznate parametre. */
export function pickAuthorizeParams(source: { get(name: string): string | null }): AuthorizeParams {
  const params: AuthorizeParams = {};
  for (const name of AUTHORIZE_PARAM_NAMES) {
    const value = source.get(name);
    if (value !== null) params[name] = value;
  }

  return params;
}

/**
 * Provera bez baze. Redosled po OAuth 2.1: `client_id` i `redirect_uri`
 * moraju da postoje (tek onda server sme da razmišlja o preusmerenju),
 * `response_type=code`, PKCE `S256` obavezan (`plain` i odsutan se odbijaju),
 * opsezi poznati. `state` se ne tumači - vraća se nepromenjen.
 */
export function parseAuthorizeParams(params: AuthorizeParams): AuthorizeParseResult {
  const clientId = params.client_id?.trim() ?? "";
  const redirectUri = params.redirect_uri ?? "";
  if (clientId === "" || redirectUri === "") {
    return { ok: false, error: "invalid_request", description: "client_id and redirect_uri are required" };
  }
  if (params.response_type !== "code") {
    return { ok: false, error: "unsupported_response_type", description: "response_type must be \"code\"" };
  }
  if (params.code_challenge_method !== "S256") {
    return { ok: false, error: "invalid_request", description: "PKCE with code_challenge_method=S256 is required" };
  }
  if (params.code_challenge === undefined || !isValidCodeChallenge(params.code_challenge)) {
    return { ok: false, error: "invalid_request", description: "code_challenge is missing or malformed" };
  }
  const scopes = parseScopeParam(params.scope);
  if (scopes === null) {
    return { ok: false, error: "invalid_scope", description: "unknown scope requested" };
  }

  return {
    ok: true,
    request: {
      clientId,
      redirectUri,
      scopes,
      state: params.state,
      codeChallenge: params.code_challenge,
      resource: params.resource,
    },
  };
}

/**
 * Neprijavljen korisnik na `/oauth/authorize?...` -> prijava sa `next` koji
 * nosi ISTE parametre, pa se posle prijave vraća na isti zahtev (tačka 5,
 * test 1). `search` je `window.location.search` (sa vodećim `?`). Putanja je
 * interna i isto-jezična, pa prolazi `safeRedirectTo` na strani za prijavu.
 */
export function signInUrlForAuthorize(locale: Locale, search: string): string {
  const next = `${toPublicPath(locale, AUTHORIZE_PATH)}${search}`;

  return `${toPublicPath(locale, "/sign-in")}?next=${encodeURIComponent(next)}`;
}
