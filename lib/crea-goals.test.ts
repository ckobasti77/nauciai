/**
 * „Šta praviš danas?" (K03): kartica po cilju mora da vodi u STVARAN režim sa
 * modelom koji postoji, koji taj režim nudi i koji prima zadate parametre.
 */

import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { CREA_GOALS, creaGoalById, goalHref } from "@/lib/crea-goals";
import { CREA_MODES, creaModeDef, modelsForMode, parseCreaShellState, usableInputModes } from "@/lib/crea-shell";

describe("CREA_GOALS", () => {
  test("ima 8-12 kartica sa jedinstvenim id-jevima", () => {
    expect(CREA_GOALS.length).toBeGreaterThanOrEqual(8);
    expect(CREA_GOALS.length).toBeLessThanOrEqual(12);
    expect(new Set(CREA_GOALS.map((goal) => goal.id)).size).toBe(CREA_GOALS.length);
  });

  test("pokriva sve tri oblasti", () => {
    expect(new Set(CREA_GOALS.map((goal) => goal.area))).toEqual(new Set(["slika", "video", "zvuk"]));
  });

  test("tekstovi nisu prazni ni na jednom jeziku", () => {
    for (const goal of CREA_GOALS) {
      expect(goal.title.sr.trim(), goal.id).not.toBe("");
      expect(goal.title.en.trim(), goal.id).not.toBe("");
      expect(goal.hint.sr.trim(), goal.id).not.toBe("");
      expect(goal.hint.en.trim(), goal.id).not.toBe("");
      if (goal.prompt) {
        expect(goal.prompt.sr.trim(), goal.id).not.toBe("");
        expect(goal.prompt.en.trim(), goal.id).not.toBe("");
      }
    }
  });

  test("režim pripada oblasti", () => {
    for (const goal of CREA_GOALS) {
      expect(CREA_MODES[goal.area].some((mode) => mode.id === goal.mode), goal.id).toBe(true);
    }
  });

  test("model postoji, odgovara vrsti i režim ga nudi", () => {
    for (const goal of CREA_GOALS) {
      if (!goal.modelSlug) continue;
      const offered = modelsForMode(STUDIO_MODELS, goal.area, goal.mode).map((model) => model.slug);
      expect(offered, goal.id).toContain(goal.modelSlug);
    }
  });

  test("kartica sa opisom ima model; kartica bez modela vodi u alat ili recept", () => {
    for (const goal of CREA_GOALS) {
      if (goal.prompt) expect(goal.modelSlug, goal.id).toBeDefined();
      if (!goal.modelSlug) expect(goal.toolId ?? goal.recipeId, goal.id).toBeDefined();
    }
  });

  test("kartica koja vodi u režim „uskoro” nema model (ne obećava generisanje)", () => {
    for (const goal of CREA_GOALS) {
      if (creaModeDef(goal.area, goal.mode).status === "soon") expect(goal.modelSlug, goal.id).toBeUndefined();
    }
  });

  test("ulazni režim i parametri postoje na modelu", () => {
    for (const goal of CREA_GOALS) {
      const model = STUDIO_MODELS.find((entry) => entry.slug === goal.modelSlug);
      if (goal.inputMode) expect(usableInputModes(model!), goal.id).toContain(goal.inputMode);
      for (const [key, value] of Object.entries(goal.params ?? {})) {
        const control = model!.paramSpec.find((entry) => entry.key === key);
        expect(control, `${goal.id}.${key}`).toBeDefined();
        if (control?.options) {
          expect(control.options.map((option) => option.value), `${goal.id}.${key}`).toContain(value);
        }
      }
    }
  });
});

describe("goalHref", () => {
  test("vodi u oblast, režim i cilj, sa preporučenim modelom", () => {
    const goal = creaGoalById("tiktok")!;
    const state = parseCreaShellState(new URLSearchParams(goalHref(goal).slice(1)));
    expect(state).toMatchObject({ area: "video", mode: null, goal: "tiktok" });
    expect(new URLSearchParams(goalHref(goal).slice(1)).get("model")).toBe("minimax-h3");
  });

  test("ne-podrazumevani režim se upisuje", () => {
    expect(goalHref(creaGoalById("profilna")!)).toBe("?oblast=slika&rezim=izmeni&cilj=profilna&model=nano-banana-pro");
  });

  test("čuva projekat i lekciju iz trenutne adrese", () => {
    const href = goalHref(creaGoalById("logo")!, new URLSearchParams("project=p1&lessonId=l1&taskId=t1"));
    expect(href).toBe("?oblast=slika&cilj=logo&project=p1&model=nano-banana-2&lessonId=l1&taskId=t1");
  });

  test("kartica alata vodi u alat", () => {
    expect(goalHref(creaGoalById("ukloni-pozadinu")!)).toBe(
      "?oblast=slika&rezim=alati&alat=slika.pozadina&cilj=ukloni-pozadinu",
    );
  });

  test("nepoznat cilj ne postoji", () => {
    expect(creaGoalById("nema-ga")).toBeUndefined();
    expect(creaGoalById(null)).toBeUndefined();
  });
});
