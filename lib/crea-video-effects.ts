import type { LocalizedText } from "./i18n";

/**
 * Video efekti kao RECEPTI (Crea K18, V8; plan K17 §3.2): efekat nije poseban
 * model nego šablon opisa + modeli koji ga dobro rade + parametri posla. Ide kroz
 * postojeći `createJob`, pa važe ista cena, limiti i DEMO bez ključa.
 *
 * `{subject}` je mesto za korisnikov opis (ili „the main subject of the image" kad
 * opisa nema). Šablon je na engleskom, kao dodaci stila (K13) - modeli ga najbolje
 * razumeju, a korisnik pre slanja vidi tačan tekst („Modelu ide:").
 *
 * Nema efekata koji stvarne ljude stavljaju u intimne ili nasilne scene (K17-16).
 */

export type VideoEffectGroup = "viralni" | "nasi" | "priroda" | "magija";

export type VideoEffect = {
  id: string;
  group: VideoEffectGroup;
  label: LocalizedText;
  hint: LocalizedText;
  /** `foto` = efekat radi nad tvojom slikom (režim `image`); `nista` = samo opis. */
  needs: "foto" | "nista";
  /** Engleski, tačno jedno `{subject}`, bez tačke na kraju. */
  template: string;
  /** Modeli redom prednosti; svaki ima traženi ulazni režim. */
  models: readonly string[];
  /** Parametri posla koje efekat traži (primenjuju se samo ako ih model prima). */
  params?: { duration?: number };
  /** Ambijent za modele koji prave zvuk. */
  sound?: string;
  /** Sme u „Spoji dva efekta". */
  combinable: boolean;
};

export const VIDEO_EFFECT_GROUPS: ReadonlyArray<{ id: VideoEffectGroup; label: LocalizedText }> = [
  { id: "viralni", label: { sr: "Viralni", en: "Viral" } },
  { id: "nasi", label: { sr: "Naši", en: "Serbian" } },
  { id: "priroda", label: { sr: "Priroda", en: "Nature" } },
  { id: "magija", label: { sr: "Magija", en: "Magic" } },
];

/** Jeftini pa bolji modeli koji oživljavaju sliku (režim `image`). */
const PHOTO_MODELS = ["hailuo-23-fast", "grok-video-15-lite", "minimax-h3-max-turbo", "kling-3-turbo", "veo-31-lite"] as const;
/** Modeli koji prave scenu iz opisa (režim `text`). */
const TEXT_MODELS = ["minimax-h3-max-turbo", "grok-video-15-lite", "wan-30", "veo-31-lite", "kling-3"] as const;

const photo = (
  id: string,
  group: VideoEffectGroup,
  label: LocalizedText,
  hint: LocalizedText,
  template: string,
  extra: Partial<Pick<VideoEffect, "params" | "sound" | "combinable">> = {},
): VideoEffect => ({ id, group, label, hint, needs: "foto", template, models: PHOTO_MODELS, params: { duration: 6 }, combinable: true, ...extra });

const scene = (
  id: string,
  label: LocalizedText,
  hint: LocalizedText,
  template: string,
  sound: string,
): VideoEffect => ({ id, group: "nasi", label, hint, needs: "nista", template, models: TEXT_MODELS, params: { duration: 6 }, sound, combinable: false });

