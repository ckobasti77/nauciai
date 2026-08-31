import { notFound } from "next/navigation";

/**
 * Hvatač neuparenih ruta ispod `/[locale]/…`. App Router koristi
 * `[locale]/not-found.tsx` samo kad neko pozove `notFound()` (ili za root
 * `app/not-found.tsx`), a ne za proizvoljne nepostojeće URL-ove — pa je bez ovog
 * catch-all-a svaki takav URL vraćao Next-ov generički 404 van teme/providera.
 * Ova ruta ima najniži prioritet (specifične rute uvek pobede), poziva
 * `notFound()` i time renderuje živi-papir 404 UNUTAR `[locale]/layout.tsx`
 * (tema, provideri, html lang) uz ispravan 404 status.
 */
export default function CatchAllNotFound(): never {
  notFound();
}
