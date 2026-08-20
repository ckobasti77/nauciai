/**
 * Dva obavezna testa nad CELIM katalogom v4 (.studio-run/prompts/S5.md):
 *
 * 1. **Marža nad celim prostorom parametara** - nijedan model se ni u jednoj
 *    kombinaciji ne sme prodavati ispod nabavne cene.
 * 2. **Doslednost specifikacija** - svaki režim ima endpoint i slotove, svaki
 *    parametar koji cena pominje postoji kao kontrola, i svaka vrednost koju
 *    `lookup` očekuje postoji kao opcija.
 *
 * Uz njih idu tabele iz kataloga (sekcije 2, 3 i 4) i zamke iz S5.md, jer
 * invarijanta hvata "prodajemo ispod nabavne", ali ne hvata "prepisali smo
 * pogrešan broj".
 */

import { expect, test } from "vitest";

import {
  type ParamControl,
  isControlVisible,
  sanitizeSpecParams,
} from "../studioParamSpec";
import {
  computeCostUsd,
  computeCredits,
  CREDIT_FACTOR,
  isCombinationPriceable,
  type PriceRule,
  REFERENCE_WITH_VIDEO_MODE,
} from "../studioPricing";
import { SEEDANCE_20, SEEDANCE_25, SEEDREAM_5_PRO } from "./bytePlusModels";
import { STUDIO_MODELS, studioModelBySlug } from "./catalogModels";
import {
  AUDIO_ISOLATION,
  DIALOGUE,
  DUBBING,
  MUSIC,
  SFX,
  STT,
  TTS,
  VOICE_CHANGER,
} from "./falAudioModels";
import { GPT_IMAGE_15, GPT_IMAGE_2, SEEDREAM_45, SEEDREAM_5_LITE } from "./falImageModels";
import {
  KLING_AVATAR,
  KLING_LIPSYNC,
  KLING_MOTION,
  KLING_TRYON,
  KLING_V2A,
} from "./falToolModels";
import { KLING_3, KLING_3_TURBO, KLING_OMNI, MINIMAX_H3 } from "./falVideoModels";
import { GEMINI_OMNI, VEO_31, VEO_31_FAST, VEO_31_LITE } from "./googleModels";
import { NANO_BANANA_2, NANO_BANANA_PRO } from "./googleImageModels";
import { quantitySourceOf } from "./modelControls";
import type { StudioModelSeed } from "./modelSeed";

// ── pomoćne funkcije: prostor parametara jednog reda ───────────────────────

/** Kontrole vidljive u datom režimu; ključ koji se ponavlja rešava režim. */
function visibleControls(seed: StudioModelSeed, mode: string): ParamControl[] {
  const byKey = new Map<string, ParamControl>();
  for (const control of seed.paramSpec) {
    if (isControlVisible(control, mode)) byKey.set(control.key, control);
  }

  return [...byKey.values()];
}

/**
 * Vrednosti koje jedna kontrola uzima u kombinatorici. Kontrola koja ne dira
 * cenu daje samo svoju podrazumevanu vrednost - inače bi prostor eksplodirao na
 * klizačima izgovora, a nijedna od tih vrednosti ne menja račun.
 */
function valuesFor(control: ParamControl): unknown[] {
  if (!control.affectsPrice) return [control.default];
  if (control.options && control.options.length > 0) {
    return control.options.map((option) => option.value);
  }
  if (control.type === "switch") return [false, true];
  if (control.type === "slider" || control.type === "number") {
    const min = typeof control.min === "number" ? control.min : 1;
    const max = typeof control.max === "number" ? control.max : min;
    const step = typeof control.step === "number" && control.step > 0 ? control.step : 1;
    const steps = Math.floor((max - min) / step);
    const middle = min + Math.floor(steps / 2) * step;

    return [...new Set([min, middle, max])];
  }

  return [control.default];
}

/** Svi režimi u kojima se model može naručiti, plus sniženi režim za reference sa videom. */
function pricingModes(seed: StudioModelSeed): string[] {
  const modes = [...seed.inputModes];
  const rule = seed.priceRule;
  if (rule.modeMultipliers && Object.hasOwn(rule.modeMultipliers, REFERENCE_WITH_VIDEO_MODE)) {
    modes.push(REFERENCE_WITH_VIDEO_MODE);
  }

  return modes;
}

