import type { MetadataRoute } from "next";

import { locales, withLocale } from "@/lib/i18n";

export default function robots(): MetadataRoute.Robots {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  // Javne rute po jeziku kroz `withLocale` (sr bez prefiksa, en sa /en) — nikad ručno
  // pisan `/sr/…`. Duži prefiks pobeđuje: landing /studio je dozvoljen, a radni prostor
  // i kupovina (studio-public F3) ostaju van indeksa kao i /app/.
  const allow = locales.flatMap((locale) => [
    withLocale(locale, "/community"),
    withLocale(locale, "/courses/"),
    withLocale(locale, "/studio"),
  ]).concat(
    // OG slika deljene knjižice: bez nje nema pregleda linka na mrežama (K29 S-04).
    // Duži prefiks pobeđuje `Disallow: /api/`; sama strana knjižice je `noindex`.
    "/api/crea/knjizica/",
  );
  const disallow = [
    ...locales.flatMap((locale) => [
      withLocale(locale, "/app/"),
      withLocale(locale, "/studio/app"),
      withLocale(locale, "/studio/krediti"),
      withLocale(locale, "/sign-in"),
      withLocale(locale, "/oauth/"),
    ]),
    "/api/",
  ];
  return {
    rules: [{ userAgent: "*", allow, disallow }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
