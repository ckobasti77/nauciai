import { describe, expect, test } from "vitest";

import { demoAssistant } from "@/convex/creaAssistantCore";
import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { assistantTotal, priceAssistantSteps } from "@/lib/crea-assistant";
import { creditsFor } from "@/lib/studio-params";
import { parseStudioModel, type StudioModel } from "@/lib/studio-models";

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

describe("pomoćnik: cena koraka", () => {
  test("slika → video iz slike → muzika: model po vrsti, opis u polju za opis, cena kao na dugmetu", () => {
    const plan = demoAssistant("reklama za kafić sa videom i muzikom", "sr");
    const priced = priceAssistantSteps(plan.steps, CATALOG, () => true);
    expect(priced.map((entry) => entry.model?.kind)).toEqual(["image", "video", "audio"]);
    expect(priced[1]).toMatchObject({ fromStep: 0 });
    expect(priced[1]!.model!.inputModes).toContain(priced[1]!.inputMode);
    for (const entry of priced) {
      expect(Object.values(entry.params)).toContain(entry.step.prompt);
      expect(entry.credits).toBeGreaterThan(0);
    }
    const image = priced[0]!;
    expect(image.credits).toBe(creditsFor(image.model!.priceRule, image.params, image.inputMode, image.model!.creditFactor));
    expect(assistantTotal(priced)).toBe(priced.reduce((sum, entry) => sum + entry.credits, 0));
  });

  test("bez dostupnog modela korak (i video iz te slike) se preskače i ne ulazi u zbir", () => {
    const plan = demoAssistant("reklama sa videom", "sr");
    const priced = priceAssistantSteps(plan.steps, CATALOG, (model) => model.kind !== "image");
    expect(priced.map((entry) => entry.model)).toEqual([null, null]);
    expect(assistantTotal(priced)).toBe(0);
  });
});