/** Pravilo koje stvarno važi u režimu (Seedream layerize ima svoje). */
function ruleForMode(rule: PriceRule, mode: string): PriceRule {
  const scoped = rule.modeRules?.[mode];

  return scoped ?? rule;
}

type Combination = { mode: string; params: Record<string, unknown> };

/**
 * Ceo prostor parametara jednog reda: dekartov proizvod svih kontrola koje
 * diraju cenu, po svakom režimu, plus količine koje ne dolaze iz forme
 * (`capabilities.quantity`) i broj dodatnih ulaznih fajlova (`extras`).
 */
function combinationsFor(seed: StudioModelSeed): Combination[] {
  const combinations: Combination[] = [];

  for (const mode of pricingModes(seed)) {
    const specMode = mode === REFERENCE_WITH_VIDEO_MODE ? "reference" : mode;
    const rule = ruleForMode(seed.priceRule, specMode);
    let rows: Array<Record<string, unknown>> = [{}];

    const axes: Array<[string, unknown[]]> = [];
    for (const control of visibleControls(seed, specMode)) {
      axes.push([control.key, valuesFor(control)]);
    }

    // Količina koju meri server (dužina okačenog fajla, broj znakova).
    const quantity = quantitySourceOf(seed);
    const hasQuantityControl = axes.some(([key]) => key === rule.quantityParam);
    if (rule.quantityParam && !hasQuantityControl && quantity) {
      axes.push([quantity.param, [quantity.min, quantity.max]]);
    }

    // Dodatne ulazne slike preko besplatne kvote - broj koji upisuje server.
    for (const extra of rule.extras ?? []) {
      axes.push([extra.param, [0, extra.freeCount, extra.freeCount + 3]]);
    }

    for (const [key, values] of axes) {
      const next: Array<Record<string, unknown>> = [];
      for (const row of rows) {
        for (const value of values) next.push({ ...row, [key]: value });
      }
      rows = next;
    }

    for (const params of rows) {
      if (!isCombinationPriceable(seed.priceRule, params, mode)) continue;
      combinations.push({ mode, params });
    }
  }

  return combinations;
}

// ── 1. OBAVEZAN TEST: marža nad celim prostorom parametara ─────────────────

test("marža nikad ne pada ispod 1,0 - ni na jednom modelu, ni u jednoj kombinaciji", () => {
  let checked = 0;

  for (const seed of STUDIO_MODELS) {
    const combinations = combinationsFor(seed);
    // Model bez ijedne cenovne kombinacije je red koji se ne može naručiti.
    expect(combinations.length, `${seed.slug} nema nijednu kombinaciju sa cenom`).toBeGreaterThan(
      0,
    );

    for (const { mode, params } of combinations) {
      const costUsd = computeCostUsd(seed.priceRule, params, mode);
      const credits = computeCredits(seed.priceRule, params, mode);
      // Ista šestodecimalna granica koju `computeCredits` primenjuje pre
      // `ceil`-a: `0,05 x 3,2 x 15 x 216,25` u binarnom zapisu ispadne
      // 519,0000000000001, pa bi sirovo poredjenje prijavilo maržu 0,9999...
      // na ceni koja je tačno pokrivena.
      const naplativo = Math.round(costUsd * CREDIT_FACTOR * 1e6) / 1e6;
      expect(costUsd, `${seed.slug} ${mode} ${JSON.stringify(params)}`).toBeGreaterThan(0);
      expect(
        credits,
        `${seed.slug} ${mode} ${JSON.stringify(params)}`,
      ).toBeGreaterThanOrEqual(naplativo);
      checked += 1;
    }
  }

  // Da test ne prodje tiho ako kombinatorika pukne na praznom nizu.
  expect(checked).toBeGreaterThan(800);
});

// ── 2. OBAVEZAN TEST: doslednost specifikacija ─────────────────────────────

/** Sve opcije jednog ključa, spojene preko svih kontrola sa tim ključem. */
function optionValuesByKey(seed: StudioModelSeed): Map<string, Set<string>> {
  const byKey = new Map<string, Set<string>>();
  for (const control of seed.paramSpec) {
    if (!control.options) continue;
    const values = byKey.get(control.key) ?? new Set<string>();
    for (const option of control.options) values.add(option.value);
    byKey.set(control.key, values);
  }

  return byKey;
}

