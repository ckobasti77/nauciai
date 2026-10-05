import type { LocalizedText } from "./i18n";

/**
 * Ljuska Cree (K03, plan K01 §2): tri radionice - Slika · Video · Zvuk - i u svakoj
 * režimi. Stanje živi u URL-u (`?oblast=&rezim=`), pa je svaki ekran deljiv link.
 *
 * Čist modul, bez React-a i bez `lucide-react`: ikone su samo imena, a mapira ih
 * komponenta (`components/crea/crea-icons.tsx`). Koji model pripada kom režimu
 * izvodi se iz ULAZNIH REŽIMA modela (`inputModes`) ili iz spiska slugova kad
 * ulazni režim ne razlikuje posao (sav zvuk je `text`). Test tvrdi da svaki model
 * iz kataloga pada u bar jedan režim - nijedan postojeći model ne sme da „nestane".
 */

export const CREA_AREAS = ["slika", "video", "zvuk"] as const;
export type CreaArea = (typeof CREA_AREAS)[number];

export type CreaKind = "image" | "video" | "audio";

export const CREA_AREA_KIND: Record<CreaArea, CreaKind> = { slika: "image", video: "video", zvuk: "audio" };
export const CREA_KIND_AREA: Record<CreaKind, CreaArea> = { image: "slika", video: "video", audio: "zvuk" };

export type CreaModeId =
  | "napravi" | "izmeni" | "alati" | "likovi" // slika
  | "pokret" | "govor" | "montaza" // video (+ napravi, izmeni)
  | "glasovi" | "promena" | "prevod" | "muzika" | "efekti" | "uredjivac"; // zvuk (+ govor)

/** Ime ikone; komponenta ga mapira na lucide ikonu. */
export type CreaIconName =
  | "Image" | "Clapperboard" | "AudioLines" | "House"
  | "WandSparkles" | "Brush" | "Wrench" | "UserRound"
  | "PersonStanding" | "Speech" | "Scissors"
  | "Mic" | "Library" | "AudioWaveform" | "Languages" | "Music" | "Zap" | "SlidersHorizontal"
  | "Megaphone" | "Smartphone" | "Podcast" | "PenTool" | "Volume2" | "PartyPopper" | "History" | "Film" | "Eraser";

/**
 * Koje modele režim nudi. `inputModes`: model ulazi ako ima bar jedan od tih
 * ulaznih režima (osim režima-nastavka, vidi `usableInputModes`). `slugs`: tačno
 * ti modeli. Uvek se proverava i vrsta oblasti.
 */
export type CreaModelRule = { inputModes?: readonly string[]; slugs?: readonly string[] };

export type CreaModeDef = {
  id: CreaModeId;
  label: LocalizedText;
  icon: CreaIconName;
  models?: CreaModelRule;
  /**
   * Režim nudi alate iz `lib/crea-tools.ts` (K04). Bez `models` alati su ceo režim;
   * uz `models` (Slika · Izmeni, K11) composer ostaje podrazumevan, a alat se bira
   * pored njega (`?alat=`).
   */
  tools?: boolean;
  status: "ready" | "soon";
  /** Jedna rečenica: šta režim radi (i za „Stiže uskoro"). */
  blurb: LocalizedText;
};

export const CREA_AREA_META: Record<CreaArea, { label: LocalizedText; icon: CreaIconName }> = {
  slika: { label: { sr: "Slika", en: "Image" }, icon: "Image" },
  video: { label: { sr: "Video", en: "Video" }, icon: "Clapperboard" },
  zvuk: { label: { sr: "Zvuk", en: "Sound" }, icon: "AudioLines" },
};

