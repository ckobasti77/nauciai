import { expect, test } from "vitest";

import { parsePath } from "../../lib/routes";
import { generateApiKey, KEY_BASE62_LENGTH } from "../mcp/apiKey";
import { parseAuthorizeParams, pickAuthorizeParams, signInUrlForAuthorize } from "./authorizeRequest";
import {
  ACCESS_TOKEN_PREFIX,
  appendRedirectParams,
  AUTH_CODE_PREFIX,
  generateOpaqueSecret,
  hasOpaqueFormat,
  isAllowedRedirectUri,
  parseBearerCredential,
  parseClientRegistration,
  parseScopeParam,
  REFRESH_TOKEN_PREFIX,
  resourceMatches,
  s256Challenge,
  sanitizeClientName,
} from "./core";

// RFC 7636, dodatak B.
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

const VALID_AUTHORIZE = {
  client_id: "jd7fe4g9bgg61tnwem1bx8gsrs8e1ct6",
  redirect_uri: "http://localhost:6274/callback",
  response_type: "code",
  scope: "mcp:read mcp:write",
  state: "abc",
  code_challenge: RFC_CHALLENGE,
  code_challenge_method: "S256",
};

test("parseBearerCredential: ključ i OAuth access token po prefiksu, ostalo null", () => {
  const key = generateApiKey();
  const access = generateOpaqueSecret(ACCESS_TOKEN_PREFIX);
  const refresh = generateOpaqueSecret(REFRESH_TOKEN_PREFIX);

  expect(parseBearerCredential(`Bearer ${key}`)).toEqual({ kind: "apiKey", secret: key });
  expect(parseBearerCredential(`bearer ${access}`)).toEqual({ kind: "oauth", secret: access });
  // Refresh token nije za /mcp - samo za token endpoint.
  expect(parseBearerCredential(`Bearer ${refresh}`)).toBeNull();
  expect(parseBearerCredential(`Bearer ${access.slice(0, -1)}`)).toBeNull();
  expect(parseBearerCredential(`Basic ${access}`)).toBeNull();
  expect(parseBearerCredential(null)).toBeNull();
});

test("generateOpaqueSecret/hasOpaqueFormat: prefiks + 43 base62, svaki put drugačiji", () => {
  const first = generateOpaqueSecret(AUTH_CODE_PREFIX);
  const second = generateOpaqueSecret(AUTH_CODE_PREFIX);

  expect(first).toMatch(new RegExp(`^${AUTH_CODE_PREFIX}[0-9A-Za-z]{${KEY_BASE62_LENGTH}}$`));
  expect(first).not.toBe(second);
  expect(hasOpaqueFormat(first, AUTH_CODE_PREFIX)).toBe(true);
  expect(hasOpaqueFormat(first, ACCESS_TOKEN_PREFIX)).toBe(false);
  expect(hasOpaqueFormat(`${AUTH_CODE_PREFIX}${"-".repeat(KEY_BASE62_LENGTH)}`, AUTH_CODE_PREFIX)).toBe(false);
});

test("s256Challenge: primer iz RFC 7636", async () => {
  expect(await s256Challenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
});

test("isAllowedRedirectUri: https bilo gde, http samo loopback, bez fragmenta", () => {
  expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
  expect(isAllowedRedirectUri("http://localhost:6274/callback")).toBe(true);
  expect(isAllowedRedirectUri("http://127.0.0.1:3334/oauth/callback")).toBe(true);
  expect(isAllowedRedirectUri("http://[::1]:8080/cb")).toBe(true);
  expect(isAllowedRedirectUri("http://evil.example/callback")).toBe(false);
  expect(isAllowedRedirectUri("https://claude.ai/cb#frag")).toBe(false);
  expect(isAllowedRedirectUri("claude://callback")).toBe(false);
  expect(isAllowedRedirectUri("not a url")).toBe(false);
});

test("parseClientRegistration: ime obavezno, redirect po politici, samo javni klijent", () => {
  const ok = parseClientRegistration({
    client_name: "  Claude Desktop ",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback", "https://claude.ai/api/mcp/auth_callback"],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    unknown_field: 1,
  });
  expect(ok).toEqual({
    ok: true,
    registration: { clientName: "Claude Desktop", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] },
  });

  expect(parseClientRegistration({ redirect_uris: ["https://a.example/cb"] })).toMatchObject({ ok: false, error: "invalid_client_metadata" });
  expect(parseClientRegistration({ client_name: "X", redirect_uris: [] })).toMatchObject({ ok: false, error: "invalid_redirect_uri" });
  expect(parseClientRegistration({ client_name: "X", redirect_uris: ["http://evil.example/cb"] })).toMatchObject({
    ok: false,
    error: "invalid_redirect_uri",
  });
  expect(
    parseClientRegistration({ client_name: "X", redirect_uris: ["https://a.example/cb"], token_endpoint_auth_method: "client_secret_post" }),
  ).toMatchObject({ ok: false, error: "invalid_client_metadata" });
  expect(parseClientRegistration({ client_name: "X", redirect_uris: ["https://a.example/cb"], grant_types: ["client_credentials"] })).toMatchObject({
    ok: false,
    error: "invalid_client_metadata",
  });
  expect(parseClientRegistration("nope")).toMatchObject({ ok: false, error: "invalid_client_metadata" });
});

