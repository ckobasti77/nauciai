/**
 * Testovi za `<ModelPicker>`: parsiranje reda kataloga onako kako stiže iz
 * baze (sva složena polja su JSON stringovi) i filteri koje picker nudi.
 * Nijedna funkcija ne sme da poznaje nijedan slug - zato se sve tvrdi nad
 * pravim redovima kataloga.
 */

import { describe, expect, test } from "vitest";

import { STUDIO_MODELS, studioModelBySlug } from "@/convex/providers/catalogModels";
import type { StudioModelSeed } from "@/convex/providers/modelSeed";
import {
  defaultCredits,
  defaultInputMode,
  familyMark,
  filterModels,
  groupByFamily,
  hasAudio,
  modelLabel,
  modelTagline,
  parseStudioModel,
  type StudioModel,
  type StudioModelRow,
} from "@/lib/studio-models";

/** Red kakav vraća Convex upit: JSON polja su stringovi. */
function rowOf(seed: StudioModelSeed): StudioModelRow {
  return {
    slug: seed.slug,
    provider: seed.provider,
    kind: seed.kind,
    family: seed.family,
    labelSr: seed.labelSr,
    labelEn: seed.labelEn,
    taglineSr: seed.taglineSr,
    taglineEn: seed.taglineEn,
    descriptionSr: seed.descriptionSr,
    descriptionEn: seed.descriptionEn,
    inputModes: JSON.stringify(seed.inputModes),
    inputSpec: JSON.stringify(seed.inputSpec),
    paramSpec: JSON.stringify(seed.paramSpec),
    priceRule: JSON.stringify(seed.priceRule),
    capabilities: JSON.stringify(seed.capabilities),
    sortOrder: seed.sortOrder,
  };
}

function parsed(slug: string): StudioModel {
  const seed = studioModelBySlug(slug);
  if (!seed) throw new Error(`${slug} nije u katalogu`);
  const model = parseStudioModel(rowOf(seed));
  if (!model) throw new Error(`${slug} se ne parsira`);

  return model;
}

describe("parsiranje reda kataloga", () => {
  test("svih trideset redova prolazi kroz parser sa svim složenim poljima", () => {
    for (const seed of STUDIO_MODELS) {
      const model = parseStudioModel(rowOf(seed));
      expect(model, seed.slug).not.toBeNull();
      if (!model) continue;

      expect(model.inputModes, seed.slug).toEqual(seed.inputModes);
      expect(model.priceRule, seed.slug).toEqual(seed.priceRule);
      expect(model.paramSpec.map((control) => control.key), seed.slug).toEqual(
        seed.paramSpec.map((control) => control.key),
      );
      expect(Object.keys(model.inputSpec), seed.slug).toEqual(Object.keys(seed.inputSpec));
    }
  });

  test("red bez upotrebljivog cenovnog pravila se ne nudi", () => {
    const seed = STUDIO_MODELS[0];
    expect(parseStudioModel({ ...rowOf(seed), priceRule: "{}" })).toBeNull();
    expect(parseStudioModel({ ...rowOf(seed), priceRule: "nije json" })).toBeNull();
  });

  test("neispravne `capabilities` ne obaraju red", () => {
    const seed = STUDIO_MODELS[0];
    const model = parseStudioModel({ ...rowOf(seed), capabilities: "[]" });
    expect(model?.capabilities).toEqual({});
  });

  test("labela i rečenica prate jezik", () => {
    const kling = parsed("kling-3");
    expect(modelLabel(kling, "sr")).toBe(kling.labelSr);
    expect(modelLabel(kling, "en")).toBe(kling.labelEn);
    expect(modelTagline(kling, "sr")).toBe(kling.taglineSr);
  });

  test("prvi ulazni režim je onaj kojim se forma otvara", () => {
    expect(defaultInputMode(parsed("kling-omni"))).toBe("text");
  });
});

