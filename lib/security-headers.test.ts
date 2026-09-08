import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { expect, test } from "vitest";

import nextConfig from "../next.config";
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

test("ekran pristanka, app, studio radni prostor i prijava dobijaju DENY u sve tri jezičke forme", () => {
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
  for (const path of ["/", "/kursevi", "/en/courses", "/studio", "/en/studio", "/oauthx", "/application", "/sign-in-help"]) {
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