export const VIDEO_EFFECTS: readonly VideoEffect[] = [
  // ── Viralni ───────────────────────────────────────────────────────────────
  photo("u-oko", "viralni", { sr: "Ulet u oko", en: "Into the eye" }, { sr: "Kamera ulazi u oko i otvara se svemir.", en: "The camera enters the eye and a universe opens." },
    "{subject}, the camera dives into their eye and through the iris into a glowing cosmic universe", { combinable: false }),
  photo("glina", "viralni", { sr: "Pretvori u glinu", en: "Turn into clay" }, { sr: "Postaje figura od plastelina, kao stop-animacija.", en: "Becomes a plasticine figure, like stop-motion." },
    "{subject} gradually transforms into a handmade clay stop-motion figure with visible fingerprints in the clay"),
  photo("crtani", "viralni", { sr: "U crtani film", en: "Into a cartoon" }, { sr: "Prelazi u šareni crtani, i pozadina takođe.", en: "Turns into a colourful cartoon, background too." },
    "{subject} smoothly transforms into a colorful 2D cartoon character while the background turns into hand-drawn animation"),
  photo("akvarel", "viralni", { sr: "Rastopi u akvarel", en: "Melt into watercolour" }, { sr: "Sve se razlije u boje na mokrom papiru.", en: "Everything bleeds into colours on wet paper." },
    "{subject} dissolves into flowing watercolor paint on wet paper, colors bleeding softly"),
  photo("lebdenje", "viralni", { sr: "Lebdenje", en: "Levitate" }, { sr: "Polako se podiže i lebdi u vazduhu.", en: "Slowly lifts off and floats in the air." },
    "{subject} slowly lifts off the ground and floats in the air, hair and clothes drifting weightlessly"),
  photo("prah", "viralni", { sr: "Raspad u prah", en: "Turn to dust" }, { sr: "Za predmet ili pejzaž: raspline se u svetleću prašinu.", en: "For an object or a landscape: it melts into glowing dust." },
    "{subject} disintegrates into fine glowing dust particles carried away by the wind"),
  photo("vrtlog", "viralni", { sr: "Vrtlog", en: "Vortex" }, { sr: "Iza tebe se otvara vrtlog koji usisava prostor.", en: "A vortex opens behind and pulls the place in." },
    "a swirling vortex opens behind {subject} and pulls the surroundings into a spiral"),
  photo("portal", "viralni", { sr: "Portal", en: "Portal" }, { sr: "Pored tebe se otvara čarobni prolaz u drugi svet.", en: "A magic doorway to another world opens beside you." },
    "a glowing magic portal opens next to {subject}, revealing another world on the other side"),
  photo("kocke", "viralni", { sr: "Kockice se slažu", en: "Brick build" }, { sr: "Sklopi se od šarenih kockica za igru.", en: "Builds itself out of colourful toy bricks." },
    "{subject} is built piece by piece out of colorful toy bricks snapping together"),
  photo("mehurici", "viralni", { sr: "Mehurići", en: "Bubbles" }, { sr: "Ogromni mehurići od sapunice sa duginim bojama.", en: "Huge soap bubbles with rainbow colours." },
    "huge iridescent soap bubbles float around {subject}, catching rainbow light"),
  photo("neon", "viralni", { sr: "Neonski obrisi", en: "Neon outline" }, { sr: "Svetleće linije ocrtaju lik, sve ostalo potamni.", en: "Glowing lines trace the subject as the rest darkens." },
    "glowing neon outlines trace {subject} while the scene darkens around the bright lines"),
  photo("hologram", "viralni", { sr: "Hologram", en: "Hologram" }, { sr: "Treperi kao plavi hologram iz naučne fantastike.", en: "Flickers like a blue sci-fi hologram." },
    "{subject} flickers into a blue sci-fi hologram with scan lines and digital glitches"),
  photo("zamrznut", "viralni", { sr: "Zamrznut trenutak", en: "Frozen moment" }, { sr: "Vreme stane, kapi kiše vise u vazduhu.", en: "Time stops, raindrops hang in the air." },
    "time freezes around {subject}, raindrops and dust hang in the air as the camera circles"),
  // ── Naši ──────────────────────────────────────────────────────────────────
  scene("beograd-nocu", { sr: "Beograd noću", en: "Belgrade at night" }, { sr: "Neonska ulica, Brankov most i kiša koja se presijava.", en: "A neon street, Branko's Bridge and shimmering rain." },
    "{subject} walking along a neon-lit Belgrade street at night, Branko's Bridge glowing over the Sava river, light rain and reflections, cinematic",
    "city night ambience, light rain"),
  scene("slava", { sr: "Slava", en: "Slava feast" }, { sr: "Sveća, slavski kolač i žito, porodica za stolom.", en: "A candle, slava bread and wheat, family at the table." },
    "a warm Serbian slava family celebration, a lit beeswax candle, a decorated slava bread and boiled wheat on the table, {subject} raising a glass, cosy golden light",
    "family chatter, clinking glasses"),
  scene("kafana", { sr: "Kafana", en: "Kafana" }, { sr: "Tamburaši sviraju, dim i toplo svetlo.", en: "A tamburica band plays, smoke and warm light." },
    "a lively traditional Serbian kafana with a tamburica band playing, smoky warm light, {subject} singing along at a wooden table",
    "tamburica music and lively chatter"),
  scene("splav", { sr: "Splav na Savi", en: "River raft party" }, { sr: "Zalazak sunca, lampice i muzika na reci.", en: "Sunset, string lights and music on the river." },
    "{subject} dancing on a river club raft on the Sava at sunset, Belgrade skyline behind, string lights glowing",
    "upbeat music and water"),
  scene("kalemegdan", { sr: "Kalemegdan u zalazak", en: "Kalemegdan sunset" }, { sr: "Zidine tvrđave i ušće Save u Dunav.", en: "Fortress walls and where the Sava meets the Danube." },
    "{subject} standing on the Kalemegdan fortress walls at golden sunset, the confluence of the Sava and the Danube below",
    "wind and distant birds"),
  scene("zlatibor", { sr: "Sneg na Zlatiboru", en: "Snowy Zlatibor" }, { sr: "Planina, brvnare i pahulje.", en: "Mountain, log cabins and snowflakes." },
    "{subject} in a snowy Zlatibor mountain landscape with wooden cabins, pine trees and snowflakes falling softly",
    "soft wind and crunching snow"),
  scene("exit", { sr: "Exit svetla", en: "Festival lights" }, { sr: "Petrovaradin, gužva, laseri i bina.", en: "Petrovaradin, a crowd, lasers and a stage." },
    "a huge festival crowd at the Petrovaradin fortress at night, stage lights and lasers sweeping, {subject} jumping with the crowd",
    "festival crowd and electronic music"),
  scene("guca", { sr: "Truba i kolo", en: "Brass and kolo" }, { sr: "Trubači sviraju, igra se kolo.", en: "A brass band plays, people dance the kolo." },
    "a brass band playing trumpets at a summer village festival, {subject} dancing kolo in a circle, dust and sunlight",
    "Balkan brass band"),
  scene("nova-godina", { sr: "Nova godina u Knez Mihailovoj", en: "New Year in the old town" }, { sr: "Praznična svetla, sneg i vatromet.", en: "Festive lights, snow and fireworks." },
    "{subject} walking down Knez Mihailova street on New Year's Eve, festive lights overhead, snow and fireworks",
    "crowd cheering and fireworks"),
  scene("vasar", { sr: "Vašar", en: "Village fair" }, { sr: "Ringišpil, šećerna vuna i baloni.", en: "A carousel, cotton candy and balloons." },
    "a colorful village fair with a spinning carousel, cotton candy and balloons, {subject} laughing on the ride",
    "fairground music and laughter"),
  // ── Priroda ───────────────────────────────────────────────────────────────
  photo("latice", "priroda", { sr: "Kiša latica", en: "Petal rain" }, { sr: "Ružičaste latice padaju na povetarcu.", en: "Pink petals fall in a breeze." },
    "pink cherry blossom petals rain softly around {subject} in a gentle breeze"),
  photo("sneg", "priroda", { sr: "Počinje sneg", en: "Snowfall" }, { sr: "Počinje da pada sneg, inje se hvata.", en: "Snow starts falling and frost forms." },
    "soft snow starts falling around {subject} as frost forms on the surfaces"),
  photo("vatromet", "priroda", { sr: "Vatromet", en: "Fireworks" }, { sr: "Šareni vatromet na nebu iza.", en: "Colourful fireworks in the sky behind." },
    "colorful fireworks burst in the night sky behind {subject}"),
  photo("cvece", "priroda", { sr: "Cveće raste", en: "Flowers bloom" }, { sr: "Cveće niče i cveta oko tebe.", en: "Flowers sprout and bloom around you." },
    "flowers bloom and grow rapidly around {subject}, vines curling in time-lapse"),
  photo("magla", "priroda", { sr: "Jutarnja magla", en: "Morning fog" }, { sr: "Magla se valja, sunčevi zraci probijaju.", en: "Fog rolls in as sun rays break through." },
    "thick morning fog rolls in around {subject} while sun rays pierce through"),
  // ── Magija ────────────────────────────────────────────────────────────────
  photo("prasina", "magija", { sr: "Čarobna prašina", en: "Magic dust" }, { sr: "Zlatna svetlucava prašina kruži oko tebe.", en: "Golden sparkling dust swirls around you." },
    "sparkling golden magic dust swirls around {subject}"),
  photo("godisnja-doba", "magija", { sr: "Godišnja doba", en: "Four seasons" }, { sr: "Proleće, leto, jesen i zima za par sekundi.", en: "Spring, summer, autumn and winter in seconds." },
    "the seasons change around {subject} from spring to summer to autumn to winter", { params: { duration: 8 } }),
  photo("ozivi-staru", "magija", { sr: "Oživi staru fotku", en: "Bring an old photo to life" }, { sr: "Ljudi na staroj fotki trepnu i nasmeju se.", en: "People in an old photo blink and smile." },
    "{subject} comes to life inside the photo with subtle natural movement, blinking, breathing and a gentle smile", { combinable: false }),
];

