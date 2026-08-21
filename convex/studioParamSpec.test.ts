import { expect, test } from "vitest";

import { SEEDANCE_20, SEEDREAM_5_PRO } from "./providers/bytePlusModels";
import {
  availableOptionValues,
  isControlVisible,
  type ParamControl,
  parseParamSpec,
  sanitizeSpecParams,
} from "./studioParamSpec";
import type { PriceRule } from "./studioPricing";

function controlOf(spec: ParamControl[], key: string): ParamControl {
  const control = spec.find((entry) => entry.key === key);
  if (!control) throw new Error(`test setup: kontrola "${key}" ne postoji`);

  return control;
}

// ── 1. Sakrivanje nedostupnih opcija (katalog 3.4: Mini nema 1080p ni 4K) ──

test("kad je izabran Mini, rezolucija nudi samo 480p i 720p", () => {
  const control = controlOf(SEEDANCE_20.paramSpec, "resolution");
  const rule = SEEDANCE_20.priceRule;

  expect(availableOptionValues(control, rule, { tier: "mini" })).toEqual(["480p", "720p"]);
  expect(availableOptionValues(control, rule, { tier: "fast" })).toEqual(["480p", "720p"]);
  expect(availableOptionValues(control, rule, { tier: "standard" })).toEqual([
    "480p",
    "720p",
    "1080p",
    "4K",
  ]);
});

test("i obrnuto: kad je izabran 1080p, brzina nudi samo Standard", () => {
  const control = controlOf(SEEDANCE_20.paramSpec, "tier");
  const rule = SEEDANCE_20.priceRule;

  expect(availableOptionValues(control, rule, { resolution: "1080p" })).toEqual(["standard"]);
  expect(availableOptionValues(control, rule, { resolution: "4K" })).toEqual(["standard"]);
  expect(availableOptionValues(control, rule, { resolution: "720p" })).toEqual([
    "standard",
    "fast",
    "mini",
  ]);
});

test("kontrola koja ne utiče na cenu ne skriva ništa", () => {
  const control: ParamControl = {
    key: "aspect_ratio",
    type: "select",
    labelSr: "Odnos stranica",
    labelEn: "Aspect ratio",
    default: "1:1",
    options: [
      { value: "1:1", labelSr: "1:1", labelEn: "1:1" },
      { value: "16:9", labelSr: "16:9", labelEn: "16:9" },
    ],
    affectsPrice: false,
  };
  const rule: PriceRule = { unit: "image", baseUsd: 0.04 };

  expect(availableOptionValues(control, rule, {})).toEqual(["1:1", "16:9"]);
});

// ── 2. Server odbija istu kombinaciju koju UI ne nudi ──────────────────────

test("Mini + 1080p se ODBIJA na serveru, ne odseca na nešto naplativo", () => {
  const result = sanitizeSpecParams(
    SEEDANCE_20.paramSpec,
    SEEDANCE_20.priceRule,
    { prompt: "lisica trči", tier: "mini", resolution: "1080p", duration: 5 },
    "text",
  );

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.reason).toContain("NEDOSTUPNA_KOMBINACIJA");
  expect(result.reason).toContain("tier=mini");
  expect(result.reason).toContain("resolution=1080p");
});

test("Mini + 4K se takodje odbija, a Mini + 720p prolazi", () => {
  const reject = sanitizeSpecParams(
    SEEDANCE_20.paramSpec,
    SEEDANCE_20.priceRule,
    { tier: "mini", resolution: "4K", duration: 5 },
    "text",
  );
  expect(reject.ok).toBe(false);

  const accept = sanitizeSpecParams(
    SEEDANCE_20.paramSpec,
    SEEDANCE_20.priceRule,
    { tier: "mini", resolution: "720p", duration: 5 },
    "text",
  );
  expect(accept.ok).toBe(true);
  if (!accept.ok) return;
  expect(accept.params).toMatchObject({ tier: "mini", resolution: "720p", duration: 5 });
});

test("vrednost van skupa opcija se odbija, ne odseca", () => {
  const result = sanitizeSpecParams(
    SEEDANCE_20.paramSpec,
    SEEDANCE_20.priceRule,
    { tier: "ultra", resolution: "720p", duration: 5 },
    "text",
  );

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.reason).toBe("NEPOZNATA_VREDNOST_PARAMETRA:tier");
});

