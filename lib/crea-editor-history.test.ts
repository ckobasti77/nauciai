/** Poništi / ponovi (S28, K10): koraci, grananje, granica i spajanje kucanja. */
import { describe, expect, test } from "vitest";

import { canRedo, canUndo, COALESCE_MS, createHistory, HISTORY_LIMIT, pushHistory, redo, undo } from "./crea-editor-history";

describe("istorija izmena", () => {
  test("poništi i ponovi idu tamo-nazad", () => {
    let history = createHistory("a");
    history = pushHistory(history, "b", { now: 1 });
    history = pushHistory(history, "c", { now: 5000 });
    expect(history.present).toBe("c");
    history = undo(history);
    expect(history.present).toBe("b");
    history = undo(history);
    expect(history.present).toBe("a");
    expect(canUndo(history)).toBe(false);
    history = undo(history);
    expect(history.present).toBe("a");
    history = redo(redo(history));
    expect(history.present).toBe("c");
    expect(canRedo(history)).toBe(false);
  });

  test("izmena posle poništavanja briše „ponovi\"", () => {
    let history = pushHistory(pushHistory(createHistory(1), 2, { now: 1 }), 3, { now: 5000 });
    history = undo(history);
    history = pushHistory(history, 9, { now: 9000 });
    expect(history.present).toBe(9);
    expect(canRedo(history)).toBe(false);
    expect(undo(history).present).toBe(2);
  });

  test("ista vrednost ne pravi korak", () => {
    const history = createHistory({ x: 1 });
    expect(pushHistory(history, history.present)).toBe(history);
  });

  test("kucanje sa istim ključem se spaja u jedan korak, ali samo dok je brzo", () => {
    let history = createHistory("");
    history = pushHistory(history, "Č", { key: "tekst-1", now: 1000 });
    history = pushHistory(history, "Ča", { key: "tekst-1", now: 1200 });
    history = pushHistory(history, "Čač", { key: "tekst-1", now: 1400 });
    expect(history.past).toEqual([""]);
    history = pushHistory(history, "Čačak", { key: "tekst-1", now: 1400 + COALESCE_MS + 1 });
    expect(history.past).toEqual(["", "Čač"]);
    // Drugi ključ (drugi čvor) je nov korak čak i odmah posle.
    history = pushHistory(history, "Čačak!", { key: "tekst-2", now: 1400 + COALESCE_MS + 2 });
    expect(history.past.length).toBe(3);
    expect(undo(history).present).toBe("Čačak");
  });

  test("pamti najviše HISTORY_LIMIT koraka", () => {
    let history = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 25; i++) history = pushHistory(history, i, { now: i * 10_000 });
    expect(history.past.length).toBe(HISTORY_LIMIT);
    let steps = 0;
    while (canUndo(history)) {
      history = undo(history);
      steps++;
    }
    expect(steps).toBe(HISTORY_LIMIT);
    expect(history.present).toBe(25);
  });
});
