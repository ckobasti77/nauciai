/**
 * Recepti (S37, K15): svaki recept mora da napravi posao koji server prima
 * (`sanitizeSpecParams` za svoj model), sa FIKSNOM cenom - ista cena bez obzira
 * šta je korisnik upisao, izabrao ili priložio - i da posle rezultata vodi u
 * alat koji stvarno postoji.
 */

import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { sanitizeSpecParams } from "@/convex/studioParamSpec";
import { computeCredits } from "@/convex/studioPricing";
import { isAnglesGridPrompt } from "./crea-grid-crop";
import {
  CREA_RECIPE_GROUPS,
  CREA_RECIPES,
  cleanRecipeText,
  recipeAspect,
  recipeById,
  recipeDefaults,
  recipeExampleValues,
  recipeMissingField,
  recipeRequest,
  RECIPE_MODELS,
  SERIES_FORMATS,
  SERIES_MAX_JOBS,
  SERIES_MODEL,
  seriesJobs,
  seriesParams,
  seriesPrompt,
  seriesTexts,
  type CreaRecipe,
  type CreaRecipeModel,
} from "./crea-recipes";
import { toolById } from "./crea-tools";

const KIT = { name: "Pekara Klas", colors: ["#c8402f", "#f4be30"], fonts: { heading: "lora" as const, body: "nunito" as const }, tone: "topao" };

function seedOf(slug: string) {
  const seed = STUDIO_MODELS.find((model) => model.slug === slug);
  if (!seed) throw new Error(`nema ${slug}`);
  return seed;
}

/** Sve kombinacije izbora (svaki `select` × svaka opcija). */
function optionCombos(recipe: CreaRecipe): Array<Record<string, string>> {
  let combos: Array<Record<string, string>> = [recipeDefaults(recipe)];
  for (const field of recipe.fields) {
    if (field.kind !== "select") continue;
    combos = combos.flatMap((combo) => field.options.map((option) => ({ ...combo, [field.key]: option.id })));
  }
  return combos;
}

/** Priloženo: obavezna polja uvek, neobavezna sa i bez slike; lik sa 1 i 3 slike. */
function attachVariants(recipe: CreaRecipe): Array<Record<string, number>> {
  let variants: Array<Record<string, number>> = [{}];
  for (const field of recipe.fields) {
    if (field.kind === "image") {
      const counts = field.required ? [1] : [0, 1];
      variants = variants.flatMap((variant) => counts.map((count) => ({ ...variant, [field.key]: count })));
    }
    if (field.kind === "element") variants = variants.flatMap((variant) => [1, 3].map((count) => ({ ...variant, [field.key]: count })));
  }
  return variants;
}

function priceOf(model: CreaRecipeModel, params: Record<string, unknown>, inputMode: string): number {
  const seed = seedOf(model);
  const sanitized = sanitizeSpecParams(seed.paramSpec, seed.priceRule, params, inputMode);
  if (!sanitized.ok) throw new Error(sanitized.reason);
  return computeCredits(seed.priceRule, sanitized.params, inputMode);
}

