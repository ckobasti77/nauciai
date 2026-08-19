import type { Locale } from "./i18n";

/**
 * Gornja granica dužine prompta. Ista vrednost stoji u
 * `convex/creditsCore.ts` (`MAX_PROMPT_LENGTH`), koju `createJob` stvarno
 * proverava - ovde se ne uvozi da moderacijski rečnik iz tog modula ne bi
 * ušao u klijentski bundle. Da vrednosti ne bi razišle, `studio-messages.test.ts`
 * uvozi obe i tvrdi da su jednake.
 */
export const PROMPT_MAX_LENGTH = 2000;

/**
 * Svaka greška `createJob`-a ima svoju ljudsku rečenicu i predlog šta dalje;
 * sirov kod se nikad ne prikazuje. Convex poruku umota u "[CONVEX
 * M(studio:createJob)] ... Uncaught Error: DNEVNI_LIMIT at handler ...", pa se
 * kod TRAŽI u tekstu, ne poredi sa njim. Redosled je bitan: specifičnije pre
 * opštijeg (`DNEVNI_LIMIT_TROSKA` pre `DNEVNI_LIMIT`).
 */
const CREATE_JOB_ERROR_MESSAGES: Array<[string, { sr: string; en: string }]> = [
  [
    "NEISPRAVAN_PROMPT:PRAZAN_PROMPT",
    { sr: "Napiši prompt pre nego što pokreneš generaciju.", en: "Write a prompt before generating." },
  ],
  [
    "NEISPRAVAN_PROMPT:PREDUGACAK_PROMPT",
    {
      sr: `Prompt je duži od ${PROMPT_MAX_LENGTH} znakova. Skrati ga i pokušaj ponovo.`,
      en: `The prompt is longer than ${PROMPT_MAX_LENGTH} characters. Shorten it and try again.`,
    },
  ],
  [
    "NEISPRAVAN_PROMPT:ZABRANJEN_POJAM",
    {
      sr: "Prompt sadrži pojam koji Studio ne generiše. Izmeni ga i pokušaj ponovo.",
      en: "The prompt contains a term the Studio does not generate. Edit it and try again.",
    },
  ],
  [
    "NEISPRAVAN_PROMPT",
    { sr: "Prompt nije prihvaćen. Izmeni ga i pokušaj ponovo.", en: "The prompt was not accepted. Edit it and try again." },
  ],
  [
    "DNEVNI_LIMIT_TROSKA",
    {
      sr: "Dostigao si dnevni limit potrošnje u Studiju. Krediti su ti ostali; nastavi sutra.",
      en: "You have reached the Studio's daily spending limit. Your credits are untouched; continue tomorrow.",
    },
  ],
  [
    "DNEVNI_LIMIT",
    {
      sr: "Dostigao si dnevni limit generacija. Nastavi sutra - krediti ostaju na nalogu.",
      en: "You have reached the daily generation limit. Continue tomorrow - your credits stay on the account.",
    },
  ],
  [
    "MODEL_NEDOSTUPAN",
    {
      sr: "Ovaj model trenutno nije dostupan. Izaberi drugi iz liste.",
      en: "This model is currently unavailable. Pick another one from the list.",
    },
  ],
  [
    "NEDOVOLJNO_KREDITA",
    {
      sr: "Nemaš dovoljno kredita za ovu generaciju. Dopuni ih pa pokušaj ponovo.",
      en: "You do not have enough credits for this generation. Top up and try again.",
    },
  ],
  [
    "PREVISE_POSLOVA",
    {
      sr: "Sačekaj da se završi trenutna generacija - najviše tri posla mogu da rade istovremeno.",
      en: "Wait for the current generation to finish - at most three jobs can run at once.",
    },
  ],
  [
    "STUDIO_PAUZIRAN",
    {
      sr: "Studio je privremeno pauziran. Krediti ti ostaju na nalogu, probaj kasnije.",
      en: "The Studio is paused for now. Your credits stay on the account; try again later.",
    },
  ],
  [
    "NIJE_UPISAN",
    {
      sr: "Studio je otvoren za polaznike kurseva. Upiši se na kurs pa se vrati.",
      en: "The Studio is open to course students. Enroll in a course and come back.",
    },
  ],
  [
    // Dugme "Otvori u Studiju" (P9) uvek šalje oboje zajedno, pa je ovo
    // nedostižno kroz normalnu upotrebu - ali link se može ručno izmeniti.
    "ZADATAK_BEZ_LEKCIJE",
    {
      sr: "Zadatak zahteva i lekciju. Otvori Studio direktno iz zadatka u lekciji i pokušaj ponovo.",
      en: "The task needs its lesson context. Open the Studio from the task in the lesson and try again.",
    },
  ],
  [
    "ZADATAK_NIJE_U_LEKCIJI",
    {
      sr: "Ovaj zadatak ne pripada toj lekciji. Otvori Studio ponovo iz zadatka i pokušaj opet.",
      en: "This task does not belong to that lesson. Open the Studio again from the task and try again.",
    },
  ],
  [
    "NEISPRAVNO_TRAJANJE",
    {
      sr: "Trajanje koje si zadao nije dozvoljeno za ovaj model. Vrati ga na podrazumevanu vrednost i pokušaj ponovo.",
      en: "The duration you set is not allowed for this model. Reset it to the default and try again.",
    },
  ],
  [
    "NEISPRAVNI_PARAMETRI",
    {
      sr: "Podešavanja nisu ispravna. Osveži stranicu i pokušaj ponovo.",
      en: "The settings are not valid. Refresh the page and try again.",
    },
  ],
];

