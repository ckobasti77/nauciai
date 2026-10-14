import type { LocalizedText } from "./i18n";

// Izdvojeno iz `lib/igra-copy.ts` (K28): granice greške (`error.tsx`) i traka bez mreže
// uvoze samo ove tekstove, a Turbopack ne odbacuje neiskorišćene izvoze - sa celim
// `igra-copy` granica greške Cree je nosila drugu kopiju tog modula u početnom JS-u.

/**
 * Stanja unutar aplikacije (K23, plan §6.10): zajednički podrazumevani tekstovi. Kratki,
 * topli, bez krivice korisnika; svako stanje kaže šta se desilo i šta sad.
 */
export const IGRA_STATE_COPY = {
  prazno: {
    title: { sr: "Ovde je za sada prazno", en: "Nothing here yet" },
    body: { sr: "Čim se nešto pojavi, videćeš ga ovde.", en: "As soon as something shows up, you will see it here." },
  },
  greska: {
    title: { sr: "Nešto je zastalo", en: "Something stalled" },
    body: { sr: "To nije do tebe. Tvoj napredak je sačuvan, pokušaj ponovo.", en: "That is not on you. Your progress is saved, please try again." },
    cta: { sr: "Pokušaj ponovo", en: "Try again" },
  },
  "404": {
    title: { sr: "Ove strane nema", en: "This page is not here" },
    body: { sr: "Možda je premeštena ili je veza stara. Vrati se na tablu pa kreni odatle.", en: "It may have moved, or the link is old. Head back to your dashboard and start from there." },
    cta: { sr: "Nazad na tablu", en: "Back to the dashboard" },
  },
  ucitavanje: {
    title: { sr: "Učitava se", en: "Loading" },
    body: { sr: "Samo trenutak.", en: "Just a moment." },
  },
  offline: {
    title: { sr: "Nema interneta", en: "You are offline" },
    body: { sr: "Čim se veza vrati, nastavljamo. Ništa nije izgubljeno.", en: "As soon as the connection is back, we carry on. Nothing is lost." },
    cta: { sr: "Pokušaj ponovo", en: "Try again" },
  },
  zakljucano: {
    title: { sr: "Ovo je još zaključano", en: "This is still locked" },
    body: { sr: "Otvoriće se kad bude spremno.", en: "It opens up when it is ready." },
  },
  uskoro: {
    title: { sr: "Stiže uskoro", en: "Coming soon" },
    body: { sr: "Još radimo na ovome. Svrati ponovo malo kasnije.", en: "We are still working on this. Come back a little later." },
  },
} satisfies Record<string, { title: LocalizedText; body: LocalizedText; cta?: LocalizedText }>;
