/**
 * Procenat kursa preveden u jednu toplu recenicu.
 *
 * Publika su pocetnici: gola brojka „12%" pored trake napretka je za njih pre prekor
 * nego podatak. Zato svaki opseg ima svoj glas — pocetak hrabri, sredina priznaje sto
 * je vec uradjeno, kraj slavi. Nijedna varijanta ne prekoreva i nijedna ne izmislja
 * rok; nista se ne racuna iz vremena, samo iz brojeva koje ekran ionako prikazuje.
 *
 * Ovde nema ni React-a ni prevoda u JSX-u: funkcija vraca ID prekretnice i gotov
 * srpski/engleski tekst, po uzoru na `lib/dashboard-first-run.ts`.
 */

import { serbianPlural } from "./course-catalog";

export type ProgressMilestone = "empty" | "started" | "halfway" | "almost" | "done";

export type ProgressInput = {
  completedLessons: number;
  totalLessons: number;
};

/**
 * Prekretnica se racuna iz BROJA lekcija, ne iz zaokruzenog procenta: kurs od tri
 * lekcije sa jednom zavrsenom je 33% i mora da bude „started", a ne „halfway".
 * „done" trazi da lekcija uopste ima — kurs bez lekcija nije zavrsen, on je prazan.
 */
export function progressMilestone({ completedLessons, totalLessons }: ProgressInput): ProgressMilestone {
  if (totalLessons <= 0 || completedLessons <= 0) return "empty";
  if (completedLessons >= totalLessons) return "done";

  const ratio = completedLessons / totalLessons;
  if (ratio >= 0.8) return "almost";
  if (ratio >= 0.5) return "halfway";
  return "started";
}

const COPY: Record<ProgressMilestone, { sr: (input: ProgressInput) => string; en: (input: ProgressInput) => string }> = {
  empty: {
    sr: () => "Prva lekcija je najteža — posle nje ide samo.",
    en: () => "The first lesson is the hard one — after that it rolls.",
  },
  started: {
    sr: ({ completedLessons }) =>
      completedLessons === 1
        ? "Prva lekcija je iza tebe. Lepo počinje."
        : `Već ${completedLessons} ${serbianPlural(completedLessons, { one: "lekcija", few: "lekcije", many: "lekcija" })} iza tebe.`,
    en: ({ completedLessons }) =>
      completedLessons === 1 ? "First lesson done. Good start." : `${completedLessons} lessons behind you already.`,
  },
  halfway: {
    sr: () => "Prešao/la si pola puta. Drži tempo.",
    en: () => "You are past halfway. Keep the pace.",
  },
  almost: {
    sr: ({ totalLessons, completedLessons }) => {
      const left = totalLessons - completedLessons;
      if (left === 1) return "Ostala je još jedna lekcija.";
      return `Ostalo je još ${left} ${serbianPlural(left, { one: "lekcija", few: "lekcije", many: "lekcija" })}.`;
    },
    en: ({ totalLessons, completedLessons }) => {
      const left = totalLessons - completedLessons;
      return left === 1 ? "One lesson left." : `${left} lessons left.`;
    },
  },
  done: {
    sr: () => "Kurs je završen. Svaka čast!",
    en: () => "Course finished. Well done!",
  },
};

/** Gotova recenica za traku napretka, na jeziku ekrana. */
export function progressEncouragement(locale: "sr" | "en", input: ProgressInput): string {
  const milestone = progressMilestone(input);
  return COPY[milestone][locale](input);
}
