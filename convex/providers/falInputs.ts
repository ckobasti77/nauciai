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
  mask: { single: "mask_url", many: "mask_urls" },
};

/** U `reference` režimu fal-ova polja nose prefiks - reference nisu isto što i ulaz. */
const REFERENCE_FIELDS: Record<string, string> = {
  image: "reference_image_urls",
  video: "reference_video_urls",
  audio: "reference_audio_urls",
};

/**
 * Imena polja koja odstupaju od fal konvencije, po modelu (`capabilities.fal`,
 * Crea K07). fal nije dosledan: Seedream i FLUX.2 edit traže NIZ `image_urls`
 * i za jednu sliku, Wan prvi kadar zove `start_image_url`, LTX `image_url`,
 * PixVerse `first_image_url`; ElevenLabs muzika traje u `music_length_ms`, a
 * ne u minutima koje bira forma. Imena su iz fal OpenAPI šeme (`docs/crea/
 * planovi/K06.md` §6.1), ne iz živog poziva - pogrešno ime daje grešku i refund.
 *
 * - `fields`: tačno ime polja po slotu (`first`/`last` su dva kadra para).
 *   Ime koje se završava na `_urls` UVEK dobija niz, i za jedan fajl; ostala
 *   imena nose jedan fajl (slot sa takvim imenom ima `max: 1` u `inputSpec`-u).
 * - `params`: parametar forme -> ime kod fal-a, uz opciono množenje jedinice.
 * - `fixed`: polja koja idu uz SVAKI zahtev (npr. gašenje „proširenja opisa"
 *   koje bi korisnikov opis zamenilo modelovim, ili ga dodatno naplatilo).
 */
export type FalSlotField = "image" | "video" | "audio" | "mask" | "reference" | "first" | "last";

export type FalMap = {
  fields?: Partial<Record<FalSlotField, string>>;
  params?: Record<string, { to: string; scale?: number }>;
  fixed?: Record<string, unknown>;
};

/** `capabilities.fal` reda kataloga, ili `undefined` kad ga red nema (današnje ponašanje). */
export function falMapOf(capabilities: Record<string, unknown>): FalMap | undefined {
  const raw = capabilities.fal;

  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as FalMap) : undefined;
}

function mappedField(map: FalMap | undefined, slot: string): string | undefined {
  const fields = map?.fields;
  if (!fields || !Object.hasOwn(fields, slot)) return undefined;
  const name = fields[slot as FalSlotField];

  return typeof name === "string" && name.length > 0 ? name : undefined;
}

export function falInputFields(
  inputMode: string,
  urls: InputUrls,
  map?: FalMap,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  // Par kadrova je jedini režim u kojem redosled unutar slota menja IME polja,
  // a ne samo mesto u nizu (katalog sekcija 5).
  if (inputMode === "first_last") {
    const images = urls.image ?? [];
    if (images[0]) fields[mappedField(map, "first") ?? "start_image_url"] = images[0];
    if (images[1]) fields[mappedField(map, "last") ?? "end_image_url"] = images[1];

    return fields;
  }

  for (const [slot, list] of Object.entries(urls)) {
    if (list.length === 0) continue;

    const mapped = mappedField(map, slot);
    if (mapped) {
      fields[mapped] = mapped.endsWith("_urls") ? list : list[0];
      continue;
    }

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
 * Parametri posla -> telo zahteva. Bez mape je identično `params` (današnje
 * ponašanje). Preimenovan ključ se NE šalje i pod starim imenom: fal bi
 * nepoznato polje ignorisao, ali dupli podatak u logu zbunjuje podršku.
 */
export function falParams(params: Record<string, unknown>, map?: FalMap): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params };
  for (const [key, rule] of Object.entries(map?.params ?? {})) {
    if (!Object.hasOwn(out, key) || !rule || typeof rule.to !== "string") continue;
    const value = out[key];
    delete out[key];
    out[rule.to] =
      typeof rule.scale === "number" && typeof value === "number" ? Math.round(value * rule.scale) : value;
  }

  return { ...out, ...(map?.fixed ?? {}) };
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
