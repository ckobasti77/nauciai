import { describe, expect, it } from "vitest";

import { tabTrapAction } from "./focus-trap";

const ring = (over: Partial<Parameters<typeof tabTrapAction>[0]> = {}) =>
  tabTrapAction({ count: 3, activeIndex: 1, activeInside: true, shiftKey: false, ...over });

describe("Tab zamka u modalu", () => {
  it("vraca fokus na okvir modala kad u njemu nema nijedne kontrole", () => {
    expect(ring({ count: 0 })).toEqual({ kind: "container" });
    expect(ring({ count: 0, shiftKey: true })).toEqual({ kind: "container" });
  });

  it("pusta pregledac da radi svoje dok je fokus usred prstena", () => {
    expect(ring({ activeIndex: 1 })).toEqual({ kind: "native" });
    expect(ring({ activeIndex: 1, shiftKey: true })).toEqual({ kind: "native" });
  });

  it("sa poslednje kontrole Tab vraca na prvu", () => {
    expect(ring({ activeIndex: 2 })).toEqual({ kind: "focus", index: 0 });
  });

  it("sa prve kontrole Shift+Tab vodi na poslednju", () => {
    expect(ring({ activeIndex: 0, shiftKey: true })).toEqual({ kind: "focus", index: 2 });
  });

  it("Shift+Tab uvlaci fokus nazad u modal ako je ispao iz njega", () => {
    // Ovo je razlika izmedju kompletne i polovicne zamke: bez ovog pravila fokus
    // koji je zavrsio iza preklopa nikad se ne vrati unutra.
    expect(ring({ activeIndex: -1, activeInside: false, shiftKey: true })).toEqual({ kind: "focus", index: 2 });
  });

  it("ne dira fokus koji je ispao iz modala dok se ide unapred", () => {
    // Tab unapred nema isto pravilo - tako je bilo i u originalu, pa se ponasanje
    // ne menja tihom "popravkom".
    expect(ring({ activeIndex: -1, activeInside: false })).toEqual({ kind: "native" });
  });

  it("prsten od jedne kontrole vrti se na samog sebe u oba smera", () => {
    expect(tabTrapAction({ count: 1, activeIndex: 0, activeInside: true, shiftKey: false })).toEqual({
      kind: "focus",
      index: 0,
    });
    expect(tabTrapAction({ count: 1, activeIndex: 0, activeInside: true, shiftKey: true })).toEqual({
      kind: "focus",
      index: 0,
    });
  });
});
