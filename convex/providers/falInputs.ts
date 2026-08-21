/**
 * Ulazi v4 kataloga -> polja koja fal očekuje u telu zahteva, i tarifa u ruti
 * sa `{tier}` placeholderom (STUDIO-CATALOG-V4 sekcija 5 i S5 ODLUKA 5).
 *
 * Čista logika, bez `ctx`: potpisane URL-ove pravi akcija, ovde se samo
 * rasporedjuju po imenima polja. Imena prate fal konvenciju (`image_url` za
 * jedan fajl, `image_urls` za više, `start_image_url`/`end_image_url` za par
 * kadrova) i **nisu potvrdjena živim pozivom** - pravila run-a to zabranjuju.
 * Pogrešno ime polja daje grešku i refund, ne tihi trošak.
 */

/** Potpisani URL-ovi po slotu, redom kojim ih je korisnik okačio. */
export type InputUrls = Record<string, string[]>;

const SLOT_FIELDS: Record<string, { single: string; many: string }> = {
  image: { single: "image_url", many: "image_urls" },
  video: { single: "video_url", many: "video_urls" },
  audio: { single: "audio_url", many: "audio_urls" },
  person: { single: "human_image_url", many: "human_image_urls" },
  garment: { single: "garment_image_url", many: "garment_image_urls" },
};

/** U `reference` režimu fal-ova polja nose prefiks - reference nisu isto što i ulaz. */
const REFERENCE_FIELDS: Record<string, string> = {
  image: "reference_image_urls",
  video: "reference_video_urls",
  audio: "reference_audio_urls",
};

export function falInputFields(inputMode: string, urls: InputUrls): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  // Par kadrova je jedini režim u kojem redosled unutar slota menja IME polja,
  // a ne samo mesto u nizu (katalog sekcija 5).
  if (inputMode === "first_last") {
    const images = urls.image ?? [];
    if (images[0]) fields.start_image_url = images[0];
    if (images[1]) fields.end_image_url = images[1];

    return fields;
  }

  for (const [slot, list] of Object.entries(urls)) {
    if (list.length === 0) continue;

    if (inputMode === "reference" && Object.hasOwn(REFERENCE_FIELDS, slot)) {
      fields[REFERENCE_FIELDS[slot]] = list;
      continue;
    }

    const names = Object.hasOwn(SLOT_FIELDS, slot) ? SLOT_FIELDS[slot] : undefined;
    if (!names) {
      fields[`${slot}_urls`] = list;
      continue;
    }

    if (list.length === 1) fields[names.single] = list[0];
    else fields[names.many] = list;
  }

  return fields;
}

/**
 * Ruta kod Klinga nosi `{tier}`, a tarifa NIJE kvalitet nego rezolucija
 * (katalog 3.1). Mapa stoji u `capabilities.tierByResolution` reda, pa se
 * menja iz admin ekrana bez deploy-a; ruta bez mape je greška, ne nagadjanje.
 */
export function resolveEndpointTier(
  endpoint: string,
  params: Record<string, unknown>,
  capabilities: Record<string, unknown>,
): string {
  if (!endpoint.includes("{tier}")) return endpoint;

  const map = capabilities.tierByResolution;
  const resolution = params.resolution;
  if (!map || typeof map !== "object" || typeof resolution !== "string") {
    throw new Error("RUTA_BEZ_TARIFE");
  }

  const tier = (map as Record<string, unknown>)[resolution];
  if (typeof tier !== "string") throw new Error(`RUTA_BEZ_TARIFE:${resolution}`);

  return endpoint.replace("{tier}", tier);
}
