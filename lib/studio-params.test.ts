/**
 * Testovi za `<ParamForm>` i `<PriceTag>` (.studio-run/prompts/S6.md).
 *
 * Obe komponente su tanke: forma crta ono što `paramValuesForMode`,
 * `visibleControls` i `buildParams` kažu, a značka ispisuje ono što
 * `priceDelta` vrati. Zato se ovde tvrdi tačno ono što se korisniku PRIKAŽE -
 * i to nad CELIM katalogom, ne nad izmišljenim modelom.
 *
 * Glavna tvrdnja: cifra na dugmetu je `computeCredits` nad istim objektom
 * parametara koji ide u `createJob`, i preživljava serversku kapiju
 * (`sanitizeSpecParams`) nepromenjena. Ako se te dve strane ikad raziđu, ovaj
 * fajl pada.
 */

import { describe, expect, test } from "vitest";

import { STUDIO_MODELS, studioModelBySlug } from "@/convex/providers/catalogModels";
import { quantitySourceOf } from "@/convex/providers/modelControls";
import type { StudioModelSeed } from "@/convex/providers/modelSeed";
import { availableOptionValues, sanitizeSpecParams, type ParamControl } from "@/convex/studioParamSpec";
import { computeCredits, type PriceRule } from "@/convex/studioPricing";
import {
  buildParams,
  clampControlNumber,
  creditsFor,
  creditsPerUnit,
  formatCredits,
  formatCreditsPerUnit,
  paramValuesForMode,
  priceDelta,
  priceDeltaLabel,
  stepPriceDelta,
  visibleControls,
} from "@/lib/studio-params";

/**
 * Količine koje korisnik ne bira nego se mere iz ulaza (dužina okačenog
 * videa, broj znakova). Forma ih prikazuje u ceni; ovde se uzima donja
 * granica, ista koju katalog deklariše.
 */
function measuredFor(seed: StudioModelSeed): Record<string, number> {
  const quantity = quantitySourceOf(seed);

  return quantity ? { [quantity.param]: quantity.min } : {};
}

/** Ulazne slike preko besplatne kvote se ne broje ovde - forma ih broji iz slotova. */
function formParams(seed: StudioModelSeed, mode: string): Record<string, unknown> {
  const values = paramValuesForMode(seed.paramSpec, mode);

  return buildParams(seed.paramSpec, values, mode, measuredFor(seed));
}

