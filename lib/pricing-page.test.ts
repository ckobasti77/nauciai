import { describe, expect, test } from "vitest";

import { locales, pricingPageContent, withLocale } from "@/lib/i18n";
import { PRICING } from "@/lib/pricing";

/**
 * Strana pretplate (N6) živi na dva URL-a jer joj se segment prevodi, a ceo tekst
 * dolazi iz jednog objekta sa dva jezika. Oba su tiha da se pokvare: engleski red
 * može da nestane iz tabele razlika a da ništa ne pukne. Ovaj test čuva to dvoje.
 */
describe("prevedeni segment pretplate", () => {
  test("kanonski /pricing ide kroz withLocale u javni segment", () => {
    // sr je jezik-bez-prefiksa sa prevedenim segmentom; en nosi /en.
    expect(withLocale("sr", "/pricing")).toBe("/pretplata");
    expect(withLocale("en", "/pricing")).toBe("/en/pricing");
  });
});

describe("pricingPageContent", () => {
  test("sr i en drže istu strukturu", () => {
    const sr = pricingPageContent.sr;
    const en = pricingPageContent.en;
    expect(en.plans.basicFeatures).toHaveLength(sr.plans.basicFeatures.length);
    expect(en.plans.premiumFeatures).toHaveLength(sr.plans.premiumFeatures.length);
    expect(en.compare.rows).toHaveLength(sr.compare.rows.length);
    expect(en.faq.items).toHaveLength(sr.faq.items.length);
  });

  test("Premium spisak nosi mesto za broj kredita iz baze", () => {
    for (const locale of locales) {
      expect(pricingPageContent[locale].plans.premiumFeatures).toContain("%CREDITS%");
    }
  });

  test("tabela razlika pokriva svih šest mogućnosti i nijedan red nije prazan", () => {
    for (const locale of locales) {
      const rows = pricingPageContent[locale].compare.rows;
      expect(rows).toHaveLength(6);
      // Premium je nadskup Basic-a: nijedna mogućnost ne sme da bude samo u Basic-u.
      expect(rows.filter((row) => row.basic && !row.premium)).toHaveLength(0);
      expect(rows.filter((row) => row.premium)).toHaveLength(6);
      for (const row of rows) expect(row.label.trim().length).toBeGreaterThan(0);
    }
  });

  test("nijedno pitanje o naplati nije bez odgovora", () => {
    for (const locale of locales) {
      for (const item of pricingPageContent[locale].faq.items) {
        expect(item.q.trim().length).toBeGreaterThan(0);
        expect(item.a.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("jednokratna cena kursa", () => {
  test("postoji rezerva u lib/pricing.ts (platformSettings još nema polje za nju)", () => {
    expect(PRICING.course.eur).toMatch(/^\d+,\d{2}$/);
  });
});
