import { describe, expect, test } from "vitest";

import { CREDIT_LIFETIME_MONTHS } from "@/convex/creditsCore";
import { OUTPUT_RETENTION_DAYS } from "@/convex/studioCore";
import { locales, type Locale } from "@/lib/i18n";
import {
  PRIVACY_POLICY_PATH,
  STUDIO_TERMS_GATE,
  STUDIO_TERMS_PATH,
} from "@/lib/studio-messages";
import {
  LEGAL_DOCUMENTS,
  LEGAL_PLACEHOLDERS,
  PRIVACY_POLICY,
  STUDIO_TERMS,
  type LegalDocument,
} from "@/lib/legal-copy";

/** Ceo dokument kao jedan string na jednom jeziku - za traženje klauzula. */
function flatten(document: LegalDocument, locale: Locale): string {
  return [
    document.title[locale],
    document.intro[locale],
    document.updated[locale],
    ...document.sections.flatMap((section) => [
      section.title[locale],
      ...section.body.map((paragraph) => paragraph[locale]),
    ]),
  ].join("\n");
}

describe("oba dokumenta postoje na oba jezika", () => {
  test("nijedan naslov, uvod ni pasus nije prazan ni na jednom jeziku", () => {
    for (const document of LEGAL_DOCUMENTS) {
      for (const locale of locales) {
        expect(document.title[locale], `${document.path}.title.${locale}`).toBeTruthy();
        expect(document.intro[locale], `${document.path}.intro.${locale}`).toBeTruthy();
        expect(document.updated[locale], `${document.path}.updated.${locale}`).toBeTruthy();

        for (const section of document.sections) {
          expect(section.title[locale], `${section.id}.title.${locale}`).toBeTruthy();
          expect(section.body.length, `${section.id}.body`).toBeGreaterThan(0);
          for (const [index, paragraph] of section.body.entries()) {
            expect(paragraph[locale], `${section.id}.body[${index}].${locale}`).toBeTruthy();
          }
        }
      }
    }
  });

  test("engleski nije kopija srpskog - neprevedena klauzula je prazna klauzula", () => {
    for (const document of LEGAL_DOCUMENTS) {
      for (const section of document.sections) {
        expect(section.title.sr, section.id).not.toBe(section.title.en);
        for (const paragraph of section.body) {
          expect(paragraph.sr, section.id).not.toBe(paragraph.en);
        }
      }
    }
  });

  test("`id` sekcije je jedinstven unutar dokumenta - naslovi nose sidra", () => {
    for (const document of LEGAL_DOCUMENTS) {
      const ids = document.sections.map((section) => section.id);
      expect(new Set(ids).size, document.path).toBe(ids.length);
    }
  });
});