describe("ParamForm - vrednosti koje forma drži", () => {
  test("svaki model u svakom režimu ima cenu za podrazumevani izbor", () => {
    for (const seed of STUDIO_MODELS) {
      for (const mode of seed.inputModes) {
        const credits = creditsFor(seed.priceRule, formParams(seed, mode), mode);
        expect(credits, `${seed.slug}/${mode}`).not.toBeNull();
        expect(credits, `${seed.slug}/${mode}`).toBeGreaterThan(0);
      }
    }
  });

  test("kling-tryon nema nijednu kontrolu - <ParamForm> vraća null, forma je samo upload i dugme (W7 stavka 7)", () => {
    const tryon = studioModelBySlug("kling-tryon");
    expect(tryon).toBeDefined();
    if (!tryon) return;

    // `components/studio/param-form.tsx` ima `if (controls.length === 0) return null`
    // - ovo tvrdi PREMISU tog uslova za tačno ovaj model, ne samu komponentu
    // (repo nema konvenciju za testiranje React renderovanja).
    for (const mode of tryon.inputModes) {
      expect(visibleControls(tryon.paramSpec, mode)).toEqual([]);
    }
  });

  test("kling-v2a ima tačno jednu kontrolu (prompt) - forma je prompt, upload i dugme (W7 stavka 7)", () => {
    const v2a = studioModelBySlug("kling-v2a");
    expect(v2a).toBeDefined();
    if (!v2a) return;

    for (const mode of v2a.inputModes) {
      const controls = visibleControls(v2a.paramSpec, mode);
      expect(controls).toHaveLength(1);
      expect(controls[0]?.type).toBe("textarea");
    }
  });

  test("kontrola sa istim ključem u dva režima daje tačno jednu kontrolu po režimu", () => {
    // Kling 3.0 Turbo ima DVE `resolution` kontrole: jednu za `text`/`image`,
    // drugu (samo 720p) za prvi i poslednji kadar.
    const turbo = studioModelBySlug("kling-3-turbo");
    expect(turbo).toBeDefined();
    if (!turbo) return;

    const duplicated = turbo.paramSpec.filter((control) => control.key === "resolution");
    expect(duplicated.length).toBe(2);

    for (const mode of turbo.inputModes) {
      const keys = visibleControls(turbo.paramSpec, mode).map((control) => control.key);
      expect(new Set(keys).size, mode).toBe(keys.length);
    }

    const firstLast = visibleControls(turbo.paramSpec, "first_last").find(
      (control) => control.key === "resolution",
    );
    expect(firstLast?.options?.map((option) => option.value)).toEqual(["720p"]);
  });

  test("promena režima zadržava vrednost koja i dalje postoji, a spušta onu koje nema", () => {
    const turbo = studioModelBySlug("kling-3-turbo");
    if (!turbo) throw new Error("kling-3-turbo nije u katalogu");

    const text = paramValuesForMode(turbo.paramSpec, "text");
    const chosen = { ...text, resolution: "1080p", duration: 7 };

    const firstLast = paramValuesForMode(turbo.paramSpec, "first_last", chosen);
    // 1080p ne postoji u režimu prvog i poslednjeg kadra - pada na 720p...
    expect(firstLast.resolution).toBe("720p");
    // ...a trajanje je ista kontrola, pa se prenosi.
    expect(firstLast.duration).toBe(7);
  });

  test("vrednosti drugog modela se ne prenose - `paramValuesForMode` bez prethodnih daje podrazumevane", () => {
    const kling = studioModelBySlug("kling-3");
    if (!kling) throw new Error("kling-3 nije u katalogu");

    const values = paramValuesForMode(kling.paramSpec, "text");
    for (const control of visibleControls(kling.paramSpec, "text")) {
      expect(values[control.key], control.key).toEqual(control.default);
    }
  });

  test("broj se odseca na `min`/`max` kontrole", () => {
    const control: ParamControl = {
      key: "num_images",
      type: "number",
      labelSr: "Broj slika",
      labelEn: "Number of images",
      default: 1,
      min: 1,
      max: 4,
      affectsPrice: true,
    };

    expect(clampControlNumber(control, 0)).toBe(1);
    expect(clampControlNumber(control, 9)).toBe(4);
    expect(clampControlNumber(control, 3)).toBe(3);
  });
});

