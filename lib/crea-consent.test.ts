import { describe, expect, test } from "vitest";

import { checkConsentTranscript, consentCodeWords, consentPhrase, normalizeSpeech, pickConsentWords } from "./crea-consent";

const phrase = consentPhrase("sr", ["lampa", "reka"]);

describe("izgovoreni pristanak (A7, O5)", () => {
  test("rečenica nosi dve nasumične reči na kraju", () => {
    expect(phrase).toBe("Ja pristajem da Crea napravi kopiju mog glasa. Ovo je moj glas. Moje reči su lampa reka.");
    expect(consentCodeWords(phrase)).toEqual(["lampa", "reka"]);
    expect(consentCodeWords(consentPhrase("en", ["river", "lamp"]))).toEqual(["river", "lamp"]);
  });

  test("reči su uvek dve različite, i na ivicama slučajnog broja", () => {
    for (const value of [0, 0.3, 0.5, 0.9999]) {
      const [first, second] = pickConsentWords("sr", () => value);
      expect(first).not.toBe(second);
    }
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let round = 0; round < 200; round++) {
      const [first, second] = pickConsentWords("en", random);
      expect(first).not.toBe(second);
    }
  });

  test("tačan transkript prolazi - i bez kvačica, interpunkcije, na ćirilici", () => {
    expect(checkConsentTranscript(phrase, phrase)).toEqual({ passed: true, score: 1, codeWords: true });
    expect(checkConsentTranscript("ja pristajem da crea napravi kopiju mog glasa ovo je moj glas moje reci su lampa reka", phrase).passed).toBe(true);
    expect(checkConsentTranscript("Ја пристајем да Креа направи копију мог гласа. Ово је мој глас. Моје речи су лампа река.", phrase)).toMatchObject({
      codeWords: true,
    });
    expect(normalizeSpeech("Ђорђе, Чачак!")).toBe("djordje cacak");
  });

  test("ponekad promašena reč je u redu (≥ 80 %), nasumične reči su obavezne", () => {
    const sloppy = "Ja pristajem da Kreja napravi kopiju glasa. Ovo je moj glas. Moje reči su lampa reka.";
    expect(checkConsentTranscript(sloppy, phrase).passed).toBe(true);
    const wrongCode = "Ja pristajem da Crea napravi kopiju mog glasa. Ovo je moj glas. Moje reči su sunce most.";
    expect(checkConsentTranscript(wrongCode, phrase)).toMatchObject({ passed: false, codeWords: false });
  });

  test("ne prolazi: tišina, samo deo rečenice, tuđa priča, odbijanje", () => {
    expect(checkConsentTranscript("", phrase)).toEqual({ passed: false, score: 0, codeWords: false });
    expect(checkConsentTranscript("lampa reka", phrase).passed).toBe(false);
    expect(checkConsentTranscript("Danas je lep dan, idemo do reke da upalimo lampa.", phrase).passed).toBe(false);
    expect(checkConsentTranscript("Ja ne pristajem. Moje reči su lampa reka.", phrase).passed).toBe(false);
  });
});
