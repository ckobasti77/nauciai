import type { NextConfig } from "next";

import { locales, otherLocale, pricingPath, withLocale } from "./lib/i18n";

const nextConfig: NextConfig = {
  // Strana pretplate ima PREVEDEN segment (sr `/pretplata`, en `/pricing`). Suprotna
  // kombinacija (`/en/pretplata`, `/sr/pricing`) ne sme da postoji kao drugi URL istog
  // sadržaja, pa se ovde preusmerava — pravim 308 pre rendera, ne meta-refreshom iz
  // strane. Putanje gradi `withLocale` + `pricingPath`, nikad ručno pisan `/sr/…`.
  async redirects() {
    return locales.map((locale) => ({
      source: withLocale(locale, pricingPath(otherLocale(locale))),
      destination: withLocale(locale, pricingPath(locale)),
      permanent: true,
    }));
  },
  images: {
    // AVIF prvi (najbolja kompresija), pa WebP kao fallback. Next/image bira
    // format po `Accept` zaglavlju pregledača.
    formats: ["image/avif", "image/webp"],
  },
  // Kad Next sam služi statični .webm iz public/ (Vercel/lokal), prisili ispravan
  // MIME tip. Na LiteSpeed produkciji isto radi public/.htaccess.
  async headers() {
    return [
      {
        source: "/images/:path*.webm",
        headers: [{ key: "Content-Type", value: "video/webm" }],
      },
    ];
  },
};

export default nextConfig;
