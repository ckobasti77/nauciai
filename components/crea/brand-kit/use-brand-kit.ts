"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { CreaBrandKit } from "@/lib/crea-brand-kit";

/**
 * Brend kit prijavljenog korisnika (S38, K15) - recepti, editor (boje, slova,
 * vodeni žig) i logo ga čitaju odavde. `undefined` dok se učitava, `null` kad
 * kita nema (ili korisnik nije prijavljen).
 */
export function useBrandKit(): CreaBrandKit | null | undefined {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const kit = useQuery(api.creaBrandKit.getMine, isAuthenticated ? {} : "skip");
  if (isLoading) return undefined;
  if (!isAuthenticated) return null;
  return kit;
}
