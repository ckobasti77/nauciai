import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kanonizacija javnih URL-ova (prevedeni segmenti, /sr -> /, stari legal URL-ovi)
  // sada živi u `proxy.ts` kroz jedan 308 nad `lib/routes.ts`. `redirects()` je
  // uklonjen: pošto ide PRE middleware-a, slao bi i engleske korisnike na /pretplata.
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
      // "/" ima dve jezičke varijante po kolačiću (sr / 307 na /en), pa deljeni keš mora da vari
      // po kolačiću. Deklaracija stoji ovde, ali Next App Router PREGAZI `Vary` na renderovanom
      // RSC odgovoru (drugi headeri prolaze — proveren X-Probe — samo Vary ne). Zato je stvarni
      // efekat na "/" prolazu obezbeđen na LiteSpeed rubu (public/.htaccess: `Header append Vary`),
      // a keš trovanje je već sprečeno B4 pravilom (no-cache kad kolačić postoji). 307 iz proxy.ts
      // svoj `Vary: Cookie` zadrži (terminalni odgovor, nema RSC rendera).
      {
        source: "/",
        headers: [{ key: "Vary", value: "Cookie" }],
      },
    ];
  },
};

export default nextConfig;
