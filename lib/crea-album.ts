import { CAMERA_MOVE_GROUPS, CAMERA_MOVES } from "./crea-camera-moves";
import { CREA_RECIPES } from "./crea-recipes";
import { CREA_KIND_AREA, type CreaArea } from "./crea-shell";
import { CREA_STYLE_GROUPS, CREA_STYLES } from "./crea-styles";
import { isLocalTier, toolById, toolIdFromModelSlug, type CreaTool } from "./crea-tools";
import { VIDEO_EFFECTS } from "./crea-video-effects";
import { voicesOf } from "./crea-voices";
import type { LocalizedText } from "./i18n";

/**
 * Album sličica Cree (K26, G4) - kao Panini: svaka nova tehnika koju probaš je
 * sličica, a puna strana donosi malu, jednokratnu nagradu u kreditima.
 *
 * Sličica se dodeljuje SAMO za ono što server vidi na gotovom radu: lokalni rezultat
 * (`local:<alat>`), alat kojim je plaćen rad poslat (`creaTechniques`), pokret
 * kamere / efekat / stil / recept koje je composer ili recept poslao, i glas iz
 * parametara govora. Alati koji ništa ne čuvaju (samo preuzimanje) nisu u albumu -
 * server ne može da potvrdi da su probani.
 *
 * Id sličice je `<porodica>:<id>`: `prvi:slika`, `alat:slika.format`, `kamera:fpv`,
 * `efekat:glina`, `stil:foto-film`, `glas:gemini:Kore`, `recept:profilna`.
 */

export type CreaStickerFamily = "prvi" | "alat" | "kamera" | "efekat" | "stil" | "glas" | "recept";

export type CreaAlbumSticker = {
  id: string;
  family: CreaStickerFamily;
  label: LocalizedText;
};

export type CreaAlbumPage = {
  id: string;
  family: CreaStickerFamily;
  title: LocalizedText;
  /** Gde se ove sličice skupljaju - jedna rečenica za početnika. */
  howTo: LocalizedText;
  stickers: readonly CreaAlbumSticker[];
};

/** Nagrada za punu stranu: mala (≈ jedna jeftina slika) i jednokratna po strani. */
export const ALBUM_PAGE_REWARD_CREDITS = 5;
/** Najviše ovoliko nagrada za strane u jednom beogradskom danu (zaštita od farmovanja). */
export const ALBUM_REWARDS_PER_DAY = 2;
/** Najviše tehnika koje jedan posao sme da prijavi. */
export const JOB_TECHNIQUES_MAX = 6;

const FIRSTS: readonly CreaAlbumSticker[] = [
  { id: "prvi:slika", family: "prvi", label: { sr: "Prva slika", en: "First image" } },
  { id: "prvi:video", family: "prvi", label: { sr: "Prvi video", en: "First video" } },
  { id: "prvi:zvuk", family: "prvi", label: { sr: "Prvi zvuk", en: "First sound" } },
  { id: "prvi:besplatno", family: "prvi", label: { sr: "Prvi besplatan alat", en: "First free tool" } },
  { id: "prvi:verzija", family: "prvi", label: { sr: "Prva nova verzija", en: "First new version" } },
  { id: "prvi:recept", family: "prvi", label: { sr: "Prvi recept", en: "First recipe" } },
  { id: "prvi:lekcija", family: "prvi", label: { sr: "Prva mini-lekcija", en: "First mini-lesson" } },
  { id: "prvi:proba", family: "prvi", label: { sr: "Prva besplatna proba", en: "First free try" } },
];

/**
 * Strane alata. Lokalni alati su u albumu samo ako čuvaju rezultat u galeriju;
 * plaćeni ako šalju posao (`createJob`) - to proverava `crea-album.test.ts`.
 */
