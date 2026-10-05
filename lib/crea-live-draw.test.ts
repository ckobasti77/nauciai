import { describe, expect, test } from "vitest";

import { LIVE_DRAW_DEFAULTS, liveDrawDecision, liveDrawMaxCredits, type LiveDrawState } from "./crea-live-draw";

const base: LiveDrawState = { revision: 3, sentRevision: -1, lastChangeAt: 10_000, lastSentAt: null, inFlight: false, sent: 0 };
const rules = { idleMs: 1000, minIntervalMs: 5000, limit: 3 };

describe("crtaj i gledaj (S9): kada se skica šalje", () => {
  test("šalje tek kad ruka miruje", () => {
    expect(liveDrawDecision(base, 10_400, rules)).toEqual({ action: "wait", ms: 600 });
    expect(liveDrawDecision(base, 11_000, rules)).toEqual({ action: "send" });
  });

  test("između dva slanja bar `minIntervalMs`", () => {
    const state = { ...base, sentRevision: 2, lastSentAt: 9_000, sent: 1 };
    expect(liveDrawDecision(state, 11_000, rules)).toEqual({ action: "wait", ms: 3000 });
    expect(liveDrawDecision(state, 14_000, rules)).toEqual({ action: "send" });
  });

  test("ništa dok prethodno osvežavanje traje, ni kad se crtež nije promenio", () => {
    expect(liveDrawDecision({ ...base, inFlight: true }, 20_000, rules)).toEqual({ action: "idle", reason: "in-flight" });
    expect(liveDrawDecision({ ...base, sentRevision: 3 }, 20_000, rules)).toEqual({ action: "idle", reason: "unchanged" });
    expect(liveDrawDecision({ ...base, revision: 0 }, 20_000, rules)).toEqual({ action: "idle", reason: "unchanged" });
  });

  test("granica osvežavanja po sesiji je tvrda", () => {
    expect(liveDrawDecision({ ...base, sent: 3 }, 99_000, rules)).toEqual({ action: "idle", reason: "limit" });
  });

  test("najveća cena sesije se zna unapred", () => {
    expect(liveDrawMaxCredits(4)).toBe(4 * LIVE_DRAW_DEFAULTS.limit);
    expect(liveDrawMaxCredits(4, 5)).toBe(20);
    expect(liveDrawMaxCredits(null)).toBeNull();
  });
});
