import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { isDayKey } from "../lib/crea-streak";
import { isBannerUnlocked, isIgraBannerKey } from "../lib/igra-banners";
import { currentUserId, requireUserId } from "./helpers";
import { freshSeenKeys, levelOf, memberProgressFor, progressFor } from "./igraCore";
import { belgradeDayKey } from "./leaderboardCore";

/**
 * Javni API napretka IGRA-e (K04): nivo, XP, niz dana, bedževi i šta je novo. SAMO za
 * prikaz (O6): nijedna funkcija ovde ne dodeljuje XP, kredite ni nagrade, a jedini upis
 * je dnevnik viđenog (`igraSeen`), plus izbor banera profila (`users.igraBanner`, K13).
 * Čitanja su u `igraCore`.
 *
 * Mesto na nedeljnoj listi (`weekRank`) je ograničeno čitanje, tačno do 100 redova ispred;
 * ceo red rang-liste i mesto dalje od toga daje postojeći `leaderboard.getViewerLeaderboardRow`.
 */

/** Najviše ključeva u jednom pozivu `markSeen` (24 bedža + nivo + kursevi + zbir). */
const MARK_SEEN_MAX = 40;
/** Zbir prvog kontakta („Tvoj napredak do sada") se upisuje uz stavke koje pokriva. */
const SUMMARY_KEY = "summary";

/** Napredak prijavljenog korisnika za ljusku i primitive. Gost dobija `null`. */
export const getMyProgress = query({
  // Upit ne čita sat: današnji beogradski dan šalje klijent (kao `creaGame.myGame`).
  args: { todayKey: v.string() },
  handler: async (ctx, args) => {
    if (!isDayKey(args.todayKey)) throw new Error("NEISPRAVAN_DAN");
    const userId = await currentUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get("users", userId);
    if (!user) return null;
    return progressFor(ctx, user, args.todayKey);
  },
});

/** Napredak člana na njegovom profilu: samo ono što je i danas javno. */
export const getMemberProgress = query({
  // `todayKey` (beogradski dan) šalje klijent, kao i za `getMyProgress`: upit ne čita sat.
  args: { username: v.string(), todayKey: v.string() },
  handler: async (ctx, args) => {
    if (!isDayKey(args.todayKey)) throw new Error("NEISPRAVAN_DAN");
    return memberProgressFor(ctx, args.username, await requireUserId(ctx), args.todayKey);
  },
});

/**
 * Izbor banera na sopstvenom profilu (K13). Baner mora biti u katalogu
 * (`lib/igra-banners.ts`) i otključan nivoom koji server sam izračuna iz XP-a, pa klijent
 * ne može da izabere zaključan baner. Samo izgled: ništa se ne dodeljuje.
 */
export const setBanner = mutation({
  args: { banner: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!isIgraBannerKey(args.banner)) throw new Error("NEPOZNAT_BANER");
    if (!isBannerUnlocked(args.banner, await levelOf(ctx, userId))) throw new Error("BANER_ZAKLJUCAN");
    await ctx.db.patch("users", userId, { igraBanner: args.banner });
    return null;
  },
});

/**
 * Upis u dnevnik posle slavlja. Server ponovo računa napredak i upisuje samo ključeve
 * koji su STVARNO zarađeni i još nisu viđeni, pa klijent ne može sam sebi da otključa
 * bedž ni nivo. Ponovljen poziv ne upisuje ništa.
 */
export const markSeen = mutation({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get("users", userId);
    if (!user) throw new Error("Unauthorized");
    const now = Date.now();
    const progress = await progressFor(ctx, user, belgradeDayKey(now));
    const allowed = new Set([...freshSeenKeys(progress.fresh), SUMMARY_KEY]);

    for (const key of new Set(args.keys.slice(0, MARK_SEEN_MAX))) {
      if (!allowed.has(key)) continue;
      const existing = await ctx.db
        .query("igraSeen")
        .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
        .unique();
      if (!existing) await ctx.db.insert("igraSeen", { userId, key, seenAt: now });
    }
    return null;
  },
});