describe("cena na dugmetu je cena koju server naplati", () => {
  test("`buildParams` prolazi kroz `sanitizeSpecParams` bez promene cene, za sve modele i sve režime", () => {
    for (const seed of STUDIO_MODELS) {
      const measured = measuredFor(seed);

      for (const mode of seed.inputModes) {
        const params = formParams(seed, mode);
        const shown = creditsFor(seed.priceRule, params, mode);

        const sanitized = sanitizeSpecParams(seed.paramSpec, seed.priceRule, params, mode);
        expect(sanitized.ok, `${seed.slug}/${mode}`).toBe(true);
        if (!sanitized.ok) continue;

        // Server merene količine upisuje sam, pa se ovde vraćaju - sve ostalo
        // mora da prodje netaknuto.
        const charged = computeCredits(seed.priceRule, { ...sanitized.params, ...measured }, mode);
        expect(charged, `${seed.slug}/${mode}`).toBe(shown);
      }
    }
  });

  test("cena forme je doslovno `computeCredits` nad istim objektom - nema druge računice", () => {
    for (const seed of STUDIO_MODELS) {
      for (const mode of seed.inputModes) {
        const params = formParams(seed, mode);
        expect(creditsFor(seed.priceRule, params, mode), `${seed.slug}/${mode}`).toBe(
          computeCredits(seed.priceRule, params, mode),
        );
      }
    }
  });

  test("promena svake opcije pomeri cenu na tačno onoliko koliko cenovno pravilo kaže", () => {
    for (const seed of STUDIO_MODELS) {
      for (const mode of seed.inputModes) {
        const params = formParams(seed, mode);

        for (const control of visibleControls(seed.paramSpec, mode)) {
          if (!control.affectsPrice) continue;

          for (const option of control.options ?? []) {
            const next = { ...params, [control.key]: option.value };
            const priceable = availableOptionValues(control, seed.priceRule, params, mode).includes(
              option.value,
            );
            if (!priceable) {
              expect(creditsFor(seed.priceRule, next, mode), `${seed.slug}/${option.value}`).toBeNull();
              continue;
            }

            expect(creditsFor(seed.priceRule, next, mode)).toBe(computeCredits(seed.priceRule, next, mode));
          }
        }
      }
    }
  });

  test("cena bez poznate količine je `null`, ne nula", () => {
    const tts = studioModelBySlug("tts");
    if (!tts) throw new Error("tts nije u katalogu");

    const values = paramValuesForMode(tts.paramSpec, "text");
    // Bez broja znakova cena ne postoji - dugme tada ne sme da pokaže "0 kr".
    expect(creditsFor(tts.priceRule, buildParams(tts.paramSpec, values, "text"), "text")).toBeNull();
    expect(
      creditsFor(tts.priceRule, buildParams(tts.paramSpec, values, "text", { char_count: 1000 }), "text"),
    ).toBe(22);
  });

  test("kombinacija koju cenovno pravilo ne poznaje nema cenu ni u formi", () => {
    const seedance = studioModelBySlug("seedance-20");
    if (!seedance) throw new Error("seedance-20 nije u katalogu");

    const params = formParams(seedance, "text");
    // Mini tarifa nema 1080p (katalog 3.4) - to nije spisak zabrana nego rupa
    // u `lookup` mapi, pa ista rupa gasi i opciju u formi.
    const mini = { ...params, tier: "mini", resolution: "1080p" };
    expect(creditsFor(seedance.priceRule, mini, "text")).toBeNull();

    const resolution = seedance.paramSpec.find((control) => control.key === "resolution");
    expect(resolution).toBeDefined();
    if (!resolution) return;
    expect(
      availableOptionValues(resolution, seedance.priceRule, { ...params, tier: "mini" }, "text"),
    ).toEqual(["480p", "720p"]);
  });
});

