import { cameraMoveById } from "../lib/crea-camera-moves";
import type { LocalizedText } from "../lib/i18n";

/**
 * Strip → film (Crea K21, V10; plan K17 §4): kadrovi stripa kako ih čuva
 * `creaStoryboards` i kako ih vraća LLM (`creaLlm.planStoryboard`) - vrste
 * kadrova (kartice ih uče), granice i sređivanje nepouzdanog ulaza. Čista
 * pravila, bez `ctx`; poslove, cenu i montažu radi `lib/crea-storyboard.ts`.
 */

export const STORYBOARD_LIMITS = {
  storyChars: 1500,
  titleChars: 80,
  shotsMin: 3,
  shotsMax: 8,
  captionChars: 140,
  promptChars: 600,
  elementsMax: 3,
  durationMin: 3,
  durationMax: 10,
  /** JSON kadrova u bazi. */
  shotsJsonChars: 32_000,
  /** Sačuvanih stripova po korisniku. */
  perUser: 30,
} as const;

/** Vrste kadrova - kartice ih uče (ime + jedna rečenica „kad se koristi"). */
export const SHOT_TYPES = ["siroki", "srednji", "krupni", "detalj", "preko-ramena", "ptica", "zablja", "subjektivni"] as const;
export type ShotTypeId = (typeof SHOT_TYPES)[number];

export const SHOT_TYPE_INFO: Record<ShotTypeId, { label: LocalizedText; lesson: LocalizedText; phrase: string }> = {
  siroki: {
    label: { sr: "Širok kadar", en: "Wide shot" },
    lesson: { sr: "Pokazuje gde smo i ko je tu. Njime priča obično počinje.", en: "Shows where we are and who is there. Stories usually open with it." },
    phrase: "wide establishing shot showing the whole place",
  },
  srednji: {
    label: { sr: "Srednji kadar", en: "Medium shot" },
    lesson: { sr: "Lik od pojasa naviše - vidi se i lice i šta radi rukama.", en: "The character from the waist up - you see the face and the hands." },
    phrase: "medium shot from the waist up",
  },
  krupni: {
    label: { sr: "Krupni plan", en: "Close-up" },
    lesson: { sr: "Samo lice. Za osećanje: radost, strah, iznenađenje.", en: "Just the face. For feelings: joy, fear, surprise." },
    phrase: "close-up on the face, showing the emotion clearly",
  },
  detalj: {
    label: { sr: "Detalj", en: "Detail" },
    lesson: { sr: "Jedan predmet izbliza - ključ, pismo, šolja. Gledalac zna da je važno.", en: "One object up close - a key, a letter, a cup. The viewer knows it matters." },
    phrase: "extreme close-up detail shot of the important object",
  },
  "preko-ramena": {
    label: { sr: "Preko ramena", en: "Over the shoulder" },
    lesson: { sr: "Gledamo preko ramena jednog lika ka drugom - za razgovor.", en: "We look over one character's shoulder at another - for conversations." },
    phrase: "over-the-shoulder shot",
  },
  ptica: {
    label: { sr: "Ptičja perspektiva", en: "Bird's-eye view" },
    lesson: { sr: "Odozgo - lik izgleda mali i izgubljen, ili vidimo ceo plan.", en: "From above - the character looks small and lost, or we see the whole plan." },
    phrase: "high-angle bird's-eye view from above",
  },
  zablja: {
    label: { sr: "Žablja perspektiva", en: "Low angle" },
    lesson: { sr: "Odozdo - lik izgleda velik, jak ili preteći.", en: "From below - the character looks big, strong or threatening." },
    phrase: "low-angle shot looking up at the character",
  },
  subjektivni: {
    label: { sr: "Subjektivni kadar", en: "Point of view" },
    lesson: { sr: "Vidimo očima lika - gledalac postaje lik.", en: "We see through the character's eyes - the viewer becomes the character." },
    phrase: "first-person point-of-view shot",
  },
};

export function isShotType(value: unknown): value is ShotTypeId {
  return typeof value === "string" && (SHOT_TYPES as readonly string[]).includes(value);
}

/** Jedan kadar stripa (kako se čuva u `creaStoryboards.shots`). */
export type StoryShot = {
  /** Srpski, ispod kadra u stripu. */
  caption: string;
  shotType: ShotTypeId;
  /** Engleski opis slike; Likovi kao `@handle`. */
  imagePrompt: string;
  /** Engleski: šta se pomera. */
  motionPrompt: string;
  /** Id iz `CAMERA_MOVES`. */
  move: string;
  durationS: number;
  /** Handle-ovi Likova u kadru. */
  elements: string[];
  imageJobId?: string;
  videoJobId?: string;
};

