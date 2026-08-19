import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { getCurrentProfile, requireAdmin } from "./helpers";
import { dayKey, dayStart, STUDIO_FLAG_KEY } from "./studioCore";

/**
 * `requireAdmin` (helpers.ts) bootstrapuje profil preko `db.patch` i zato
 * baca "Profile bootstrap requires a write-capable Convex context" unutar
 * query-ja - isti obrazac kao `contentHierarchy.getAdminHierarchy` rešava
 * ovde: čita ulogu preko `getCurrentProfile`, bez upisa.
 */
async function requireAdminRead(ctx: Parameters<typeof getCurrentProfile>[0]) {
  const { profile } = await getCurrentProfile(ctx);
  if (profile.role !== "admin") throw new Error("Forbidden");
}

const STATUSES = ["reserved", "running", "done", "failed", "refunded"] as const;

// Potrošnja se agregira "po danu" (P8.md) - obična kolekcija je dovoljna dok
// je tabela ovako mala, bez uvođenja `@convex-dev/aggregate` za ovaj obim.
// Kapovi ispod postoje da čitanje ostane ograničeno čak i ako platforma
// naraste pre nego što se doda pravi agregacioni sloj (Faza D).
const MAX_USAGE_ROWS = 500;
const MAX_JOBS_PER_STATUS = 2000;
const TOP_USERS = 10;

/**
 * Kartica "Potrošnja" (P8, treći deo admin ekrana). `now` stiže sa klijenta
 * (zamrznut `Date.now()`, isti obrazac kao `credits-page.tsx`/`studio-gallery-page.tsx`)
 * jer query nikad ne sme sam da čita sat.
 *
 * Trošak i top korisnici dolaze iz `studioUsageDaily` (jedan red po
 * korisniku po danu). Broj poslova po statusu dolazi iz `generationJobs`,
 * ograničen na poslove napravljene istog UTC dana preko `by_status_created`
 * - to je jedini indeks koji to čitanje čini ograničenim bez punog scan-a.
 */
export const getUsageSummary = query({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    await requireAdminRead(ctx);
    const day = dayKey(args.now);
    const since = dayStart(args.now);

    const usageRows = await ctx.db
      .query("studioUsageDaily")
      .withIndex("by_day", (q) => q.eq("day", day))
      .take(MAX_USAGE_ROWS);

    const totalCostUsd = usageRows.reduce((sum, row) => sum + row.costUsd, 0);
    const topRows = [...usageRows].sort((a, b) => b.costUsd - a.costUsd).slice(0, TOP_USERS);
    const topUsers = await Promise.all(
      topRows.map(async (row) => {
        const user = await ctx.db.get(row.userId);
        return {
          userId: row.userId,
          name: user?.name ?? user?.email ?? row.userId,
          costUsd: row.costUsd,
          creditsSpent: row.creditsSpent,
          generations: row.generations,
        };
      }),
    );

    const jobCounts: Record<(typeof STATUSES)[number], number> = {
      reserved: 0,
      running: 0,
      done: 0,
      failed: 0,
      refunded: 0,
    };
    let jobCountsCapped = false;
    for (const status of STATUSES) {
      const rows = await ctx.db
        .query("generationJobs")
        .withIndex("by_status_created", (q) => q.eq("status", status).gte("createdAt", since))
        .take(MAX_JOBS_PER_STATUS + 1);
      if (rows.length > MAX_JOBS_PER_STATUS) jobCountsCapped = true;
      jobCounts[status] = Math.min(rows.length, MAX_JOBS_PER_STATUS);
    }

    return {
      day,
      totalCostUsd,
      topUsers,
      jobCounts,
      usageRowsCapped: usageRows.length >= MAX_USAGE_ROWS,
      jobCountsCapped,
    };
  },
});

/** Trenutno stanje kill switch-a za admin ekran; isto čitanje kao `studio.getStudioState`. */
export const getKillSwitchState = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminRead(ctx);
    const flag = await ctx.db
      .query("platformFlags")
      .withIndex("by_key", (q) => q.eq("key", STUDIO_FLAG_KEY))
      .unique();
    return { enabled: flag ? flag.enabled : true };
  },
});

/**
 * Kill switch iz STUDIO-PLAN 4.4. Rules-day traži potvrdu PRE gašenja - ta
 * potvrda je u UI-ju (P8), ova mutacija samo upisuje ono što je admin već
 * potvrdio.
 */
export const setStudioEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const flag = await ctx.db
      .query("platformFlags")
      .withIndex("by_key", (q) => q.eq("key", STUDIO_FLAG_KEY))
      .unique();
    if (flag) {
      await ctx.db.patch(flag._id, { enabled: args.enabled });
    } else {
      await ctx.db.insert("platformFlags", { key: STUDIO_FLAG_KEY, enabled: args.enabled });
    }
    return null;
  },
});