test("sanitizeClientName: bidi, nevidljivi, kontrolni i Zalgo znakovi odlaze; legitimno ime i NFC ostaju", () => {
  const rlo = String.fromCodePoint(0x202e);
  const zwsp = String.fromCodePoint(0x200b);
  const bom = String.fromCodePoint(0xfeff);
  const tag = String.fromCodePoint(0xe0041);
  const strike = String.fromCodePoint(0x336);
  const acute = String.fromCodePoint(0x301);
  const tab = String.fromCodePoint(9);

  expect(sanitizeClientName(`Claude${rlo} Desktop`)).toBe("Claude Desktop");
  expect(sanitizeClientName(`${bom}Cla${zwsp}ude${tag}`)).toBe("Claude");
  expect(sanitizeClientName(`C${strike}${strike}l${strike}aude`)).toBe("Claude");
  expect(sanitizeClientName(`  Nauči${tab}AI   desktop `)).toBe("Nauči AI desktop");
  // Dekomponovan „é" posle NFC postaje jedan znak i ne strada.
  expect(sanitizeClientName(`caf${"e"}${acute}`)).toBe("café");
  expect(sanitizeClientName("Клод Десктоп / クロード")).toBe("Клод Десктоп / クロード");

  // Ime koje se sastoji samo od nevidljivih znakova pada na obaveznost imena.
  expect(parseClientRegistration({ client_name: `${zwsp}${rlo}`, redirect_uris: ["https://a.example/cb"] })).toMatchObject({
    ok: false,
    error: "invalid_client_metadata",
  });
});

test("parseScopeParam: bez parametra samo čitanje, nepoznat opseg null, duplikati sažeti", () => {
  expect(parseScopeParam(undefined)).toEqual(["mcp:read"]);
  expect(parseScopeParam("")).toEqual(["mcp:read"]);
  expect(parseScopeParam("mcp:write mcp:read mcp:write")).toEqual(["mcp:write", "mcp:read"]);
  expect(parseScopeParam("mcp:read admin")).toBeNull();
});

test("resourceMatches: kanonski /mcp, velika slova i završna kosa crta tolerisani, drugi host ne", () => {
  const issuer = "https://example.convex.site";

  expect(resourceMatches("https://example.convex.site/mcp", issuer)).toBe(true);
  expect(resourceMatches("HTTPS://EXAMPLE.convex.site/mcp/", issuer)).toBe(true);
  expect(resourceMatches("https://example.convex.site", issuer)).toBe(false);
  expect(resourceMatches("https://other.convex.site/mcp", issuer)).toBe(false);
  expect(resourceMatches("https://example.convex.site/mcp?x=1", issuer)).toBe(false);
  expect(resourceMatches("example.convex.site/mcp", issuer)).toBe(false);
});

test("appendRedirectParams: čuva postojeći query, state ide nepromenjen", () => {
  const url = new URL(appendRedirectParams("http://localhost:6274/callback?keep=1", { code: "c", state: "st@te/ü&x=1", skip: undefined }));

  expect(url.searchParams.get("keep")).toBe("1");
  expect(url.searchParams.get("code")).toBe("c");
  expect(url.searchParams.get("state")).toBe("st@te/ü&x=1");
  expect(url.searchParams.has("skip")).toBe(false);
});