export function videoEffectById(id: string | null | undefined): VideoEffect | undefined {
  if (!id) return undefined;
  return VIDEO_EFFECTS.find((effect) => effect.id === id);
}

export type CombineProblem = "isti-efekat" | "ne-spaja-se" | "razlicit-ulaz";

/** Zašto se dva efekta ne spajaju (ili `null` kad mogu). */
export function combineProblem(a: VideoEffect, b: VideoEffect): CombineProblem | null {
  if (a.id === b.id) return "isti-efekat";
  if (!a.combinable || !b.combinable) return "ne-spaja-se";
  if (a.needs !== b.needs) return "razlicit-ulaz";
  return null;
}

/**
 * „Spoji dva efekta": jedan klip u kojem prvi efekat prelazi u drugi. Šablon je
 * „prvi, then drugi" (drugi bez ponovljenog predmeta), modeli su zajednički (ili
 * modeli prvog), a trajanje je duže od oba - dva efekta traže vreme.
 */
export function combineEffects(a: VideoEffect, b: VideoEffect): VideoEffect | null {
  if (combineProblem(a, b) !== null) return null;
  const shared = a.models.filter((slug) => b.models.includes(slug));
  const second = b.template.replace("{subject}", "it");
  return {
    id: `${a.id}+${b.id}`,
    group: a.group,
    label: { sr: `${a.label.sr} + ${b.label.sr}`, en: `${a.label.en} + ${b.label.en}` },
    hint: { sr: `${a.hint.sr} Zatim: ${b.hint.sr}`, en: `${a.hint.en} Then: ${b.hint.en}` },
    needs: a.needs,
    template: `${a.template}, then ${second}`,
    models: shared.length > 0 ? shared : a.models,
    params: { duration: Math.max(8, a.params?.duration ?? 0, b.params?.duration ?? 0) },
    ...(a.sound || b.sound ? { sound: [a.sound, b.sound].filter(Boolean).join(", ") } : {}),
    combinable: false,
  };
}
