import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "../public/brand/igra/manifest.json";
import { CREDITS_FIXTURES, IGRA_FIXTURE_IDS } from "./igra-fixtures";
import { bestPackCreditsWithin, referenceCreditCosts, unitsFor } from "./credits-value";

/**
 * Krediti, naplata, podešavanja (K19): samo izgled. Stripe, cene, krediti i tok plaćanja se
 * ne diraju, pa se provere vode nad izvorom (strane čitaju Convex i ne mogu u jsdom).
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const assets: Record<string, { ready: boolean } | undefined> = manifest.assets;

const CREDITS = read("components/app/credits-page.tsx");
const BILLING = read("components/app/profile-billing.tsx");
const KEYS = read("components/app/api-keys-page.tsx");
const HELP = read("components/app/help-settings.tsx");
const EDITOR = read("components/app/profile-editor.tsx");
const HEAD = read("components/igra/account/account-head.tsx");
const EMPTY = read("components/igra/account/account-empty.tsx");
const ACCOUNT_SOURCES = [CREDITS, BILLING, KEYS, HELP, HEAD, EMPTY];

describe("slike strana naloga", () => {
  it("svaka slika koju K19 koristi je u manifestu i spremna", () => {
    const ids = new Set<string>();
    for (const src of [CREDITS, BILLING, KEYS, HELP, HEAD, EMPTY, EDITOR]) {
      for (const match of src.matchAll(/(?:id|art)="((?:ikona|prazno|lik)\.[a-z.-]+)"/g)) ids.add(match[1]!);
    }
    expect([...ids]).toEqual(expect.arrayContaining(["ikona.krediti", "ikona.podesavanja", "ikona.pomoc", "prazno.uskoro", "prazno.zakljucano"]));
    for (const id of ids) expect(assets[id]?.ready, id).toBe(true);
    expect(assets["lik.robi.misli"]?.ready).toBe(true);
  });

  it("zaglavlja: krediti i pretplata ikona.krediti, profil i ključevi ikona.podesavanja, pomoć ikona.pomoc", () => {
    expect(CREDITS).toContain('art="ikona.krediti"');
    expect(BILLING).toContain('art="ikona.krediti"');
    expect(BILLING).toContain('art="ikona.podesavanja"');
    expect(KEYS).toContain('art="ikona.podesavanja"');
    expect(EDITOR).toContain('art="ikona.podesavanja"');
    expect(HELP).toContain('id="ikona.pomoc"');
  });

  it("Robi stoji samo uz kredite i samo od lg", () => {
    expect(CREDITS).toMatch(/<AccountHead[^>]*\brobi\b/);
    for (const src of [BILLING, KEYS, EDITOR]) expect(src).not.toMatch(/<AccountHead[^>]*\brobi\b/);
    expect(HEAD).toContain('hidden shrink-0 lg:block');
    expect(HEAD).toContain('lik="robi" poza="misli"');
  });
});

describe("bez gejmifikacije trošenja", () => {
  it("nijedan fajl naloga nema slavlje, odometar, konfete, XP ni marker", () => {
    for (const src of ACCOUNT_SOURCES) {
      expect(src).not.toMatch(/Odometer|Confetti|CelebrationHost|useCelebrat|useStampIn|MarkerHighlight|gsap|LevelStamp|XpBar|StreakFlame/);
    }
  });

  it("nema „kupi još” pritiska: prijava ne obećava kupovinu, a CTA bez kredita nije žut", () => {
    expect(CREDITS).not.toContain("kupiš još");
    expect(CREDITS).not.toContain("to buy more");
    const zeroCta = CREDITS.slice(CREDITS.indexOf("CREDITS_NO_BALANCE.cta") - 700, CREDITS.indexOf("CREDITS_NO_BALANCE.cta"));
    expect(zeroCta).not.toContain("bg-yellow");
    // Pretplata više nije žuti blok sa debelim okvirom.
    expect(CREDITS).not.toContain("border-4");
    expect(CREDITS).not.toContain("bg-yellow/25");
  });
});

describe("brojevi, cene i tok plaćanja su isti", () => {
  it("kupovina ide kroz iste Stripe rute sa istim sadržajem", () => {
    expect(CREDITS).toContain('endpoint="/api/stripe/credits"');
    expect(CREDITS).toContain('endpoint="/api/stripe/plan"');
    expect(CREDITS).toContain("packSlug: pack.slug");
    expect(CREDITS).toContain("planSlug: premium.slug");
    expect(CREDITS).toContain("formatEur(pack.priceEurCents, locale)");
    expect(CREDITS).toContain("formatEur(premium.priceEurCents, locale)");
    expect(CREDITS).toContain("signedAmount(transaction.amount)");
    expect(CREDITS).toContain("transaction.balanceAfter");
    expect(CREDITS).toContain("packValueLine(pack.credits, reference, locale)");
  });

  it("redosled kartica je isti: stanje, limit, paketi, pretplata, istorija", () => {
    const order = ["{/* Balans.", "{spendLimit}", "id={CREDITS_PACKS_ANCHOR}", "{premium && !isStudio", "{/* Istorija. */}"].map((marker) => CREDITS.indexOf(marker));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("pretplata i profil: demo cena 9,99 EUR, portal i status ostaju", () => {
    expect(BILLING).toContain("9,99 EUR");
    expect(BILLING).toContain("<PortalButton");
    expect(BILLING).toContain("Aktivan demo status");
  });

  it("API ključevi i pomoć zadržavaju pozive (kreiranje, opoziv, čuvanje statusa)", () => {
    expect(KEYS).toContain("onCreate={() => setCreateOpen(true)}");
    expect(KEYS).toContain("onRevoke={() => setRevoking(row)}");
    expect(HELP).toContain("api.helpTopics.setViewerHelpProfile");
    expect(HELP).toContain("api.helpTopics.proposeTopic");
    expect(HELP).toContain("<HelpTopicsEmpty");
  });

  it("test podaci izloga: stanje je zbir lotova, brojevi kao u seed-u", () => {
    for (const id of IGRA_FIXTURE_IDS) {
      const fixture = CREDITS_FIXTURES[id];
      if (fixture.lots.length) expect(fixture.lots.reduce((sum, lot) => sum + lot.remaining, 0)).toBe(fixture.balance.balance);
      const reference = referenceCreditCosts(fixture.models);
      expect(reference.image).toBe(12);
      expect(unitsFor(fixture.balance.balance, reference.image)).toBe(Math.floor(fixture.balance.balance / 12));
    }
    const premium = CREDITS_FIXTURES.aktivan.packs.find((pack) => pack.kind === "plan");
    expect([premium?.priceEurCents, premium?.credits]).toEqual([2499, 2000]);
    expect(bestPackCreditsWithin(CREDITS_FIXTURES.aktivan.packs, 2499)).toBe(1650);
    expect(CREDITS_FIXTURES.aktivan.packs.filter((pack) => pack.kind === "pack").map((pack) => [pack.priceEurCents, pack.credits, pack.bonusPercent])).toEqual([
      [500, 500, 0],
      [1500, 1650, 10],
      [4000, 4800, 20],
    ]);
  });
});