export const CREA_MODES: Record<CreaArea, readonly CreaModeDef[]> = {
  slika: [
    {
      id: "napravi",
      label: { sr: "Napravi", en: "Create" },
      icon: "WandSparkles",
      models: { inputModes: ["text"] },
      status: "ready",
      blurb: {
        sr: "Opiši sliku rečima i dobij je za nekoliko sekundi.",
        en: "Describe an image in words and get it in a few seconds.",
      },
    },
    {
      id: "izmeni",
      label: { sr: "Izmeni", en: "Edit" },
      icon: "Brush",
      models: { inputModes: ["image_multi", "layerize"] },
      tools: true,
      status: "ready",
      blurb: {
        sr: "Okači svoju sliku i napiši šta da se promeni - ili uzmi alat: četkica, brisanje, pozadina, uvećanje, boje.",
        en: "Upload your image and write what should change - or pick a tool: brush, erase, background, upscale, colour.",
      },
    },
    {
      id: "alati",
      label: { sr: "Alati", en: "Tools" },
      icon: "Wrench",
      tools: true,
      status: "ready",
      blurb: {
        sr: "Besplatni alati koji rade na tvom uređaju, bez kredita: promeni format slike i proveri fotku pre plaćanja.",
        en: "Free tools that run on your device, with no credits: change an image's format and check a photo before you pay.",
      },
    },
    {
      id: "likovi",
      label: { sr: "Likovi", en: "Characters" },
      icon: "UserRound",
      status: "soon",
      blurb: {
        sr: "Sačuvaj svoj lik jednom, pa ga koristi u svakoj slici i svakom videu.",
        en: "Save your character once, then use it in every image and every video.",
      },
    },
  ],
  video: [
    {
      id: "napravi",
      label: { sr: "Napravi", en: "Create" },
      icon: "WandSparkles",
      models: { inputModes: ["text", "image", "first_last", "reference"] },
      status: "ready",
      blurb: {
        sr: "Od opisa ili od slike napravi kratak video, često i sa zvukom.",
        en: "Turn a description or a picture into a short video, often with sound.",
      },
    },
    {
      id: "izmeni",
      label: { sr: "Izmeni", en: "Edit" },
      icon: "Brush",
      models: { inputModes: ["video"] },
      status: "ready",
      blurb: {
        sr: "Okači svoj video i napiši šta da se promeni, ili ga produži.",
        en: "Upload your video and write what should change, or make it longer.",
      },
    },
    {
      id: "pokret",
      label: { sr: "Pokret", en: "Motion" },
      icon: "PersonStanding",
      models: { slugs: ["kling-motion"] },
      status: "ready",
      blurb: {
        sr: "Prenesi pokret iz jednog videa na lik sa tvoje slike.",
        en: "Move the character from your picture the way someone moves in a video.",
      },
    },
    {
      id: "govor",
      label: { sr: "Govor", en: "Talking" },
      icon: "Speech",
      models: { slugs: ["kling-avatar", "kling-lipsync"] },
      status: "ready",
      blurb: {
        sr: "Slika ili video uz snimak glasa: lik progovori, a usne prate reči.",
        en: "A picture or a video plus a voice recording: the character speaks and the lips follow.",
      },
    },
    {
      id: "montaza",
      label: { sr: "Montaža", en: "Montage" },
      icon: "Scissors",
      status: "soon",
      blurb: {
        sr: "Seci i spajaj klipove, dodaj muziku i natpise pravo u browseru, besplatno.",
        en: "Cut and join clips, add music and captions right in the browser, for free.",
      },
    },
  ],
  zvuk: [
    {
      id: "govor",
      label: { sr: "Govor", en: "Speech" },
      icon: "Mic",
      models: { slugs: ["tts", "dialogue"] },
      status: "ready",
      blurb: {
        sr: "Napiši tekst i Crea ga izgovori, i na srpskom, i kao razgovor više glasova.",
        en: "Write a text and Crea reads it out, in Serbian too, or as a conversation of several voices.",
      },
    },
    {
      id: "glasovi",
      label: { sr: "Glasovi", en: "Voices" },
      icon: "Library",
      status: "soon",
      blurb: {
        sr: "Biblioteka glasova: preslušaj ih, izaberi omiljene i sačuvaj podešavanja.",
        en: "A voice library: listen, pick your favourites and keep your settings.",
      },
    },
    {
      id: "promena",
      label: { sr: "Promena glasa", en: "Voice changer" },
      icon: "AudioWaveform",
      models: { slugs: ["voice-changer"] },
      status: "ready",
      blurb: {
        sr: "Okači snimak i promeni glas, a reči i ritam ostaju isti.",
        en: "Upload a recording and change the voice while the words and rhythm stay the same.",
      },
    },
    {
      id: "prevod",
      label: { sr: "Prevod", en: "Dubbing" },
      icon: "Languages",
      models: { slugs: ["dubbing"] },
      status: "ready",
      blurb: {
        sr: "Prevedi video ili snimak na drugi jezik, istim glasom.",
        en: "Translate a video or a recording into another language, in the same voice.",
      },
    },
    {
      id: "muzika",
      label: { sr: "Muzika", en: "Music" },
      icon: "Music",
      models: { slugs: ["music"] },
      status: "ready",
      blurb: {
        sr: "Opiši raspoloženje i dobij numeru za svoj video.",
        en: "Describe a mood and get a track for your video.",
      },
    },
    {
      id: "efekti",
      label: { sr: "Efekti", en: "Sound effects" },
      icon: "Zap",
      models: { slugs: ["sfx", "kling-v2a"] },
      status: "ready",
      blurb: {
        sr: "Napravi zvučni efekat iz opisa ili ozvuči svoj video.",
        en: "Make a sound effect from a description, or add sound to your video.",
      },
    },
    {
      id: "uredjivac",
      label: { sr: "Uređivač", en: "Editor" },
      icon: "SlidersHorizontal",
      models: { slugs: ["stt", "audio-isolation"] },
      status: "ready",
      blurb: {
        sr: "Pretvori snimak u tekst ili očisti govor od buke.",
        en: "Turn a recording into text or clean the noise out of speech.",
      },
    },
  ],
};

