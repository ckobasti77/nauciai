/**
 * Cene planova za landing „#pricing". BASIC je aktuelna cena; PREMIUM je
 * PLACEHOLDER — vlasnik ovde menja iznose kad se uvede pravi Premium plan.
 * Nema Stripe-a ni naplate u ovom koraku: cene su samo prikaz, CTA vodi na
 * registraciju/billing.
 */
export const PRICING = {
  basic: { eur: "9,99" },
  premium: { eur: "19,99" }, // placeholder — vlasnik menja
} as const;
