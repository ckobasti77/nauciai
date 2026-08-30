import { expect, test } from "vitest";

import {
  bestPackCreditsWithin,
  expiringSoon,
  formatEur,
  imageGenerationsLabel,
  imagesLabel,
  packValueLine,
  referenceCreditCosts,
  signedAmount,
  transactionTypeLabel,
  unitsFor,
  videosLabel,
  type CatalogModelRow,
  type CreditPackRow,
} from "./credits-value";

// Katalog iz `convex/seed.ts` (STUDIO-PLAN 2.3), skraćen na ono što referenca dira.
const IMAGE_MODELS: CatalogModelRow[] = [
  { kind: "image", creditCost: 3 },
  { kind: "image", creditCost: 7 },
  { kind: "image", creditCost: 20, badge: "preporuceno" },
  { kind: "image", creditCost: 65 },
];
const VIDEO_MODELS: CatalogModelRow[] = [
  { kind: "video", creditCost: 95 },
  { kind: "video", creditCost: 55 },
  { kind: "video", creditCost: 435, badge: "skupo" },
];

// Paketi iz `convex/seed.ts` (STUDIO-PLAN 2.4).
const PACKS: CreditPackRow[] = [
  { slug: "basic", priceEurCents: 999, credits: 0, bonusPercent: 0, kind: "plan", planTier: "basic" },
  { slug: "premium", priceEurCents: 2499, credits: 2000, bonusPercent: 0, kind: "plan", planTier: "premium" },
  { slug: "starter", priceEurCents: 500, credits: 500, bonusPercent: 0, kind: "pack" },
  { slug: "creator", priceEurCents: 1500, credits: 1650, bonusPercent: 10, kind: "pack" },
  { slug: "pro", priceEurCents: 4000, credits: 4800, bonusPercent: 20, kind: "pack" },
];

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 19, 10, 0, 0);

test("preporuceni model je referenca, ne najjeftiniji", () => {
  expect(referenceCreditCosts(IMAGE_MODELS).image).toBe(20);
});

test("bez preporucenog badge-a referenca pada na najjeftiniji model", () => {
  expect(referenceCreditCosts(VIDEO_MODELS).video).toBe(55);
});

test("vrsta bez ijednog ukljucenog modela nema referencu", () => {
  const reference = referenceCreditCosts(IMAGE_MODELS);
  expect(reference.video).toBeNull();
  expect(reference.audio).toBeNull();
});

test("referenca ignorise modele sa cenom nula", () => {
  expect(referenceCreditCosts([{ kind: "image", creditCost: 0 }]).image).toBeNull();
});

test("unitsFor sece nanize i ne deli nulom", () => {
  expect(unitsFor(500, 55)).toBe(9);
  expect(unitsFor(500, null)).toBe(0);
  expect(unitsFor(500, 0)).toBe(0);
});

// STUDIO-PLAN 2.4: Starter 500 kr = "9 klipova · ili 25 dobrih slika",
// Creator 1650 = "30 klipova · ili 82 slike", Pro 4800 = "87 klipova · ili 240 slika".
test("vrednost paketa se poklapa sa tabelom 2.4 iz plana", () => {
  const reference = referenceCreditCosts([...IMAGE_MODELS, ...VIDEO_MODELS]);
  expect(packValueLine(500, reference, "sr")).toBe("otprilike: 25 slika ili 9 video klipova");
  expect(packValueLine(1650, reference, "sr")).toBe("otprilike: 82 slike ili 30 video klipova");
  expect(packValueLine(4800, reference, "sr")).toBe("otprilike: 240 slika ili 87 video klipova");
});

test("vrednost paketa je bilingvalna", () => {
  const reference = referenceCreditCosts([...IMAGE_MODELS, ...VIDEO_MODELS]);
  expect(packValueLine(500, reference, "en")).toBe("roughly: 25 images or 9 video clips");
});

test("video se ne pominje dok nijedan video model nije ukljucen", () => {
  const reference = referenceCreditCosts(IMAGE_MODELS);
  expect(packValueLine(500, reference, "sr")).toBe("otprilike: 25 slika");
});

test("prazan katalog ne daje red o vrednosti", () => {
  expect(packValueLine(500, referenceCreditCosts([]), "sr")).toBeNull();
});

test("premalo kredita za jednu generaciju ne daje red o vrednosti", () => {
  expect(packValueLine(2, referenceCreditCosts(IMAGE_MODELS), "sr")).toBeNull();
});

