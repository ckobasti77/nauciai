import type { ParamControl } from "@/convex/studioParamSpec";

import { CAMERA_APERTURES, CAMERA_LENSES, type CreaAperture, type CreaCameraLensId } from "./crea-camera";
import type { CameraMove, CameraMoveIntensity } from "./crea-camera-moves";
import { COMPOSED_PROMPT_MAX } from "./crea-prompt-compose";
import { normalizePalette } from "./crea-styles";
import type { VideoEffect } from "./crea-video-effects";
import type { LocalizedText } from "./i18n";

/**
 * Režiserski pult za video (Crea K18, V9; plan K17 §3.3) i sklapanje opisa: žanr,
 * era, tempo, pokret kamere, objektiv, blenda, svetlo, paleta, emocija lika i
 * zvuk (@Zvuk, V6). Čista logika - ista funkcija pravi pregled „Modelu ide:" i
 * opis koji se stvarno šalje.
 *
 * Opis se sklapa PO MODELU (ne po slug-u nego po onome što red kataloga kaže):
 * - granica dužine je granica kontrole opisa tog modela (Kling 2500 po fal šemi,
 *   ali composer svuda drži 2000 - `COMPOSED_PROMPT_MAX`);
 * - zvuk ide samo modelima koji ga prave (`capabilities.audio`);
 * - parametri efekta (trajanje) idu samo ako ih model prima, svedeni na njegove
 *   vrednosti (`effectParamsFor`).
 *
 * Uvozi samo TIPOVE pokreta i efekata: njihovi spiskovi (~75 stavki sa lekcijama)
 * ostaju u lenjom panelu „Režija", a composer nosi izabrane objekte.
 */

type DeskOption<T extends string> = { id: T; label: LocalizedText; fragment: string };

export type GenreId =
  | "drama" | "akcija" | "komedija" | "horor" | "naucna-fantastika"
  | "dokumentarac" | "reklama" | "spot" | "bajka" | "noar";
export type EraId = "nemi-film" | "pedesete" | "sedamdesete" | "osamdesete" | "devedesete" | "dvehiljadite" | "danas" | "buducnost";
export type TempoId = "sporo" | "srednje" | "brzo";
export type LightId =
  | "zlatni-sat" | "plavi-sat" | "studijsko" | "kontra" | "neon"
  | "svece" | "oblacno" | "podne" | "mesecina" | "blic";
export type EmotionId =
  | "radost" | "tuga" | "strah" | "bes" | "iznenadjenje"
  | "mir" | "ponos" | "zaljubljenost" | "napetost" | "umor";
export type SoundId = "kisa" | "grad" | "more" | "kafana" | "suma" | "vetar" | "publika" | "ptice" | "vatromet" | "tisina";

export const DESK_GENRES: readonly DeskOption<GenreId>[] = [
  { id: "drama", label: { sr: "Drama", en: "Drama" }, fragment: "dramatic film look" },
  { id: "akcija", label: { sr: "Akcija", en: "Action" }, fragment: "high-energy action movie look" },
  { id: "komedija", label: { sr: "Komedija", en: "Comedy" }, fragment: "light-hearted comedy look, bright and playful" },
  { id: "horor", label: { sr: "Horor", en: "Horror" }, fragment: "eerie horror film atmosphere" },
  { id: "naucna-fantastika", label: { sr: "Naučna fantastika", en: "Sci-fi" }, fragment: "science fiction film look" },
  { id: "dokumentarac", label: { sr: "Dokumentarac", en: "Documentary" }, fragment: "natural documentary style" },
  { id: "reklama", label: { sr: "Reklama", en: "Commercial" }, fragment: "polished TV commercial look" },
  { id: "spot", label: { sr: "Muzički spot", en: "Music video" }, fragment: "stylish music video look" },
  { id: "bajka", label: { sr: "Bajka", en: "Fairy tale" }, fragment: "whimsical fairy-tale atmosphere" },
  { id: "noar", label: { sr: "Noar", en: "Noir" }, fragment: "film noir style, deep shadows" },
];

