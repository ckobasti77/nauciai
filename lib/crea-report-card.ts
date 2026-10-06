import { CREA_ALBUM_PAGES } from "./crea-album";
import { CREA_MINI_LESSONS } from "./crea-mini-lessons";
import type { LocalizedText } from "./i18n";

/**
 * Đačka knjižica (Crea K26, G5): veštine kao školski predmeti sa ocenama.
 * Ocena raste sa udelom probanih tehnika predmeta (sličice albuma); 1 se ne daje -
 * predmet koji još nisi probao je „neocenjen", kao na početku polugodišta.
 */

export type ReportSubjectId = "slika" | "video" | "zvuk" | "recepti" | "ucenje";
export type ReportGrade = 2 | 3 | 4 | 5;

export const REPORT_SUBJECTS: ReadonlyArray<{ id: ReportSubjectId; label: LocalizedText }> = [
  { id: "slika", label: { sr: "Slika", en: "Image" } },
  { id: "video", label: { sr: "Video", en: "Video" } },
  { id: "zvuk", label: { sr: "Zvuk", en: "Sound" } },
  { id: "recepti", label: { sr: "Recepti", en: "Recipes" } },
  { id: "ucenje", label: { sr: "Mini-lekcije", en: "Mini-lessons" } },
];

export const GRADE_LABEL: Record<ReportGrade, LocalizedText> = {
  2: { sr: "dovoljan", en: "sufficient" },
  3: { sr: "dobar", en: "good" },
  4: { sr: "vrlo dobar", en: "very good" },
  5: { sr: "odličan", en: "excellent" },
};

/** Kojem predmetu sličica pripada (prvi koraci ne ulaze u ocene). */
export function subjectOfSticker(stickerId: string): ReportSubjectId | null {
  if (stickerId.startsWith("alat:slika.") || stickerId.startsWith("stil:")) return "slika";
  if (stickerId.startsWith("alat:video.") || stickerId.startsWith("kamera:") || stickerId.startsWith("efekat:")) return "video";
  if (stickerId.startsWith("alat:zvuk.") || stickerId.startsWith("glas:")) return "zvuk";
  if (stickerId.startsWith("recept:")) return "recepti";
  return null;
}

const SUBJECT_TOTALS: Record<ReportSubjectId, number> = (() => {
  const totals: Record<ReportSubjectId, number> = { slika: 0, video: 0, zvuk: 0, recepti: 0, ucenje: CREA_MINI_LESSONS.length };
  for (const page of CREA_ALBUM_PAGES) {
    for (const sticker of page.stickers) {
      const subject = subjectOfSticker(sticker.id);
      if (subject) totals[subject] += 1;
    }
  }
  return totals;
})();

export function subjectTotal(subject: ReportSubjectId): number {
  return SUBJECT_TOTALS[subject];
}

/** Udeo → ocena: bar jedna tehnika 2, 10 % 3, 25 % 4, 45 % 5. */
export function gradeFor(done: number, total: number): ReportGrade | null {
  if (done <= 0 || total <= 0) return null;
  const share = done / total;
  if (share >= 0.45) return 5;
  if (share >= 0.25) return 4;
  if (share >= 0.1) return 3;
  return 2;
}

/** Opšti uspeh po školskom pravilu: 4,50 odličan, 3,50 vrlo dobar, 2,50 dobar. */
export function overallGrade(grades: readonly (ReportGrade | null)[]): { average: number; grade: ReportGrade } | null {
  const given = grades.filter((g): g is ReportGrade => g !== null);
  if (given.length === 0) return null;
  const average = Math.round((given.reduce((sum, g) => sum + g, 0) / given.length) * 100) / 100;
  const grade: ReportGrade = average >= 4.5 ? 5 : average >= 3.5 ? 4 : average >= 2.5 ? 3 : 2;
  return { average, grade };
}

export type ReportConduct = "primerno" | "vrlo-dobro" | "dobro";

export const CONDUCT_LABEL: Record<ReportConduct, LocalizedText> = {
  primerno: { sr: "primerno", en: "exemplary" },
  "vrlo-dobro": { sr: "vrlo dobro", en: "very good" },
  dobro: { sr: "dobro", en: "good" },
};

/** Vladanje = najduži niz dana (redovnost). */
export function conductFor(bestStreak: number): ReportConduct {
  if (bestStreak >= 30) return "primerno";
  if (bestStreak >= 7) return "vrlo-dobro";
  return "dobro";
}

export type ReportCard = {
  subjects: Array<{ id: ReportSubjectId; done: number; total: number; grade: ReportGrade | null }>;
  overall: { average: number; grade: ReportGrade } | null;
  conduct: ReportConduct;
  stickers: number;
};

export function buildReportCard(input: { stickerIds: readonly string[]; lessonsDone: number; bestStreak: number }): ReportCard {
  const done: Record<ReportSubjectId, number> = { slika: 0, video: 0, zvuk: 0, recepti: 0, ucenje: Math.min(input.lessonsDone, SUBJECT_TOTALS.ucenje) };
  for (const id of new Set(input.stickerIds)) {
    const subject = subjectOfSticker(id);
    if (subject) done[subject] += 1;
  }
  const subjects = REPORT_SUBJECTS.map(({ id }) => ({ id, done: done[id], total: SUBJECT_TOTALS[id], grade: gradeFor(done[id], SUBJECT_TOTALS[id]) }));
  return {
    subjects,
    overall: overallGrade(subjects.map((s) => s.grade)),
    conduct: conductFor(input.bestStreak),
    stickers: new Set(input.stickerIds).size,
  };
}
