import type { Locale, LocalizedText } from "./i18n";

/**
 * Virtuelna kamera (Crea K13, S8): telo, objektiv, žižna daljina i blenda kao
 * meniji, a ishod je dodatak opisu koji model razume („shot on 35mm film
 * camera, 85mm portrait lens, f/1.8, shallow depth of field"). Uz svaki izbor
 * ide kratko objašnjenje za početnika - šta to radi slici.
 *
 * Pravila su namerno mala: objektiv određuje koje žižne daljine imaju smisla
 * (ribije oko nije 200 mm), a blenda određuje zamućenje pozadine.
 */

export type CreaCameraBodyId = "telefon" | "dslr" | "film35" | "srednji" | "polaroid" | "akciona";
export type CreaCameraLensId = "fiksni" | "zum" | "sirokougaoni" | "makro" | "riblje-oko" | "tele";
export type CreaAperture = "f/1.4" | "f/2" | "f/2.8" | "f/4" | "f/8" | "f/16";

export type CreaCamera = { body: CreaCameraBodyId; lens: CreaCameraLensId; focal: number; aperture: CreaAperture };

type Option<T extends string> = { id: T; label: LocalizedText; explain: LocalizedText; fragment: string };

export const CAMERA_BODIES: readonly Option<CreaCameraBodyId>[] = [
  { id: "telefon", label: { sr: "Telefon", en: "Phone" }, explain: { sr: "obična, svakodnevna fotka", en: "an everyday snapshot" }, fragment: "shot on a smartphone" },
  { id: "dslr", label: { sr: "Profesionalni foto-aparat", en: "Pro camera" }, explain: { sr: "oštro i čisto, kao u časopisu", en: "sharp and clean, magazine-like" }, fragment: "shot on a full-frame digital camera" },
  { id: "film35", label: { sr: "Film 35 mm", en: "35mm film" }, explain: { sr: "zrno i tople boje starog filma", en: "grain and warm old-film colours" }, fragment: "shot on a 35mm film camera" },
  { id: "srednji", label: { sr: "Srednji format", en: "Medium format" }, explain: { sr: "bogati detalji, mekan prelaz", en: "rich detail, soft transitions" }, fragment: "shot on a medium format camera" },
  { id: "polaroid", label: { sr: "Polaroid", en: "Polaroid" }, explain: { sr: "izbledele boje, beli okvir", en: "faded colours, white frame" }, fragment: "instant polaroid photo" },
  { id: "akciona", label: { sr: "Akciona kamera", en: "Action camera" }, explain: { sr: "široko, usred akcije", en: "wide, in the middle of the action" }, fragment: "shot on an action camera" },
];

export const CAMERA_LENSES: readonly (Option<CreaCameraLensId> & { focals: readonly number[] })[] = [
  { id: "fiksni", label: { sr: "Fiksni", en: "Prime" }, explain: { sr: "jedna žižna, najoštriji", en: "one focal length, the sharpest" }, fragment: "prime lens", focals: [24, 35, 50, 85] },
  { id: "zum", label: { sr: "Zum", en: "Zoom" }, explain: { sr: "svestran, za sve", en: "versatile, for everything" }, fragment: "zoom lens", focals: [24, 35, 50, 70, 105] },
  { id: "sirokougaoni", label: { sr: "Širokougaoni", en: "Wide angle" }, explain: { sr: "stane ceo prostor", en: "fits the whole space" }, fragment: "wide-angle lens", focals: [14, 18, 24] },
  { id: "makro", label: { sr: "Makro", en: "Macro" }, explain: { sr: "sitni detalji izbliza", en: "tiny details up close" }, fragment: "macro lens, extreme close-up", focals: [60, 100] },
  { id: "riblje-oko", label: { sr: "Riblje oko", en: "Fisheye" }, explain: { sr: "zakrivljen, razigran kadar", en: "a curved, playful frame" }, fragment: "fisheye lens, strong barrel distortion", focals: [8, 12] },
  { id: "tele", label: { sr: "Teleobjektiv", en: "Telephoto" }, explain: { sr: "iz daljine, pozadina blizu", en: "from afar, background pulled close" }, fragment: "telephoto lens, compressed perspective", focals: [135, 200, 300] },
];

