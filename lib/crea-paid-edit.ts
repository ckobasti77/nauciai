import type { Locale, LocalizedText } from "./i18n";

/**
 * Plaćene izmene iz alata „Izmeni" (K11): četkica i opis (S11), brisanje
 * velikog predmeta (S13) i AI scena iza isečka (S14). Čista logika - koji
 * model, kojim ulaznim režimom, sa kojim parametrima i kojim opisom - pa je
 * isti zahtev i u UI-ju i u testu pravljenja posla (`convex/creaMaskEdit.test.ts`).
 *
 * Posao ide kroz POSTOJEĆI tok (`studio.createJob`): ista cena, isti limiti,
 * isti DEMO bez ključa (O3), isto stablo verzija (K05).
 */

/**
 * Kako model dobija „gde": `mask` - prava crno-bela maska (Ideogram 4.5,
 * `ideogram/v4.5/edit`); `zone` - Nano Banana nema masku (K06 §4.1), pa dobija
 * original i drugu sliku sa obojenim delom; `photo` - samo fotka i opis.
 */
export type CreaPaidRouteKind = "mask" | "zone" | "photo";

/** `label`: natpis izbora kad dve rute imaju istu vrstu (K12: Nano Banana Pro ili 2). */
export type CreaPaidRoute = { modelSlug: string; inputMode: string; kind: CreaPaidRouteKind; label?: LocalizedText };

/** Redosled = prednost: prava maska pre obojene zone (K06 Auto pravilo S-1). */
export const BRUSH_ROUTES: readonly CreaPaidRoute[] = [
  { modelSlug: "ideogram-45", inputMode: "mask", kind: "mask" },
  { modelSlug: "nano-banana-2", inputMode: "image_multi", kind: "zone" },
];

export const SCENE_ROUTES: readonly CreaPaidRoute[] = [
  { modelSlug: "nano-banana-2", inputMode: "image_multi", kind: "photo" },
];

/** Podrazumevan kvalitet Ideograma za izmenu dela slike ($0,03 - mali deo ne traži više). */
export const MASK_DEFAULT_QUALITY = "low";

/** Odnosi stranica koje Nano Banana 2 prima (`aspect_ratio`, katalog). */
export const ZONE_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "3:2", "2:3"] as const;

/**
 * Najbliži odnos stranica iz ponuđenih - bez njega bi izmena uspravne fotke
 * stigla kao kvadrat (podrazumevano `1:1`). Poređenje je po logaritmu odnosa,
 * pa su 2:1 i 1:2 podjednako daleko od 1:1.
 */
export function nearestAspectRatio(width: number, height: number, options: readonly string[] = ZONE_ASPECT_RATIOS): string {
  const target = Math.log(width / height);
  let best = options[0] ?? "1:1";
  let bestDistance = Infinity;
  for (const option of options) {
    const [w, h] = option.split(":").map(Number);
    if (!w || !h) continue;
    const distance = Math.abs(Math.log(w / h) - target);
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }
  return best;
}

/** Opis koji ide modelu: korisnikove reči uz uputstvo gde (za model bez maske). */
export function paidEditPrompt(route: CreaPaidRoute, purpose: "edit" | "erase" | "scene", text: string, locale: Locale): string {
  const said = text.trim();
  if (purpose === "erase") {
    if (route.kind === "zone") {
      return locale === "sr"
        ? "Prva slika je original. Na drugoj je crvenom označen predmet koji treba ukloniti. Ukloni taj predmet sa prve slike i prirodno popuni pozadinom; sve ostalo ostaje isto."
        : "The first image is the original. On the second one, the object to remove is marked in red. Remove that object from the first image and fill in the background naturally; keep everything else the same.";
    }
    return locale === "sr"
      ? "Ukloni predmet i prirodno popuni pozadinom, kao da ga nikad nije bilo."
      : "Remove the object and fill in the background naturally, as if it was never there.";
  }
  if (purpose === "scene") {
    return locale === "sr"
      ? `Zameni pozadinu ove fotke novom scenom: ${said}. Osoba ili predmet u prvom planu ostaje potpuno isti - lice, oblik, boje i odeća se ne menjaju; uskladi samo svetlo.`
      : `Replace the background of this photo with a new scene: ${said}. The person or object in front stays exactly the same - face, shape, colours and clothes do not change; only match the lighting.`;
  }
  if (route.kind === "zone") {
    return locale === "sr"
      ? `Prva slika je original. Na drugoj je crvenom označen deo koji se menja. Promeni SAMO taj deo prve slike, sve ostalo ostaje isto. U tom delu: ${said}`
      : `The first image is the original. On the second one, the part to change is marked in red. Change ONLY that part of the first image and keep everything else the same. In that part: ${said}`;
  }
  return said;
}