function controlsByKey(seed: StudioModelSeed): Map<string, ParamControl[]> {
  const byKey = new Map<string, ParamControl[]>();
  for (const control of seed.paramSpec) {
    byKey.set(control.key, [...(byKey.get(control.key) ?? []), control]);
  }

  return byKey;
}

test("svaki režim ima endpoint i slotove, i nijedan slot ne visi van režima", () => {
  for (const seed of STUDIO_MODELS) {
    expect(seed.inputModes.length, `${seed.slug} nema nijedan ulazni režim`).toBeGreaterThan(0);

    for (const mode of seed.inputModes) {
      const endpoint = seed.endpoints[mode];
      expect(typeof endpoint, `${seed.slug}/${mode} nema endpoint`).toBe("string");
      expect(endpoint.length).toBeGreaterThan(0);

      const slots = seed.inputSpec[mode];
      expect(slots, `${seed.slug}/${mode} nema inputSpec`).toBeDefined();
      for (const [slot, spec] of Object.entries(slots)) {
        expect(spec.max, `${seed.slug}/${mode}/${slot}`).toBeGreaterThan(0);
        expect(spec.accept.length, `${seed.slug}/${mode}/${slot}`).toBeGreaterThan(0);
      }
    }

    // Obrnuti smer: endpoint ili slotovi za režim koji model ne nudi su mrtav
    // kod koji tvrdi da nešto radi.
    expect(Object.keys(seed.endpoints).sort()).toEqual([...seed.inputModes].sort());
    expect(Object.keys(seed.inputSpec).sort()).toEqual([...seed.inputModes].sort());
  }
});

test("svaki parametar koji cena pominje postoji kao kontrola koja utiče na cenu", () => {
  for (const seed of STUDIO_MODELS) {
    const controls = controlsByKey(seed);
    const quantity = quantitySourceOf(seed);
    const rules: PriceRule[] = [seed.priceRule, ...Object.values(seed.priceRule.modeRules ?? {})];

    for (const rule of rules) {
      const priced = [
        ...(rule.lookup?.params ?? []),
        ...(rule.multipliers ?? []).map((multiplier) => multiplier.param),
      ];
      for (const param of priced) {
        const found = controls.get(param);
        expect(found, `${seed.slug}: ${param} nije kontrola`).toBeDefined();
        for (const control of found ?? []) {
          expect(control.affectsPrice, `${seed.slug}: ${param} ne prijavljuje da menja cenu`).toBe(
            true,
          );
        }
      }

      if (rule.quantityParam) {
        const isControl = controls.has(rule.quantityParam);
        const isMeasured = quantity?.param === rule.quantityParam;
        expect(
          isControl || isMeasured,
          `${seed.slug}: količina ${rule.quantityParam} nije ni kontrola ni merena vrednost`,
        ).toBe(true);
        if (isMeasured && quantity) {
          expect(quantity.min).toBeGreaterThan(0);
          expect(quantity.max).toBeGreaterThanOrEqual(quantity.min);
        }
      }

      // `extras` broji fajlove koje je server stvarno primio. Da je kontrola,
      // klijent bi mogao da pošalje devet slika a prijavi pet.
      for (const extra of rule.extras ?? []) {
        expect(controls.has(extra.param), `${seed.slug}: ${extra.param} ne sme biti kontrola`).toBe(
          false,
        );
      }
    }
  }
});

test("svaka vrednost koju lookup ili množilac očekuje postoji kao opcija", () => {
  for (const seed of STUDIO_MODELS) {
    const options = optionValuesByKey(seed);
    const rules: PriceRule[] = [seed.priceRule, ...Object.values(seed.priceRule.modeRules ?? {})];

    for (const rule of rules) {
      for (const key of Object.keys(rule.lookup?.map ?? {})) {
        const parts = key.split("|");
        expect(parts.length, `${seed.slug}: ključ ${key}`).toBe(rule.lookup?.params.length);
        rule.lookup?.params.forEach((param, index) => {
          const values = options.get(param);
          // Prekidač nema opcije - njegove vrednosti su on/off, i to je ugovor
          // `studioPricing.keyPart`-a, ne slučajnost.
          if (!values) {
            expect(["on", "off"], `${seed.slug}: ${param}=${parts[index]}`).toContain(parts[index]);
            return;
          }
          expect(values, `${seed.slug}: ${param}=${parts[index]}`).toContain(parts[index]);
        });
      }

      for (const multiplier of rule.multipliers ?? []) {
        for (const value of Object.keys(multiplier.map)) {
          const values = options.get(multiplier.param);
          if (!values) {
            expect(["on", "off"], `${seed.slug}: ${multiplier.param}=${value}`).toContain(value);
            continue;
          }
          expect(values, `${seed.slug}: ${multiplier.param}=${value}`).toContain(value);
        }
      }
    }
  }
});