test("parseAuthorizeParams: PKCE S256 obavezan, plain i odsutan se odbijaju, opsezi i response_type provereni", () => {
  const ok = parseAuthorizeParams(VALID_AUTHORIZE);
  expect(ok).toEqual({
    ok: true,
    request: {
      clientId: VALID_AUTHORIZE.client_id,
      redirectUri: VALID_AUTHORIZE.redirect_uri,
      scopes: ["mcp:read", "mcp:write"],
      state: "abc",
      codeChallenge: RFC_CHALLENGE,
      resource: undefined,
    },
  });

  expect(parseAuthorizeParams({ ...VALID_AUTHORIZE, code_challenge_method: "plain" })).toMatchObject({ ok: false, error: "invalid_request" });
  expect(parseAuthorizeParams({ ...VALID_AUTHORIZE, code_challenge_method: undefined })).toMatchObject({ ok: false, error: "invalid_request" });
  expect(parseAuthorizeParams({ ...VALID_AUTHORIZE, code_challenge: undefined })).toMatchObject({ ok: false, error: "invalid_request" });
  expect(parseAuthorizeParams({ ...VALID_AUTHORIZE, code_challenge: "kratko" })).toMatchObject({ ok: false, error: "invalid_request" });
  expect(parseAuthorizeParams({ ...VALID_AUTHORIZE, response_type: "token" })).toMatchObject({ ok: false, error: "unsupported_response_type" });
  expect(parseAuthorizeParams({ ...VALID_AUTHORIZE, scope: "mcp:read admin" })).toMatchObject({ ok: false, error: "invalid_scope" });
  expect(parseAuthorizeParams({ ...VALID_AUTHORIZE, client_id: undefined })).toMatchObject({ ok: false, error: "invalid_request" });
  expect(parseAuthorizeParams({ ...VALID_AUTHORIZE, scope: undefined })).toMatchObject({ ok: true, request: { scopes: ["mcp:read"] } });
});

test("pickAuthorizeParams: uzima samo poznate parametre", () => {
  const search = new URLSearchParams({ ...VALID_AUTHORIZE, _junk: "x", utm_source: "y" });

  expect(pickAuthorizeParams(search)).toEqual(VALID_AUTHORIZE);
});

/**
 * Tačka 5, test 1: authorize bez prijave -> prijava; posle prijave nazad na
 * authorize sa ISTIM parametrima. Strana za prijavu prihvata `next` samo ako
 * je interna putanja istog jezika (`safeRedirectTo` u sign-in/page.tsx) - to
 * pravilo se ovde ponavlja, pa test pada ako bi URL ispao iz njega.
 */
test("authorize bez prijave -> prijava sa `next` koji vraća na authorize sa istim parametrima", () => {
  const original = new URLSearchParams({ ...VALID_AUTHORIZE, state: "st@te/ü&x=1", resource: "https://example.convex.site/mcp" });
  const search = `?${original.toString()}`;

  for (const locale of ["sr", "en"] as const) {
    const signIn = new URL(signInUrlForAuthorize(locale, search), "http://localhost:3000");
    expect(signIn.pathname).toBe(locale === "sr" ? "/sign-in" : "/en/sign-in");

    const next = signIn.searchParams.get("next");
    expect(next).not.toBeNull();
    // Pravilo strane za prijavu: interna putanja (bez `//`), isti jezik.
    expect(/^\/(?![/\\])/.test(next!)).toBe(true);
    expect(parsePath(next!).locale).toBe(locale);
    expect(parsePath(next!).canonicalPath).toBe("/oauth/authorize");

    const returned = new URL(next!, "http://localhost:3000");
    expect(returned.pathname).toBe(locale === "sr" ? "/oauth/authorize" : "/en/oauth/authorize");
    expect(Object.fromEntries(returned.searchParams)).toEqual(Object.fromEntries(original));
  }

  expect(signInUrlForAuthorize("sr", "")).toBe("/sign-in?next=%2Foauth%2Fauthorize");
});
