import { expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { applyPriceEdit, computeCredits, type PriceRule } from "@/convex/studioPricing";

import { LOW_MARGIN_THRESHOLD } from "./studio-admin";
import { defaultMargin, isBaseUsdEditable, priceTable } from "./studio-catalog-admin";

function seedOf(slug: string) {
  const seed = STUDIO_MODELS.find((model) => model.slug === slug);
  if (!seed) throw new Error(`Nema modela ${slug}`);

  return seed;
}

function tableOf(slug: string, rule?: PriceRule) {
  const seed = seedOf(slug);

  return priceTable({
    paramSpec: seed.paramSpec,
    priceRule: rule ?? seed.priceRule,
    inputModes: seed.inputModes,
    capabilities: JSON.stringify(seed.capabilities),
    locale: "sr",
    limit: 200,
  });
}

test("svaki model iz kataloga ima maržu za podrazumevana podešavanja", () => {
  for (const seed of STUDIO_MODELS) {
    const margin = defaultMargin({
      paramSpec: seed.paramSpec,
      priceRule: seed.priceRule,
      inputModes: seed.inputModes,
      capabilities: JSON.stringify(seed.capabilities),
    });

    expect(margin, seed.slug).not.toBeNull();
    // Marža 2,5x je cilj kataloga; zaokruživanje kredita naviše je ume podići,
    // ali nikad ispod praga na kojem admin ekran boji upozorenje.
    expect(margin ?? 0, seed.slug).toBeGreaterThanOrEqual(LOW_MARGIN_THRESHOLD);
  }
});

test("tabela nabraja kombinacije, i preskače onu koju katalog ne nudi", () => {
  const table = tableOf("seedance-20");
  const combinations = table.rows.map((row) => row.label);

  expect(combinations).toContain("Mini · 480p");
  expect(combinations).toContain("Standard · 1080p");
  // Mini nema 1080p ni 4K - ne postoji u `lookup` mapi, pa nema ni reda.
  expect(combinations).not.toContain("Mini · 1080p");
  expect(combinations).not.toContain("Mini · 4K");
});

test("cena u tabeli je doslovno `computeCredits` - nema druge računice", () => {
  const seed = seedOf("nano-banana-2");
  const table = tableOf("nano-banana-2");
  const row = table.rows.find((entry) => entry.label === "4K");
  expect(row).toBeDefined();

  expect(row?.credits).toBe(
    computeCredits(seed.priceRule, { resolution: "4K", aspect_ratio: "1:1" }, "text"),
  );
  // 34, ne 30: 4K kod Google-a košta $0,151, a ne $0,134 (zvanični cenovnik).
  expect(row?.credits).toBe(34);
});

test("izmena osnove pomera SVAKU kombinaciju, i to se vidi u tabeli", () => {
  const seed = seedOf("seedream-5-pro");
  const before = tableOf("seedream-5-pro");

  const edited = applyPriceEdit(seed.priceRule, { baseUsd: (seed.priceRule.baseUsd ?? 0) * 2 });
  expect(edited.ok).toBe(true);
  if (!edited.ok) return;
  const after = tableOf("seedream-5-pro", edited.rule);

  expect(after.rows).toHaveLength(before.rows.length);
  for (const [index, row] of after.rows.entries()) {
    // Layerize ima SVOJE pravilo (`modeRules`) i ne prati roditeljsku osnovu -
    // zato se poredi samo tamo gde cena stvarno zavisi od nje.
    if (row.inputMode === "layerize") continue;
    expect(row.costUsd, row.label).toBeCloseTo(before.rows[index].costUsd * 2, 6);
  }
});

test("tabela priznaje šta je izostavila i pamti najgoru maržu iz CELOG prostora", () => {
  const seed = seedOf("gpt-image-2");
  const full = priceTable({
    paramSpec: seed.paramSpec,
    priceRule: seed.priceRule,
    inputModes: seed.inputModes,
    capabilities: JSON.stringify(seed.capabilities),
    locale: "sr",
    limit: 200,
  });
  const cut = priceTable({
    paramSpec: seed.paramSpec,
    priceRule: seed.priceRule,
    inputModes: seed.inputModes,
    capabilities: JSON.stringify(seed.capabilities),
    locale: "sr",
    limit: 3,
  });

  expect(cut.rows).toHaveLength(3);
  expect(cut.hidden).toBe(full.rows.length - 3);
  // Najgora marža je ista bez obzira na to koliko je redova prikazano - inače
  // bi kap u prikazu sakrio baš onu kombinaciju zbog koje se gleda.
  expect(cut.worstMargin).toBe(full.worstMargin);
});

test("model bez cene za nijednu kombinaciju daje praznu tabelu, ne tabelu nula", () => {
  const table = priceTable({
    paramSpec: [],
    priceRule: { unit: "image" },
    inputModes: ["text"],
    capabilities: "{}",
    locale: "sr",
  });

  expect(table.rows).toEqual([]);
  expect(table.worstMargin).toBeNull();
});

test("osnova se menja samo tamo gde cena stvarno izlazi iz nje", () => {
  expect(isBaseUsdEditable(seedOf("seedream-45").priceRule)).toBe(true);
  // GPT Image cenu čita iz tabele - `baseUsd` bi bio broj koji ništa ne radi.
  expect(isBaseUsdEditable(seedOf("gpt-image-2").priceRule)).toBe(false);
});