describe("CREA_RECIPES", () => {
  test("najmanje 20 recepata, jedinstveni kebab id-jevi, 2-3 polja, grupe postoje", () => {
    expect(CREA_RECIPES.length).toBeGreaterThanOrEqual(20);
    const ids = CREA_RECIPES.map((recipe) => recipe.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const recipe of CREA_RECIPES) {
      expect(recipe.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(recipe.fields.length, recipe.id).toBeGreaterThanOrEqual(2);
      expect(recipe.fields.length, recipe.id).toBeLessThanOrEqual(3);
      expect(new Set(recipe.fields.map((field) => field.key)).size, recipe.id).toBe(recipe.fields.length);
      expect(CREA_RECIPE_GROUPS.map((group) => group.id)).toContain(recipe.group);
      expect(recipe.models.length, recipe.id).toBeGreaterThan(0);
    }
  });

  test("tekstovi postoje na oba jezika; izbori imaju bar dve opcije", () => {
    for (const recipe of CREA_RECIPES) {
      for (const text of [recipe.title, recipe.summary, recipe.example]) {
        expect(text.sr.trim(), recipe.id).not.toBe("");
        expect(text.en.trim(), recipe.id).not.toBe("");
      }
      for (const field of recipe.fields) {
        expect(field.label.sr.trim(), `${recipe.id}.${field.key}`).not.toBe("");
        expect(field.label.en.trim(), `${recipe.id}.${field.key}`).not.toBe("");
        if (field.kind === "select") {
          expect(field.options.length, `${recipe.id}.${field.key}`).toBeGreaterThanOrEqual(2);
          expect(new Set(field.options.map((option) => option.id)).size).toBe(field.options.length);
        }
        if (field.kind === "text") {
          expect(field.example.sr.length, `${recipe.id}.${field.key}`).toBeLessThanOrEqual(field.maxLength);
          expect(field.example.en.length, `${recipe.id}.${field.key}`).toBeLessThanOrEqual(field.maxLength);
        }
      }
    }
  });

  test("modeli postoje u katalogu; recept sa fotkom ili likom ide samo na model koji prima dovoljno slika", () => {
    for (const recipe of CREA_RECIPES) {
      const needsImages = recipe.fields.some((field) => field.kind === "image" || field.kind === "element");
      for (const model of recipe.models) {
        expect(RECIPE_MODELS).toContain(model);
        const seed = seedOf(model);
        expect(seed.kind, recipe.id).toBe("image");
        if (needsImages) {
          expect(seed.inputModes, `${recipe.id} → ${model}`).toContain("image_multi");
          // Najviše: lik sa 3 slike + fotke + logo kita.
          const most = recipe.fields.reduce((sum, field) => sum + (field.kind === "element" ? 3 : field.kind === "image" ? 1 : 0), 0) + 1;
          expect(seed.inputSpec.image_multi?.image?.max ?? 0, recipe.id).toBeGreaterThanOrEqual(most);
        }
      }
    }
  });

  test("svaki recept pravi parametre koje server prima, za svaki model, izbor i prilog", () => {
    for (const recipe of CREA_RECIPES) {
      for (const model of recipe.models) {
        for (const values of optionCombos(recipe)) {
          for (const attached of attachVariants(recipe)) {
            for (const brand of [null, KIT]) {
              const request = recipeRequest(recipe, model, {
                values: recipeExampleValues(recipe, "sr", values),
                attached,
                brand,
                brandLogo: brand !== null,
                imageSize: { width: 1200, height: 900 },
              });
              expect(seedOf(model).inputModes, recipe.id).toContain(request.inputMode);
              const seed = seedOf(model);
              const sanitized = sanitizeSpecParams(seed.paramSpec, seed.priceRule, request.params, request.inputMode);
              expect(sanitized.ok, `${recipe.id} → ${model}: ${sanitized.ok ? "" : sanitized.reason}`).toBe(true);
            }
          }
        }
      }
    }
  });

  test("FIKSNA cena: ista za svaki izbor, prilog i brend kit, i veća od nule", () => {
    const fixed: Record<string, number> = {};
    for (const recipe of CREA_RECIPES) {
      for (const model of recipe.models) {
        const prices = new Set<number>();
        for (const values of optionCombos(recipe)) {
          for (const attached of attachVariants(recipe)) {
            for (const brand of [null, KIT]) {
              for (const imageSize of [{ width: 1200, height: 900 }, { width: 600, height: 1600 }]) {
                const request = recipeRequest(recipe, model, { values, attached, brand, brandLogo: true, imageSize });
                prices.add(priceOf(model, request.params, request.inputMode));
              }
            }
          }
        }
        expect([...prices], `${recipe.id} → ${model}`).toHaveLength(1);
        const [price] = [...prices];
        expect(Number.isFinite(price) && price! > 0, recipe.id).toBe(true);
        fixed[`${recipe.id}:${model}`] = price!;
      }
    }
    // Zakucane cene (×2,5 danas): NB2 1K 16, 2K 23, 4K 34; NB Pro 2K 33; Recraft 8.
    expect(fixed["profilna:nano-banana-pro"]).toBe(33);
    expect(fixed["jelovnik:nano-banana-2"]).toBe(23);
    expect(fixed["foto-dump:nano-banana-2"]).toBe(34);
    expect(fixed["logo:recraft-41"]).toBe(8);
    expect(fixed["bojanka:nano-banana-2"]).toBe(16);
  });

  test("rečenica za model nosi tekst korisnika doslovno, a slike redom polja", () => {
    const menu = recipeById("jelovnik")!;
    const request = recipeRequest(menu, "nano-banana-2", {
      values: { naziv: "  Kafić   Zrno ", stavke: "Espresso 150\n\n  Kapućino 200 ", stil: "tabla" },
      attached: {},
      brand: null,
      brandLogo: false,
    });
    expect(request.inputMode).toBe("text");
    expect(request.params.prompt).toContain("“Kafić Zrno”");
    expect(request.params.prompt).toContain("- “Espresso 150”\n- “Kapućino 200”");
    expect(request.params.prompt).toContain("chalkboard");
    expect(request.params).toMatchObject({ aspect_ratio: "2:3", resolution: "2K" });

    const thumb = recipeById("thumbnail")!;
    const withPhoto = recipeRequest(thumb, "nano-banana-2", { values: { naslov: "Probao sam", emocija: "smeh" }, attached: { foto: 1 }, brand: null, brandLogo: false });
    expect(withPhoto.inputMode).toBe("image_multi");
    expect(withPhoto.imageOrder).toEqual(["foto"]);
    expect(withPhoto.params.prompt).toContain("as in image 1");
    const without = recipeRequest(thumb, "nano-banana-2", { values: { naslov: "Probao sam", emocija: "smeh" }, attached: {}, brand: null, brandLogo: false });
    expect(without.inputMode).toBe("text");
    expect(without.params.prompt).not.toContain("image 1");
  });

  test("brend kit: rečenica sa imenom, bojama i slovima; logo je poslednja slika samo kod `full`", () => {
    const post = recipeById("instagram-objava")!;
    const request = recipeRequest(post, "nano-banana-2", { values: { poruka: "Akcija", stil: "vedro" }, attached: { proizvod: 1 }, brand: KIT, brandLogo: true });
    expect(request.imageOrder).toEqual(["proizvod", "brand-logo"]);
    expect(request.params.prompt).toContain('Brand: "Pekara Klas"');
    expect(request.params.prompt).toContain("#c8402f");
    expect(request.params.prompt).toContain("Image 2 is the brand logo");
    expect(request.params.prompt).toContain("elegant serif");

    const logo = recipeById("logo")!;
    for (const model of logo.models) {
      const own = recipeRequest(logo, model, { values: { ime: "Klas", delatnost: "pekara", stil: "rukom" }, attached: {}, brand: KIT, brandLogo: true });
      expect(own.imageOrder, model).toEqual([]);
      expect(own.params.prompt).toContain("#f4be30");
      expect(own.params.prompt).not.toContain("brand logo");
    }

    const profile = recipeById("profilna")!;
    const personal = recipeRequest(profile, "nano-banana-pro", { values: {}, attached: { foto: 1 }, brand: KIT, brandLogo: true });
    expect(personal.params.prompt).not.toContain("Brand:");
    expect(personal.imageOrder).toEqual(["foto"]);
  });

  test("lik ide kao više slika; foto-dump je mreža koju alat „Uglovi\" ume da iseče", () => {
    const dump = recipeById("foto-dump")!;
    const request = recipeRequest(dump, "nano-banana-2", { values: { tema: "more" }, attached: { lik: 3 }, brand: null, brandLogo: false });
    expect(request.imageOrder).toEqual(["lik", "lik", "lik"]);
    expect(request.params.prompt).toContain("from images 1-3");
    expect(isAnglesGridPrompt(request.params.prompt)).toBe(true);
    expect(request.params).toMatchObject({ aspect_ratio: "1:1", resolution: "4K" });
  });

  test("stara fotka zadržava format fotke", () => {
    const old = recipeById("stara-fotka")!;
    expect(recipeAspect(old, { width: 1000, height: 1500 })).toBe("2:3");
    expect(recipeAspect(old, { width: 1600, height: 900 })).toBe("16:9");
    expect(recipeAspect(old)).toBe("1:1");
  });

  test("Recraft dobija fal veličinu, Pro najmanje 2K", () => {
    const logo = recipeById("logo")!;
    expect(recipeRequest(logo, "recraft-41", { values: {}, attached: {}, brand: null, brandLogo: false }).params).toMatchObject({ image_size: "square_hd" });
    const cv = recipeById("cv-fotka")!;
    expect(recipeRequest(cv, "nano-banana-pro", { values: {}, attached: { foto: 1 }, brand: null, brandLogo: false }).params).toMatchObject({ resolution: "2K", aspect_ratio: "2:3" });
  });

  test("obavezna polja: tekst, fotka i lik", () => {
    const flat = recipeById("oglas-stan")!;
    expect(recipeMissingField(flat, recipeDefaults(flat), {})?.key).toBe("foto");
    expect(recipeMissingField(flat, { ...recipeDefaults(flat), podaci: "   " }, { foto: 1 })?.key).toBe("podaci");
    expect(recipeMissingField(flat, { ...recipeDefaults(flat), podaci: "Stan" }, { foto: 1 })).toBeNull();
    const dump = recipeById("foto-dump")!;
    expect(recipeMissingField(dump, recipeDefaults(dump), {})?.key).toBe("lik");
    const thumb = recipeById("thumbnail")!;
    expect(recipeMissingField(thumb, { ...recipeDefaults(thumb), naslov: "x" }, {})).toBeNull();
  });

  test("sledeći koraci vode u alate koji rade i primaju sliku", () => {
    for (const recipe of CREA_RECIPES) {
      expect(recipe.nextSteps.length, recipe.id).toBeGreaterThan(0);
      for (const step of recipe.nextSteps) {
        if (step.kind !== "tool") continue;
        const tool = toolById(step.toolId);
        expect(tool, `${recipe.id} → ${step.toolId}`).toBeDefined();
        expect(tool?.status, `${recipe.id} → ${step.toolId}`).toBe("ready");
        expect(tool?.inputs, `${recipe.id} → ${step.toolId}`).toContain("image");
      }
    }
  });

  test("sređivanje teksta: razmaci, prazni redovi i granica", () => {
    expect(cleanRecipeText("  a   b \n\n c ", 100)).toBe("a b c");
    expect(cleanRecipeText("  a   b \n\n c ", 100, true)).toBe("a b\nc");
    expect(cleanRecipeText("abcdef", 3)).toBe("abc");
  });
});

describe("serija (S39)", () => {
  test("tekstovi: jedan po redu, bez praznih i duplikata, najviše 6", () => {
    expect(seriesTexts("A\n\n a \nB\nA")).toEqual(["A", "a", "B"]);
    expect(seriesTexts(Array.from({ length: 9 }, (_, i) => `T${i}`).join("\n"))).toHaveLength(6);
  });

  test("svaki tekst u svakom formatu, najviše 12 poslova", () => {
    const jobs = seriesJobs(["A", "B"], ["1:1", "9:16"]);
    expect(jobs).toEqual([
      { text: "A", aspect: "1:1" },
      { text: "A", aspect: "9:16" },
      { text: "B", aspect: "1:1" },
      { text: "B", aspect: "9:16" },
    ]);
    const formats = SERIES_FORMATS.map((format) => format.id);
    expect(seriesJobs(["1", "2", "3", "4", "5", "6"], formats)).toHaveLength(SERIES_MAX_JOBS);
  });

  test("svaki oglas serije prolazi server i košta isto, bez obzira na format", () => {
    const prices = new Set<number>();
    for (const format of SERIES_FORMATS) {
      const job = { text: "−20 % ovog vikenda", aspect: format.id };
      const prompt = seriesPrompt(job, KIT, 2);
      expect(prompt).toContain("“−20 % ovog vikenda”");
      expect(prompt).toContain("Image 2 is the brand logo");
      prices.add(priceOf(SERIES_MODEL, seriesParams(job, prompt), "image_multi"));
    }
    expect([...prices]).toEqual([16]);
  });
});