export const DESK_ERAS: readonly DeskOption<EraId>[] = [
  { id: "nemi-film", label: { sr: "Nemi film", en: "Silent film" }, fragment: "1920s silent film, black and white, film flicker" },
  { id: "pedesete", label: { sr: "50-e", en: "1950s" }, fragment: "1950s Technicolor look" },
  { id: "sedamdesete", label: { sr: "70-e", en: "1970s" }, fragment: "1970s film stock, warm grain" },
  { id: "osamdesete", label: { sr: "80-e (VHS)", en: "1980s (VHS)" }, fragment: "1980s VHS home video look" },
  { id: "devedesete", label: { sr: "90-e", en: "1990s" }, fragment: "1990s camcorder look" },
  { id: "dvehiljadite", label: { sr: "2000-e", en: "2000s" }, fragment: "early 2000s digital camera look" },
  { id: "danas", label: { sr: "Danas", en: "Today" }, fragment: "modern crisp digital cinema" },
  { id: "buducnost", label: { sr: "Budućnost", en: "Future" }, fragment: "futuristic look from the year 2100" },
];

export const DESK_TEMPOS: readonly DeskOption<TempoId>[] = [
  { id: "sporo", label: { sr: "Sporo", en: "Slow" }, fragment: "slow calm pacing" },
  { id: "srednje", label: { sr: "Srednje", en: "Medium" }, fragment: "steady natural pacing" },
  { id: "brzo", label: { sr: "Brzo", en: "Fast" }, fragment: "fast energetic pacing" },
];

export const DESK_LIGHTS: readonly DeskOption<LightId>[] = [
  { id: "zlatni-sat", label: { sr: "Zlatni sat", en: "Golden hour" }, fragment: "warm golden hour sunlight" },
  { id: "plavi-sat", label: { sr: "Plavi sat", en: "Blue hour" }, fragment: "cool blue hour twilight" },
  { id: "studijsko", label: { sr: "Meko studijsko", en: "Soft studio" }, fragment: "soft even studio lighting" },
  { id: "kontra", label: { sr: "Kontra svetlo", en: "Backlight" }, fragment: "strong backlight with a glowing rim" },
  { id: "neon", label: { sr: "Neon", en: "Neon" }, fragment: "colorful neon lighting" },
  { id: "svece", label: { sr: "Sveće", en: "Candlelight" }, fragment: "flickering warm candlelight" },
  { id: "oblacno", label: { sr: "Oblačno", en: "Overcast" }, fragment: "soft overcast daylight" },
  { id: "podne", label: { sr: "Podnevno sunce", en: "Midday sun" }, fragment: "harsh midday sun with hard shadows" },
  { id: "mesecina", label: { sr: "Mesečina", en: "Moonlight" }, fragment: "cold silver moonlight" },
  { id: "blic", label: { sr: "Blic", en: "Flash" }, fragment: "direct camera flash, party snapshot look" },
];

export const DESK_EMOTIONS: readonly DeskOption<EmotionId>[] = [
  { id: "radost", label: { sr: "Radost", en: "Joy" }, fragment: "the character looks joyful and full of energy" },
  { id: "tuga", label: { sr: "Tuga", en: "Sadness" }, fragment: "the character looks sad and thoughtful" },
  { id: "strah", label: { sr: "Strah", en: "Fear" }, fragment: "the character looks scared" },
  { id: "bes", label: { sr: "Bes", en: "Anger" }, fragment: "the character looks angry" },
  { id: "iznenadjenje", label: { sr: "Iznenađenje", en: "Surprise" }, fragment: "the character looks surprised" },
  { id: "mir", label: { sr: "Mir", en: "Calm" }, fragment: "the character looks calm and at peace" },
  { id: "ponos", label: { sr: "Ponos", en: "Pride" }, fragment: "the character looks proud and confident" },
  { id: "zaljubljenost", label: { sr: "Zaljubljenost", en: "In love" }, fragment: "the character looks dreamy and in love" },
  { id: "napetost", label: { sr: "Napetost", en: "Tension" }, fragment: "the character looks tense and alert" },
  { id: "umor", label: { sr: "Umor", en: "Tiredness" }, fragment: "the character looks tired" },
];

