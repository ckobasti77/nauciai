import type { NextConfig } from "next";

import { frameDenyHeaderEntries } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // Kanonizacija javnih URL-ova (prevedeni segmenti, /sr -> /, stari legal URL-ovi)
  // sada živi u `proxy.ts` kroz jedan 308 nad `lib/routes.ts`. `redirects()` je
  // uklonjen: pošto ide PRE middleware-a, slao bi i engleske korisnike na /pretplata.
  images: {
    // AVIF prvi (najbolja kompresija), pa WebP kao fallback. Next/image bira
    // format po `Accept` zaglavlju pregledača.
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    // Turbopack PostCSS (Tailwind) po defaultu pušta u zaseban `node` proces koji
    // se javlja nazad preko TCP-a na 127.0.0.1. Na Hostinger build serveru ta veza
    // ne prolazi: proces tiho izađe sa statusom 0 i build pada na `app/globals.css`
    // ("node process exited before we could connect to it"). Worker niti rade u
    // istom procesu, bez mreže - Turbopack ostaje, samo PostCSS ne ide preko TCP-a.
    turbopackPluginRuntimeStrategy: "workerThreads",
  },
  // Kad Next sam služi statični .webm iz public/ (Vercel/lokal), prisili ispravan
  // MIME tip. Na LiteSpeed produkciji isto radi public/.htaccess.
  async headers() {
    return [
      {
        source: "/images/:path*.webm",
        headers: [{ key: "Content-Type", value: "video/webm" }],
      },
      // 3D-FAZA5: isti razlog kao .webm iznad — kad Next sam služi /models/*.glb
      // (Vercel/lokal), prisili ispravan MIME tip. LiteSpeed produkcija ima svoje
      // pravilo u public/.htaccess.
      {
        source: "/models/:path*.glb",
        headers: [{ key: "Content-Type", value: "model/gltf-binary" }],
      },
      // NAPOMENA: `Vary: Cookie` na "/" NIJE ovde jer Next App Router pregazi `Vary` na
      // renderovanom RSC odgovoru (potvrđeno na produkciji: `curl -I` ne vraća `Cookie` u
      // Vary-ju bez obzira na ovo pravilo) — deklaracija bi bila mrtvo slovo na papiru. Nije
      // ni potrebna: "/" već nosi `Cache-Control: private, no-cache, no-store` (uvek
      // revalidacija, nikad deljeni keš), pa nema šta da se keš-truje po jeziku; a stvarni
      // `Vary: Cookie` za edge keš (LiteSpeed) je dodat na rubu u `public/.htaccess`. 307 iz
      // proxy.ts (soft redirect na /en) svoj `Vary: Cookie` zadrži nezavisno (terminalni
      // odgovor, nema RSC rendera).
      // Clickjacking (MCP-P4b): ekran pristanka `/oauth/authorize`, app, studio
      // radni prostor i prijava ne smeju u tuđi <iframe>. Spisak putanja i
      // obrazloženje su u `lib/security-headers.ts`; test u
      // `lib/security-headers.test.ts` proverava da pravila pogađaju te putanje.
      ...frameDenyHeaderEntries(),
    ];
  },
};

export default nextConfig;