/** Query ključevi ljuske. Ostali (`project`, `model`, `lessonId`…) ostaju kakvi su. */
export const CREA_PARAM = {
  area: "oblast",
  mode: "rezim",
  tool: "alat",
  goal: "cilj",
  recipe: "recept",
  legacyKind: "kind",
} as const;

export type CreaShellState = {
  /** `null` = početni ekran „Šta praviš danas?". */
  area: CreaArea | null;
  /** `null` = prvi režim oblasti. Uvek pripada oblasti (ili je `null`). */
  mode: CreaModeId | null;
  /** id iz `lib/crea-tools.ts` (K04). */
  tool: string | null;
  /** id iz `lib/crea-goals.ts`. */
  goal: string | null;
  /** id iz `lib/crea-recipes.ts` (K15). */
  recipe: string | null;
};

/** Parametri koje ljuska čuva pri svakoj navigaciji; sve ostalo se ne prenosi. */
const PRESERVED_PARAMS = ["project", "model", "lessonId", "taskId", "regenerate"] as const;

function isCreaArea(value: string | null): value is CreaArea {
  return value !== null && (CREA_AREAS as readonly string[]).includes(value);
}

export function creaModeDef(area: CreaArea, mode: CreaModeId | null): CreaModeDef {
  const modes = CREA_MODES[area];
  return modes.find((entry) => entry.id === mode) ?? modes[0];
}

function modeOf(area: CreaArea, value: string | null): CreaModeId | null {
  if (value === null) return null;
  return CREA_MODES[area].some((entry) => entry.id === value) ? (value as CreaModeId) : null;
}

function cleanId(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return /^[a-z0-9][a-z0-9.-]{0,63}$/.test(trimmed) ? trimmed : null;
}

/**
 * Stanje iz query stringa. Stari `?kind=image|video|audio` (sidebar, stari linkovi)
 * znači oblast. Nepoznata oblast = početni ekran; režim koji ne pripada oblasti =
 * prvi režim; režim bez oblasti se ignoriše.
 */
export function parseCreaShellState(params: { get(key: string): string | null }): CreaShellState {
  const rawArea = params.get(CREA_PARAM.area);
  const legacyKind = params.get(CREA_PARAM.legacyKind);
  const area = isCreaArea(rawArea)
    ? rawArea
    : legacyKind === "image" || legacyKind === "video" || legacyKind === "audio"
      ? CREA_KIND_AREA[legacyKind]
      : null;

  return {
    area,
    mode: area ? modeOf(area, params.get(CREA_PARAM.mode)) : null,
    tool: area ? cleanId(params.get(CREA_PARAM.tool)) : null,
    goal: cleanId(params.get(CREA_PARAM.goal)),
    recipe: cleanId(params.get(CREA_PARAM.recipe)),
  };
}

/**
 * Query string (bez `?`) za sledeće stanje. Čuva `project`, `model`, `lessonId`,
 * `taskId` i `regenerate`; briše stari `kind`; ne upisuje podrazumevane vrednosti
 * (prvi režim oblasti). Promena oblasti briše `model` (model pripada jednoj vrsti),
 * a promena oblasti ili režima briše cilj i alat - osim ako ih `next` donosi.
 */
export function creaShellQuery(
  next: Partial<CreaShellState> & { model?: string | null },
  current: URLSearchParams,
): string {
  const now = parseCreaShellState(current);
  const area = next.area !== undefined ? next.area : now.area;
  const areaChanged = area !== now.area;
  const mode = area ? (next.mode !== undefined ? next.mode : areaChanged ? null : now.mode) : null;
  const modeChanged = areaChanged || (area !== null && creaModeDef(area, mode).id !== creaModeDef(area, now.mode).id);

  const out = new URLSearchParams();
  if (area) {
    out.set(CREA_PARAM.area, area);
    const resolved = modeOf(area, mode);
    if (resolved && resolved !== CREA_MODES[area][0].id) out.set(CREA_PARAM.mode, resolved);
  }

  const tool = next.tool !== undefined ? next.tool : modeChanged ? null : now.tool;
  const goal = next.goal !== undefined ? next.goal : modeChanged ? null : now.goal;
  const recipe = next.recipe !== undefined ? next.recipe : modeChanged ? null : now.recipe;
  if (area && tool) out.set(CREA_PARAM.tool, tool);
  if (goal) out.set(CREA_PARAM.goal, goal);
  if (recipe) out.set(CREA_PARAM.recipe, recipe);

  for (const key of PRESERVED_PARAMS) {
    if (key === "model") {
      const model = next.model !== undefined ? next.model : areaChanged ? null : current.get("model");
      if (model) out.set("model", model);
      continue;
    }
    const value = current.get(key);
    if (value) out.set(key, value);
  }

  return out.toString();
}