const TOOL_PAGES: ReadonlyArray<{ id: string; area: CreaArea; title: LocalizedText; howTo: LocalizedText; tools: readonly string[] }> = [
  {
    id: "alati-slika-besplatno",
    area: "slika",
    title: { sr: "Slika · besplatni alati", en: "Image · free tools" },
    howTo: { sr: "Slika → Alati. Sačuvaj rezultat u galeriju.", en: "Image → Tools. Save the result to the gallery." },
    tools: ["slika.format", "slika.iseci", "slika.pametni-isecak", "slika.qr", "slika.gif", "slika.editor", "slika.sabloni", "slika.provera", "slika.3d-foto"],
  },
  {
    id: "alati-slika-izmene",
    area: "slika",
    title: { sr: "Slika · izmene na uređaju", en: "Image · on-device edits" },
    howTo: { sr: "Slika → Izmeni. Besplatno, na tvom uređaju.", en: "Image → Edit. Free, on your device." },
    tools: ["slika.klik", "slika.obrisi", "slika.pozadina", "slika.uvecaj", "slika.tekst", "slika.boje", "slika.retus"],
  },
  {
    id: "alati-slika-ai",
    area: "slika",
    title: { sr: "Slika · AI izmene", en: "Image · AI edits" },
    howTo: { sr: "Slika → Izmeni. Ovi alati troše kredite.", en: "Image → Edit. These tools use credits." },
    tools: ["slika.cetkica", "slika.prosiri", "slika.svetlo", "slika.uglovi", "slika.slojevi", "slika.odeca", "slika.zameni-lik"],
  },
  {
    id: "alati-slika-pravljenje",
    area: "slika",
    title: { sr: "Slika · pravljenje", en: "Image · creating" },
    howTo: { sr: "Slika → Napravi i Likovi.", en: "Image → Create and Characters." },
    tools: ["slika.probni-list", "slika.ko-gde-kako", "slika.crtaj", "slika.skica", "slika.kreator-lika", "slika.nalepnice", "slika.logo"],
  },
  {
    id: "alati-video-besplatno",
    area: "video",
    title: { sr: "Video · besplatni alati", en: "Video · free tools" },
    howTo: { sr: "Video → Izmeni i Montaža. Sačuvaj rezultat u galeriju.", en: "Video → Edit and Montage. Save the result to the gallery." },
    tools: ["video.poslednji-kadar", "video.reframe", "video.pozadina", "video.boje", "video.slowmo", "video.bez-treperenja", "video.retro", "video.montaza", "video.ritam-sabloni", "video.titlovi"],
  },
  {
    id: "alati-video-ai",
    area: "video",
    title: { sr: "Video · AI alati", en: "Video · AI tools" },
    howTo: { sr: "Video → Napravi, Izmeni, Pokret i Govor.", en: "Video → Create, Edit, Motion and Speech." },
    tools: ["video.vise-scena", "video.crtaj-pokret", "video.strip", "video.objasnjenje", "video.reklama", "video.produzi", "video.izmeni-recima", "video.zameni", "video.uvecaj", "video.shorts", "video.odglumi", "video.lik-govori"],
  },
  {
    id: "alati-zvuk-glas",
    area: "zvuk",
    title: { sr: "Zvuk · glas", en: "Sound · voice" },
    howTo: { sr: "Zvuk → Govor, Glasovi, Promena glasa i Prevod.", en: "Sound → Speech, Voices, Voice change and Dubbing." },
    tools: ["zvuk.govor", "zvuk.dijalog", "zvuk.podkast", "zvuk.dizajn", "zvuk.promena", "zvuk.prevod"],
  },
  {
    id: "alati-zvuk-radionica",
    area: "zvuk",
    title: { sr: "Zvuk · muzika i radionica", en: "Sound · music and workshop" },
    howTo: { sr: "Zvuk → Muzika, Efekti i Uređivač.", en: "Sound → Music, Effects and Editor." },
    tools: ["zvuk.muzika", "zvuk.ozvuci", "zvuk.efekti", "zvuk.trake", "zvuk.snimac", "zvuk.uredjivac", "zvuk.transkript", "zvuk.audiogram", "zvuk.ciscenje"],
  },
];