export function studioErrorMessage(raw: string, locale: Locale): string {
  for (const [code, message] of CREATE_JOB_ERROR_MESSAGES) {
    if (raw.includes(code)) return message[locale];
  }

  return locale === "sr"
    ? "Generacija nije pokrenuta. Pokušaj ponovo za koji trenutak."
    : "The generation did not start. Try again in a moment.";
}

/**
 * `deleteJob` (`convex/studio.ts`) baca dva imenovana koda; sirov kod se
 * nikad ne prikazuje, isti obrazac kao `studioErrorMessage`.
 */
export function deleteJobErrorMessage(raw: string, locale: Locale): string {
  if (raw.includes("POSAO_U_TOKU")) {
    return locale === "sr"
      ? "Posao je još u obradi - sačekaj da se završi pre brisanja."
      : "The job is still in progress - wait for it to finish before deleting.";
  }
  if (raw.includes("POSAO_POVEZAN_SA_LEKCIJOM")) {
    return locale === "sr"
      ? "Ova generacija je dokaz za zadatak u lekciji i ne može da se obriše odavde."
      : "This generation is evidence for a lesson task and cannot be deleted from here.";
  }
  return locale === "sr" ? "Brisanje nije uspelo. Pokušaj ponovo." : "Delete failed. Try again.";
}

export type EmptyState = {
  title: Record<Locale, string>;
  body: Record<Locale, string>;
  cta: Record<Locale, string>;
};

/**
 * Prazna stanja Studija na jednom mestu (rules-day.md: "Prazna stanja se
 * pišu, ne zaboravljaju"). Svako ima naslov, rečenicu i sledeći korak - nijedno
 * ne staje na praznom ekranu bez predloga šta dalje.
 */
export const STUDIO_PAUSED: EmptyState = {
  title: { sr: "Studio je pauziran", en: "The Studio is paused" },
  body: {
    sr: "Privremeno smo zaustavili generisanje. Krediti ti ostaju na nalogu i ništa se ne troši dok Studio ne proradi.",
    en: "Generation is paused for now. Your credits stay on the account and nothing is spent until the Studio is back.",
  },
  cta: { sr: "Pogledaj svoje kredite", en: "See your credits" },
};

export const STUDIO_NOT_ENROLLED: EmptyState = {
  title: { sr: "Studio je za polaznike", en: "The Studio is for students" },
  body: {
    sr: "Generisanje se otključava upisom na kurs. Krediti koje već imaš te čekaju.",
    en: "Generation unlocks when you enrol in a course. The credits you already have will be waiting.",
  },
  cta: { sr: "Pogledaj kurseve", en: "Browse courses" },
};

export const STUDIO_NO_GENERATIONS: EmptyState = {
  title: { sr: "Još nemaš nijednu generaciju", en: "No generations yet" },
  body: {
    sr: "Studio je tvoj alat za slike: napišeš opis, izabereš model i platiš kreditima tačno onoliko koliko piše na dugmetu. Gotova slika ostaje ovde.",
    en: "The Studio is your image tool: write a description, pick a model, and pay exactly what the button says. The finished image stays here.",
  },
  cta: { sr: "Ubaci prvi prompt", en: "Use a starter prompt" },
};

export const CREDITS_NO_BALANCE: EmptyState = {
  title: { sr: "Nemaš kredite", en: "You have no credits" },
  body: {
    sr: "Još nemaš kredite, pa Studio ne može ništa da generiše. Paketi su odmah ispod.",
    en: "You have no credits yet, so the Studio cannot generate anything. The packs are right below.",
  },
  cta: { sr: "Izaberi paket", en: "Pick a pack" },
};

export const CREDITS_NO_PACKS: EmptyState = {
  title: { sr: "Nijedan paket nije u prodaji", en: "No pack is on sale" },
  body: {
    sr: "Nijedan paket trenutno nije u prodaji. Javi se podršci.",
    en: "No pack is on sale right now. Please contact support.",
  },
  cta: { sr: "Javi se podršci", en: "Contact support" },
};

export const CREDITS_NO_HISTORY: EmptyState = {
  title: { sr: "Još nisi kupio kredite", en: "You have not bought any credits yet" },
  body: {
    sr: "Još nisi kupio kredite.",
    en: "You have not bought any credits yet.",
  },
  cta: { sr: "Paketi su gore", en: "The packs are up top" },
};

export const GALLERY_NO_GENERATIONS: EmptyState = {
  title: { sr: "Još nemaš nijednu generaciju", en: "No generations yet" },
  body: {
    sr: "Sve što napraviš u Studiju sleti ovde - sa promptom, modelom i cenom.",
    en: "Everything you make in the Studio lands here - with its prompt, model and price.",
  },
  cta: { sr: "Otvori Studio", en: "Open the Studio" },
};

export const GALLERY_NO_MATCHES: EmptyState = {
  title: { sr: "Nijedna generacija ne odgovara filterima", en: "No generation matches these filters" },
  body: {
    sr: "Nijedna generacija ne odgovara ovim filterima.",
    en: "No generation matches these filters.",
  },
  cta: { sr: "Resetuj filtere", en: "Reset filters" },
};