describe("PriceTag - značka pokazuje razliku pre klika", () => {
  test("značka svake opcije je razlika `computeCredits`-a sa hipotetičkom vrednošću", () => {
    for (const seed of STUDIO_MODELS) {
      for (const mode of seed.inputModes) {
        const params = formParams(seed, mode);
        const base = creditsFor(seed.priceRule, params, mode);
        if (base === null) continue;

        for (const control of visibleControls(seed.paramSpec, mode)) {
          if (!control.affectsPrice) continue;

          for (const option of control.options ?? []) {
            const delta = priceDelta(seed.priceRule, params, control.key, option.value, mode);
            const next = creditsFor(seed.priceRule, { ...params, [control.key]: option.value }, mode);

            if (next === null) {
              expect(delta.kind, `${seed.slug}/${option.value}`).toBe("none");
              continue;
            }

            if (delta.kind === "delta") expect(base + delta.credits).toBe(next);
            else if (delta.kind === "multiplier") expect(base * delta.factor).toBe(next);
            else if (delta.kind === "same") expect(next).toBe(base);
            else throw new Error(`${seed.slug}/${control.key}/${option.value}: značka je nestala`);
          }
        }
      }
    }
  });

  test("dvostruka cena se piše kao ×2, a ne kao razlika", () => {
    const pro = studioModelBySlug("seedream-5-pro");
    if (!pro) throw new Error("seedream-5-pro nije u katalogu");

    const params = formParams(pro, "text");
    // 1,5K je 10 kredita, 2K je 20 (katalog 2.6).
    expect(creditsFor(pro.priceRule, params, "text")).toBe(10);

    const delta = priceDelta(pro.priceRule, params, "resolution", "2K", "text");
    expect(delta).toEqual({ kind: "multiplier", factor: 2 });
    expect(priceDeltaLabel(delta, "sr")).toBe("×2");
  });

  test("razlika u kreditima ide sa znakom i jedinicom", () => {
    const nano = studioModelBySlug("nano-banana-2");
    if (!nano) throw new Error("nano-banana-2 nije u katalogu");

    const params = formParams(nano, "text");
    expect(creditsFor(nano.priceRule, params, "text")).toBe(16); // 1K

    // 1K 16 -> 4K 34 i 0,5K 11, po zvaničnom cenovniku Google-a.
    expect(priceDeltaLabel(priceDelta(nano.priceRule, params, "resolution", "4K", "text"), "sr")).toBe(
      "+18 kr",
    );
    expect(priceDeltaLabel(priceDelta(nano.priceRule, params, "resolution", "0.5K", "text"), "sr")).toBe(
      "−5 kr",
    );
    expect(priceDeltaLabel(priceDelta(nano.priceRule, params, "resolution", "4K", "text"), "en")).toBe(
      "+18 cr",
    );
  });

  test("zvuk koji ne menja cenu se ne prećutkuje nego kaže da je cena ista", () => {
    const kling = studioModelBySlug("kling-3");
    if (!kling) throw new Error("kling-3 nije u katalogu");

    // Na 4K je cena ista sa zvukom i bez njega (katalog 3.1) - značka to mora
    // da kaže, jer prekidač koji naizgled ništa ne radi izgleda kao kvar.
    const params = { ...formParams(kling, "text"), resolution: "4K", audio: true };
    const delta = priceDelta(kling.priceRule, params, "audio", false, "text");
    expect(delta).toEqual({ kind: "same" });
    expect(priceDeltaLabel(delta, "sr")).toBe("ista cena");
    expect(priceDeltaLabel(delta, "en")).toBe("same price");
  });

  test("opcija bez cene nema značku", () => {
    const seedance = studioModelBySlug("seedance-20");
    if (!seedance) throw new Error("seedance-20 nije u katalogu");

    const params = { ...formParams(seedance, "text"), tier: "mini" };
    expect(priceDelta(seedance.priceRule, params, "resolution", "1080p", "text")).toEqual({ kind: "none" });
    expect(priceDeltaLabel({ kind: "none" }, "sr")).toBeNull();
  });

  test("klizač pokazuje cenu jednog koraka, i na gornjoj granici", () => {
    const omni = studioModelBySlug("gemini-omni");
    if (!omni) throw new Error("gemini-omni nije u katalogu");

    const duration = omni.paramSpec.find((control) => control.key === "duration");
    expect(duration).toBeDefined();
    if (!duration) return;

    const params = formParams(omni, "text");
    const perStep = stepPriceDelta(omni.priceRule, params, duration, "text");
    expect(perStep.kind).toBe("delta");

    const atMax = { ...params, duration: duration.max ?? 10 };
    const atMaxStep = stepPriceDelta(omni.priceRule, atMax, duration, "text");
    // Cena po sekundi je ravna, pa je korak isti i na kraju klizača.
    expect(atMaxStep).toEqual(perStep);
  });
});

describe("prikaz cene", () => {
  test("krediti nose oznaku jezika", () => {
    expect(formatCredits(140, "sr")).toBe("140 kr");
    expect(formatCredits(140, "en")).toBe("140 cr");
  });

  test("cena po sekundi se izvodi iz ukupne cene", () => {
    const omni = studioModelBySlug("gemini-omni");
    if (!omni) throw new Error("gemini-omni nije u katalogu");

    const params = { ...formParams(omni, "text"), duration: 5 };
    // 22 kr/s, 5 s = 110 kredita (katalog 3.8).
    expect(creditsFor(omni.priceRule, params, "text")).toBe(110);
    expect(creditsPerUnit(omni.priceRule, params, "text")).toBe(22);
    expect(formatCreditsPerUnit(22, "s", "sr")).toBe("22 kr/s");
    expect(formatCreditsPerUnit(21.94, "s", "sr")).toBe("21,9 kr/s");
    expect(formatCreditsPerUnit(21.94, "s", "en")).toBe("21.9 cr/s");
  });

  test("pravilo bez količine nema cenu po jedinici", () => {
    const rule: PriceRule = { unit: "generation", baseUsd: 0.07 };
    expect(creditsPerUnit(rule, {}, "image_multi")).toBeNull();
  });
});
