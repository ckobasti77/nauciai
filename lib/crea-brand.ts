import type { Metadata } from "next";

/**
 * Ikonice i OG slika Cree (K02). Fajlovi su gotovi u `public/brand/crea/`; ovde je
 * samo jedno mesto sa putanjama, da layout radionice i javni landing ne bi držali
 * dva spiska. Bez React-a - uvoze ga i server metadata funkcije.
 */
export const CREA_ICONS: NonNullable<Metadata["icons"]> = {
  icon: [
    { url: "/brand/crea/crea-favicon.svg", type: "image/svg+xml" },
    { url: "/brand/crea/crea-favicon-32.png", sizes: "32x32", type: "image/png" },
    { url: "/brand/crea/crea-favicon-16.png", sizes: "16x16", type: "image/png" },
  ],
  apple: [{ url: "/brand/crea/crea-ikonica-180.png", sizes: "180x180", type: "image/png" }],
};

export const CREA_OG_IMAGE = {
  url: "/brand/crea/crea-og.png",
  width: 1200,
  height: 630,
  alt: "Crea — stvaraj.",
} as const;
