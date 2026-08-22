/**
 * Filteri mreže Studija (SP2) kao mali deljeni store, bez zavisnosti.
 *
 * Zašto store, a ne props: okidač je LINIJA u sidebaru (`app-sidebar-studio.tsx`,
 * drugo React stablo), prozor renderuje `studio-page.tsx`, a vrednosti čita
 * `studio-media-grid.tsx`. Vrsta (Slika/Video/Zvuk) NIJE ovde - nju i dalje nosi
 * URL (`?kind=`) i sidebar, kao i do sad.
 *
 * Pure deo (`reduceFilters`, `activeFilterCount`) je odvojen od React-a da bi se
 * testirao; `useStudioFilters` je tanak `useSyncExternalStore` omotač.
 */

import { useSyncExternalStore } from "react";

import type { DateRangePreset } from "@/lib/studio-gallery";

export type StudioFilters = {
  /** Da li je prozor sa filterima otvoren. */
  open: boolean;
  modelSlug: string | null;
  range: DateRangePreset;
  query: string;
  /** „Izaberi više" - režim višestrukog izbora u mreži. */
  selectMode: boolean;
};

export const DEFAULT_FILTERS: StudioFilters = {
  open: false,
  modelSlug: null,
  range: "all",
  query: "",
  selectMode: false,
};

export function reduceFilters(state: StudioFilters, patch: Partial<StudioFilters>): StudioFilters {
  const next = { ...state, ...patch };
  for (const key of Object.keys(next) as Array<keyof StudioFilters>) {
    if (next[key] !== state[key]) return next;
  }

  return state;
}

/** Koliko filtera je aktivno - broj na sidebar-liniji. `open`/`selectMode` nisu filteri. */
export function activeFilterCount(state: StudioFilters): number {
  let count = 0;
  if (state.modelSlug !== null) count += 1;
  if (state.range !== "all") count += 1;
  if (state.query.trim().length > 0) count += 1;

  return count;
}

let current: StudioFilters = DEFAULT_FILTERS;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setStudioFilters(patch: Partial<StudioFilters>) {
  const next = reduceFilters(current, patch);
  if (next === current) return;
  current = next;
  emit();
}

export function openStudioFilters() {
  setStudioFilters({ open: true });
}

export function closeStudioFilters() {
  setStudioFilters({ open: false });
}

/** Vraća filtere na podrazumevano; prozor i režim izbora ostaju kakvi jesu. */
export function resetStudioFilters() {
  setStudioFilters({ modelSlug: null, range: "all", query: "" });
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return current;
}

function getServerSnapshot() {
  return DEFAULT_FILTERS;
}

export function useStudioFilters(): StudioFilters {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Samo za testove: vrati store na početno stanje. */
export function resetStudioFiltersStoreForTests() {
  current = DEFAULT_FILTERS;
  emit();
}