/** @Zvuk (V6): ambijent za modele koji prave zvuk. */
export const DESK_SOUNDS: readonly DeskOption<SoundId>[] = [
  { id: "kisa", label: { sr: "Kiša", en: "Rain" }, fragment: "rain falling" },
  { id: "grad", label: { sr: "Grad", en: "City" }, fragment: "busy city street ambience" },
  { id: "more", label: { sr: "More", en: "Sea" }, fragment: "waves and seagulls" },
  { id: "kafana", label: { sr: "Kafana", en: "Tavern" }, fragment: "tamburica music and lively chatter" },
  { id: "suma", label: { sr: "Šuma", en: "Forest" }, fragment: "forest birds and rustling leaves" },
  { id: "vetar", label: { sr: "Vetar", en: "Wind" }, fragment: "strong wind" },
  { id: "publika", label: { sr: "Publika", en: "Crowd" }, fragment: "cheering crowd" },
  { id: "ptice", label: { sr: "Ptice", en: "Birds" }, fragment: "morning birdsong" },
  { id: "vatromet", label: { sr: "Vatromet", en: "Fireworks" }, fragment: "fireworks bangs" },
  { id: "tisina", label: { sr: "Tišina", en: "Silence" }, fragment: "near silence, only soft room tone" },
];

export type DirectorDesk = {
  genre?: GenreId;
  era?: EraId;
  tempo?: TempoId;
  lens?: CreaCameraLensId;
  focal?: number;
  aperture?: CreaAperture;
  light?: LightId;
  palette?: readonly string[];
  emotion?: EmotionId;
  sound?: SoundId;
};

/**
 * Kartice sa primerima (V9): gotov pult jednim klikom - početnik vidi šta koja
 * kombinacija radi, pa menja jednu po jednu stvar. `move` je id iz `crea-camera-moves`.
 */
export type DeskPreset = { id: string; label: LocalizedText; hint: LocalizedText; example: LocalizedText; desk: DirectorDesk; move: string };

export const DESK_PRESETS: readonly DeskPreset[] = [
  {
    id: "noar-detektiv",
    label: { sr: "Noar detektiv", en: "Noir detective" },
    hint: { sr: "Kiša, neon, sporo približavanje.", en: "Rain, neon, a slow push in." },
    example: { sr: "Detektiv u mantilu stoji pod uličnom lampom", en: "A detective in a trench coat under a street lamp" },
    desk: { genre: "noar", light: "neon", tempo: "sporo", emotion: "napetost", sound: "kisa" },
    move: "priblizavanje",
  },
  {
    id: "bajka",
    label: { sr: "Bajka", en: "Fairy tale" },
    hint: { sr: "Toplo svetlo, kran nagore, čarolija.", en: "Warm light, a crane up, magic." },
    example: { sr: "Devojčica otvara stara drvena vrata u šumi", en: "A girl opens an old wooden door in the forest" },
    desk: { genre: "bajka", light: "zlatni-sat", tempo: "sporo", emotion: "radost", sound: "suma" },
    move: "kran-gore",
  },
  {
    id: "reklama-kafic",
    label: { sr: "Reklama za kafić", en: "Café ad" },
    hint: { sr: "Meko svetlo, kruženje oko šolje, plitka dubina.", en: "Soft light, an orbit around the cup, shallow focus." },
    example: { sr: "Šolja kafe sa srcem u peni na drvenom stolu", en: "A cup of coffee with a heart in the foam on a wooden table" },
    desk: { genre: "reklama", light: "studijsko", lens: "makro", focal: 100, aperture: "f/2", tempo: "srednje" },
    move: "kruzenje-desno",
  },
  {
    id: "spot-80",
    label: { sr: "Spot iz 80-ih", en: "80s music video" },
    hint: { sr: "VHS, neon, brz tempo, rotacija.", en: "VHS, neon, fast pace, a roll." },
    example: { sr: "Pevačica pleše na krovu zgrade noću", en: "A singer dances on a rooftop at night" },
    desk: { genre: "spot", era: "osamdesete", light: "neon", tempo: "brzo", emotion: "ponos" },
    move: "rotacija",
  },
  {
    id: "horor-hodnik",
    label: { sr: "Horor hodnik", en: "Horror hallway" },
    hint: { sr: "Mesečina, kamera iz ruke, strah.", en: "Moonlight, handheld camera, fear." },
    example: { sr: "Dugačak hodnik stare bolnice, vrata se sama otvaraju", en: "A long hallway in an old hospital, a door opens by itself" },
    desk: { genre: "horor", light: "mesecina", tempo: "sporo", emotion: "strah", sound: "tisina" },
    move: "iz-ruke",
  },
  {
    id: "priroda-dokumentarac",
    label: { sr: "Dokumentarac o prirodi", en: "Nature documentary" },
    hint: { sr: "Dron napred, zlatni sat, mir.", en: "Drone forward, golden hour, calm." },
    example: { sr: "Jelen pije vodu na reci u zoru", en: "A deer drinks from a river at dawn" },
    desk: { genre: "dokumentarac", light: "zlatni-sat", lens: "tele", focal: 200, tempo: "sporo", emotion: "mir", sound: "ptice" },
    move: "dron-napred",
  },
];

