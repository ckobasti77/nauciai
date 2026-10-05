import type { LocalizedText } from "./i18n";

/**
 * Tekstovi radionice Cree (K01-16): objekti `{ sr, en }` po obrascu
 * `lib/studio-landing.ts`, da `lib/i18n.ts` ne raste. Nazivi oblasti i režima su
 * podaci ljuske (`lib/crea-shell.ts`), a kartice ciljeva u `lib/crea-goals.ts`.
 */
export const CREA_SHELL_COPY = {
  areaTabs: { sr: "Šta praviš", en: "What you are making" },
  modeTabs: { sr: "Način rada", en: "Way of working" },
  start: { sr: "Početak", en: "Start" },
  soonBadge: { sr: "uskoro", en: "soon" },
} satisfies Record<string, LocalizedText>;

export const CREA_START_COPY = {
  title: { sr: "Šta praviš danas?", en: "What are you making today?" },
  body: {
    sr: "Izaberi cilj. Crea otvara pravi alat, piše prvi opis i bira model. Sve to posle možeš da promeniš.",
    en: "Pick a goal. Crea opens the right tool, writes a first description and picks a model. You can change all of it afterwards.",
  },
} satisfies Record<string, LocalizedText>;

export const CREA_STAGE_COPY = {
  latest: { sr: "Poslednji rad", en: "Latest work" },
  emptyTitle: { sr: "Ovde stiže tvoj rad", en: "Your work lands here" },
  emptyDocked: {
    sr: "Napiši opis u polju levo i klikni dugme sa cenom.",
    en: "Write a description in the box on the left and click the button with the price.",
  },
  emptyFloating: {
    sr: "Napiši opis u polju na dnu ekrana i klikni dugme sa cenom.",
    en: "Write a description in the box at the bottom of the screen and click the button with the price.",
  },
  emptyGuest: {
    sr: "Prijavi se, napiši opis i klikni dugme sa cenom.",
    en: "Sign in, write a description and click the button with the price.",
  },
  open: { sr: "Otvori ceo prikaz", en: "Open full view" },
  noModels: {
    sr: "Nijedan model za ovaj način rada trenutno nije uključen. Ovo nije do tvog naloga - probaj drugi način rada ili kasnije.",
    en: "No model for this way of working is switched on right now. This is not about your account - try another one or come back later.",
  },
} satisfies Record<string, LocalizedText>;

export const CREA_SOON_COPY = {
  title: { sr: "Stiže uskoro", en: "Coming soon" },
  meanwhile: { sr: "Do tada probaj:", en: "Meanwhile, try:" },
} satisfies Record<string, LocalizedText>;

export const CREA_HISTORY_COPY = {
  title: { sr: "Istorija", en: "History" },
  allTitle: { sr: "Tvoji radovi", en: "Your work" },
  empty: {
    sr: "Još nema radova u ovoj radionici. Prvi koji napraviš pojaviće se ovde.",
    en: "No work in this workshop yet. The first one you make will appear here.",
  },
  emptyAll: {
    sr: "Još nema radova. Izaberi cilj i napravi prvi.",
    en: "No work yet. Pick a goal and make your first one.",
  },
  guest: {
    sr: "Kad se prijaviš, ovde se čuva sve što napraviš.",
    en: "Once you sign in, everything you make is kept here.",
  },
} satisfies Record<string, LocalizedText>;
