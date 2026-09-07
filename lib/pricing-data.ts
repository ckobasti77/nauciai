/**
 * Čitanje cena i Studio kredita za JAVNE strane (landing „#pricing" i strana
 * pretplate iz N6). Izdvojeno jer obe rute traže istu stvar na isti način —
 * jedan izvor istine za redosled „baza → `resolveSettings` → statička rezerva",
 * pa se cena ne može razići između dve strane.
 *
 * Obe funkcije gutaju grešku i vraćaju rezervu: cena je marketinški podatak, a
 * pad Convex-a ne sme da obori javnu stranu.
 */
import { convexQueries, getConvexHttpClient } from "./convex-http";
import {
  resolveSettings,
  type PlatformPricing,
  type PlatformSettingsInput,
} from "./platform-settings";

/**
 * Broj Studio kredita uz Premium plan — iz istog javnog upita kao Studio landing.
 * Ako plan „premium" nije definisan (ili Convex nije dostupan), vraća `null` i
 * kartica prikazuje tekst bez broja.
 */
export async function getPremiumCredits(): Promise<number | null> {
  const convex = getConvexHttpClient();
  if (!convex) return null;
  try {
    const packs = (await convex.query(convexQueries.listPacks, { kind: "plan" })) as Array<{
      planTier?: string;
      credits?: number;
    }>;
    const premium = packs.find((pack) => pack.planTier === "premium");
    return premium?.credits ?? null;
  } catch {
    return null;
  }
}

/**
 * Cene planova — od N1 ih drži admin u `platformSettings`, a `lib/pricing.ts` je
 * samo rezerva kad reda nema, kad je polje prazno ili kad Convex nije dostupan.
 * `resolveSettings` spaja to dvoje na jednom mestu.
 */
export async function getPlanPricing(): Promise<PlatformPricing> {
  const convex = getConvexHttpClient();
  if (!convex) return resolveSettings(null).pricing;
  try {
    const live = (await convex.query(convexQueries.getPlatformSettings, {})) as PlatformSettingsInput;
    return resolveSettings(live).pricing;
  } catch {
    return resolveSettings(null).pricing;
  }
}