test("podrazumevane vrednosti su same po sebi ispravan i naplativ izbor", () => {
  for (const seed of STUDIO_MODELS) {
    for (const control of seed.paramSpec) {
      if (control.options && control.options.length > 0) {
        expect(
          control.options.map((option) => option.value),
          `${seed.slug}: podrazumevana vrednost ${control.key}`,
        ).toContain(control.default);
      }
      if (control.type === "slider" || control.type === "number") {
        expect(typeof control.default).toBe("number");
        if (typeof control.min === "number") {
          expect(control.default as number).toBeGreaterThanOrEqual(control.min);
        }
        if (typeof control.max === "number") {
          expect(control.default as number).toBeLessThanOrEqual(control.max);
        }
      }
    }

    // Prazna forma mora da ima cenu u SVAKOM režimu - inače korisnik otvori
    // stranicu i dočeka ga "nedostupna kombinacija" pre nego što išta dodirne.
    for (const mode of seed.inputModes) {
      const sanitized = sanitizeSpecParams(seed.paramSpec, seed.priceRule, {}, mode);
      expect(sanitized.ok, `${seed.slug}/${mode}: ${JSON.stringify(sanitized)}`).toBe(true);
    }
  }
});

test("endpoint sa {tier} placeholderom ima mapu tarifa za svaku rezoluciju", () => {
  for (const seed of STUDIO_MODELS) {
    const needsTier = Object.values(seed.endpoints).some((endpoint) => endpoint.includes("{tier}"));
    if (!needsTier) continue;

    const tiers = seed.capabilities.tierByResolution as Record<string, string> | undefined;
    expect(tiers, `${seed.slug}: {tier} bez mape tarifa`).toBeDefined();
    for (const value of optionValuesByKey(seed).get("resolution") ?? []) {
      expect(tiers?.[value], `${seed.slug}: tarifa za ${value}`).toBeTruthy();
    }
  }
});

// ── katalog: koliko ih ima i ko su ─────────────────────────────────────────

test("katalog ima 30 redova, jedinstvene slugove i jedinstven redosled", () => {
  expect(STUDIO_MODELS).toHaveLength(30);
  expect(new Set(STUDIO_MODELS.map((model) => model.slug)).size).toBe(30);
  expect(new Set(STUDIO_MODELS.map((model) => model.sortOrder)).size).toBe(30);

  const byKind = { image: 0, video: 0, audio: 0 };
  for (const model of STUDIO_MODELS) byKind[model.kind] += 1;
  // 7 modela za slike + Kling proba odeće (izlaz je slika) = 8.
  expect(byKind.image).toBe(8);
  // 10 video modela + tri Kling alata koji vraćaju video = 13.
  expect(byKind.video).toBe(13);
  // 8 ElevenLabs alata + Kling zvuk za video = 9.
  expect(byKind.audio).toBe(9);

  const byProvider = { fal: 0, google: 0, byteplus: 0 };
  for (const model of STUDIO_MODELS) byProvider[model.provider] += 1;
  expect(byProvider.google).toBe(4);
  expect(byProvider.byteplus).toBe(3);
  expect(byProvider.fal).toBe(23);

  expect(studioModelBySlug("nano-banana-pro")).toBe(NANO_BANANA_PRO);
  expect(studioModelBySlug("nema-me")).toBeUndefined();
});

// ── tabele cena iz kataloga (sekcije 2, 3, 4) ──────────────────────────────

function creditsFor(seed: StudioModelSeed, params: Record<string, unknown>, mode?: string): number {
  return computeCredits(seed.priceRule, params, mode);
}

