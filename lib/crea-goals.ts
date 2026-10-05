import type { LocalizedText } from "./i18n";
import { creaShellQuery, type CreaArea, type CreaIconName, type CreaModeId } from "./crea-shell";

/**
 * „Šta praviš danas?" (U2, K03): početni ekran Cree po CILJU, ne po modelu.
 * Početnik zna da hoće „reklamu za lokal", ne „GPT Image 2". Kartica vodi u tačnu
 * oblast i režim, sa popunjenim opisom i preporučenim modelom - modeli ostaju
 * skriveni iza izbora u formi („Napredno").
 *
 * Kuka za recepte (K15): kad kartica dobije `recipeId`, `goalHref` vodi u recept
 * (`?recept=`) umesto u golu formu. Test tvrdi da su oblast, režim, model,
 * ulazni režim i parametri stvarni (postoje u katalogu i pripadaju režimu).
 */
export type CreaGoal = {
  id: string;
  area: CreaArea;
  mode: CreaModeId;
  icon: CreaIconName;
  title: LocalizedText;
  hint: LocalizedText;
  /** Popunjava polje za opis. */
  prompt?: LocalizedText;
  /** Preporučen model; mora da postoji u katalogu i da ga režim nudi. */
  modelSlug?: string;
  /** Ulazni režim kojim se forma otvara (npr. `image` za „Oživi fotku"). */
  inputMode?: string;
  /** Početne vrednosti kontrola (ključ mora da postoji u `paramSpec`-u modela). */
  params?: Record<string, string | number | boolean>;
  /** K15: kad postoji, kartica vodi u recept (`?recept=`). */
  recipeId?: string;
  /** Kartice koje vode u lokalni alat (K04+). */
  toolId?: string;
};