/**
 * Parametri posla. Ostale kontrole (veličina, rezolucija...) popunjava server
 * podrazumevanim vrednostima (`sanitizeSpecParams`), a cena na dugmetu ih
 * računa istim putem (`buildParams`).
 */
export function paidEditParams(
  route: CreaPaidRoute,
  options: { prompt: string; quality?: string; width: number; height: number },
): Record<string, string> {
  if (route.kind === "mask") return { prompt: options.prompt, quality: options.quality ?? MASK_DEFAULT_QUALITY };
  return { prompt: options.prompt, aspect_ratio: nearestAspectRatio(options.width, options.height) };
}

/** Slotovi i broj fajlova koje ruta šalje (redosled je bitan: original pa oznaka). */
export function paidEditSlots(route: CreaPaidRoute): Record<string, number> {
  if (route.kind === "mask") return { image: 1, mask: 1 };
  if (route.kind === "zone") return { image: 2 };
  return { image: 1 };
}

// ── K12: izmene II (S15, S18-S23) ────────────────────────────────────────────
// Svaki alat sam sastavlja opis i parametre (`PaidEditPanel.request`); ovde su
// samo rute - koji model, kojim režimom - da test proveri da postoje u katalogu.

/** S15 proširi kadar: fotka na sivom platnu ciljnog odnosa. */
export const EXPAND_ROUTES: readonly CreaPaidRoute[] = [{ modelSlug: "nano-banana-2", inputMode: "image_multi", kind: "photo" }];

/** S18 novo svetlo: Pro najbolje čuva lice; 2 je jeftinija proba. */
export const RELIGHT_ROUTES: readonly CreaPaidRoute[] = [
  { modelSlug: "nano-banana-pro", inputMode: "image_multi", kind: "photo", label: { sr: "Nano Banana Pro · najvernije", en: "Nano Banana Pro · most faithful" } },
  { modelSlug: "nano-banana-2", inputMode: "image_multi", kind: "photo", label: { sr: "Nano Banana 2 · jeftinije", en: "Nano Banana 2 · cheaper" } },
];

/** S19 uglovi kamere: jedna mreža 3×3 u 4K. */
export const ANGLES_ROUTES: readonly CreaPaidRoute[] = [{ modelSlug: "nano-banana-2", inputMode: "image_multi", kind: "photo" }];

/** S20 slojevi: razlaganje Seedream-a 5 Pro (cena po sloju). */
export const LAYERIZE_ROUTES: readonly CreaPaidRoute[] = [
  { modelSlug: "seedream-5-pro", inputMode: "layerize", kind: "photo", label: { sr: "Seedream 5 Pro", en: "Seedream 5 Pro" } },
];

/** S22 vrati staru fotku: opšti model za izmene sa opisom restauracije (namenski modeli su zabranjeni, §6). */
export const RESTORE_ROUTES: readonly CreaPaidRoute[] = [
  { modelSlug: "nano-banana-pro", inputMode: "image_multi", kind: "photo", label: { sr: "Nano Banana Pro · najvernije", en: "Nano Banana Pro · most faithful" } },
  { modelSlug: "nano-banana-2", inputMode: "image_multi", kind: "photo", label: { sr: "Nano Banana 2 · jeftinije", en: "Nano Banana 2 · cheaper" } },
];

/** S23 proba odeće: postojeći Kling try-on (slotovi `person`, `garment`). */
export const TRYON_ROUTES: readonly CreaPaidRoute[] = [
  { modelSlug: "kling-tryon", inputMode: "image_multi", kind: "photo", label: { sr: "Kling proba odeće", en: "Kling virtual try-on" } },
];

/** S23 proizvod u scenu: isečak proizvoda (+ fotka scene) kao više referenci. */
export const PRODUCT_ROUTES: readonly CreaPaidRoute[] = [{ modelSlug: "nano-banana-2", inputMode: "image_multi", kind: "photo" }];

/**
 * Opis za „postavi proizvod u scenu": prva slika je isečen proizvod, druga
 * (ako postoji) scena. Proizvod - oblik, boje, etiketa, logo, tekst - ostaje isti.
 */
