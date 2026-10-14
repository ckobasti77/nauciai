"use client";

import type { FunctionReturnType } from "convex/server";
import { createContext, useContext } from "react";

import type { api } from "@/convex/_generated/api";

export type IgraProgress = NonNullable<FunctionReturnType<typeof api.igra.getMyProgress>>;

export type IgraProgressValue = {
  /** `undefined` dok se učitava; `null` za gosta ili kad napredak nije dostupan. */
  progress: IgraProgress | null | undefined;
  /** Otvara panel „Moj napredak". */
  openPanel: () => void;
};

/** Vrednost daje `IgraProgressProvider` u ljusci aplikacije (izlog daje test podatke). */
export const IgraProgressContext = createContext<IgraProgressValue | null>(null);

/** Van ljuske aplikacije (bez Convex-a, javni sajt) napretka nema i ništa se ne crta. */
const FALLBACK: IgraProgressValue = { progress: null, openPanel: () => undefined };

export function useIgraProgress(): IgraProgressValue {
  return useContext(IgraProgressContext) ?? FALLBACK;
}
