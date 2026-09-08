/**
 * Apsolutni URL-ovi OAuth toka (MCP-P4-OAUTH). SAMO za server: čita `env`.
 *
 * Dva origina: autorizacioni server i MCP resurs su Convex site
 * (`CONVEX_SITE_URL`, daje ga platforma), a ekran pristanka je Next stranica
 * na `SITE_URL` - tamo živi Convex Auth sesija, convex.site nema kolačić.
 */

import { env } from "../_generated/server";
import { AUTHORIZE_PATH, PROTECTED_RESOURCE_METADATA_PATH } from "./core";

function trimOrigin(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

/** `CONVEX_SITE_URL` bez završne kose crte, ili `null` kad nije postavljen (convex-test bez podešavanja). */
export function issuerOriginFromEnv(): string | null {
  const origin = trimOrigin(env.CONVEX_SITE_URL);

  return origin === "" ? null : origin;
}

/** Origin autorizacionog servera; bez env-a pada na origin samog zahteva. */
export function issuerOrigin(request: Request): string {
  return issuerOriginFromEnv() ?? new URL(request.url).origin;
}

/** Origin Next aplikacije (ekran pristanka). Bez `SITE_URL`-a metapodaci ne mogu da se sastave. */
export function appOrigin(): string {
  const origin = trimOrigin(env.SITE_URL);
  if (origin === "") throw new Error("SITE_URL nije postavljen");

  return origin;
}

export function authorizeUrl(): string {
  return `${appOrigin()}${AUTHORIZE_PATH}`;
}

export function protectedResourceMetadataUrl(request: Request): string {
  return `${issuerOrigin(request)}${PROTECTED_RESOURCE_METADATA_PATH}`;
}
