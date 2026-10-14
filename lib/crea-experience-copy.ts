import type { CreaWaitKind, CreaWaitPhase } from "./crea-wait";
import type { LocalizedText } from "./i18n";

/**
 * Tekstovi „doživljaja" Cree (K25): ekran čekanja (U3), otkrivanje (U4), maskota (U5),
 * „Dok čekaš, nauči" (U6) i inspiracija (U11). Isti obrazac kao `lib/crea-copy.ts`.
 */

export const CREA_WAIT_STEP_LABEL: Record<CreaWaitPhase, LocalizedText> = {
  red: { sr: "U redu", en: "Queued" },
  crta: { sr: "Crta", en: "Sketching" },
  boji: { sr: "Boji", en: "Colouring" },
  gotovo: { sr: "Gotovo", en: "Done" },
};

/** Šta se dešava u koraku, po vrsti rada (metafora sveske ostaje ista za sve tri). */
export const CREA_WAIT_STEP_DETAIL: Record<CreaWaitPhase, Record<CreaWaitKind, LocalizedText>> = {
  red: {
    image: { sr: "Čeka slobodnu olovku", en: "Waiting for a free pencil" },
    video: { sr: "Čeka slobodnu olovku", en: "Waiting for a free pencil" },
    audio: { sr: "Čeka slobodnu olovku", en: "Waiting for a free pencil" },
  },
  crta: {
    image: { sr: "Crea crta skicu", en: "Crea is sketching" },
    video: { sr: "Crea slaže kadrove", en: "Crea is laying out the shots" },
    audio: { sr: "Crea piše note", en: "Crea is writing the notes" },
  },
  boji: {
    image: { sr: "Dodaje boje i svetlo", en: "Adding colour and light" },
    video: { sr: "Pokreće i boji kadrove", en: "Animating and colouring the shots" },
    audio: { sr: "Miksa zvuk", en: "Mixing the sound" },
  },
  gotovo: {
    image: { sr: "Stiže!", en: "Here it comes!" },
    video: { sr: "Stiže!", en: "Here it comes!" },
    audio: { sr: "Stiže!", en: "Here it comes!" },
  },
};

export const CREA_WAIT_COPY = {
  steps: { sr: "Koraci izrade", en: "Progress steps" },
  place: { sr: "Mesto u redu: {n}", en: "Place in queue: {n}" },
  typicalHistory: { sr: "Tvoji raniji radovi ovim modelom: {t}", en: "Your earlier works with this model: {t}" },
  typicalKind: { sr: "Obično traje {t}", en: "Usually takes {t}" },
  elapsed: { sr: "Proteklo", en: "Elapsed" },
  night: { sr: "Noćna tura - stiže do jutra.", en: "Night run - arrives by morning." },
  sketchLabel: { sr: "Olovka crta skicu dok Crea radi", en: "A pencil sketches while Crea works" },
} satisfies Record<string, LocalizedText>;

export const CREA_LEARN_COPY = {
  title: { sr: "Dok čekaš, nauči", en: "While you wait, learn" },
  tip: { sr: "Savet", en: "Tip" },
  quiz: { sr: "Pitanje", en: "Quiz" },
  next: { sr: "Sledeće", en: "Next" },
  pause: { sr: "Zaustavi smenu saveta", en: "Pause the tips" },
  resume: { sr: "Nastavi smenu saveta", en: "Resume the tips" },
  correct: { sr: "Tačno!", en: "Correct!" },
  wrong: { sr: "Nije baš.", en: "Not quite." },
  answerIs: { sr: "Tačan odgovor: {a}.", en: "Correct answer: {a}." },
} satisfies Record<string, LocalizedText>;

export const CREA_MASCOT_COPY = {
  // Postojeća 3D maskota je Robi iz IGRA ekipe (K16, plan K14 ODLUKA 11).
  label: { sr: "Robi", en: "Robi" },
} satisfies Record<string, LocalizedText>;

export const CREA_REVEAL_COPY = {
  cassette: { sr: "Crea · zvuk", en: "Crea · sound" },
} satisfies Record<string, LocalizedText>;

export const CREA_INSPIRATION_COPY = {
  title: { sr: "Inspiracija", en: "Inspiration" },
  body: { sr: "Primeri šta ovde možeš da napraviš - i tačno kako.", en: "Examples of what you can make here - and exactly how." },
  makeLikeThis: { sr: "Napravi ovako", en: "Make it like this" },
  howMade: { sr: "Kako je napravljeno", en: "How it was made" },
  back: { sr: "Nazad na primer", en: "Back to the example" },
  model: { sr: "Model", en: "Model" },
  description: { sr: "Opis", en: "Description" },
  parts: { sr: "Delovi opisa:", en: "Parts of the description:" },
} satisfies Record<string, LocalizedText>;