function toolSticker(id: string): CreaAlbumSticker {
  const tool = toolById(id);
  if (!tool) throw new Error(`Album: nepoznat alat ${id}`);
  return { id: `alat:${id}`, family: "alat", label: tool.title };
}

const CAMERA_PAGES: CreaAlbumPage[] = CAMERA_MOVE_GROUPS.map((group) => ({
  id: `kamera-${group.id}`,
  family: "kamera",
  title: { sr: `Kamera · ${group.label.sr}`, en: `Camera · ${group.label.en}` },
  howTo: { sr: "Video → Napravi → Režija: izaberi pokret kamere.", en: "Video → Create → Direction: pick a camera move." },
  stickers: CAMERA_MOVES.filter((move) => move.group === group.id).map((move) => ({ id: `kamera:${move.id}`, family: "kamera" as const, label: move.label })),
}));

const EFFECT_PAGE_GROUPS: ReadonlyArray<{ id: string; groups: readonly string[]; title: LocalizedText }> = [
  { id: "efekti-viralni", groups: ["viralni"], title: { sr: "Efekti · viralni", en: "Effects · viral" } },
  { id: "efekti-nasi", groups: ["nasi"], title: { sr: "Efekti · naši", en: "Effects · Serbian" } },
  { id: "efekti-priroda-magija", groups: ["priroda", "magija"], title: { sr: "Efekti · priroda i magija", en: "Effects · nature and magic" } },
];

const EFFECT_PAGES: CreaAlbumPage[] = EFFECT_PAGE_GROUPS.map((page) => ({
  id: page.id,
  family: "efekat",
  title: page.title,
  howTo: { sr: "Video → Napravi → Efekti: izaberi efekat.", en: "Video → Create → Effects: pick an effect." },
  stickers: VIDEO_EFFECTS.filter((effect) => page.groups.includes(effect.group)).map((effect) => ({ id: `efekat:${effect.id}`, family: "efekat" as const, label: effect.label })),
}));

const STYLE_PAGES: CreaAlbumPage[] = CREA_STYLE_GROUPS.map((group) => ({
  id: `stil-${group.id}`,
  family: "stil",
  title: { sr: `Stil · ${group.label.sr}`, en: `Style · ${group.label.en}` },
  howTo: { sr: "Slika → Napravi → Izgled: izaberi stil.", en: "Image → Create → Look: pick a style." },
  stickers: CREA_STYLES.filter((style) => style.group === group.id).map((style) => ({ id: `stil:${style.id}`, family: "stil" as const, label: style.label })),
}));

const VOICES_PER_PAGE = 10;

function voicePages(): CreaAlbumPage[] {
  const pages: CreaAlbumPage[] = [];
  const gemini = voicesOf("gemini");
  for (let start = 0; start < gemini.length; start += VOICES_PER_PAGE) {
    const n = start / VOICES_PER_PAGE + 1;
    pages.push({
      id: `glasovi-gemini-${n}`,
      family: "glas",
      title: { sr: `Glasovi · Gemini ${n}`, en: `Voices · Gemini ${n}` },
      howTo: { sr: "Zvuk → Govor: izaberi glas i napravi govor.", en: "Sound → Speech: pick a voice and make speech." },
      stickers: gemini.slice(start, start + VOICES_PER_PAGE).map((voice) => ({
        id: `glas:gemini:${voice.id}`,
        family: "glas" as const,
        label: { sr: `${voice.id} · ${voice.trait.sr}`, en: `${voice.id} · ${voice.trait.en}` },
      })),
    });
  }
  pages.push({
    id: "glasovi-eleven",
    family: "glas",
    title: { sr: "Glasovi · ElevenLabs", en: "Voices · ElevenLabs" },
    howTo: { sr: "Zvuk → Govor: model ElevenLabs.", en: "Sound → Speech: the ElevenLabs model." },
    stickers: voicesOf("eleven").map((voice) => ({
      id: `glas:eleven:${voice.id}`,
      family: "glas" as const,
      label: { sr: `${voice.id} · ${voice.trait.sr}`, en: `${voice.id} · ${voice.trait.en}` },
    })),
  });
  return pages;
}