test("trajanje se odseca na min/max, a van reda veličine se odbija", () => {
  const clamped = sanitizeSpecParams(
    SEEDANCE_20.paramSpec,
    SEEDANCE_20.priceRule,
    { duration: 2 },
    "text",
  );
  expect(clamped.ok).toBe(true);
  if (clamped.ok) expect(clamped.params.duration).toBe(4);

  const capped = sanitizeSpecParams(
    SEEDANCE_20.paramSpec,
    SEEDANCE_20.priceRule,
    { duration: 30 },
    "text",
  );
  expect(capped.ok).toBe(true);
  if (capped.ok) expect(capped.params.duration).toBe(12);

  const rejected = sanitizeSpecParams(
    SEEDANCE_20.paramSpec,
    SEEDANCE_20.priceRule,
    { duration: 1200 },
    "text",
  );
  expect(rejected.ok).toBe(false);
  if (!rejected.ok) expect(rejected.reason).toBe("VAN_OPSEGA:duration");
});

test("izostavljeni parametri se popunjavaju podrazumevanim vrednostima kontrole", () => {
  const result = sanitizeSpecParams(
    SEEDANCE_20.paramSpec,
    SEEDANCE_20.priceRule,
    { prompt: "grad noću" },
    "text",
  );

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  // Bez ovoga bi `lookup` ključ bio nepotpun i cena bi pukla na poslu koji je
  // forma sasvim ispravno poslala.
  expect(result.params).toEqual({
    prompt: "grad noću",
    tier: "standard",
    resolution: "720p",
    duration: 5,
  });
});

// ── 3. Kontrole vezane za režim (Seedream 5 Pro layerize) ──────────────────

test("`layers` postoji samo u layerize režimu, `num_images` samo van njega", () => {
  const layers = controlOf(SEEDREAM_5_PRO.paramSpec, "layers");
  const numImages = controlOf(SEEDREAM_5_PRO.paramSpec, "num_images");

  expect(isControlVisible(layers, "layerize")).toBe(true);
  expect(isControlVisible(layers, "text")).toBe(false);
  expect(isControlVisible(numImages, "text")).toBe(true);
  expect(isControlVisible(numImages, "image_multi")).toBe(true);
  expect(isControlVisible(numImages, "layerize")).toBe(false);
});

test("layerize: `num_images` poslat sa klijenta tiho ispada, `layers` se popunjava", () => {
  const result = sanitizeSpecParams(
    SEEDREAM_5_PRO.paramSpec,
    SEEDREAM_5_PRO.priceRule,
    { prompt: "etiketa", num_images: 4, layers: 8 },
    "layerize",
  );

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.params).toEqual({ prompt: "etiketa", resolution: "1.5K", layers: 8 });
  expect(result.params.num_images).toBeUndefined();
});

test("broj slojeva se drži u opsegu 2-17 iz kataloga", () => {
  const low = sanitizeSpecParams(
    SEEDREAM_5_PRO.paramSpec,
    SEEDREAM_5_PRO.priceRule,
    { layers: 1 },
    "layerize",
  );
  expect(low.ok).toBe(true);
  if (low.ok) expect(low.params.layers).toBe(2);

  const high = sanitizeSpecParams(
    SEEDREAM_5_PRO.paramSpec,
    SEEDREAM_5_PRO.priceRule,
    { layers: 25 },
    "layerize",
  );
  expect(high.ok).toBe(true);
  if (high.ok) expect(high.params.layers).toBe(17);
});

// ── 4. paramSpec preživi put kroz bazu (JSON string) ──────────────────────

test("parseParamSpec vraća isti niz kontrola koji je upisan", () => {
  const parsed = parseParamSpec(JSON.stringify(SEEDANCE_20.paramSpec));

  expect(parsed).toEqual(SEEDANCE_20.paramSpec);
});

test("parseParamSpec odbija sve što nije niz i preskače unose bez key/type", () => {
  expect(parseParamSpec("nije json")).toBeNull();
  expect(parseParamSpec(JSON.stringify({ key: "prompt" }))).toBeNull();
  expect(parseParamSpec(JSON.stringify([{ key: "prompt" }, { type: "text" }, null]))).toEqual([]);
});