/**
 * `?opis=` (K09): jednokratno popunjen opis u „Napravi" - npr. paleta boja iz
 * alata. Nije deo stanja ljuske: sledeća navigacija ga ne prenosi, pa se opis
 * ne vraća kad korisnik krene dalje.
 */
export const CREA_PROMPT_PARAM = "opis";
/** Isto kao `PROMPT_MAX_LENGTH` (`lib/studio-messages.ts`); duži opis se seče. */
export const CREA_PROMPT_PARAM_MAX = 2000;

/** Query za „Slika · Napravi" sa već upisanim opisom. */
export function creaPromptQuery(prompt: string, current: URLSearchParams): string {
  const query = new URLSearchParams(creaShellQuery({ area: "slika", mode: "napravi", tool: null }, current));
  query.set(CREA_PROMPT_PARAM, prompt.slice(0, CREA_PROMPT_PARAM_MAX));
  return query.toString();
}

/** Opis iz `?opis=`, očišćen; prazan = `null`. */
export function creaPromptFromParams(params: { get(key: string): string | null }): string | null {
  const value = params.get(CREA_PROMPT_PARAM)?.trim().slice(0, CREA_PROMPT_PARAM_MAX) ?? "";
  return value || null;
}

/** Najmanji oblik modela koji ljuska čita - važi i za red kataloga i za seed. */
export type CreaModelLike = {
  slug: string;
  kind: CreaKind;
  inputModes: readonly string[];
  capabilities: Record<string, unknown>;
};

/**
 * Ulazni režimi koje forma ume da pokrene. Režim-nastavak (`capabilities.continuation`,
 * npr. Gemini Omni `video`) traži izbor ranije generacije, a taj izbor forma još
 * nema (nalaz K01 0.2-13) - zato se ne računa.
 */
export function usableInputModes(model: CreaModelLike): string[] {
  const continuation = model.capabilities.continuation;
  const blocked =
    continuation && typeof continuation === "object" && "mode" in continuation
      ? (continuation as { mode?: unknown }).mode
      : undefined;
  return model.inputModes.filter((mode) => mode !== blocked);
}

function ruleInputMode(model: CreaModelLike, area: CreaArea, def: CreaModeDef): string | undefined {
  const rule = def.models;
  if (!rule || model.kind !== CREA_AREA_KIND[area]) return undefined;
  const usable = usableInputModes(model);
  if (rule.slugs) return rule.slugs.includes(model.slug) ? usable[0] : undefined;
  return usable.find((mode) => rule.inputModes?.includes(mode));
}

/** Modeli koje režim nudi, redosledom kataloga. */
export function modelsForMode<T extends CreaModelLike>(catalog: readonly T[], area: CreaArea, mode: CreaModeId | null): T[] {
  const def = creaModeDef(area, mode);
  return catalog.filter((model) => ruleInputMode(model, area, def) !== undefined);
}

/** Ulazni režim kojim se forma otvara za model u ovom režimu ljuske. */
export function inputModeForMode(model: CreaModelLike, area: CreaArea, mode: CreaModeId | null): string | undefined {
  return ruleInputMode(model, area, creaModeDef(area, mode));
}

/**
 * Prvi režim ljuske u kojem model radi (uz dati ulazni režim, ako ga ima). Služi
 * starim linkovima bez oblasti (`?model=`, `?regenerate=`) i „Upotrebi ponovo"
 * sa kartice iz istorije.
 */
export function modeOfModel(model: CreaModelLike, inputMode?: string): { area: CreaArea; mode: CreaModeId } | null {
  const area = CREA_KIND_AREA[model.kind];
  const modes = CREA_MODES[area];
  const fits = (def: CreaModeDef) => ruleInputMode(model, area, def) !== undefined;
  const withInput =
    inputMode !== undefined
      ? modes.find((def) => {
          if (!fits(def) || !usableInputModes(model).includes(inputMode)) return false;
          return def.models?.slugs ? true : def.models?.inputModes?.includes(inputMode) === true;
        })
      : undefined;
  const found = withInput ?? modes.find(fits);
  return found ? { area, mode: found.id } : null;
}
