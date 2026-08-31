import type { LocalizedText } from "./i18n";

/**
 * Primer za galeriju na javnom landingu Studija (studio-public F3).
 * `src` je putanja unutar `public/studio-examples/` — SAMO prave generacije
 * iz Studija, ništa se ne izmišlja i ne vadi sa stock sajtova (brif F3).
 * Sekcija "Primeri" se uopšte ne renderuje dok je niz prazan.
 */
export type StudioExample = {
  src: string;
  alt: LocalizedText;
  kind: "image" | "video" | "audio";
};

/**
 * BLOKADA (za Jovana): ubaci prave Studio generacije u `public/studio-examples/`
 * i dodaj po jedan red ovde — npr.
 * `{ src: "/studio-examples/lisica.png", alt: { sr: "Lisica u snegu", en: "A fox in the snow" }, kind: "image" }`.
 */
export const STUDIO_EXAMPLES: StudioExample[] = [];

export function validStudioExample(example: StudioExample): boolean {
  return (
    example.src.startsWith("/studio-examples/") &&
    example.alt.sr.trim().length > 0 &&
    example.alt.en.trim().length > 0
  );
}

/** Sve poruke landinga na jednom mestu, obrazac `lib/studio-messages.ts`. */
export const STUDIO_LANDING = {
  metaTitle: {
    sr: "Studio — AI slike, video i zvuk | Nauči AI",
    en: "Studio — AI images, video and sound | Nauči AI",
  },
  metaDescription: {
    sr: "Opiši šta želiš — Studio pravi sliku, video ili zvuk. Bez pretplate: krediti koje kupiš kad ti trebaju, prvih 25 na poklon uz potvrdu emaila.",
    en: "Describe what you want — the Studio makes an image, a video or sound. No subscription: credits you buy when you need them, the first 25 free once you confirm your email.",
  },
  heroTitle: {
    sr: "Opiši. Studio nacrta, snimi ili izgovori.",
    en: "Describe it. The Studio draws it, films it, or says it.",
  },
  heroBody: {
    sr: "Najbolji svetski AI modeli za sliku, video i zvuk — na srpskom, bez pretplate. Plaćaš kreditima samo ono što generišeš, a prvih 25 kredita dobijaš na poklon.",
    en: "The best AI models for images, video and sound — with no subscription. You pay in credits only for what you generate, and your first 25 credits are a gift.",
  },
  ctaTry: { sr: "Probaj besplatno", en: "Try it free" },
  ctaOpen: { sr: "Otvori Studio", en: "Open the Studio" },
  ctaPacks: { sr: "Pogledaj pakete", en: "See the packs" },
  kindsTitle: { sr: "Šta Studio pravi", en: "What the Studio makes" },
  kinds: {
    image: {
      title: { sr: "Slike", en: "Images" },
      body: {
        sr: "Ilustracije, fotorealistične scene, naslovne slike — iz jedne rečenice ili iz tvoje fotografije.",
        en: "Illustrations, photoreal scenes, cover art — from one sentence or from your own photo.",
      },
    },
    video: {
      title: { sr: "Video", en: "Video" },
      body: {
        sr: "Kratki klipovi sa zvukom, iz opisa ili iz početnog kadra koji sam okačiš.",
        en: "Short clips with sound, from a description or from a starting frame you upload.",
      },
    },
    audio: {
      title: { sr: "Zvuk", en: "Sound" },
      body: {
        sr: "Naracija na srpskom, zvučni efekti i muzika — spremni za tvoj video.",
        en: "Narration, sound effects and music — ready for your video.",
      },
    },
  },
  priceFrom: { sr: "od", en: "from" },
  credits: { sr: "kredita", en: "credits" },
  examplesTitle: { sr: "Napravljeno u Studiju", en: "Made in the Studio" },
  packsTitle: { sr: "Paketi kredita", en: "Credit packs" },
  packsBody: {
    sr: "Krediti ne propadaju na kraju meseca — važe 12 meseci i troše se samo kad generišeš.",
    en: "Credits do not vanish at the end of the month — they last 12 months and are spent only when you generate.",
  },
  packsSignIn: { sr: "Prijavi se i kupi", en: "Sign in and buy" },
  packsBuy: { sr: "Dopuni kredite", en: "Top up credits" },
  packsEmpty: {
    sr: "Paketi se upravo pripremaju — vrati se uskoro.",
    en: "The packs are being prepared — check back soon.",
  },
  bonusNote: {
    sr: "25 kredita na poklon kad potvrdiš email — dovoljno za prve dve-tri slike.",
    en: "25 credits as a gift once you confirm your email — enough for your first two or three images.",
  },
  heroVideoAlt: {
    sr: "Petlja AI generisanja slike, videa i zvuka u Studiju",
    en: "Loop of AI image, video and sound generation in the Studio",
  },
  crossSell: {
    sr: "Nauči kako ovo da radiš → kursevi",
    en: "Learn how to make this → courses",
  },
} as const;