const RECIPE_PAGE_GROUPS: ReadonlyArray<{ id: string; groups: readonly string[]; title: LocalizedText }> = [
  { id: "recepti-ja", groups: ["ja"], title: { sr: "Recepti · za tebe", en: "Recipes · for you" } },
  { id: "recepti-posao", groups: ["posao"], title: { sr: "Recepti · za posao", en: "Recipes · for business" } },
  { id: "recepti-proslave", groups: ["proslave", "deca"], title: { sr: "Recepti · proslave i deca", en: "Recipes · celebrations and kids" } },
];

const RECIPE_PAGES: CreaAlbumPage[] = RECIPE_PAGE_GROUPS.map((page) => ({
  id: page.id,
  family: "recept",
  title: page.title,
  howTo: { sr: "Početak → recepti: popuni dva-tri polja.", en: "Start → recipes: fill in two or three fields." },
  stickers: CREA_RECIPES.filter((recipe) => page.groups.includes(recipe.group)).map((recipe) => ({ id: `recept:${recipe.id}`, family: "recept" as const, label: recipe.title })),
}));

export const CREA_ALBUM_PAGES: readonly CreaAlbumPage[] = [
  {
    id: "prvi-koraci",
    family: "prvi",
    title: { sr: "Prvi koraci", en: "First steps" },
    howTo: { sr: "Svaki prvi put u Crei - slika, video, zvuk, alat, recept, lekcija.", en: "Every first time in Crea - image, video, sound, tool, recipe, lesson." },
    stickers: FIRSTS,
  },
  ...TOOL_PAGES.map((page) => ({ id: page.id, family: "alat" as const, title: page.title, howTo: page.howTo, stickers: page.tools.map(toolSticker) })),
  ...CAMERA_PAGES,
  ...EFFECT_PAGES,
  ...STYLE_PAGES,
  ...voicePages(),
  ...RECIPE_PAGES,
];

const PAGE_BY_STICKER = new Map<string, CreaAlbumPage>();
const STICKER_BY_ID = new Map<string, CreaAlbumSticker>();
for (const page of CREA_ALBUM_PAGES) {
  for (const sticker of page.stickers) {
    PAGE_BY_STICKER.set(sticker.id, page);
    STICKER_BY_ID.set(sticker.id, sticker);
  }
}

export const CREA_ALBUM_STICKER_COUNT = STICKER_BY_ID.size;

export function stickerById(id: string): CreaAlbumSticker | undefined {
  return STICKER_BY_ID.get(id);
}

export function pageOfSticker(stickerId: string): CreaAlbumPage | undefined {
  return PAGE_BY_STICKER.get(stickerId);
}

export function albumPageById(id: string): CreaAlbumPage | undefined {
  return CREA_ALBUM_PAGES.find((page) => page.id === id);
}

/** Da li su sve sličice strane skupljene (prazan skup = ne). */
export function isPageComplete(page: CreaAlbumPage, owned: ReadonlySet<string>): boolean {
  return page.stickers.length > 0 && page.stickers.every((sticker) => owned.has(sticker.id));
}

/** Može li alat da donese sličicu kroz plaćen posao (alat poslat uz `createJob`). */
function toolSendsJobs(tool: CreaTool): boolean {
  return tool.status === "ready" && (tool.tier === "paid" || tool.localSave === true || tool.cloudFallback === true);
}