describe("uslovi pokrivaju ono bez čega Stripe ne sme da se upali", () => {
  const sr = flatten(STUDIO_TERMS, "sr");
  const en = flatten(STUDIO_TERMS, "en");

  test("krediti su nepovratni i ne menjaju se za novac", () => {
    expect(sr).toContain("nepovratni");
    expect(sr).toMatch(/ne mogu.*zameniti za novac/);
    expect(en).toContain("non-refundable");
    expect(en).toMatch(/cannot be exchanged for money/);
  });

  test("rok isteka kredita u ugovoru je isti broj koji ledger primenjuje", () => {
    expect(CREDIT_LIFETIME_MONTHS).toBe(12);
    expect(sr).toContain(`${CREDIT_LIFETIME_MONTHS} meseci od dana dodele`);
    expect(en).toContain(`${CREDIT_LIFETIME_MONTHS} months from the day they are granted`);
  });

  test("neuspeo posao se refundira sam, uspeo se ne refundira zbog nesviđanja", () => {
    expect(sr).toMatch(/refundira se automatski/);
    expect(sr).toMatch(/ne refundira zato što ti se rezultat nije dopao/);
    expect(en).toMatch(/refunded automatically/);
    expect(en).toMatch(/not refunded because you did not like the result/);
  });

  test("18+ stoji i kao granica uzrasta i kao odgovornost za generativni sadržaj", () => {
    expect(sr).toContain("18 godina");
    expect(sr).toMatch(/nije otvoren maloletnicima/);
    expect(en).toContain("18 and over");
    expect(en).toMatch(/not open to minors/);
  });

  test("zabranjen sadržaj imenuje tuđi lik bez pristanka i maloletnike", () => {
    expect(sr).toMatch(/bez njenog pristanka/);
    expect(sr).toMatch(/maloletnicima/);
    expect(en).toMatch(/without that person's consent/);
    expect(en).toMatch(/involving minors/);
  });

  test("sva četiri dobavljača su imenovana poimence, jer im se podaci prosleđuju", () => {
    for (const provider of ["fal.ai", "Google", "BytePlus", "ElevenLabs"]) {
      expect(sr, `sr:${provider}`).toContain(provider);
      expect(en, `en:${provider}`).toContain(provider);
    }
  });

  test("pregled generisanog sadržaja zbog moderacije je izričito ugovoren (osnov za X4)", () => {
    expect(sr).toMatch(/osoblje platforme može da pregleda/);
    expect(en).toMatch(/staff may review/);
  });

  test("rokovi čuvanja u ugovoru su isti brojevi koje cron primenjuje", () => {
    expect(OUTPUT_RETENTION_DAYS).toEqual({ image: 90, audio: 90, video: 30 });
    expect(sr).toContain(`${OUTPUT_RETENTION_DAYS.video} dana od nastanka`);
    expect(sr).toContain(`${OUTPUT_RETENTION_DAYS.image} dana`);
    expect(sr).toMatch(/[Mm]etapodaci .*čuvaju se trajno/);
    expect(en).toContain(`${OUTPUT_RETENTION_DAYS.video} days from creation`);
    expect(en).toContain(`${OUTPUT_RETENTION_DAYS.image} days`);
    expect(en).toMatch(/is kept permanently/);
  });

  test("pravo na gašenje Studija bez najave (kill switch iz W2) je ugovoreno", () => {
    expect(sr).toMatch(/bez prethodne najave/);
    expect(en).toMatch(/without prior notice/);
  });

  test("posledice refundacije i spora po kartici su napisane pre nego što se dese", () => {
    expect(sr).toMatch(/saldo naloga ide u minus/);
    expect(sr).toContain("chargeback");
    expect(en).toMatch(/balance goes negative/);
    expect(en).toContain("chargeback");
  });
});

describe("politika privatnosti odgovara na četiri pitanja koja mora", () => {
  const sr = flatten(PRIVACY_POLICY, "sr");
  const en = flatten(PRIVACY_POLICY, "en");

  test("kom provajderu se šta šalje - sva četiri modela plus Stripe", () => {
    for (const processor of ["fal.ai", "Google", "BytePlus", "ElevenLabs", "Stripe"]) {
      expect(sr, `sr:${processor}`).toContain(processor);
      expect(en, `en:${processor}`).toContain(processor);
    }
  });

  test("gde se čuva i koliko - isti rokovi kao u uslovima", () => {
    expect(sr).toContain("Convex");
    expect(sr).toContain(`${OUTPUT_RETENTION_DAYS.video} dana`);
    expect(sr).toContain(`${OUTPUT_RETENTION_DAYS.image} dana`);
    expect(en).toContain("Convex");
    expect(en).toContain(`${OUTPUT_RETENTION_DAYS.video} days`);
    expect(en).toContain(`${OUTPUT_RETENTION_DAYS.image} days`);
  });

  test("kako se traži brisanje i kome se piše", () => {
    expect(sr).toMatch(/Zahtev šalješ sa email adrese naloga/);
    expect(sr).toContain("[POPUNITI: kontakt email za zaštitu podataka]");
    expect(en).toMatch(/Send the request from the account's email address/);
  });
});

describe("Studio linkuje tačno ove dve stranice", () => {
  test("putanje iz `studio-messages` su putanje koje dokumenti stvarno imaju", () => {
    // `STUDIO_TERMS_PATH` postoji od koraka X4, kada je ruta još bila prazna.
    // Ako se putanja u jednom od dva modula promeni, kapija pred prvom
    // generacijom vodi na 404 - a pristanak na uslove koji se ne otvaraju nije
    // pristanak.
    expect(STUDIO_TERMS.path).toBe(STUDIO_TERMS_PATH);
    expect(PRIVACY_POLICY.path).toBe(PRIVACY_POLICY_PATH);
  });

  test("kvačica pred prvom generacijom imenuje uzrast i oba dokumenta", () => {
    for (const locale of locales) {
      const checkbox = STUDIO_TERMS_GATE.checkbox[locale];
      expect(checkbox, locale).toContain("18");
      expect(checkbox.length, locale).toBeGreaterThan(20);
    }
    expect(STUDIO_TERMS_GATE.checkbox.sr).toMatch(/uslove korišćenja Studija/);
    expect(STUDIO_TERMS_GATE.checkbox.sr).toMatch(/politiku privatnosti/);
    expect(STUDIO_TERMS_GATE.checkbox.en).toMatch(/Studio terms of use/);
    expect(STUDIO_TERMS_GATE.checkbox.en).toMatch(/privacy policy/);
  });
});

describe("nijedan podatak o pravnom licu nije izmišljen", () => {
  test("svaka rupa iz spiska stvarno stoji u nekom od dva dokumenta", () => {
    const everything = LEGAL_DOCUMENTS.flatMap((document) =>
      locales.map((locale) => flatten(document, locale)),
    ).join("\n");

    for (const placeholder of LEGAL_PLACEHOLDERS) {
      expect(everything, placeholder).toContain(placeholder);
    }
  });

  test("nijedno `[POPUNITI` u tekstu nije van spiska - spisak za Jovana mora da bude potpun", () => {
    const known = new Set<string>(LEGAL_PLACEHOLDERS);

    for (const document of LEGAL_DOCUMENTS) {
      for (const locale of locales) {
        const found = flatten(document, locale).match(/\[POPUNITI:[^\]]*\]/g) ?? [];
        for (const placeholder of found) {
          expect(known.has(placeholder), `${document.path}.${locale}: ${placeholder}`).toBe(true);
        }
      }
    }
  });

  test("tekst ne sadrži nijedan broj koji bi mogao da se pročita kao PIB ili matični broj", () => {
    // Osmocifren i devetocifren niz je tačno oblik matičnog broja i PIB-a.
    // Rokovi (12, 30, 90, 24) i godina (2026) su najviše četvorocifreni, pa
    // ovaj obrazac ne može da ih uhvati.
    const everything = LEGAL_DOCUMENTS.flatMap((document) =>
      locales.map((locale) => flatten(document, locale)),
    ).join("\n");

    expect(everything).not.toMatch(/\d{8,}/);
  });
});