test("Nano Banana 2 i Pro: tabele iz kataloga 2.1 i 2.2", () => {
  for (const [resolution, credits] of [
    ["0.5K", 12],
    ["1K", 16],
    ["2K", 23],
    ["4K", 30],
  ] as const) {
    expect(creditsFor(NANO_BANANA_2, { resolution, num_images: 1 })).toBe(credits);
  }

  expect(creditsFor(NANO_BANANA_PRO, { resolution: "2K", num_images: 1 })).toBe(33);
  expect(creditsFor(NANO_BANANA_PRO, { resolution: "4K", num_images: 1 })).toBe(56);

  // Thinking tokeni se plaćaju jednom po generaciji, ne po slici.
  expect(computeCostUsd(NANO_BANANA_2.priceRule, { resolution: "1K", num_images: 4 })).toBeCloseTo(
    0.271,
    10,
  );
});

test("Nano Banana Pro NEMA 1K - Google ga naplaćuje isto kao 2K (katalog 2.2)", () => {
  const resolution = NANO_BANANA_PRO.paramSpec.find((control) => control.key === "resolution");
  expect(resolution?.options?.map((option) => option.value)).toEqual(["2K", "4K"]);
  expect(isCombinationPriceable(NANO_BANANA_PRO.priceRule, { resolution: "1K" })).toBe(false);
});

test("GPT Image 2: cena NIJE monotona po rezoluciji - zato lookup, ne množioci", () => {
  const high1024 = creditsFor(GPT_IMAGE_2, { quality: "high", size: "1024x1024", num_images: 1 });
  const high1536 = creditsFor(GPT_IMAGE_2, { quality: "high", size: "1536x1024", num_images: 1 });
  expect(high1024).toBeGreaterThan(high1536);
  const usd = (size: string) =>
    computeCostUsd(GPT_IMAGE_2.priceRule, { quality: "high", size, num_images: 1 });
  expect(usd("1024x1024")).toBeCloseTo(0.211, 10);
  expect(usd("1536x1024")).toBeCloseTo(0.165, 10);

  // Katalog 2.3: medium 1024² = 12 kredita, high 4K = 87.
  expect(creditsFor(GPT_IMAGE_2, { quality: "medium", size: "1024x1024", num_images: 1 })).toBe(12);
  expect(creditsFor(GPT_IMAGE_2, { quality: "high", size: "3840x2160", num_images: 1 })).toBe(87);

  // Katalog 2.4: high 1024² i high portret kod GPT Image 1.5.
  expect(creditsFor(GPT_IMAGE_15, { quality: "high", size: "1024x1024", num_images: 1 })).toBe(29);
  expect(creditsFor(GPT_IMAGE_15, { quality: "high", size: "1024x1536", num_images: 1 })).toBe(44);
});

test("GPT Image: quality i size su PINOVANI podrazumevanom vrednošću", () => {
  // fal podrazumeva `quality: high` (katalog 2.3). Zahtev bez ta dva polja bi
  // naplatio low tarifu za high posao - trideset pet puta manje nego što košta.
  for (const seed of [GPT_IMAGE_2, GPT_IMAGE_15]) {
    const sanitized = sanitizeSpecParams(seed.paramSpec, seed.priceRule, {}, "text");
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;
    expect(sanitized.params.quality).toBe("medium");
    expect(sanitized.params.size).toBe("1024x1024");
  }
});

test("Seedream 4.5 i 5 Lite: ravna cena po slici (katalog 2.5 i 2.7)", () => {
  expect(creditsFor(SEEDREAM_45, { num_images: 1 })).toBe(9);
  expect(creditsFor(SEEDREAM_45, { num_images: 4 })).toBe(35);
  expect(creditsFor(SEEDREAM_5_LITE, { num_images: 1 })).toBe(8);
  // Lite i Pro idu RAZLIČITIM rutama - ista porodica, dva provajdera.
  expect(SEEDREAM_5_LITE.provider).toBe("fal");
  expect(SEEDREAM_5_PRO.provider).toBe("byteplus");
});

