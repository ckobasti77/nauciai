"use client";

import { useMemo } from "react";

import { useBelgradeToday } from "@/components/crea/game/crea-game-context";
import { seasonById, seasonForDay, type CreaSeason } from "@/lib/crea-seasons";
import { stickerPickerGroups } from "@/lib/crea-stickers";

/**
 * Sezona koja danas traje (K27, G12), po beogradskom danu. `preview` (`?sezona=` na
 * ekranima zajednice) pokazuje izgled druge sezone - samo ukras, izazov se ne menja.
 */
export function useActiveSeason(preview?: string | null): CreaSeason | null {
  const today = useBelgradeToday();
  return useMemo(() => seasonById(preview) ?? seasonForDay(today), [preview, today]);
}

/** Grupe birača nalepnica: dok sezona traje, njene nalepnice su prva grupa. */
export function useSeasonStickerGroups() {
  const season = useActiveSeason();
  return useMemo(() => stickerPickerGroups(season), [season]);
}
