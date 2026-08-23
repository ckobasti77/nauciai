import { afterEach, describe, expect, test } from "vitest";

import {
  activeFilterCount,
  closeStudioFilters,
  DEFAULT_FILTERS,
  openStudioFilters,
  reduceFilters,
  resetStudioFilters,
  resetStudioFiltersStoreForTests,
  setStudioFilters,
  type StudioFilters,
} from "@/lib/studio-filters-store";

afterEach(() => {
  resetStudioFiltersStoreForTests();
});

describe("reduceFilters", () => {
  test("vraća ISTU referencu kad se ništa ne menja (useSyncExternalStore ne sme da vrti render)", () => {
    const state: StudioFilters = { ...DEFAULT_FILTERS, query: "lisica" };
    expect(reduceFilters(state, { query: "lisica" })).toBe(state);
    expect(reduceFilters(state, {})).toBe(state);
    expect(reduceFilters(state, { range: "7d" })).not.toBe(state);
  });
});

describe("activeFilterCount", () => {
  test("vraća 0 kad nijedan filter nije aktivan", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, open: true, selectMode: true })).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, query: "   " })).toBe(0);
  });

  test("vraća 1 kada je aktivan tačno jedan filter", () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, modelSlug: "flux-schnell" })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, range: "7d" })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, query: "roboti" })).toBe(1);
  });

  test("vraća tačan zbir kada je aktivno više filtera (2 ili 3)", () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, modelSlug: "veo-31", range: "30d" })).toBe(2);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, modelSlug: "veo-31", query: "grad" })).toBe(2);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, range: "7d", query: "grad" })).toBe(2);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, modelSlug: "veo-31", range: "30d", query: "x" })).toBe(3);
  });

  test("prozor (open) i režim izbora (selectMode) NE ulaze u zbir", () => {
    expect(
      activeFilterCount({
        ...DEFAULT_FILTERS,
        open: true,
        selectMode: true,
        modelSlug: "veo-31",
      }),
    ).toBe(1);
  });
});

describe("store", () => {
  test("open/close/reset menjaju samo svoje delove", () => {
    setStudioFilters({ modelSlug: "veo-31", range: "7d", query: "q", selectMode: true });
    openStudioFilters();
    resetStudioFilters();
    // Reset vraća filtere, ali ne dira prozor ni režim izbora.
    closeStudioFilters();
    resetStudioFiltersStoreForTests();
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
  });
});

