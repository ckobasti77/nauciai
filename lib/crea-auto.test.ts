import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { AUTO_RULES, type AutoJob, autoSentence, autoSignals, pickAuto } from "@/lib/crea-auto";
import { creditsFor } from "@/lib/studio-params";
import { parseStudioModel, type StudioModel, withCreditFactors } from "@/lib/studio-models";

const CATALOG: StudioModel[] = STUDIO_MODELS.filter((seed) => seed.isEnabled !== false)
  .map((seed) =>
    parseStudioModel({
      ...seed,
      inputModes: JSON.stringify(seed.inputModes),
      inputSpec: JSON.stringify(seed.inputSpec),
      paramSpec: JSON.stringify(seed.paramSpec),
      priceRule: JSON.stringify(seed.priceRule),
      capabilities: JSON.stringify(seed.capabilities),
    }),
  )
  .filter((model): model is StudioModel => model !== null);

const ALL = { available: () => true };
const NONE = { images: 0, videos: 0, audio: 0, mask: false };

function job(partial: Partial<AutoJob> & Pick<AutoJob, "area">): AutoJob {
  return { prompt: "", inputs: NONE, ...partial };
}

function pick(partial: Partial<AutoJob> & Pick<AutoJob, "area">, models = CATALOG) {
  const result = pickAuto(job(partial), models, ALL);
  if (!result) throw new Error(`nema izbora za ${JSON.stringify(partial)}`);

  return result;
}

describe("signali iz opisa", () => {
  test("tekst u slici, vektor, proba, kvalitet, zvuk i trajanje", () => {
    expect(autoSignals('Pozivnica za rođendan sa natpisom „Maja 7"').text).toBe(true);
    expect(autoSignals("plakat za koncert").text).toBe(true);
    expect(autoSignals("mačka na krovu").text).toBe(false);
    expect(autoSignals("Logo za pekaru").vector).toBe(true);
    expect(autoSignals("brza skica zamka").cheap).toBe(true);
    expect(autoSignals("vrhunska fotografija proizvoda").quality).toBe(true);
    expect(autoSignals("reklama sa muzikom").audio).toBe(true);
    expect(autoSignals("kadar od 20 sekundi").durationS).toBe(20);
    expect(autoSignals("bez trajanja").durationS).toBeNull();
  });
});