describe("filteri pickera", () => {
  const models = STUDIO_MODELS.map(rowOf)
    .map(parseStudioModel)
    .filter((model): model is StudioModel => model !== null);

  test("filter po vrsti propušta samo tu vrstu", () => {
    const images = filterModels(models, { kind: "image" }, "sr");
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((model) => model.kind === "image")).toBe(true);
  });

  test("filter po zvuku prepoznaje i prekidač i zastavicu", () => {
    // Kling 3.0 ima zvuk kao kontrolu koja ulazi u cenu...
    expect(hasAudio(parsed("kling-3"))).toBe(true);
    // ...MiniMax H3 ga ima uračunatog, pa stoji u `capabilities`...
    expect(hasAudio(parsed("minimax-h3"))).toBe(true);
    // ...a model koji pravi sliku ga nema.
    expect(hasAudio(parsed("seedream-45"))).toBe(false);

    const withAudio = filterModels(models, { audioOnly: true }, "sr");
    expect(withAudio.every((model) => hasAudio(model))).toBe(true);
    expect(withAudio.length).toBeLessThan(models.length);
  });

  test("pretraga gleda ime, slug i porodicu", () => {
    expect(filterModels(models, { query: "kling" }, "sr").length).toBeGreaterThan(3);
    // Ime se piše sa razmakom, slug sa crticom - pretraga pogadja oba.
    expect(filterModels(models, { query: "nano banana" }, "sr").map((model) => model.slug)).toEqual([
      "nano-banana-2",
      "nano-banana-pro",
    ]);
    expect(filterModels(models, { query: "nano-banana" }, "sr").map((model) => model.slug)).toEqual([
      "nano-banana-2",
      "nano-banana-pro",
    ]);
    expect(filterModels(models, { query: "ne postoji" }, "sr")).toEqual([]);
    expect(filterModels(models, { query: "  " }, "sr")).toHaveLength(models.length);
  });

  test("grupisanje po porodici čuva redosled prve pojave", () => {
    const groups = groupByFamily(filterModels(models, { query: "kling" }, "sr"));
    expect(groups.map((group) => group.family)).toEqual(["kling"]);
    expect(groups[0].models.length).toBeGreaterThan(3);

    const all = groupByFamily(models);
    expect(all.length).toBeGreaterThan(1);
    expect(all.reduce((sum, group) => sum + group.models.length, 0)).toBe(models.length);
  });
});

describe("cena uz model u listi", () => {
  test("podrazumevana cena je cena podrazumevanog izbora", () => {
    // Seedream 4.5: ravna cena, 9 kredita po slici (pravilo, katalog 2.5).
    expect(defaultCredits(parsed("seedream-45"))).toBe(9);
    // Gemini Omni: 22 kr/s, podrazumevano trajanje je donja granica klizača.
    const omni = parsed("gemini-omni");
    const duration = omni.paramSpec.find((control) => control.key === "duration");
    expect(defaultCredits(omni)).toBe(22 * Number(duration?.default));
  });

  test("cena prati zadato trajanje", () => {
    expect(defaultCredits(parsed("gemini-omni"), { duration: 5 })).toBe(110);
  });

  test("model kome se količina meri iz ulaza nema cenu unapred", () => {
    // Kling lipsync se naplaćuje po sekundi OKAČENOG videa - lista tu ne sme
    // da izmisli cifru.
    expect(defaultCredits(parsed("kling-lipsync"))).toBeNull();
    expect(defaultCredits(parsed("kling-lipsync"), { duration: 5 })).toBe(16);
  });
});

describe("familyMark", () => {
  test("generiše dvoslovni monohromni znak iz imena porodice", () => {
    expect(familyMark(parsed("nano-banana-2"))).toBe("NB");
    expect(familyMark(parsed("kling-3"))).toBe("KL");
    expect(familyMark(parsed("veo-31"))).toBe("VE");
  });
});