export const CAMERA_APERTURES: readonly Option<CreaAperture>[] = [
  { id: "f/1.4", label: { sr: "f/1.4", en: "f/1.4" }, explain: { sr: "pozadina jako zamućena", en: "a very blurry background" }, fragment: "f/1.4, very shallow depth of field, creamy bokeh" },
  { id: "f/2", label: { sr: "f/2", en: "f/2" }, explain: { sr: "pozadina zamućena", en: "a blurry background" }, fragment: "f/2, shallow depth of field, soft bokeh" },
  { id: "f/2.8", label: { sr: "f/2.8", en: "f/2.8" }, explain: { sr: "malo zamućenja iza", en: "a little blur behind" }, fragment: "f/2.8, gentle background blur" },
  { id: "f/4", label: { sr: "f/4", en: "f/4" }, explain: { sr: "skoro sve oštro", en: "almost everything sharp" }, fragment: "f/4, moderate depth of field" },
  { id: "f/8", label: { sr: "f/8", en: "f/8" }, explain: { sr: "sve oštro, za pejzaže", en: "everything sharp, for landscapes" }, fragment: "f/8, deep depth of field" },
  { id: "f/16", label: { sr: "f/16", en: "f/16" }, explain: { sr: "oštro od blizu do horizonta", en: "sharp from near to the horizon" }, fragment: "f/16, everything in focus" },
];

export const DEFAULT_CAMERA: CreaCamera = { body: "dslr", lens: "fiksni", focal: 50, aperture: "f/2.8" };

/** Šta žižna daljina radi slici - za početnika, u pet reči. */
export function focalExplain(focal: number, locale: Locale): string {
  const text: LocalizedText =
    focal <= 12 ? { sr: "ekstremno široko", en: "extremely wide" }
    : focal <= 24 ? { sr: "široko, ceo prostor", en: "wide, the whole space" }
    : focal <= 35 ? { sr: "kao što oko vidi, malo šire", en: "like the eye sees, a bit wider" }
    : focal <= 50 ? { sr: "prirodno, kao oko", en: "natural, like the eye" }
    : focal <= 105 ? { sr: "portret, lepo lice", en: "portrait, a flattering face" }
    : { sr: "izdaleka, pozadina blizu", en: "from afar, background close" };
  return text[locale];
}

/**
 * Sredi izbor: nepoznata vrednost pada na podrazumevanu, a žižna daljina koja
 * ne postoji na tom objektivu ide na najbližu koju objektiv ima.
 */
export function normalizeCamera(input: Partial<Record<keyof CreaCamera, unknown>>): CreaCamera {
  const body = CAMERA_BODIES.find((option) => option.id === input.body)?.id ?? DEFAULT_CAMERA.body;
  const lens = CAMERA_LENSES.find((option) => option.id === input.lens) ?? CAMERA_LENSES.find((option) => option.id === DEFAULT_CAMERA.lens)!;
  const aperture = CAMERA_APERTURES.find((option) => option.id === input.aperture)?.id ?? DEFAULT_CAMERA.aperture;
  const wanted = typeof input.focal === "number" && Number.isFinite(input.focal) ? input.focal : DEFAULT_CAMERA.focal;
  const focal = lens.focals.reduce((best, value) => (Math.abs(value - wanted) < Math.abs(best - wanted) ? value : best), lens.focals[0]!);
  return { body, lens: lens.id, focal, aperture };
}

/** Dodatak opisu: „shot on …, 85mm prime lens, f/1.8, …". */
export function cameraFragment(camera: CreaCamera): string {
  const safe = normalizeCamera(camera);
  const body = CAMERA_BODIES.find((option) => option.id === safe.body)!;
  const lens = CAMERA_LENSES.find((option) => option.id === safe.lens)!;
  const aperture = CAMERA_APERTURES.find((option) => option.id === safe.aperture)!;
  return `${body.fragment}, ${safe.focal}mm ${lens.fragment}, ${aperture.fragment}`;
}

/** Jedna rečenica za početnika: šta će ova kamera uraditi slici. */
export function cameraExplain(camera: CreaCamera, locale: Locale): string {
  const safe = normalizeCamera(camera);
  const body = CAMERA_BODIES.find((option) => option.id === safe.body)!;
  const aperture = CAMERA_APERTURES.find((option) => option.id === safe.aperture)!;
  return `${body.explain[locale]} · ${safe.focal} mm: ${focalExplain(safe.focal, locale)} · ${aperture.explain[locale]}`;
}
