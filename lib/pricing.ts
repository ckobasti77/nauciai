/**
 * REZERVNE cene planova. Od N1 izvor cena za landing „#pricing" je admin ekran
 * („Opšte informacije" → kartica „Cene", tabela `platformSettings`); ove
 * vrednosti se koriste samo kroz `STATIC_FALLBACK` u `lib/platform-settings.ts`
 * — kad reda u bazi još nema, kad je polje prazno ili kad Convex nije dostupan.
 *
 * Nema Stripe-a ni naplate u ovom koraku: cene su samo prikaz, CTA vodi na
 * registraciju/billing.
 */
export const PRICING = {
  basic: { eur: "9,99" },
  premium: { eur: "19,99" }, // placeholder — vlasnik menja
  /**
   * Jednokratna cena JEDNOG kursa — strana „/pretplata" (N6). `platformSettings`
   * (N1) nema polje za cenu kursa, pa se do njegovog uvođenja čita odavde. Ista
   * vrednost stoji u `priceLabel` svakog kursa u `lib/content.ts` (bedž na kartici);
   * kad se cene razdvoje po kursu, mesto za to je ovde, ne u komponenti.
   */
  course: { eur: "9,99" },
} as const;
