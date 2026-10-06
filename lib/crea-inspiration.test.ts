import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";

import {
  CREA_INSPIRATIONS,
  CREA_PROMPT_PREFILL_TOOLS,
  inspirationById,
  inspirationsFor,
  makeLikeThisQuery,
  modeTarget,
} from "./crea-inspiration";
import { CREA_MODES, CREA_PROMPT_PARAM, modelsForMode, parseCreaShellState, type CreaArea } from "./crea-shell";
import { CREA_TOOLS, toolById } from "./crea-tools";

const composerModes = (Object.entries(CREA_MODES) as Array<[CreaArea, (typeof CREA_MODES)[CreaArea]]>).flatMap(([area, modes]) =>
  modes.filter((mode) => mode.status === "ready" && mode.models !== undefined).map((mode) => ({ area, mode: mode.id })),
);

describe("Inspiracija uz svaki alat (U11)", () => {
  test("svaki gotov alat ima bar jedan primer", () => {
    const missing = CREA_TOOLS.filter((tool) => tool.status === "ready" && inspirationsFor(tool.id).length === 0).map((tool) => tool.id);
    expect(missing).toEqual([]);
  });

  test("svaki režim sa composerom ima bar jedan primer", () => {
    const missing = composerModes.filter(({ area, mode }) => inspirationsFor(`${area}:${mode}`).length === 0);
    expect(missing).toEqual([]);
  });

  test("meta je gotov alat ili režim sa composerom - ništa ne cilja „uskoro\"", () => {
    for (const example of CREA_INSPIRATIONS) {
      const mode = modeTarget(example.target);
      if (mode) {
        expect(composerModes.some((entry) => entry.area === mode.area && entry.mode === mode.mode), example.id).toBe(true);
      } else {
        expect(toolById(example.target)?.status, example.id).toBe("ready");
      }
    }
  });

  test("jedinstveni ASCII id-jevi, tekstovi na oba jezika, 2-3 koraka", () => {
    const ids = CREA_INSPIRATIONS.map((example) => example.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const example of CREA_INSPIRATIONS) {
      expect(example.id).toMatch(/^[a-z0-9][a-z0-9-]{1,48}$/);
      expect(example.title.sr.length, example.id).toBeLessThanOrEqual(60);
      expect(example.title.en.trim(), example.id).not.toBe("");
      expect(example.steps.length, example.id).toBeGreaterThanOrEqual(2);
      expect(example.steps.length, example.id).toBeLessThanOrEqual(3);
      for (const step of example.steps) {
        expect(step.sr.trim() && step.en.trim(), example.id).toBeTruthy();
        expect(step.sr.length, example.id).toBeLessThanOrEqual(120);
      }
      if (example.prompt) {
        expect(example.prompt.sr.trim() && example.prompt.en.trim(), example.id).toBeTruthy();
      }
    }
  });

  test("model primera postoji i režim ga nudi; alati nemaju model", () => {
    for (const example of CREA_INSPIRATIONS) {
      const mode = modeTarget(example.target);
      if (!mode) {
        expect(example.modelSlug, example.id).toBeUndefined();
        continue;
      }
      if (!example.modelSlug) continue;
      const slugs = modelsForMode(STUDIO_MODELS, mode.area, mode.mode).map((model) => model.slug);
      expect(slugs, example.id).toContain(example.modelSlug);
    }
  });

  test("primer sa opisom za alat cilja samo alat koji prima opis", () => {
    for (const example of CREA_INSPIRATIONS) {
      if (!example.prompt || modeTarget(example.target)) continue;
      expect(CREA_PROMPT_PREFILL_TOOLS.has(example.target), example.id).toBe(true);
    }
    for (const id of CREA_PROMPT_PREFILL_TOOLS) expect(toolById(id)?.status, id).toBe("ready");
  });
});

describe("„Napravi ovako\"", () => {
  test("režim: oblast, režim, model i opis; čuva projekat, briše alat i cilj", () => {
    const example = inspirationById("pas-plaza")!;
    const current = new URLSearchParams("oblast=video&alat=video.montaza&cilj=tiktok&project=p1");
    const query = new URLSearchParams(makeLikeThisQuery(example, "sr", current));
    // Podrazumevani režim oblasti (Napravi) se ne upisuje u adresu.
    expect(parseCreaShellState(query)).toMatchObject({ area: "slika", mode: null, tool: null, goal: null });
    expect(query.get("model")).toBe("nano-banana-2");
    expect(query.get(CREA_PROMPT_PARAM)).toBe(example.prompt!.sr);
    expect(query.get("project")).toBe("p1");
  });

  test("engleski interfejs dobija engleski opis", () => {
    const query = new URLSearchParams(makeLikeThisQuery(inspirationById("lofi-ucenje")!, "en", new URLSearchParams()));
    expect(query.get(CREA_PROMPT_PARAM)).toMatch(/lo-fi hip hop/);
    expect(parseCreaShellState(query)).toMatchObject({ area: "zvuk", mode: "muzika" });
  });

  test("alat sa poljem za opis dobija opis, ostali samo alat", () => {
    const withPrompt = new URLSearchParams(makeLikeThisQuery(inspirationById("efekti-grmljavina")!, "sr", new URLSearchParams()));
    expect(parseCreaShellState(withPrompt)).toMatchObject({ area: "zvuk", mode: "efekti", tool: "zvuk.efekti" });
    expect(withPrompt.get(CREA_PROMPT_PARAM)).toMatch(/grmljavina/);
    const fileTool = new URLSearchParams(makeLikeThisQuery(inspirationById("pozadina-proizvod")!, "sr", new URLSearchParams()));
    expect(parseCreaShellState(fileTool)).toMatchObject({ area: "slika", mode: "izmeni", tool: "slika.pozadina" });
    expect(fileTool.get(CREA_PROMPT_PARAM)).toBeNull();
  });

  test("svaki primer daje adresu koja vodi u svoju metu", () => {
    for (const example of CREA_INSPIRATIONS) {
      const state = parseCreaShellState(new URLSearchParams(makeLikeThisQuery(example, "sr", new URLSearchParams())));
      const mode = modeTarget(example.target);
      if (mode) {
        expect(state.area, example.id).toBe(mode.area);
        expect(state.mode ?? CREA_MODES[mode.area][0]!.id, example.id).toBe(mode.mode);
      } else {
        expect(state.tool, example.id).toBe(example.target);
      }
    }
  });
});