describe("svaki posao iz pravila ima svoj izbor", () => {
  test("slika: vektor → Recraft (vektor je ugašen, pa raster)", () => {
    const result = pick({ area: "slika", prompt: "logo za pekaru" });
    expect(result.reasonId).toBe("vector");
    expect(result.model.slug).toBe("recraft-41");
  });

  test("slika: jedna okačena slika → najjeftinija izmena", () => {
    const result = pick({ area: "slika", prompt: "promeni pozadinu u plažu", inputs: { ...NONE, images: 1 } });
    expect(result.reasonId).toBe("edit_one");
    expect(result.model.slug).toBe("nano-banana-2-lite");
    expect(result.inputMode).toBe("image_multi");
  });

  test("slika: više slika → spajanje, i model koji prima toliko slika", () => {
    const result = pick({ area: "slika", prompt: "spoji ih", inputs: { ...NONE, images: 6 } });
    expect(result.reasonId).toBe("edit_many");
    expect(result.model.inputSpec.image_multi.image.max).toBeGreaterThanOrEqual(6);
  });

  test("slika: tekst u slici → Recraft, pa Ideogram", () => {
    expect(pick({ area: "slika", prompt: 'plakat „Leto 2026"' }).model.slug).toBe("recraft-41");
    const withoutRecraft = CATALOG.filter((model) => model.slug !== "recraft-41");
    const fallback = pick({ area: "slika", prompt: 'plakat „Leto 2026"' }, withoutRecraft);
    expect(fallback.model.slug).toBe("ideogram-45");
    expect(fallback.params.quality).toBe("medium");
  });

  test("slika: proba → najjeftinija skica", () => {
    const result = pick({ area: "slika", prompt: "brza skica broda" });
    expect(result.reasonId).toBe("draft");
    expect(result.model.slug).toBe("z-image-turbo");
    expect(pick({ area: "slika", prompt: "brod", wants: { draft: true } }).model.slug).toBe("z-image-turbo");
  });

  test("slika: kvalitet → Nano Banana Pro", () => {
    const result = pick({ area: "slika", prompt: "vrhunska fotografija sata" });
    expect(result.reasonId).toBe("quality");
    expect(result.model.slug).toBe("nano-banana-pro");
  });

  test("slika: podrazumevano → Seedream 5 Flash", () => {
    const result = pick({ area: "slika", prompt: "mačka na krovu" });
    expect(result.reasonId).toBe("default_image");
    expect(result.model.slug).toBe("seedream-5-flash");
  });

  test("video: dva kadra → prvi i poslednji kadar", () => {
    const result = pick({ area: "video", prompt: "prelaz", inputs: { ...NONE, images: 2 } });
    expect(result.reasonId).toBe("first_last");
    expect(result.inputMode).toBe("first_last");
    expect(result.model.slug).toBe("wan-30");
  });

  test("video: tri i više slika → reference", () => {
    const result = pick({ area: "video", prompt: "lik šeta", inputs: { ...NONE, images: 3 } });
    expect(result.reasonId).toBe("refs");
    expect(result.model.slug).toBe("seedance-20");
    expect(result.params.tier).toBe("mini");
  });

  test("video: jedna slika → oživi fotku", () => {
    const result = pick({ area: "video", prompt: "neka se nasmeje", inputs: { ...NONE, images: 1 } });
    expect(result.reasonId).toBe("animate");
    expect(result.model.slug).toBe("hailuo-23-fast");
  });

  test("video: dug kadar i zvuk", () => {
    const long = pick({ area: "video", prompt: "kadar od 25 sekundi" });
    expect(long.reasonId).toBe("long");
    expect(long.model.slug).toBe("wan-30");
    expect(long.params.duration).toBe(25);
    const audio = pick({ area: "video", prompt: "reklama sa muzikom" });
    expect(audio.reasonId).toBe("audio");
    expect(audio.model.slug).toBe("minimax-h3");
  });

  test("video: proba, kvalitet i podrazumevano", () => {
    expect(pick({ area: "video", prompt: "brza proba" }).model.slug).toBe("grok-video-15-lite");
    expect(pick({ area: "video", prompt: "vrhunski film" }).model.slug).toBe("veo-31");
    const result = pick({ area: "video", prompt: "pas trči" });
    expect(result.reasonId).toBe("default_video");
    expect(result.model.slug).toBe("minimax-h3-max-turbo");
  });

  test("zvuk: govor (Gemini TTS od K22) i muzika (Lyria od K23, ElevenLabs kao rezerva)", () => {
    expect(pick({ area: "zvuk", prompt: "Dobrodošli u našu radnju" }).model.slug).toBe("gemini-tts");
    const music = pick({ area: "zvuk", prompt: "vesela pesma za rođendan" });
    expect(music.reasonId).toBe("music_song");
    expect(music.model.slug).toBe("lyria-35");
    expect(pick({ area: "zvuk", prompt: "melodija", shellMode: "muzika" }).model.slug).toBe("lyria-35");
  });

  test("svaki slug u pravilima je ili u katalogu ili stiže kasnije (K22/K23)", () => {
    const later = new Set(["gemini-tts", "lyria-3-clip", "lyria-35"]);
    for (const rule of AUTO_RULES) {
      for (const choice of rule.picks) {
        const seed = STUDIO_MODELS.find((model) => model.slug === choice.slug);
        if (!seed) {
          expect(later.has(choice.slug), `${rule.id}: ${choice.slug}`).toBe(true);
          continue;
        }
        expect(seed.inputModes, `${rule.id}: ${choice.slug}`).toContain(rule.mode);
      }
    }
  });
});

describe("cena, budžet i dostupnost", () => {
  test("cena izbora je ista funkcija kao dugme, i prati v2 faktor", () => {
    const result = pick({ area: "slika", prompt: "mačka" });
    expect(result.credits).toBe(creditsFor(result.model.priceRule, result.params, result.inputMode));
    const v2 = pick({ area: "slika", prompt: "mačka" }, withCreditFactors(CATALOG, true));
    expect(v2.model.slug).toBe(result.model.slug);
    expect(v2.credits).toBeLessThan(result.credits);
  });

  test("budžet bira prvi model koji staje; kad ništa ne staje, najjeftiniji uz upozorenje", () => {
    const fits = pick({ area: "slika", prompt: "promeni boju", inputs: { ...NONE, images: 1 }, budgetCredits: 8 });
    expect(fits.credits).toBeLessThanOrEqual(8);
    expect(fits.overBudget).toBe(false);
    const over = pick({ area: "video", prompt: "pas trči", budgetCredits: 1 });
    expect(over.overBudget).toBe(true);
    expect(autoSentence(over, "sr", 1)).toContain("Ništa ne staje u 1 kr");
    expect(autoSentence(fits, "sr", 8)).toContain("Staje u tvoj limit od 8 kr");
    expect(autoSentence(fits, "en")).toMatch(/\d+ cr\.$/);
  });

  test("model bez ključa se preskače (javni korisnik), a bez ijednog dostupnog nema izbora", () => {
    const googleOnly = { available: (model: StudioModel) => model.provider === "google" };
    const result = pickAuto(job({ area: "slika", prompt: "mačka" }), CATALOG, googleOnly);
    expect(result?.model.slug).toBe("nano-banana-2-lite");
    expect(pickAuto(job({ area: "slika", prompt: "mačka" }), CATALOG, { available: () => false })).toBeNull();
  });
});