/**
 * Tehnike koje posao sme da ponese (`createJob`): poznate sličice, uz vrstu rada
 * koja im odgovara - pokret kamere i efekat samo za video, stil samo za sliku.
 * Nepoznato tiho otpada (oznaka za album nikad ne obara plaćen posao).
 * „Spoji dva efekta" (`a+b`) daje obe sličice.
 */
export function jobTechniques(input: {
  tool?: string;
  techniques?: readonly string[];
  kind: "image" | "video" | "audio";
}): string[] {
  const out: string[] = [];
  const add = (id: string) => {
    if (out.length < JOB_TECHNIQUES_MAX && !out.includes(id) && STICKER_BY_ID.has(id)) out.push(id);
  };
  if (input.tool) {
    const tool = toolById(input.tool);
    if (tool && toolSendsJobs(tool)) add(`alat:${tool.id}`);
  }
  for (const raw of input.techniques ?? []) {
    if (typeof raw !== "string" || raw.length > 80) continue;
    const [family, ...rest] = raw.split(":");
    const id = rest.join(":");
    if (family === "kamera" && input.kind === "video") add(raw);
    else if (family === "efekat" && input.kind === "video") for (const part of id.split("+")) add(`efekat:${part}`);
    else if (family === "stil" && input.kind === "image") add(raw);
    else if (family === "recept") add(raw);
  }
  return out;
}

/** Ono što pravila albuma čitaju sa gotovog rada. */
export type CreaWorkFacts = {
  kind: "image" | "video" | "audio";
  modelSlug: string;
  provider?: string;
  params?: string;
  creaTechniques?: readonly string[];
  parentJobId?: unknown;
  freeTryLessonId?: string;
};

/** Model govora → motor glasa (glas se čita iz `params.voice`). */
const VOICE_MODEL_ENGINE: Record<string, "gemini" | "eleven"> = { "gemini-tts": "gemini", tts: "eleven" };

function voiceOf(work: CreaWorkFacts): string | null {
  const engine = VOICE_MODEL_ENGINE[work.modelSlug];
  if (!engine || !work.params) return null;
  try {
    const params: unknown = JSON.parse(work.params);
    const voice = params && typeof params === "object" ? (params as Record<string, unknown>).voice : undefined;
    return typeof voice === "string" ? `glas:${engine}:${voice}` : null;
  } catch {
    return null;
  }
}

/** Oblast rada (za „prvi rad u oblasti"). */
export function areaOfWork(work: Pick<CreaWorkFacts, "kind">): CreaArea {
  return CREA_KIND_AREA[work.kind];
}

/**
 * Sve sličice koje gotov rad zaslužuje (bez obzira da li ih korisnik već ima).
 * Cena rada se ne gleda: plaćen i besplatan rad iste tehnike daju istu sličicu.
 */
export function stickersForWork(work: CreaWorkFacts): string[] {
  const ids = new Set<string>([`prvi:${areaOfWork(work)}`]);
  const localTool = work.provider === "local" ? toolById(toolIdFromModelSlug(work.modelSlug)) : undefined;
  if (localTool) {
    ids.add(`alat:${localTool.id}`);
    if (isLocalTier(localTool.tier)) ids.add("prvi:besplatno");
  }
  for (const id of work.creaTechniques ?? []) ids.add(id);
  if ((work.creaTechniques ?? []).some((id) => id.startsWith("recept:"))) ids.add("prvi:recept");
  if (work.parentJobId) ids.add("prvi:verzija");
  if (work.freeTryLessonId) ids.add("prvi:proba");
  const voice = voiceOf(work);
  if (voice) ids.add(voice);
  return [...ids].filter((id) => STICKER_BY_ID.has(id));
}

/** Recepti koje je rad uradio (XP za recept, jednom po receptu). */
export function recipesOfWork(work: Pick<CreaWorkFacts, "creaTechniques">): string[] {
  return (work.creaTechniques ?? []).filter((id) => id.startsWith("recept:")).map((id) => id.slice("recept:".length));
}
