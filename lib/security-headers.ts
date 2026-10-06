/**
 * Zaštita od uokviravanja (clickjacking), MCP-P4b BLOKER 1. Next sam ne
 * postavlja ni `X-Frame-Options` ni `frame-ancestors`, pa je pre ovoga bilo
 * moguće učitati `/oauth/authorize` u providan `<iframe>` preko mamac-dugmeta:
 * registracija OAuth klijenta je po RFC 7591 javna (napadač bira ime i
 * `redirect_uri`), a jedan klik prijavljenog posetioca na „Dozvoli pristup"
 * bi izdao kod napadačevom klijentu - dakle access token sa `mcp:write` i
 * trošenje tuđih kredita.
 *
 * `X-Frame-Options: DENY` za starije pregledače, `frame-ancestors 'none'` kao
 * CSP direktiva koja u novijim ima prednost. Oba kažu isto: ova strana se ne
 * sme prikazati ni u čijem okviru, ni u našem.
 *
 * Šta dobija zaštitu, i zašto ne samo ekran pristanka:
 * - `/oauth/*`: razlog iznad.
 * - `/app/*` (uključujući `/app/profile/api-keys`): iza prijave, sa radnjama
 *   koje su jedan-dva klika i deluju u ime korisnika (opoziv ključa, opoziv
 *   povezane aplikacije, admin radnje). Sam ključ napadač kroz okvir ne može
 *   da PROČITA (cross-origin), ali može da natera klik.
 * - Crea radni prostor i krediti (javno `/crea/app`, `/crea/krediti`; interno i
 *   pre 308 `/studio/app`, `/studio/krediti`): dugme koje troši kredite, odnosno kupuje.
 * - Zajednica Cree (K27; javno `/crea/galerija`, `/crea/izazov`, `/crea/poziv/<kod>`):
 *   lajk, glas na izazovu i prihvatanje poziva (kreativni par) su jedan klik u ime
 *   prijavljenog korisnika.
 * - `/sign-in`, `/auth/*`, `/reset-password`, `/verify-email`: forme za
 *   prijavu i tokovi sa jednokratnim linkovima ne smeju u tuđi okvir (UI
 *   redressing preko dugmeta „Prijavi se preko Google-a", i sl.).
 * - Marketinške strane (`/`, `/kursevi`, `/crea` landing...) nemaju radnju
 *   koja klikom nešto radi u ime korisnika i ostaju bez zaglavlja - ako ikad
 *   zatreba, jedno pravilo `/:path*` ovde pokriva sve. Nijedna strana
 *   aplikacije ne uokviruje sopstvene strane (`git grep "<iframe"` je prazan),
 *   pa DENY nigde ne lomi postojeće ponašanje.
 *
 * Svaka putanja se daje u tri forme: javna (sr bez prefiksa), `/en`, i
 * interna `/sr` na koju `proxy.ts` rewrite-uje javnu - koju god od njih Next
 * uporedi sa `source`, pravilo pogađa. `lib/security-headers.test.ts` to
 * dokazuje istim matcher-om koji Next koristi za `headers()`.
 */

export const FRAME_DENY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
] as const;

/**
 * Kanonske I javne putanje bez jezičkog prefiksa, u Next `headers()` `source`
 * sintaksi. Crea ima javni slug `crea` a interni folder `studio` (K02), pa stoje
 * obe forme: javna je ono što browser traži, interna ono na šta proxy rewrite-uje.
 */
export const FRAME_DENY_CANONICAL_SOURCES = [
  "/oauth/:path*",
  "/app/:path*",
  "/studio/app/:path*",
  "/studio/krediti/:path*",
  "/crea/app/:path*",
  "/crea/krediti/:path*",
  "/studio/galerija/:path*",
  "/studio/izazov",
  "/studio/poziv/:path*",
  "/crea/galerija/:path*",
  "/crea/izazov",
  "/crea/poziv/:path*",
  "/sign-in",
  "/auth/:path*",
  "/reset-password",
  "/verify-email",
] as const;

const LOCALE_PREFIXES = ["", "/sr", "/en"] as const;

export function frameDenySources(): string[] {
  return FRAME_DENY_CANONICAL_SOURCES.flatMap((source) => LOCALE_PREFIXES.map((prefix) => `${prefix}${source}`));
}

/** Unosi za `headers()` u `next.config.ts`. */
export function frameDenyHeaderEntries(): Array<{ source: string; headers: Array<{ key: string; value: string }> }> {
  return frameDenySources().map((source) => ({ source, headers: FRAME_DENY_HEADERS.map((header) => ({ ...header })) }));
}
