import type { ModerationCategory } from "../convex/creditsCore";
import type { LocalizedText } from "./i18n";

/**
 * Provera opisa pre plaćanja (K28, C7). Naši provajderi sa ključem (Google, fal,
 * BytePlus) nemaju besplatnu moderaciju teksta, pa važe lokalna pravila: isti
 * filter kao `createJob` (`creditsCore.validatePrompt`, na serveru - spisak
 * pojmova ne ide u browser) i ova pravila za razlog i predlog na srpskom.
 * Zabranjen opis nikad ne stiže do naplate: server ga odbija pre rezervacije, a
 * korisnik ovde dobija ZAŠTO i KAKO da ga ispravi. Koji pojam je pogodio se i
 * dalje ne otkriva (vidi `validatePrompt`).
 */

export type PromptAdvice = { reason: LocalizedText; suggestion: LocalizedText };

export const PROMPT_CHECK_ADVICE: Record<ModerationCategory, PromptAdvice> = {
  nsfw: {
    reason: { sr: "Opis traži golotinju ili seksualni sadržaj, a to Crea ne pravi.", en: "The description asks for nudity or sexual content, which Crea does not make." },
    suggestion: {
      sr: "Opiši osobu obučenu, u svakodnevnoj sceni - npr. „žena u crvenoj haljini šeta pored mora u zalazak sunca”.",
      en: "Describe the person dressed, in an everyday scene - e.g. “a woman in a red dress walking by the sea at sunset”.",
    },
  },
  minors: {
    reason: { sr: "Opis spaja decu sa sadržajem koji nije za decu. To se nikad ne pravi.", en: "The description combines children with content that is not for children. That is never made." },
    suggestion: {
      sr: "Ako praviš nešto za decu, opiši bezbednu scenu - igru, školu, crtani stil - bez ičega za odrasle.",
      en: "If you are making something for children, describe a safe scene - play, school, a cartoon style - with nothing for adults.",
    },
  },
  deepfake: {
    reason: { sr: "Opis traži lažni snimak ili zamenu lica stvarne osobe.", en: "The description asks for a fake recording or a face swap of a real person." },
    suggestion: {
      sr: "Za svoje lice koristi „Likovi” (uz pristanak). Za druge opiši izmišljenu osobu - godine, frizuru, odeću.",
      en: "For your own face use “Characters” (with consent). For others describe an invented person - age, hair, clothes.",
    },
  },
  illegal: {
    reason: { sr: "Opis traži nešto nezakonito ili opasno.", en: "The description asks for something illegal or dangerous." },
    suggestion: {
      sr: "Izbaci taj deo i opiši scenu bez njega - šta se vidi, gde je, kakvo je svetlo.",
      en: "Leave that part out and describe the scene without it - what is seen, where it is, what the light is like.",
    },
  },
  violence: {
    reason: { sr: "Opis traži krv, povrede ili nasilje.", en: "The description asks for blood, injuries or violence." },
    suggestion: {
      sr: "Napetost se vidi i bez nasilja: opiši atmosferu - tamno nebo, kišu, izraz lica, filmsko svetlo.",
      en: "Tension shows without violence: describe the mood - a dark sky, rain, a facial expression, cinematic light.",
    },
  },
  public_figure: {
    reason: { sr: "Opis pominje stvarnu poznatu osobu ili političara.", en: "The description names a real famous person or politician." },
    suggestion: {
      sr: "Umesto imena opiši izgled izmišljene osobe - npr. „sredovečni muškarac u odelu govori sa bine”.",
      en: "Instead of a name, describe an invented person - e.g. “a middle-aged man in a suit speaking on stage”.",
    },
  },
};

/** Razlog i predlog za kategoriju koju je server vratio (`moderationBlocked.category`). */
export function promptCheckAdvice(category: string): PromptAdvice {
  return PROMPT_CHECK_ADVICE[category as ModerationCategory] ?? PROMPT_CHECK_ADVICE.illegal;
}

export type PromptHint = { id: "kratko" | "cirilica"; text: LocalizedText };

const CYRILLIC_IN_QUOTES = /[„"“”«»][^„"“”«»]*[Ѐ-ӿ][^„"“”«»]*[„"“”«»]/;

/**
 * Meki saveti pre plaćanja (ne blokiraju): prekratak opis daje nasumičan rezultat,
 * a natpis na ćirilici modeli slika često pogreše. Ušteda je u tome da se ne plati
 * rad koji će ionako trebati ponoviti.
 */
export function promptHints(prompt: string, kind: "image" | "video" | "audio"): PromptHint[] {
  const text = prompt.trim();
  if (!text || kind === "audio") return [];
  const hints: PromptHint[] = [];
  if (text.split(/\s+/).length < 3) {
    hints.push({
      id: "kratko",
      text: {
        sr: "Opis je kratak - rezultat će biti nasumičan. Dodaj ko je u kadru, gde je i kakvo je svetlo.",
        en: "The description is short - the result will be random. Add who is in the frame, where, and what the light is like.",
      },
    });
  }
  if (kind === "image" && CYRILLIC_IN_QUOTES.test(text)) {
    hints.push({
      id: "cirilica",
      text: {
        sr: "Natpis na ćirilici modeli često pogreše - za čitljiv tekst napiši ga latinicom.",
        en: "Models often get Cyrillic lettering wrong - write the text in Latin script for readable letters.",
      },
    });
  }
  return hints;
}