test("Kling 3.0: kr/s po ćelijama iz kataloga 3.1", () => {
  const perSecond = (resolution: string, audio: boolean, voice: boolean) =>
    creditsFor(KLING_3, { resolution, audio, voice_control: voice, duration: 1 });

  expect(perSecond("720p", false, false)).toBe(19);
  expect(perSecond("720p", true, false)).toBe(28);
  expect(perSecond("720p", true, true)).toBe(34);
  expect(perSecond("1080p", false, false)).toBe(25);
  expect(perSecond("1080p", true, false)).toBe(37);
  expect(perSecond("1080p", true, true)).toBe(43);
  expect(perSecond("4K", true, false)).toBe(91);

  // 5 s u 720p sa zvukom: katalog u koloni "5s" množi ZAOKRUŽENU sekundu
  // (28 x 5 = 140), a sekcija 1.3 propisuje `ceil` tačno jednom nad ukupnom
  // cenom - `ceil(0,126 x 5 x 216,25) = 137`. Pravilo je izvor istine, isto
  // kao kod Seedance-a (33 kr/s, ali 164 za 5 s).
  expect(
    creditsFor(KLING_3, { resolution: "720p", audio: true, voice_control: false, duration: 5 }),
  ).toBe(137);

  // 4K ne postaje jeftiniji bez zvuka - ista cena, i UI to mora da kaže.
  expect(perSecond("4K", false, false)).toBe(perSecond("4K", true, false));

  // Kontrola glasa bez zvuka ne postoji ni kao cena, pa ni kao ponuda.
  expect(
    isCombinationPriceable(KLING_3.priceRule, {
      resolution: "720p",
      audio: false,
      voice_control: true,
    }),
  ).toBe(false);
});

test("Kling labele kažu REZOLUCIJU, a tarifa standard/pro ostaje u ruti", () => {
  for (const seed of [KLING_3, KLING_3_TURBO]) {
    const values = optionValuesByKey(seed).get("resolution") ?? new Set<string>();
    for (const value of values) {
      expect(value).toMatch(/^(480p|720p|1080p|2K|4K)$/);
    }
    expect([...values]).not.toContain("standard");
    expect([...values]).not.toContain("pro");
  }

  expect(KLING_3.capabilities.tierByResolution).toEqual({
    "720p": "standard",
    "1080p": "pro",
    "4K": "pro",
  });
});

test("Kling Turbo: 25 i 31 kr/s, bez 4K, prvi i poslednji kadar samo u 720p", () => {
  expect(creditsFor(KLING_3_TURBO, { resolution: "720p", duration: 1 })).toBe(25);
  expect(creditsFor(KLING_3_TURBO, { resolution: "1080p", duration: 1 })).toBe(31);
  expect(isCombinationPriceable(KLING_3_TURBO.priceRule, { resolution: "4K" })).toBe(false);

  const inFirstLast = visibleControls(KLING_3_TURBO, "first_last").find(
    (control) => control.key === "resolution",
  );
  expect(inFirstLast?.options?.map((option) => option.value)).toEqual(["720p"]);

  const inText = visibleControls(KLING_3_TURBO, "text").find(
    (control) => control.key === "resolution",
  );
  expect(inText?.options?.map((option) => option.value)).toEqual(["720p", "1080p"]);

  // Zvuk je u ceni Turba - prekidača nema jer ne bi menjao ništa.
  expect(KLING_3_TURBO.paramSpec.some((control) => control.key === "audio")).toBe(false);
});

test("Kling Omni: 19/25/31/91 kr/s, a izmena videa nosi množilac 1,5 (katalog 3.3)", () => {
  expect(creditsFor(KLING_OMNI, { resolution: "720p", audio: false, duration: 1 })).toBe(19);
  expect(creditsFor(KLING_OMNI, { resolution: "720p", audio: true, duration: 1 })).toBe(25);
  expect(creditsFor(KLING_OMNI, { resolution: "1080p", audio: true, duration: 1 })).toBe(31);
  expect(creditsFor(KLING_OMNI, { resolution: "4K", audio: true, duration: 1 })).toBe(91);
  expect(
    creditsFor(KLING_OMNI, { resolution: "720p", audio: false, duration: 1 }, "video"),
  ).toBe(28);
});

