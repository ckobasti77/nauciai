import { describe, expect, test } from "vitest";

import { studioModelBySlug } from "@/convex/providers/catalogModels";
import { sanitizeSpecParams } from "@/convex/studioParamSpec";

import {
  editInstruction,
  editParams,
  editPrompt,
  editRouteProblem,
  refList,
  seedanceSeconds,
  swapPrompt,
  swapTarget,
  VIDEO_EDIT_EXAMPLES,
  VIDEO_EDIT_ROUTES,
  VIDEO_SWAP_TARGETS,
  VIDEO_UPSCALE_MODEL,
} from "./crea-video-edit";

const kling = VIDEO_EDIT_ROUTES.find((route) => route.id === "kling")!;
const seedance = VIDEO_EDIT_ROUTES.find((route) => route.id === "seedance")!;

describe("izmeni video rečima (V13) i zameni predmet (V14)", () => {
  test("rute su postojeći modeli sa traženim režimom i dovoljno slika", () => {
    for (const route of VIDEO_EDIT_ROUTES) {
      const model = studioModelBySlug(route.modelSlug);
      expect(model, route.id).toBeDefined();
      expect(model!.inputModes, route.id).toContain(route.inputMode);
      expect(model!.inputSpec[route.inputMode]?.video?.max, route.id).toBeGreaterThanOrEqual(1);
      expect(model!.inputSpec[route.inputMode]?.image?.max ?? 0, route.id).toBeGreaterThanOrEqual(route.maxRefs);
    }
    expect(studioModelBySlug(VIDEO_UPSCALE_MODEL)?.inputModes).toEqual(["video"]);
  });

  test("parametri prolaze serversku proveru za obe rute", () => {
    for (const route of VIDEO_EDIT_ROUTES) {
      const model = studioModelBySlug(route.modelSlug)!;
      for (const resolution of ["720p", "1080p"]) {
        const params = editParams(route, editPrompt(route, "Add rain"), 6.4, resolution);
        const sanitized = sanitizeSpecParams(model.paramSpec, model.priceRule, params, route.inputMode);
        expect(sanitized.ok, `${route.id} ${resolution}`).toBe(true);
      }
    }
    // Kling: trajanje meri server, ne šalje se.
    expect(editParams(kling, "p", 6.4, "720p")).toEqual({ prompt: "p", resolution: "720p" });
    expect(editParams(seedance, "p", 6.4, "720p")).toEqual({ prompt: "p", resolution: "720p", duration: 7 });
    expect(seedanceSeconds(2)).toBe(4);
    expect(seedanceSeconds(9.99)).toBe(10);
    expect(seedanceSeconds(80)).toBe(30);
  });

  test("primeri rečenica: srpski na dugmetu, engleski za model", () => {
    expect(VIDEO_EDIT_EXAMPLES.length).toBeGreaterThanOrEqual(6);
    expect(VIDEO_EDIT_EXAMPLES.map((example) => example.label.sr)).toEqual(expect.arrayContaining(["Dodaj kišu", "Skloni auto"]));
    for (const example of VIDEO_EDIT_EXAMPLES) {
      expect(example.instruction).toMatch(/^[A-Z][A-Za-z ,'-]+$/);
      expect(example.label.en.length).toBeGreaterThan(2);
    }
    expect(editInstruction("kisa", "")).toBe(VIDEO_EDIT_EXAMPLES[0]!.instruction);
    expect(editInstruction("kisa", " i grmljavina. ")).toBe(`${VIDEO_EDIT_EXAMPLES[0]!.instruction}. i grmljavina`);
    expect(editInstruction(null, "  skloni   kantu  ")).toBe("skloni kantu");
    expect(editInstruction(null, "   ")).toBe("");
  });

  test("opis po ruti: Kling menja direktno, Seedance zna da je video referenca 1", () => {
    expect(editPrompt(kling, "Add rain")).toBe("Add rain. Keep the motion, the camera, the timing and everything else exactly the same.");
    expect(editPrompt(seedance, "Add rain.")).toMatch(/^Edit video 1: Add rain\. Keep/);
    expect(editPrompt(kling, "Add a hat", 2)).toContain("Use @Image1 and @Image2 as the visual reference.");
    expect(editPrompt(seedance, "Add a hat", 1)).toContain("Use image 1 as the visual reference.");
    expect(refList(kling, 3)).toBe("@Image1, @Image2 and @Image3");
  });

  test("zamena predmeta referentnom slikom", () => {
    expect(swapTarget("auto", "")).toBe("the car");
    expect(swapTarget("auto", "crvenu šolju")).toBe("crvenu šolju");
    expect(swapTarget(null, "")).toBe("");
    expect(swapPrompt(kling, "the car", 1)).toBe(
      "Replace the car in the video with the object shown in @Image1. Keep the motion, the camera, the timing and everything else exactly the same.",
    );
    expect(swapPrompt(seedance, "the car", 1)).toMatch(/^In video 1, replace the car with the object shown in image 1\./);
    expect(VIDEO_SWAP_TARGETS.every((target) => target.phrase.startsWith("the "))).toBe(true);
  });

  test("dužina izvora po ruti", () => {
    expect(editRouteProblem(kling, 2)).toBe("prekratko");
    expect(editRouteProblem(kling, 15)).toBeNull();
    expect(editRouteProblem(kling, 16)).toBe("predugo");
    expect(editRouteProblem(seedance, 12)).toBe("predugo");
    expect(editRouteProblem(seedance, null)).toBeNull();
  });
});
