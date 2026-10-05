import type { LocalizedText } from "./i18n";

/**
 * Izmeni video rečima (V13) i zameni predmet (V14) - Crea K20, plan K17 §5.
 * Dva puta, oba postojeći redovi kataloga:
 *
 * - **Kling O3 izmena** (`kling-o3-edit`, K20): video 3-15 s, opis izmene, do 4
 *   referentne slike (`@Image1`…); zvuk ostaje; naplata po sekundi ulaza.
 * - **Seedance 2.5** (`seedance-25`, režim `reference`): izvorni video ide kao
 *   referenca 1, a izmena je u opisu („Edit video 1…") - isti način kao K18
 *   „Produži". Nije proveren živim pozivom (nema BytePlus ključa); izlaz je bez
 *   zvuka i traje koliko i izvor (najmanje 4 s). Samo za izvor do 10 s (vidi
 *   ODLUKE K20: Seedance naplaćuje i ulazni video).
 *
 * Primeri rečenica su srpski na dugmetu, a modelu idu kao jasna engleska
 * uputstva. Zamena LIKA (sopstveni Lik uz pristanak) ide preko servera
 * (`creaFaceJobs.startVideoSwap`), ne ovde.
 */

export type VideoEditRouteId = "kling" | "seedance";

export type VideoEditRoute = {
  id: VideoEditRouteId;
  modelSlug: string;
  inputMode: "video" | "reference";
  label: LocalizedText;
  /** Najkraći i najduži izvorni video koji ruta prima (s). */
  minS: number;
  maxS: number;
  /** Najviše referentnih slika (predmet, stil). */
  maxRefs: number;
  keepsAudio: boolean;
};

export const VIDEO_EDIT_ROUTES: readonly VideoEditRoute[] = [
  {
    id: "kling",
    modelSlug: "kling-o3-edit",
    inputMode: "video",
    label: { sr: "Kling O3 · zvuk ostaje", en: "Kling O3 · keeps the sound" },
    minS: 3,
    maxS: 15,
    maxRefs: 4,
    keepsAudio: true,
  },
  {
    id: "seedance",
    modelSlug: "seedance-25",
    inputMode: "reference",
    label: { sr: "Seedance 2.5 · bez zvuka", en: "Seedance 2.5 · no sound" },
    minS: 1,
    maxS: 10,
    maxRefs: 4,
    keepsAudio: false,
  },
];

/** Uvećanje videa (V17) - red kataloga iz K20. */
export const VIDEO_UPSCALE_MODEL = "video-upscaler";

export type VideoEditExample = { id: string; label: LocalizedText; instruction: string };

/** Primeri rečenica za „Izmeni rečima" (V13). */
export const VIDEO_EDIT_EXAMPLES: readonly VideoEditExample[] = [
  { id: "kisa", label: { sr: "Dodaj kišu", en: "Add rain" }, instruction: "Add heavy rain falling over the whole scene, with wet, reflective surfaces" },
  { id: "auto", label: { sr: "Skloni auto", en: "Remove the car" }, instruction: "Remove the car from the scene and fill its place naturally with the background" },
  { id: "noc", label: { sr: "Pretvori u noć", en: "Turn it into night" }, instruction: "Turn the scene into night time, with street lights and lit windows" },
  { id: "sneg", label: { sr: "Neka pada sneg", en: "Make it snow" }, instruction: "Make it snow, with fresh snow covering the ground and the roofs" },
  { id: "zalazak", label: { sr: "Zlatni zalazak", en: "Golden sunset" }, instruction: "Change the light to a warm golden sunset" },
  { id: "jesen", label: { sr: "Jesen", en: "Autumn" }, instruction: "Change the season to autumn, with orange and red leaves" },
  { id: "crtani", label: { sr: "Kao crtani film", en: "Like a cartoon" }, instruction: "Turn the whole video into a hand-drawn cartoon style" },
  { id: "magla", label: { sr: "Jutarnja magla", en: "Morning fog" }, instruction: "Add soft morning fog in the background" },
];

export type VideoSwapTarget = { id: string; label: LocalizedText; phrase: string };

