import type { Locale, LocalizedText, PluralForms } from "./i18n";

/**
 * Tekstovi IGRA-e (plan K01, ODLUKA 12): isti oblik kao `lib/crea-*-copy.ts`, van
 * `lib/i18n.ts`. Svaki korak ovde dopisuje svoj blok; sr je primaran, en sekundaran.
 */

export const IGRA_CELEBRATION_COPY = {
  dialogLabel: { sr: "Slavlje", en: "Celebration" },
  levelEyebrow: { sr: "Novi nivo", en: "New level" },
  badgeEyebrow: { sr: "Novi bedž", en: "New badge" },
  badgesEyebrow: { sr: "Novi bedževi", en: "New badges" },
  courseEyebrow: { sr: "Kurs završen", en: "Course completed" },
  summaryEyebrow: { sr: "Tvoj napredak do sada", en: "Your progress so far" },
  level: { sr: "Nivo", en: "Level" },
  continue: { sr: "Nastavi", en: "Continue" },
  close: { sr: "Zatvori", en: "Close" },
} satisfies Record<string, LocalizedText>;

export const IGRA_BADGE_FORMS: Record<Locale, PluralForms> = {
  sr: { one: "bedž", few: "bedža", many: "bedževa" },
  en: { one: "badge", few: "badges", many: "badges" },
};

export const IGRA_NEW_BADGE_FORMS: Record<Locale, PluralForms> = {
  sr: { one: "novi bedž", few: "nova bedža", many: "novih bedževa" },
  en: { one: "new badge", few: "new badges", many: "new badges" },
};