export const STORYBOARD_ASPECTS = ["9:16", "16:9", "1:1"] as const;
export type StoryboardAspect = (typeof STORYBOARD_ASPECTS)[number];
export const STORYBOARD_QUALITY_IDS = ["jeftino", "lepse"] as const;
export type StoryboardQuality = (typeof STORYBOARD_QUALITY_IDS)[number];

export type StoryboardSettings = {
  styleId: string | null;
  aspect: StoryboardAspect;
  quality: StoryboardQuality;
  /** Id-jevi Likova (`creaElements`), najviše 3. */
  elementIds: string[];
};

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * Kadar iz nepouzdanog izvora (LLM, klijent): tekst skraćen, nepoznat pokret →
 * „staticno", nepoznata vrsta kadra → „srednji", trajanje 3-10 s, samo poznati
 * Likovi. `null` kad nema ni potpisa ni opisa slike.
 */
export function sanitizeShot(raw: unknown, handles: readonly string[]): StoryShot | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const caption = clip(record.caption, STORYBOARD_LIMITS.captionChars);
  const imagePrompt = clip(record.imagePrompt, STORYBOARD_LIMITS.promptChars);
  if (!caption && !imagePrompt) return null;
  const motionPrompt = clip(record.motionPrompt, STORYBOARD_LIMITS.promptChars);
  const move = typeof record.move === "string" && cameraMoveById(record.move) ? record.move : "staticno";
  const duration = typeof record.durationS === "number" && Number.isFinite(record.durationS) ? Math.round(record.durationS) : 5;
  const elements = Array.isArray(record.elements)
    ? [...new Set(record.elements.filter((handle): handle is string => typeof handle === "string" && handles.includes(handle)))].slice(0, STORYBOARD_LIMITS.elementsMax)
    : [];
  const shot: StoryShot = {
    caption: caption || imagePrompt.slice(0, STORYBOARD_LIMITS.captionChars),
    shotType: isShotType(record.shotType) ? record.shotType : "srednji",
    imagePrompt: imagePrompt || caption,
    motionPrompt: motionPrompt || "subtle natural motion, the characters move slightly",
    move,
    durationS: Math.min(STORYBOARD_LIMITS.durationMax, Math.max(STORYBOARD_LIMITS.durationMin, duration)),
    elements,
  };
  if (typeof record.imageJobId === "string" && record.imageJobId.length <= 64) shot.imageJobId = record.imageJobId;
  if (typeof record.videoJobId === "string" && record.videoJobId.length <= 64) shot.videoJobId = record.videoJobId;
  return shot;
}

/** Spisak kadrova: najviše 8, neispravni ispadaju. */
export function sanitizeShots(raw: unknown, handles: readonly string[]): StoryShot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => sanitizeShot(entry, handles))
    .filter((shot): shot is StoryShot => shot !== null)
    .slice(0, STORYBOARD_LIMITS.shotsMax);
}

/** Kadrovi iz baze (pisao ih je server; oštećen JSON = prazan strip). */
export function parseStoredShots(json: string, handles: readonly string[]): StoryShot[] {
  try {
    return sanitizeShots(JSON.parse(json), handles);
  } catch {
    return [];
  }
}

export const STORYBOARD_JOB_KINDS = ["image", "video"] as const;

/** Svi poslovi stripa (slike pa videi, redom kadrova, bez ponavljanja). */
export function storyboardJobIds(shots: readonly StoryShot[]): string[] {
  const ids: string[] = [];
  for (const shot of shots) {
    for (const id of [shot.imageJobId, shot.videoJobId]) if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

const DEFAULT_SETTINGS: StoryboardSettings = { styleId: null, aspect: "9:16", quality: "jeftino", elementIds: [] };

/** Podešavanja stripa iz JSON-a; nepoznate vrednosti padaju na podrazumevane. */
export function parseStoryboardSettings(json: string): StoryboardSettings {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    return {
      styleId: typeof raw.styleId === "string" ? raw.styleId.slice(0, 60) : null,
      aspect: (STORYBOARD_ASPECTS as readonly unknown[]).includes(raw.aspect) ? (raw.aspect as StoryboardAspect) : DEFAULT_SETTINGS.aspect,
      quality: (STORYBOARD_QUALITY_IDS as readonly unknown[]).includes(raw.quality) ? (raw.quality as StoryboardQuality) : DEFAULT_SETTINGS.quality,
      elementIds: Array.isArray(raw.elementIds)
        ? raw.elementIds.filter((id): id is string => typeof id === "string").slice(0, STORYBOARD_LIMITS.elementsMax)
        : [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
