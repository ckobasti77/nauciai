/**
 * Preporuke po POSLU, ne po imenu modela (SP1, tačka 5). Početnik ne zna šta
 * je „Nano Banana 2"; zna da hoće „tekst u slici". Ovaj sloj mu daje ulaz:
 * najviše četiri prečice po vrsti, svaka imenuje tačno jedan model.
 *
 * Koji model za koji posao NIJE izmišljeno - izvedeno je iz `taglineEn` reda
 * kataloga (v4), i svaki izbor je odbranjen u ODLUKAMA (STUDIO-PROGRESS.md).
 * Test tvrdi da svaki `slug` ovde postoji u katalogu i da mu se vrsta poklapa,
 * pa se prečica ka nepostojećem ili tuđem modelu ne provuče.
 */

import type { Locale } from "./i18n";
import type { StudioModel } from "./studio-models";
import type { StudioSectionKind } from "./studio-sections";

export type Recommendation = {
  /** Stabilan ključ (za React key i test), ne prikazuje se. */
  id: string;
  slug: string;
  labelSr: string;
  labelEn: string;
};

/**
 * Kurirana tabela. Redosled je redosled prikaza. Slugovi se biraju po jačini iz
 * kataloga:
 *  - image: gpt-image-2 „reads a long, precise brief best"; seedream-45 „for
 *    trying ideas fast"; nano-banana-pro „thinking image model" (najviši
 *    kvalitet slike); nano-banana-2 „great in-frame text".
 *  - video: minimax-h3 „the cheapest video with audio"; veo-31 „the best quality
 *    in the catalogue"; seedance-25 „up to 30 seconds in a single shot";
 *    gemini-omni „refine by talking to it".
 *  - audio: tts „the only voice that speaks Serbian"; music „a track from a
 *    description"; sfx „a short effect from a description"; stt „a recording into
 *    text, very cheap".
 */
const RECOMMENDATIONS: Record<StudioSectionKind, Recommendation[]> = {
  image: [
    { id: "reads-brief", slug: "gpt-image-2", labelSr: "Najbolje čita dug, precizan opis", labelEn: "Best at a long, precise brief" },
    { id: "cheapest", slug: "seedream-45", labelSr: "Najbrže i najjeftinije", labelEn: "Fastest and cheapest" },
    { id: "quality", slug: "nano-banana-pro", labelSr: "Najviši kvalitet", labelEn: "Highest quality" },
    { id: "text", slug: "nano-banana-2", labelSr: "Tekst u slici", labelEn: "Text in the image" },
  ],
  video: [
    { id: "cheapest", slug: "minimax-h3", labelSr: "Najjeftinije, sa zvukom", labelEn: "Cheapest, with audio" },
    { id: "quality", slug: "veo-31", labelSr: "Najviši kvalitet", labelEn: "Highest quality" },
    { id: "longest", slug: "seedance-25", labelSr: "Najduži snimak (do 30 s)", labelEn: "Longest clip (up to 30s)" },
    { id: "conversational", slug: "gemini-omni", labelSr: "Doteruješ razgovorom", labelEn: "Refine by talking" },
  ],
  audio: [
    { id: "serbian", slug: "tts", labelSr: "Govor na srpskom", labelEn: "Speech in Serbian" },
    { id: "music", slug: "music", labelSr: "Muzika iz opisa", labelEn: "Music from a description" },
    { id: "sfx", slug: "sfx", labelSr: "Zvučni efekat", labelEn: "Sound effect" },
    { id: "transcribe", slug: "stt", labelSr: "Snimak u tekst", labelEn: "Recording to text" },
  ],
};

export function recommendationLabel(rec: Recommendation, locale: Locale): string {
  return locale === "sr" ? rec.labelSr : rec.labelEn;
}

/**
 * Preporuke za datu vrstu, ali SAMO one čiji je model stvarno u ponudi (admin ga
 * nije ugasio) i te vrste. Prečica ka ugašenom modelu bi vodila u prazno, pa se
 * ćutke izostavlja - bolje tri prečice nego jedna slepa.
 */
export function recommendationsFor(kind: StudioSectionKind, models: StudioModel[]): Recommendation[] {
  const bySlug = new Map(models.map((model) => [model.slug, model]));

  return RECOMMENDATIONS[kind].filter((rec) => {
    const model = bySlug.get(rec.slug);
    return model !== undefined && model.kind === kind;
  });
}

/** Ceo katalog preporuka - za test koji tvrdi integritet svih slugova. */
export function allRecommendations(): Array<Recommendation & { kind: StudioSectionKind }> {
  return (Object.keys(RECOMMENDATIONS) as StudioSectionKind[]).flatMap((kind) =>
    RECOMMENDATIONS[kind].map((rec) => ({ ...rec, kind })),
  );
}
