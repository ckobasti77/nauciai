import type { Locale } from "./i18n";

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

export type CreaPaidRoute = { modelSlug: string; inputMode: string; kind: CreaPaidRouteKind };

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
