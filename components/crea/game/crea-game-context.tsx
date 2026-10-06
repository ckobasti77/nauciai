"use client";

import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { api } from "@/convex/_generated/api";
import { belgradeDayKey } from "@/convex/leaderboardCore";
import { CREA_MINI_LESSONS } from "@/lib/crea-mini-lessons";
import type { CreaUnlockState } from "@/lib/crea-skills";

export type CreaGame = NonNullable<FunctionReturnType<typeof api.creaGame.myGame>>;

/** Besplatna proba koju composer nudi uz model (K26, G6). */
export type ComposerFreeTry = { lessonId: string; models: readonly string[]; maxCredits: number };

export type CreaGameValue = {
  /** `undefined` dok se učitava, `null` za gosta. */
  game: CreaGame | null | undefined;
  unlock: CreaUnlockState;
  freeTries: ComposerFreeTry[];
  /** Kanonska putanja sveske (`withLocale` je pravi javnom). */
  notebookPath: string;
  todayKey: string;
};

const CreaGameContext = createContext<CreaGameValue | null>(null);

/** Beogradski dan (isti kao na serveru); osvežava se posle ponoći. */
export function useBelgradeToday(): string {
  const [today, setToday] = useState(() => belgradeDayKey(Date.now()));
  useEffect(() => {
    const id = window.setInterval(() => setToday(belgradeDayKey(Date.now())), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return today;
}

/**
 * Stanje igre za celu radionicu. Gost vidi sve alate (kao i do sada); prijavljen
 * početnik dok se stanje učitava vidi osnovni komplet, da mu se spisak ne skupi
 * pred očima.
 */
export function useCreaGameValue(notebookPath: string): CreaGameValue {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const todayKey = useBelgradeToday();
  const game = useQuery(api.creaGame.myGame, isAuthenticated ? { todayKey } : "skip");
  return useMemo(() => {
    const signedIn = isAuthenticated || isLoading;
    const unlock: CreaUnlockState = !signedIn
      ? { all: true }
      : game === undefined || game === null
        ? { all: false, lessons: [] }
        : game.unlock.auto || game.unlock.chosen
          ? { all: true }
          : { all: false, lessons: game.unlock.lessons };
    const freeTries: ComposerFreeTry[] = (game?.freeTries ?? []).flatMap((row) => {
      const lesson = CREA_MINI_LESSONS.find((l) => l.id === row.lessonId);
      return lesson?.freeTry ? [{ lessonId: lesson.id, models: lesson.freeTry.models, maxCredits: lesson.freeTry.maxCredits }] : [];
    });
    return { game: isAuthenticated ? game : null, unlock, freeTries, notebookPath, todayKey };
  }, [game, isAuthenticated, isLoading, notebookPath, todayKey]);
}

export const CreaGameProvider = CreaGameContext.Provider;

/** Van radionice (npr. samostalan spisak alata) igra nije poznata - sve je otključano. */
const FALLBACK: CreaGameValue = { game: null, unlock: { all: true }, freeTries: [], notebookPath: "/studio/sveska", todayKey: "" };

export function useCreaGame(): CreaGameValue {
  return useContext(CreaGameContext) ?? FALLBACK;
}
