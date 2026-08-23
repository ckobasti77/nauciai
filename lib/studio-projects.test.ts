import { describe, expect, test } from "vitest";
import {
  canCreateStudioProject,
  MAX_STUDIO_PROJECTS,
  PROJECT_NAME_MAX_LENGTH,
  validateProjectName,
} from "./studio-projects";
import { computeCreditCost } from "@/convex/studioCore";
import { jobCreditCost } from "@/lib/studio-form";

describe("validateProjectName", () => {
  test("prihvata validno ime i trimuje whitespace", () => {
    const res = validateProjectName("  Moj Projekat 1  ");
    expect(res).toEqual({ ok: true, name: "Moj Projekat 1" });
  });

  test("odbija prazno ime ili samo razmake sa PROJEKAT_BEZ_IMENA", () => {
    expect(validateProjectName("")).toEqual({ ok: false, code: "PROJEKAT_BEZ_IMENA" });
    expect(validateProjectName("   \t\n  ")).toEqual({ ok: false, code: "PROJEKAT_BEZ_IMENA" });
  });

  test("odbija predugačko ime (>60 karaktera) sa PROJEKAT_PREDUGO_IME", () => {
    const valid60 = "A".repeat(PROJECT_NAME_MAX_LENGTH);
    expect(validateProjectName(valid60)).toEqual({ ok: true, name: valid60 });

    const tooLong61 = "A".repeat(PROJECT_NAME_MAX_LENGTH + 1);
    expect(validateProjectName(tooLong61)).toEqual({
      ok: false,
      code: "PROJEKAT_PREDUGO_IME",
    });
  });

  test("odbija duplikat kod istog korisnika (case-insensitive i trimovano)", () => {
    const existing = ["Marketing Kampanja", "Video spotovi", "Avatar Probe"];

    expect(validateProjectName("marketing kampanja", existing)).toEqual({
      ok: false,
      code: "PROJEKAT_VEC_POSTOJI",
    });

    expect(validateProjectName("  VIDEO SPOTOVI  ", existing)).toEqual({
      ok: false,
      code: "PROJEKAT_VEC_POSTOJI",
    });

    expect(validateProjectName("Novi brend", existing)).toEqual({
      ok: true,
      name: "Novi brend",
    });
  });
});

describe("canCreateStudioProject", () => {
  test("dozvoljava kreiranje ispod limita od 50 projekata", () => {
    expect(canCreateStudioProject(0)).toBe(true);
    expect(canCreateStudioProject(49)).toBe(true);
    expect(canCreateStudioProject(MAX_STUDIO_PROJECTS - 1)).toBe(true);
  });

  test("odbija kreiranje na ili preko limita od 50 projekata", () => {
    expect(canCreateStudioProject(MAX_STUDIO_PROJECTS)).toBe(false);
    expect(canCreateStudioProject(50)).toBe(false);
    expect(canCreateStudioProject(51)).toBe(false);
  });
});

describe("projectId ne menja cenu ni parametre", () => {
  test("computeCreditCost i jobCreditCost zavise isključivo od modela i parametara, bez obzira na projectId", () => {
    const model = {
      creditCost: 15,
      creditCostPerSecond: undefined,
    };

    const paramsWithoutProject = { prompt: "test prompt", aspect_ratio: "16:9", num_images: 2 };
    const paramsWithProject = { ...paramsWithoutProject, projectId: "project_123" };

    const costWithout = computeCreditCost(model, paramsWithoutProject);
    const costWith = computeCreditCost(model, paramsWithProject);

    // Cena mora biti identična
    expect(costWithout).toBe(30);
    expect(costWith).toBe(30);
    expect(costWith).toBe(costWithout);

    // jobCreditCost na klijentu takođe ne zavisi od projectId
    const clientCostWithout = jobCreditCost(15, paramsWithoutProject);
    const clientCostWith = jobCreditCost(15, paramsWithProject);
    expect(clientCostWith).toBe(clientCostWithout);
    expect(clientCostWith).toBe(30);
  });
});