export function deskIsEmpty(desk: DirectorDesk): boolean {
  return (
    !desk.genre && !desk.era && !desk.tempo && !desk.lens && !desk.aperture &&
    !desk.light && !desk.emotion && !desk.sound && normalizePalette(desk.palette ?? []).length === 0
  );
}

function pick<T extends string>(list: readonly DeskOption<T>[], id: T | undefined): DeskOption<T> | undefined {
  return id ? list.find((option) => option.id === id) : undefined;
}

/** Oznaka izbora pulta (za čipove u composeru). */
export function deskLabel(kind: "genre" | "era" | "tempo" | "light" | "emotion" | "sound", id: string, locale: "sr" | "en"): string {
  const list: readonly DeskOption<string>[] =
    kind === "genre" ? DESK_GENRES : kind === "era" ? DESK_ERAS : kind === "tempo" ? DESK_TEMPOS
    : kind === "light" ? DESK_LIGHTS : kind === "emotion" ? DESK_EMOTIONS : DESK_SOUNDS;
  return list.find((option) => option.id === id)?.label[locale] ?? id;
}

/** Ono što composer zna o modelu (red kataloga). */
export type VideoPromptModel = {
  slug: string;
  family: string;
  capabilities: Record<string, unknown>;
  paramSpec: readonly ParamControl[];
};

/** Model pravi zvuk (uvek ili uz prekidač) - samo tada @Zvuk ide u opis. */
export function modelMakesSound(model: Pick<VideoPromptModel, "capabilities">): boolean {
  return model.capabilities.audio === true || model.capabilities.audioIncluded === true;
}

/** Granica opisa za model: kontrola opisa iz kataloga, nikad preko composera (2000). */
export function videoPromptLimit(model: Pick<VideoPromptModel, "paramSpec">): number {
  const control = model.paramSpec.find((entry) => entry.key === "prompt") ?? model.paramSpec.find((entry) => entry.type === "textarea");
  const own = typeof control?.max === "number" && control.max > 0 ? control.max : COMPOSED_PROMPT_MAX;
  return Math.min(own, COMPOSED_PROMPT_MAX);
}

export type VideoPromptPart = "efekat" | "opis" | "emocija" | "kamera" | "objektiv" | "svetlo" | "paleta" | "zanr" | "tempo" | "zvuk";

export type VideoPromptInput = {
  prompt: string;
  move?: CameraMove | null;
  moveIntensity?: CameraMoveIntensity;
  /** Jedan efekat ili već spojena dva (`combineEffects`). */
  effect?: VideoEffect | null;
  desk?: DirectorDesk;
  model: VideoPromptModel;
};

export type VideoPrompt = { text: string; overBy: number; parts: Array<{ part: VideoPromptPart; text: string }> };

/** Rečenica pokreta za model; jačina se dopisuje samo pokretima koji je imaju. */
export function cameraMovePhrase(move: CameraMove, intensity?: CameraMoveIntensity): string {
  if (!move.intensity || !intensity) return move.phrase;
  return `${move.phrase}, ${intensity === "jako" ? "fast and dramatic" : "slow and gentle"}`;
}

/** Kad korisnik ne opiše ko je na slici. */
export const EFFECT_DEFAULT_SUBJECT = { foto: "the main subject of the image", nista: "a young person" } as const;

/** Efekat sa ubačenim predmetom; prazan opis daje podrazumevani predmet. */
export function fillEffect(effect: Pick<VideoEffect, "template" | "needs">, subject: string): string {
  const who = subject.trim().replace(/[.\s]+$/, "") || EFFECT_DEFAULT_SUBJECT[effect.needs];
  return effect.template.replace("{subject}", who);
}

function lensFragment(desk: DirectorDesk): string | null {
  const lens = desk.lens ? CAMERA_LENSES.find((entry) => entry.id === desk.lens) : undefined;
  const aperture = desk.aperture ? CAMERA_APERTURES.find((entry) => entry.id === desk.aperture) : undefined;
  if (!lens && !aperture) return null;
  const focal = lens && desk.focal && lens.focals.includes(desk.focal) ? `${desk.focal}mm ` : "";
  return [lens ? `${focal}${lens.fragment}` : null, aperture?.fragment ?? null].filter(Boolean).join(", ");
}

