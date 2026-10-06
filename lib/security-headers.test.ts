import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { expect, test } from "vitest";

import nextConfig from "../next.config";
import { toPublicPath } from "./routes";
import { FRAME_DENY_HEADERS, frameDenyHeaderEntries } from "./security-headers";

/**
 * Isti matcher kojim Next bira `headers()` pravila za zahtev
 * (`next/dist/server/lib/router-utils/filesystem.js` -> `getPathMatch`), pa
 * test dokazuje da pravila pogađaju tačno one putanje koje treba, a ne samo
 * da su stringovi napisani.
 */
function sourcesMatching(pathname: string): string[] {
  return frameDenyHeaderEntries()
    .filter((entry) => getPathMatch(entry.source)(pathname) !== false)
    .map((entry) => entry.source);
}

test("ekran pristanka, app, Crea radni prostor i prijava dobijaju DENY u sve tri jezičke forme", () => {
  const protectedPaths = [
    "/oauth/authorize",
    "/sr/oauth/authorize",
    "/en/oauth/authorize",
    "/app",
    "/app/profile/api-keys",
    "/sr/app/profile/api-keys",
    "/en/app/profile/api-keys",
    "/studio/app",
    "/en/studio/app/projekat",
    "/studio/krediti",
    "/sr/studio/app",
    "/crea/app",
    "/crea/app/m/abc",
    "/en/crea/app",
    "/en/crea/app/m/abc",
    "/crea/krediti",
    "/en/crea/krediti",
    "/sign-in",
    "/sr/sign-in",
    "/en/sign-in",
    "/auth/complete",
    "/en/auth/complete",
    "/reset-password",
    "/verify-email",
  ];
  for (const path of protectedPaths) {
    expect(sourcesMatching(path), path).not.toEqual([]);
  }

  // Marketing ostaje bez zaglavlja - i putanje koje samo LIČE na zaštićene.
  for (const path of [
    "/",
    "/kursevi",
    "/en/courses",
    "/studio",
    "/en/studio",
    "/crea",
    "/en/crea",
    "/uslovi-crea",
    "/en/crea-terms",
    "/oauthx",
    "/application",
    "/sign-in-help",
  ]) {
    expect(sourcesMatching(path), path).toEqual([]);
  }
});

test("zajednica Cree (K27): galerija, izazov i poziv dobijaju DENY; sveska i landing ne", () => {
  for (const path of [
    "/crea/galerija",
    "/crea/galerija/abc123",
    "/en/crea/galerija/abc123",
    "/sr/studio/galerija",
    "/crea/izazov",
    "/en/crea/izazov",
    "/studio/izazov",
    "/crea/poziv/abcd2345",
    "/en/crea/poziv/abcd2345",
  ]) {
    expect(sourcesMatching(path), path).not.toEqual([]);
  }
  // K30 (K29 S-01): sveska je sada zaštićena - ima akcije jednim klikom.
  for (const path of ["/crea/sveska", "/en/crea/sveska", "/studio/sveska"]) {
    expect(sourcesMatching(path), path).not.toEqual([]);
  }
  for (const path of ["/crea", "/crea/sveskaa", "/crea/izazovi-stari", "/crea/galerijaa"]) {
    expect(sourcesMatching(path), path).toEqual([]);
  }
});

test("svako pravilo nosi oba zaglavlja i next.config.ts ih zaista vraća iz headers()", async () => {
  expect(FRAME_DENY_HEADERS).toEqual([
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  ]);

  if (!nextConfig.headers) throw new Error("next.config.ts nema headers()");
  const configured = await nextConfig.headers();
  for (const entry of frameDenyHeaderEntries()) {
    expect(configured).toContainEqual(entry);
  }
});

test("javne putanje Cree (iz lib/routes.ts) uvek pogađa DENY, i kad se slug promeni", () => {
  for (const locale of ["sr", "en"] as const) {
    for (const canonical of ["/studio/app", "/studio/app/m/abc", "/studio/krediti"]) {
      const publicPath = toPublicPath(locale, canonical);
      expect(sourcesMatching(publicPath), publicPath).not.toEqual([]);
    }
  }
});
