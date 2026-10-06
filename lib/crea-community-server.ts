import "server-only";

import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";

/**
 * Da li je javna galerija Cree upaljena (fleg `crea_public_gallery`, O6). Galerija,
 * javni rad i izazov su bez flega 404 - kao da ne postoje. Bez backend-a ili kad upit
 * padne: isključeno (konzervativno).
 */
export async function isCreaGalleryEnabled(): Promise<boolean> {
  const client = getConvexHttpClient();
  if (!client) return false;
  try {
    const state = (await client.query(convexQueries.creaGalleryState, {})) as { enabled: boolean };
    return state.enabled === true;
  } catch {
    return false;
  }
}