export function productScenePrompt(hasScene: boolean, text: string, locale: Locale): string {
  const said = text.trim();
  if (locale === "sr") {
    const scene = hasScene
      ? `Prva slika je proizvod (isečen, bez pozadine). Druga slika je scena. Postavi proizvod sa prve slike u scenu sa druge${said ? `: ${said}` : ""}.`
      : `Ovo je proizvod (isečen, bez pozadine). Postavi ga u novu scenu: ${said}.`;
    return `${scene} Proizvod ostaje potpuno isti - oblik, boje, materijal, etiketa, logo i tekst na njemu se ne menjaju. Uskladi samo svetlo, senke, odsjaje i perspektivu da izgleda kao prava fotografija.`;
  }
  const scene = hasScene
    ? `The first image is the product (cut out, no background). The second image is the scene. Place the product from the first image into the scene from the second${said ? `: ${said}` : ""}.`
    : `This is a product (cut out, no background). Place it in a new scene: ${said}.`;
  return `${scene} The product stays exactly the same - its shape, colours, material, label, logo and text do not change. Only match the light, shadows, reflections and perspective so it looks like a real photo.`;
}

// ── K13: pravljenje (S7, S9, S10) ────────────────────────────────────────────

/** S7 Ko · Gde · Kako: modeli koji primaju više referentnih slika. */
export const SLOTS_ROUTES: readonly CreaPaidRoute[] = [
  { modelSlug: "nano-banana-2", inputMode: "image_multi", kind: "photo", label: { sr: "Nano Banana 2", en: "Nano Banana 2" } },
  { modelSlug: "nano-banana-pro", inputMode: "image_multi", kind: "photo", label: { sr: "Nano Banana Pro · najvernije", en: "Nano Banana Pro · most faithful" } },
  { modelSlug: "seedream-5-flash", inputMode: "image_multi", kind: "photo", label: { sr: "Seedream 5 Flash · jeftino", en: "Seedream 5 Flash · cheap" } },
  { modelSlug: "flux-2-klein", inputMode: "image_multi", kind: "photo", label: { sr: "FLUX.2 klein · najjeftinije", en: "FLUX.2 klein · cheapest" } },
];

/** S10 skica u sliku: Nano Banana 2 (Google ključ radi) ili jeftiniji FLUX.2 klein. */
export const SKETCH_ROUTES: readonly CreaPaidRoute[] = [
  { modelSlug: "nano-banana-2", inputMode: "image_multi", kind: "photo", label: { sr: "Nano Banana 2", en: "Nano Banana 2" } },
  { modelSlug: "flux-2-klein", inputMode: "image_multi", kind: "photo", label: { sr: "FLUX.2 klein · jeftinije", en: "FLUX.2 klein · cheaper" } },
];

/** S9 crtaj i gledaj: brz i jeftin model za osvežavanje (plan §7.1: FLUX.2 klein). */
export const LIVE_ROUTES: readonly CreaPaidRoute[] = [
  { modelSlug: "flux-2-klein", inputMode: "image_multi", kind: "photo", label: { sr: "FLUX.2 klein · brzo", en: "FLUX.2 klein · fast" } },
  { modelSlug: "nano-banana-2-lite", inputMode: "image_multi", kind: "photo", label: { sr: "Nano Banana 2 Lite", en: "Nano Banana 2 Lite" } },
];

/** fal preseti veličine i njihov odnos stranica (`modelControls.FAL_IMAGE_SIZES`). */
const FAL_SIZE_RATIOS: ReadonlyArray<{ size: string; ratio: string }> = [
  { size: "square", ratio: "1:1" },
  { size: "landscape_4_3", ratio: "4:3" },
  { size: "landscape_16_9", ratio: "16:9" },
  { size: "portrait_4_3", ratio: "3:4" },
  { size: "portrait_16_9", ratio: "9:16" },
];

/** Najbliži fal preset veličine (≤ 1 MP, najjeftiniji red cene) za date mere. */
export function nearestFalImageSize(width: number, height: number): string {
  const ratio = nearestAspectRatio(width, height, FAL_SIZE_RATIOS.map((entry) => entry.ratio));
  return FAL_SIZE_RATIOS.find((entry) => entry.ratio === ratio)?.size ?? "square";
}

/**
 * Parametri za rutu sa slikama kao referencom (S7/S9/S10): Nano Banana i Seedream
 * primaju odnos stranica, FLUX.2 klein fal preset veličine. Ostalo popunjava server.
 */
export function referenceRouteParams(route: CreaPaidRoute, prompt: string, width: number, height: number): Record<string, string> {
  if (route.modelSlug === "flux-2-klein") return { prompt, image_size: nearestFalImageSize(width, height) };
  if (route.modelSlug === "seedream-5-flash") return { prompt };
  return { prompt, aspect_ratio: nearestAspectRatio(width, height) };
}