/**
 * Konačan opis za video model. Redosled: efekat (sa korisnikovim opisom kao
 * predmetom) ILI opis, pa emocija, pokret kamere, objektiv i blenda, svetlo,
 * paleta, žanr i era, tempo, a zvuk samo za modele sa zvukom. Prazan pult vraća
 * opis netaknut. `overBy` > 0 znači predugačko za OVAJ model - UI traži kraći opis.
 */
export function composeVideoPrompt(input: VideoPromptInput): VideoPrompt {
  const said = input.prompt.trim();
  const desk = input.desk ?? {};
  const parts: VideoPrompt["parts"] = [];
  const push = (part: VideoPromptPart, text: string | null | undefined) => {
    const clean = text?.trim().replace(/[.\s]+$/, "");
    if (clean) parts.push({ part, text: clean });
  };

  if (input.effect) push("efekat", fillEffect(input.effect, said));
  else push("opis", said);
  push("emocija", pick(DESK_EMOTIONS, desk.emotion)?.fragment);
  if (input.move) push("kamera", cameraMovePhrase(input.move, input.moveIntensity));
  push("objektiv", lensFragment(desk));
  push("svetlo", pick(DESK_LIGHTS, desk.light)?.fragment);
  const palette = normalizePalette(desk.palette ?? []);
  if (palette.length > 0) push("paleta", `color palette: ${palette.join(", ")}`);
  push("zanr", [pick(DESK_GENRES, desk.genre)?.fragment, pick(DESK_ERAS, desk.era)?.fragment].filter(Boolean).join(", "));
  push("tempo", pick(DESK_TEMPOS, desk.tempo)?.fragment);
  if (modelMakesSound(input.model)) {
    const sounds = [pick(DESK_SOUNDS, desk.sound)?.fragment, input.effect?.sound].filter(Boolean);
    if (sounds.length > 0) push("zvuk", `sound: ${sounds.join(", ")}`);
  }

  const onlySaid = parts.length === 1 && parts[0].part === "opis";
  // Svaki dodatak je svoja rečenica (velikim slovom); korisnikove reči ostaju kako su napisane.
  const sentence = (entry: VideoPrompt["parts"][number]) =>
    entry.part === "opis" ? entry.text : entry.text.charAt(0).toUpperCase() + entry.text.slice(1);
  const text = parts.length === 0 ? "" : onlySaid ? said : `${parts.map(sentence).join(". ")}.`;
  return { text, overBy: Math.max(0, text.length - videoPromptLimit(input.model)), parts };
}

/**
 * Parametri efekta koje OVAJ model prima, svedeni na njegove vrednosti: klizač se
 * seče na `min`/`max` i korak, a izbor (npr. Hailuo „6"/„10") uzima najbližu
 * ponuđenu vrednost. Kontrola koja se u režimu ne vidi se ne dira.
 */
export function effectParamsFor(
  effect: Pick<VideoEffect, "params">,
  model: Pick<VideoPromptModel, "paramSpec">,
  inputMode: string,
): Record<string, string | number> {
  const wanted = effect.params?.duration;
  if (wanted === undefined) return {};
  const control = model.paramSpec.find(
    (entry) => entry.key === "duration" && (!entry.showInModes || entry.showInModes.includes(inputMode)),
  );
  if (!control) return {};
  if (control.type === "select" || control.type === "segmented") {
    const options = (control.options ?? [])
      .map((option) => ({ value: option.value, seconds: Number(option.value) }))
      .filter((option) => Number.isFinite(option.seconds));
    if (options.length === 0) return {};
    const best = options.reduce((a, b) => (Math.abs(b.seconds - wanted) < Math.abs(a.seconds - wanted) ? b : a));
    return { duration: best.value };
  }
  if (control.type === "slider" || control.type === "number") {
    const step = control.step && control.step > 0 ? control.step : 1;
    const low = control.min ?? wanted;
    const high = control.max ?? wanted;
    const stepped = low + Math.round((wanted - low) / step) * step;
    return { duration: Math.min(high, Math.max(low, stepped)) };
  }
  return {};
}

/** Režim kojim efekat ide modelu: slika za `foto`, opis za `nista`. */
export function effectInputMode(effect: Pick<VideoEffect, "needs">): "image" | "text" {
  return effect.needs === "foto" ? "image" : "text";
}
