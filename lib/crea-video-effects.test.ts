import { describe, expect, test } from "vitest";

import { sanitizeSpecParams } from "@/convex/studioParamSpec";
import { STUDIO_MODELS } from "@/convex/providers/catalogModels";

import { effectInputMode, effectParamsFor, fillEffect } from "./crea-director";
import { combineEffects, combineProblem, VIDEO_EFFECT_GROUPS, VIDEO_EFFECTS, videoEffectById } from "./crea-video-effects";

const FORBIDDEN = /\b(kiss\w*|hugs?|hugging|explod\w*|blood\w*|guns?|weapons?|naked|nude)\b/i;

function seed(slug: string) {
  const found = STUDIO_MODELS.find((model) => model.slug === slug);
  if (!found) throw new Error(`nema modela ${slug}`);
  return found;
}

describe("video efekti kao recepti (V8)", () => {
  test("oko 30 efekata u četiri grupe, jedinstveni id-jevi, tekstovi na oba jezika", () => {
    expect(VIDEO_EFFECTS.length).toBeGreaterThanOrEqual(26);
    expect(VIDEO_EFFECTS.length).toBeLessThanOrEqual(36);
    expect(new Set(VIDEO_EFFECTS.map((effect) => effect.id)).size).toBe(VIDEO_EFFECTS.length);
    for (const group of VIDEO_EFFECT_GROUPS) expect(VIDEO_EFFECTS.some((effect) => effect.group === group.id)).toBe(true);
    expect(VIDEO_EFFECTS.filter((effect) => effect.group === "nasi").length).toBeGreaterThanOrEqual(6);
    for (const effect of VIDEO_EFFECTS) {
      expect(effect.label.sr && effect.label.en && effect.hint.sr && effect.hint.en).toBeTruthy();
    }
  });

  test("šablon ima tačno jedno {subject}, bez tačke na kraju i bez zabranjenih scena (K17-16)", () => {
    for (const effect of VIDEO_EFFECTS) {
      expect(effect.template.split("{subject}").length - 1).toBe(1);
      expect(effect.template.endsWith(".")).toBe(false);
      expect(effect.template).not.toMatch(FORBIDDEN);
    }
  });

  test("svaki model efekta postoji, uključen je i ima traženi ulazni režim", () => {
    for (const effect of VIDEO_EFFECTS) {
      expect(effect.models.length).toBeGreaterThan(0);
      for (const slug of effect.models) {
        const model = seed(slug);
        expect(model.kind).toBe("video");
        expect(model.isEnabled ?? true).toBe(true);
        expect(model.inputModes).toContain(effectInputMode(effect));
      }
    }
  });

  test("parametri efekta prolaze serversku proveru za svaki model efekta", () => {
    for (const effect of VIDEO_EFFECTS) {
      for (const slug of effect.models) {
        const model = seed(slug);
        const mode = effectInputMode(effect);
        const params = { prompt: fillEffect(effect, ""), ...effectParamsFor(effect, model, mode) };
        const sanitized = sanitizeSpecParams(model.paramSpec, model.priceRule, params, mode);
        expect(sanitized.ok, `${effect.id} × ${slug}`).toBe(true);
      }
    }
  });

  test("predmet: korisnikov opis ili podrazumevani", () => {
    const glina = videoEffectById("glina")!;
    expect(fillEffect(glina, "  moja baka u bašti. ")).toContain("moja baka u bašti gradually transforms");
    expect(fillEffect(glina, "")).toContain("the main subject of the image");
    expect(fillEffect(videoEffectById("kafana")!, "")).toContain("a young person");
  });

  test("spoji dva efekta: zajednički modeli, duže trajanje, drugi bez ponovljenog predmeta", () => {
    const a = videoEffectById("glina")!;
    const b = videoEffectById("vatromet")!;
    const both = combineEffects(a, b)!;
    expect(both.template).toContain(", then colorful fireworks burst in the night sky behind it");
    expect(both.template.split("{subject}").length - 1).toBe(1);
    expect(both.params?.duration).toBeGreaterThanOrEqual(8);
    expect(both.models.every((slug) => a.models.includes(slug) && b.models.includes(slug))).toBe(true);
    expect(both.combinable).toBe(false);
    expect(combineEffects(both, a)).toBeNull();
  });

  test("ne spaja se: isti efekat, efekat koji se ne spaja, različit ulaz", () => {
    expect(combineProblem(videoEffectById("glina")!, videoEffectById("glina")!)).toBe("isti-efekat");
    expect(combineProblem(videoEffectById("u-oko")!, videoEffectById("glina")!)).toBe("ne-spaja-se");
    expect(combineProblem(videoEffectById("kafana")!, videoEffectById("glina")!)).toBe("ne-spaja-se");
    const textA = { ...videoEffectById("kafana")!, combinable: true };
    expect(combineProblem(textA, videoEffectById("glina")!)).toBe("razlicit-ulaz");
  });
});