test("MiniMax H3: 11/13/29/35 kr/s, LoRA +25%, šesta referenca se naplaćuje", () => {
  const perSecond = (resolution: string) =>
    creditsFor(MINIMAX_H3, { resolution, lora: false, duration: 1 });

  expect(perSecond("480p")).toBe(11);
  expect(perSecond("768p")).toBe(13);
  expect(perSecond("2K")).toBe(29);
  expect(perSecond("4K")).toBe(35);

  // Katalog 3.6: 5 s u 768P sa nativnim zvukom = 65 kredita.
  expect(creditsFor(MINIMAX_H3, { resolution: "768p", lora: false, duration: 5 })).toBe(65);

  const withLora = computeCostUsd(MINIMAX_H3.priceRule, {
    resolution: "768p",
    lora: true,
    duration: 5,
  });
  const withoutLora = computeCostUsd(MINIMAX_H3.priceRule, {
    resolution: "768p",
    lora: false,
    duration: 5,
  });
  expect(withLora / withoutLora).toBeCloseTo(1.25, 10);

  // Pet referenci je besplatno, šesta nosi $0,08.
  const base = { resolution: "768p", lora: false, duration: 5 };
  expect(computeCostUsd(MINIMAX_H3.priceRule, { ...base, reference_images: 5 })).toBeCloseTo(
    withoutLora,
    10,
  );
  expect(computeCostUsd(MINIMAX_H3.priceRule, { ...base, reference_images: 6 })).toBeCloseTo(
    withoutLora + 0.08,
    10,
  );
});

test("Kling alati: tabela iz kataloga 3.9, sa zaokruživanjem lipsync-a na 5 s", () => {
  expect(creditsFor(KLING_AVATAR, { quality: "720p", duration: 1 })).toBe(13);
  expect(creditsFor(KLING_AVATAR, { quality: "1080p", duration: 1 })).toBe(25);
  expect(creditsFor(KLING_MOTION, { resolution: "720p", duration: 1 })).toBe(28);
  expect(creditsFor(KLING_MOTION, { resolution: "1080p", duration: 1 })).toBe(37);
  expect(creditsFor(KLING_TRYON, {})).toBe(16);
  expect(creditsFor(KLING_V2A, {})).toBe(8);

  // Video od 3 s se naplaćuje kao 5 s, i 5 s košta isto koliko 3 s.
  expect(KLING_LIPSYNC.priceRule.roundUpTo).toBe(5);
  expect(creditsFor(KLING_LIPSYNC, { duration: 3 })).toBe(creditsFor(KLING_LIPSYNC, { duration: 5 }));
  expect(creditsFor(KLING_LIPSYNC, { duration: 6 })).toBe(creditsFor(KLING_LIPSYNC, { duration: 10 }));
});

test("TTS se naplaćuje po HILJADU znakova, ne po znaku (katalog 4.1)", () => {
  expect(TTS.priceRule.unit).toBe("chars1k");
  expect(TTS.priceRule.quantityParam).toBe("char_count");
  expect(computeCostUsd(TTS.priceRule, { char_count: 1000 })).toBeCloseTo(0.1, 10);
  expect(computeCostUsd(TTS.priceRule, { char_count: 500 })).toBeCloseTo(0.05, 10);
  expect(creditsFor(TTS, { char_count: 1000 })).toBe(22);
  expect(creditsFor(DIALOGUE, { char_count: 1000 })).toBe(22);

  // Količina se meri iz teksta, nije kontrola - inače bi klijent mogao da
  // prijavi sto znakova a pošalje pet hiljada.
  expect(quantitySourceOf(TTS)?.from).toBe("text_length");
  expect(TTS.paramSpec.some((control) => control.key === "char_count")).toBe(false);
});

test("ostali audio alati: tabela iz kataloga 4.2", () => {
  expect(creditsFor(SFX, { duration: 5 })).toBe(3);
  expect(creditsFor(MUSIC, { minutes: 1 })).toBe(130);
  expect(creditsFor(STT, { minutes: 1 })).toBe(2);
  expect(creditsFor(VOICE_CHANGER, { minutes: 1 })).toBe(65);
  expect(creditsFor(AUDIO_ISOLATION, { minutes: 1 })).toBe(22);
  expect(creditsFor(DUBBING, { minutes: 1 })).toBe(130);

  // Scribe V2, ne V1: V1 je 3,75x skuplji za isti posao.
  expect(STT.endpoints.audio).toContain("scribe-v2");
});

test("modeli koji su već bili u grani nisu promenjeni ovim korakom", () => {
  // S3 i S4 su ove redove doneli i pokrili svojim testovima; katalog ih samo
  // uključuje u isti niz. Ako se ovde nešto razidje, razišao se izvor.
  for (const seed of [SEEDREAM_5_PRO, SEEDANCE_20, SEEDANCE_25, VEO_31_LITE, VEO_31_FAST, VEO_31, GEMINI_OMNI]) {
    expect(studioModelBySlug(seed.slug)).toBe(seed);
  }
});
