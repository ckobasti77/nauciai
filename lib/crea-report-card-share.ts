import "server-only";

import { belgradeDayKey } from "@/convex/leaderboardCore";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import type { ReportCard } from "@/lib/crea-report-card";

export type SharedReportCard = {
  name: string;
  username: string;
  card: ReportCard & { streak: number; bestStreak: number; xp: number };
};

/**
 * Javna knjižica za stranicu za deljenje i OG sliku (K26, G5). `null` kad korisnik ne
 * postoji, kad knjižica nije javna ili kad backend nije povezan - stranica tada kaže
 * da knjižica nije javna, a slika vraća 404.
 */
export async function loadSharedReportCard(username: string): Promise<SharedReportCard | null> {
  const client = getConvexHttpClient();
  if (!client || username.length === 0 || username.length > 64) return null;
  try {
    return (await client.query(convexQueries.getPublicReportCard, {
      username,
      todayKey: belgradeDayKey(Date.now()),
    })) as SharedReportCard | null;
  } catch {
    return null;
  }
}
