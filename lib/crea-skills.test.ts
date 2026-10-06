import { describe, expect, it } from "vitest";

import { CREA_MINI_LESSONS, freeTryFits, miniLessonById, quizPassed } from "./crea-mini-lessons";
import { CREA_STARTER_TOOLS, isToolUnlocked, lessonForTool, skillMap, splitToolsByUnlock } from "./crea-skills";
import { CREA_TOOLS, toolById, toolsFor } from "./crea-tools";

describe("mini-lekcije", () => {
  it("svaka ima tri kartice i tri pitanja sa tačnim odgovorom, na oba jezika", () => {
    for (const lesson of CREA_MINI_LESSONS) {
      expect(lesson.cards).toHaveLength(3);
      expect(lesson.quiz).toHaveLength(3);
      for (const card of lesson.cards) {
        expect(card.body.sr.length).toBeLessThanOrEqual(240);
        expect(card.body.en.length).toBeGreaterThan(0);
      }
      for (const q of lesson.quiz) {
        expect(q.options).toHaveLength(3);
        expect(q.options[q.correct]).toBeDefined();
        expect(new Set(q.options.map((o) => o.sr)).size).toBe(3);
        expect(q.why.sr.length).toBeGreaterThan(0);
      }
    }
  });

  it("id-jevi su jedinstveni i ASCII", () => {
    const ids = CREA_MINI_LESSONS.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("test se polaže samo sa svim tačnim odgovorima", () => {
    const lesson = CREA_MINI_LESSONS[0]!;
    const right = lesson.quiz.map((q) => q.correct);
    expect(quizPassed(lesson, right)).toBe(true);
    expect(quizPassed(lesson, right.map((a, i) => (i === 0 ? (a + 1) % 3 : a)))).toBe(false);
    expect(quizPassed(lesson, right.slice(0, 2))).toBe(false);
  });

  it("besplatna proba: jeftin model sa spiska, cena do granice, nikad noćna tura", () => {
    const lesson = miniLessonById("video-kamera")!;
    const freeTry = lesson.freeTry!;
    expect(freeTryFits(freeTry, { modelSlug: "grok-video-15-lite", creditCost: 26, night: false })).toBe(true);
    expect(freeTryFits(freeTry, { modelSlug: "grok-video-15-lite", creditCost: freeTry.maxCredits + 1, night: false })).toBe(false);
    expect(freeTryFits(freeTry, { modelSlug: "veo-31-lite", creditCost: 20, night: false })).toBe(false);
    expect(freeTryFits(freeTry, { modelSlug: "grok-video-15-lite", creditCost: 20, night: true })).toBe(false);
    for (const l of CREA_MINI_LESSONS) if (l.freeTry) expect(l.freeTry.maxCredits).toBeLessThanOrEqual(30);
  });
});

describe("postepeno otkrivanje (U10)", () => {
  it("početnik vidi šest alata", () => {
    expect(CREA_STARTER_TOOLS).toHaveLength(6);
    for (const id of CREA_STARTER_TOOLS) expect(toolById(id)?.status).toBe("ready");
    const visible = CREA_TOOLS.filter((tool) => isToolUnlocked(tool.id, { all: false, lessons: [] }));
    expect(visible.map((tool) => tool.id).sort()).toEqual([...CREA_STARTER_TOOLS].sort());
  });

  it("svaki ostali alat otključava tačno jedna mini-lekcija iz iste oblasti", () => {
    const counts = new Map<string, number>();
    for (const lesson of CREA_MINI_LESSONS) {
      for (const id of lesson.unlocks) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
        expect(toolById(id), id).toBeDefined();
        expect(id.startsWith(`${lesson.area}.`), id).toBe(true);
      }
    }
    for (const tool of CREA_TOOLS) {
      if (CREA_STARTER_TOOLS.includes(tool.id)) expect(counts.get(tool.id) ?? 0, tool.id).toBe(0);
      else expect(counts.get(tool.id), tool.id).toBe(1);
    }
  });

  it("lekcija otključava svoje alate; „otključaj sve“ otvara sve", () => {
    const lesson = miniLessonById("slika-popravi")!;
    const state = { all: false as const, lessons: [lesson.id] };
    for (const id of lesson.unlocks) expect(isToolUnlocked(id, state)).toBe(true);
    expect(isToolUnlocked("slika.cetkica", state)).toBe(false);
    expect(lessonForTool("slika.cetkica")?.id).toBe("slika-ai");
    for (const tool of CREA_TOOLS) expect(isToolUnlocked(tool.id, { all: true })).toBe(true);
  });

  it("spisak režima kaže koliko alata čeka i koja lekcija ih otvara", () => {
    const { visible, locked, lessons } = splitToolsByUnlock(toolsFor("slika", "izmeni"), { all: false, lessons: [] });
    expect(visible.map((t) => t.id)).toEqual(["slika.pozadina"]);
    expect(locked.length).toBeGreaterThan(5);
    expect(lessons.map((l) => l.id).sort()).toEqual(["slika-ai", "slika-popravi"]);
  });

  it("mapa veština: koren je osnovni komplet, grane su lekcije sa napretkom", () => {
    const map = skillMap("slika", { all: false, lessons: ["slika-popravi"] }, new Set(["alat:slika.klik", "alat:slika.pozadina"]));
    expect(map.starter).toEqual({ tools: ["slika.pozadina", "slika.iseci", "slika.editor"], tried: 1 });
    const node = map.nodes.find((n) => n.lesson.id === "slika-popravi")!;
    expect(node).toMatchObject({ unlocked: true, tried: 1, total: node.lesson.unlocks.length });
    expect(map.nodes.find((n) => n.lesson.id === "slika-ai")?.unlocked).toBe(false);
  });
});