test("srpska množina prati broj", () => {
  expect(imagesLabel(1, "sr")).toBe("1 slika");
  expect(imagesLabel(3, "sr")).toBe("3 slike");
  expect(imagesLabel(11, "sr")).toBe("11 slika");
  expect(imagesLabel(22, "sr")).toBe("22 slike");
  expect(imagesLabel(25, "sr")).toBe("25 slika");
  expect(videosLabel(1, "sr")).toBe("1 video klip");
  expect(videosLabel(2, "sr")).toBe("2 video klipa");
  expect(videosLabel(9, "sr")).toBe("9 video klipova");
  expect(imageGenerationsLabel(1, "sr")).toBe("1 napravljena slika");
  expect(imageGenerationsLabel(5, "sr")).toBe("5 napravljenih slika");
  expect(imageGenerationsLabel(1, "en")).toBe("1 image you can make");
  expect(imageGenerationsLabel(2, "en")).toBe("2 images you can make");
});

// D.1: "Isti novac u paketu daje 1650 kredita" - Creator (15 EUR) je najbolji
// paket koji staje u cenu Premiuma (24,99 EUR).
test("najbolji paket za Premium novac je 1650 kredita", () => {
  expect(bestPackCreditsWithin(PACKS, 2499)).toBe(1650);
});

test("planovi se ne racunaju kao paket u poređenju", () => {
  const onlyPlans = PACKS.filter((pack) => pack.kind === "plan");
  expect(bestPackCreditsWithin(onlyPlans, 2499)).toBeNull();
});

test("kad nijedan paket ne staje u budzet, poređenja nema", () => {
  expect(bestPackCreditsWithin(PACKS, 100)).toBeNull();
});

test("istek u narednih 30 dana se prijavljuje, dalji ne", () => {
  const rows = expiringSoon(
    [
      { remaining: 120, expiresAt: NOW + 10 * DAY },
      { remaining: 900, expiresAt: NOW + 200 * DAY },
    ],
    NOW,
  );
  expect(rows).toEqual([{ credits: 120, expiresAt: NOW + 10 * DAY }]);
});

test("lotovi koji isticu istog dana idu u jedan red", () => {
  const rows = expiringSoon(
    [
      { remaining: 100, expiresAt: NOW + 5 * DAY },
      { remaining: 50, expiresAt: NOW + 5 * DAY + 3 * 60 * 60 * 1000 },
    ],
    NOW,
  );
  expect(rows).toEqual([{ credits: 150, expiresAt: NOW + 5 * DAY }]);
});

test("razliciti dani isteka dobijaju svoj red, sortirano", () => {
  const rows = expiringSoon(
    [
      { remaining: 40, expiresAt: NOW + 20 * DAY },
      { remaining: 10, expiresAt: NOW + 2 * DAY },
    ],
    NOW,
  );
  expect(rows).toEqual([
    { credits: 10, expiresAt: NOW + 2 * DAY },
    { credits: 40, expiresAt: NOW + 20 * DAY },
  ]);
});

test("prazan i vec istekao lot se ne prijavljuju", () => {
  expect(
    expiringSoon(
      [
        { remaining: 0, expiresAt: NOW + DAY },
        { remaining: 30, expiresAt: NOW - DAY },
      ],
      NOW,
    ),
  ).toEqual([]);
});

test("cena se formatira po lokalu", () => {
  expect(formatEur(2499, "sr")).toBe("24,99 EUR");
  expect(formatEur(2499, "en")).toBe("24.99 EUR");
  expect(formatEur(500, "sr")).toBe("5,00 EUR");
});

test("iznos transakcije uvek nosi znak", () => {
  expect(signedAmount(500)).toBe("+500");
  expect(signedAmount(-20)).toBe("-20");
  expect(signedAmount(0)).toBe("0");
});

test("svaki tip transakcije ima sr i en naziv", () => {
  const types = ["purchase", "spend", "refund", "bonus", "trial", "expiry", "admin_adjust"] as const;
  for (const type of types) {
    expect(transactionTypeLabel(type, "sr").length).toBeGreaterThan(0);
    expect(transactionTypeLabel(type, "en").length).toBeGreaterThan(0);
  }
  expect(transactionTypeLabel("spend", "sr")).toBe("Potrošnja");
  expect(transactionTypeLabel("expiry", "en")).toBe("Expiry");
});