export const CREA_GOALS: readonly CreaGoal[] = [
  {
    id: "profilna",
    area: "slika",
    mode: "izmeni",
    icon: "UserRound",
    title: { sr: "Profilna slika", en: "Profile picture" },
    hint: { sr: "Od tvoje fotke, za CV ili LinkedIn", en: "From your own photo, for a CV or LinkedIn" },
    prompt: {
      sr: "Napravi profesionalnu profilnu sliku od moje fotografije: isto lice, meko dnevno svetlo, mirna svetla pozadina, kadar od ramena naviše.",
      en: "Make a professional profile picture from my photo: the same face, soft daylight, a calm light background, framed from the shoulders up.",
    },
    modelSlug: "nano-banana-pro",
    recipeId: "profilna",
  },
  {
    id: "reklama-lokal",
    area: "slika",
    mode: "napravi",
    icon: "Megaphone",
    title: { sr: "Reklama za lokal", en: "Ad for a local shop" },
    hint: { sr: "Plakat ili objava sa tekstom koji se čita", en: "A poster or post with readable text" },
    prompt: {
      sr: "Plakat za mali kafić: šolja kafe na drvenom stolu, jutarnje svetlo kroz prozor, veliki natpis „Jutarnja kafa 150 din”, topli tonovi.",
      en: "A poster for a small café: a cup of coffee on a wooden table, morning light through the window, a big headline “Morning coffee €1.50”, warm tones.",
    },
    modelSlug: "gpt-image-2",
    recipeId: "instagram-objava",
  },
  {
    id: "tiktok",
    area: "video",
    mode: "napravi",
    icon: "Smartphone",
    title: { sr: "TikTok video", en: "TikTok video" },
    hint: { sr: "Uspravan klip sa zvukom", en: "An upright clip with sound" },
    prompt: {
      sr: "Uspravan video: devojka otvara paket, iznenađeno se nasmeje i pokaže proizvod u kameru, kadar iz ruke, žive boje.",
      en: "An upright video: a girl opens a parcel, laughs in surprise and shows the product to the camera, handheld shot, vivid colours.",
    },
    modelSlug: "minimax-h3",
    params: { aspect_ratio: "9:16" },
  },
  {
    id: "podkast",
    area: "zvuk",
    mode: "govor",
    icon: "Podcast",
    title: { sr: "Podkast", en: "Podcast" },
    hint: { sr: "Dva glasa razgovaraju o tvojoj temi", en: "Two voices talk about your topic" },
    prompt: {
      sr: "Ana: Dobro došli u naš podkast! Danas pričamo o tome kako AI pomaže malim firmama.\nMarko: Tako je, Ana. Krenimo od najjednostavnijeg primera: odgovaranja na poruke kupaca.",
      en: "Ana: Welcome to our podcast! Today we talk about how AI helps small businesses.\nMarko: That's right, Ana. Let's start with the simplest example: answering customer messages.",
    },
    modelSlug: "dialogue",
  },
  {
    id: "logo",
    area: "slika",
    mode: "napravi",
    icon: "PenTool",
    title: { sr: "Logo", en: "Logo" },
    hint: { sr: "Jednostavan znak sa imenom firme", en: "A simple mark with the business name" },
    prompt: {
      sr: "Jednostavan logo za pekaru „Zlatni klas”: klas pšenice i ime ispod, ravne boje, bela pozadina, čiste linije.",
      en: "A simple logo for the “Golden Ear” bakery: an ear of wheat with the name below, flat colours, white background, clean lines.",
    },
    modelSlug: "nano-banana-2",
    recipeId: "logo",
  },
  {
    id: "ozvuci-video",
    area: "zvuk",
    mode: "efekti",
    icon: "Volume2",
    title: { sr: "Ozvuči video", en: "Add sound to a video" },
    hint: { sr: "Okači nemi snimak, dobij zvuke koji ga prate", en: "Upload a silent clip, get sounds that match it" },
    prompt: {
      sr: "Zvuci koji prate snimak: koraci po šljunku, vetar u krošnjama, daleki saobraćaj.",
      en: "Sounds that follow the clip: footsteps on gravel, wind in the trees, distant traffic.",
    },
    modelSlug: "kling-v2a",
  },
  {
    id: "pozivnica",
    area: "slika",
    mode: "napravi",
    icon: "PartyPopper",
    title: { sr: "Pozivnica", en: "Invitation" },
    hint: { sr: "Za slavu, rođendan ili svadbu", en: "For a birthday, party or wedding" },
    prompt: {
      sr: "Pozivnica za rođendan: natpis „Marija puni 30!”, ispod „subota, 20 h”, konfete i baloni, vesele pastelne boje.",
      en: "A birthday invitation: the headline “Maria turns 30!”, below it “Saturday, 8 pm”, confetti and balloons, cheerful pastel colours.",
    },
    modelSlug: "nano-banana-2",
    recipeId: "pozivnica-rodjendan",
  },
  {
    id: "stara-fotka",
    area: "slika",
    mode: "izmeni",
    icon: "History",
    title: { sr: "Stara fotka", en: "Old photo" },
    hint: { sr: "Okači sliku, vratimo joj sjaj", en: "Upload it and we bring it back to life" },
    prompt: {
      sr: "Vrati ovu staru fotografiju: ukloni ogrebotine i fleke, izoštri lica, zadrži prirodne boje i duh tog vremena.",
      en: "Restore this old photograph: remove scratches and stains, sharpen the faces, keep natural colours and the feel of the era.",
    },
    modelSlug: "nano-banana-pro",
    recipeId: "stara-fotka",
  },
  {
    id: "ozivi-fotku",
    area: "video",
    mode: "napravi",
    icon: "Film",
    title: { sr: "Oživi fotku", en: "Bring a photo to life" },
    hint: { sr: "Slika postaje kratak video", en: "A picture becomes a short video" },
    prompt: {
      sr: "Oživi ovu fotografiju: ljudi se blago pomeraju i osmehuju, kamera polako prilazi.",
      en: "Bring this photo to life: the people move gently and smile, the camera slowly moves closer.",
    },
    modelSlug: "veo-31-lite",
    inputMode: "image",
  },
  {
    id: "muzika-video",
    area: "zvuk",
    mode: "muzika",
    icon: "Music",
    title: { sr: "Muzika za video", en: "Music for a video" },
    hint: { sr: "Numera po tvom raspoloženju", en: "A track that matches your mood" },
    prompt: {
      sr: "Vedra akustična gitara za letnji video sa putovanja, lagan ritam, bez vokala.",
      en: "Bright acoustic guitar for a summer travel video, easy rhythm, no vocals.",
    },
    modelSlug: "music",
  },
  {
    id: "srpski-glas",
    area: "zvuk",
    mode: "govor",
    icon: "Mic",
    title: { sr: "Srpski glas", en: "Serbian voice" },
    hint: { sr: "Tekst postaje govor sa prirodnim izgovorom", en: "Text becomes speech with natural Serbian" },
    prompt: {
      sr: "Dobro došli u našu pekaru! Svakog jutra od šest sati čekaju vas topao hleb, kifle i burek.",
      en: "Dobro došli u našu pekaru! Svakog jutra od šest sati čekaju vas topao hleb, kifle i burek.",
    },
    // K22: Gemini govor je osnovni srpski glas (5 kr na 1 000 znakova; ElevenLabs 22 kr).
    modelSlug: "gemini-tts",
  },
  {
    id: "ukloni-pozadinu",
    area: "slika",
    mode: "izmeni",
    icon: "Eraser",
    title: { sr: "Ukloni pozadinu", en: "Remove the background" },
    hint: { sr: "Besplatno, na tvom uređaju", en: "Free, on your own device" },
    toolId: "slika.pozadina",
  },
];

export function creaGoalById(id: string | null): CreaGoal | undefined {
  return id ? CREA_GOALS.find((goal) => goal.id === id) : undefined;
}

/**
 * Query string (sa `?`) za karticu: oblast, režim, cilj i preporučen model. Uz
 * `current` se čuvaju projekat i lekcija iz trenutne adrese. Recept (K15) i alat
 * (K04) idu u svoj parametar.
 */
export function goalHref(goal: CreaGoal, current: URLSearchParams = new URLSearchParams()): string {
  const query = creaShellQuery(
    {
      area: goal.area,
      mode: goal.mode,
      goal: goal.id,
      model: goal.modelSlug ?? null,
      tool: goal.toolId ?? null,
      recipe: goal.recipeId ?? null,
    },
    current,
  );
  return `?${query}`;
}