/** Šta se menja (V14): najčešći slučajevi; „svojim rečima" je slobodan tekst. */
export const VIDEO_SWAP_TARGETS: readonly VideoSwapTarget[] = [
  { id: "u-ruci", label: { sr: "Predmet u ruci", en: "Object in the hand" }, phrase: "the object the person is holding" },
  { id: "na-stolu", label: { sr: "Predmet na stolu", en: "Object on the table" }, phrase: "the main object on the table" },
  { id: "auto", label: { sr: "Auto", en: "Car" }, phrase: "the car" },
  { id: "odeca", label: { sr: "Odeću", en: "Clothes" }, phrase: "the main person's outfit" },
  { id: "ljubimac", label: { sr: "Ljubimca", en: "Pet" }, phrase: "the animal" },
];

const MAX_TEXT = 600;

function clean(text: string): string {
  return text.trim().replace(/\s+/g, " ").replace(/[.\s]+$/, "").slice(0, MAX_TEXT);
}

/** Uputstvo za izmenu: primer (engleski) i/ili korisnikove reči. Prazno = nema izmene. */
export function editInstruction(exampleId: string | null, text: string): string {
  const example = VIDEO_EDIT_EXAMPLES.find((entry) => entry.id === exampleId)?.instruction ?? "";
  const said = clean(text);
  if (example && said) return `${example}. ${said}`;
  return example || said;
}

const KEEP = "Keep the motion, the camera, the timing and everything else exactly the same";

/** Opis za model (V13). */
export function editPrompt(route: VideoEditRoute, instruction: string, refCount = 0): string {
  const what = clean(instruction);
  const refs = refCount > 0 ? ` Use ${refList(route, refCount)} as the visual reference.` : "";
  if (route.id === "kling") return `${what}.${refs} ${KEEP}.`;
  return `Edit video 1: ${what}.${refs} ${KEEP}.`;
}

/** Kako opis zove referentne slike: Kling `@Image1`, Seedance „image 1". */
export function refList(route: VideoEditRoute, count: number): string {
  const names = Array.from({ length: Math.max(1, count) }, (_, index) => (route.id === "kling" ? `@Image${index + 1}` : `image ${index + 1}`));
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Fraza „šta se menja": izabrana meta ili korisnikove reči. */
export function swapTarget(targetId: string | null, text: string): string {
  const said = clean(text);
  return said || VIDEO_SWAP_TARGETS.find((entry) => entry.id === targetId)?.phrase || "";
}

/** Opis za zamenu predmeta referentnom slikom (V14). */
export function swapPrompt(route: VideoEditRoute, target: string, refCount: number): string {
  const what = clean(target);
  const refs = refList(route, refCount);
  if (route.id === "kling") return `Replace ${what} in the video with the object shown in ${refs}. ${KEEP}.`;
  return `In video 1, replace ${what} with the object shown in ${refs}. ${KEEP}.`;
}

/** Zašto ruta ne prima izvor ove dužine (ili `null`). Dužina nepoznata = još se ne zna. */
export function editRouteProblem(route: VideoEditRoute, sourceSeconds: number | null): "prekratko" | "predugo" | null {
  if (sourceSeconds === null) return null;
  if (sourceSeconds < route.minS - 0.05) return "prekratko";
  if (sourceSeconds > route.maxS + 0.05) return "predugo";
  return null;
}

/** Trajanje Seedance izlaza: koliko i izvor, na celu sekundu, 4-30 s. */
export function seedanceSeconds(sourceSeconds: number): number {
  return Math.min(30, Math.max(4, Math.ceil(sourceSeconds - 0.05)));
}

/**
 * Parametri posla (bez cene). Kling trajanje meri server (`quantity`); Seedance
 * ga dobija kao kontrolu - izlaz traje koliko i izvor.
 */
export function editParams(
  route: VideoEditRoute,
  prompt: string,
  sourceSeconds: number,
  resolution: string,
): Record<string, string | number> {
  if (route.id === "kling") return { prompt, resolution };
  return { prompt, resolution, duration: seedanceSeconds(sourceSeconds) };
}
