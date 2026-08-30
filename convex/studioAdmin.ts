import { v } from "convex/values";

import { internalMutation, mutation, type MutationCtx, query } from "./_generated/server";
import { getCurrentProfile, requireAdmin } from "./helpers";
import { STUCK_JOB_ERROR } from "./crons";
import { parseReasonCounts } from "./studioActualCostCore";
import {
  dayKey,
  dayStart,
  GLOBAL_COST_HEARTBEAT_KEY,
  GLOBAL_DAILY_ALARM_USD,
  GLOBAL_DAILY_KILL_USD,
  PUBLIC_LIMIT_DEFAULTS,
  STUDIO_FLAG_KEY,
  STUDIO_PUBLIC_CONFIG_KEYS,
  STUDIO_PUBLIC_FLAG_KEY,
} from "./studioCore";

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
    // Koliko je poslova danas pokupio reaper. To nije isto što i "refundirano":
    // refund je i model koji je odbio posao, a ovo je odgovor koji NIKAD nije
    // stigao - jedini broj koji kaže da li nešto visi kod provajdera.
    let reapedToday = 0;
    for (const status of STATUSES) {
      const rows = await ctx.db
        .query("generationJobs")
        .withIndex("by_status_created", (q) => q.eq("status", status).gte("createdAt", since))
        .take(MAX_JOBS_PER_STATUS + 1);
      if (rows.length > MAX_JOBS_PER_STATUS) jobCountsCapped = true;
      jobCounts[status] = Math.min(rows.length, MAX_JOBS_PER_STATUS);
      if (status === "refunded") {
        reapedToday = rows.filter((job) => job.error === STUCK_JOB_ERROR).length;
      }
    }

    // Heartbeat i "cron_failed" (X6, nalaz N5): kad crona nema uopšte
    // (deployment koji nikad nije startovao), oba su odsutna - `lastRunAt: null`
    // je isto tako crveno na ekranu kao heartbeat stariji od sat vremena.
    const heartbeat = await ctx.db
      .query("studioCronHeartbeats")
      .withIndex("by_key", (q) => q.eq("key", GLOBAL_COST_HEARTBEAT_KEY))
      .unique();
    const failureRows = await ctx.db
      .query("studioCostAlarms")
      .withIndex("by_day", (q) => q.eq("day", day))
      .collect();
    const cronFailure = failureRows.find((row) => row.type === "cron_failed") ?? null;

    return {
      day,
      totalCostUsd,
      topUsers,
      jobCounts,
      reapedToday,
      // Pragovi dolaze sa servera, iz iste konstante po kojoj cron gasi Studio -
      // admin ekran ne sme da crta drugu liniju od one na kojoj se stvarno gasi.
      alarmUsd: GLOBAL_DAILY_ALARM_USD,
      killUsd: GLOBAL_DAILY_KILL_USD,
      usageRowsCapped: usageRows.length >= MAX_USAGE_ROWS,
      jobCountsCapped,
      costCapHeartbeatAt: heartbeat?.lastRunAt ?? null,
      costCapCronFailure: cronFailure ? { message: cronFailure.message ?? "" } : null,
    };
  },
});

/**
 * Katalog ima ~30 v4 redova plus stare `modelCatalog` slugove; kap je iznad
 * oba, iz istog razloga iz kojeg kapiraju i ostala čitanja ovog ekrana.
 */
const MAX_MODEL_COST_ROWS = 200;

/**
 * STVARNA marža po modelu (W6). Do sada je admin ekran umeo da pokaže samo
 * maržu iz kataloga - dakle prepričanu pretpostavku. Ovde izlazi ono što je
 * provajder zaista naplatio, ZAJEDNO sa brojem poslova iz kojih je izračunato:
 * model bez ijednog merenja mora da se razlikuje od modela sa sto merenja,
 * inače admin veruje broju koji nije merenje.
 *
 * Zbir održava `studioActualCost.recordJobActualCost` u istoj transakciji u
 * kojoj posao dobija cenu, pa se ovde ništa ne sabira nad poslovima.
 *
 * Uz zbir izlaze i RAZLOZI (X3, nalaz N6): koliko poslova ovog modela je ostalo
 * bez izmerenog troška i zašto. Bez toga je kolona "Stvarna marža" pisala "nema
 * merenja" i za model koji se po dizajnu ne meri po tokenima i za model kojem
 * nešto ne radi - a to su dva potpuno različita posla za Jovana. Brojače
 * održava `studioActualCost.recordActualCostReason`, pa se ni ovde ništa ne
 * prebrojava nad poslovima.
 */
export const getModelCostSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminRead(ctx);
    const rows = await ctx.db.query("studioModelCost").take(MAX_MODEL_COST_ROWS);

    return rows.map((row) => {
      const counts = parseReasonCounts(row.reasonCounts);

      return {
        modelSlug: row.modelSlug,
        measuredJobs: row.measuredJobs,
        actualCostUsd: row.actualCostUsd,
        estimatedCostUsd: row.estimatedCostUsd,
        creditCost: row.creditCost,
        deviationStreak: row.deviationStreak,
        // Najbrojniji razlog je prvi - to je onaj koji za taj model treba rešiti.
        reasons: Object.entries(counts)
          .map(([reason, jobs]) => ({ reason, jobs }))
          .sort((a, b) => b.jobs - a.jobs),
        unmeasuredJobs: Object.values(counts).reduce((sum, jobs) => sum + jobs, 0),
      };
    });
  },
});

/**
 * Sirov odgovor provajdera koji nismo umeli da pročitamo (X3, tačka 4). Jedan
 * red po provajderu i modelu; postoji da bi se oblik posle prve prave
 * generacije čitao, a ne nagađao.
 */
export const getProviderSamples = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminRead(ctx);
    const rows = await ctx.db.query("studioProviderSamples").take(MAX_MODEL_COST_ROWS);

    return rows
      .map((row) => ({
        provider: row.provider,
        modelSlug: row.modelSlug,
        sample: row.sample,
        updatedAt: row.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
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

// ── JAVNI STUDIO: fleg + limiti (studio-public F1) ─────────────────────────

async function upsertPlatformFlag(
  ctx: MutationCtx,
  key: string,
  fields: { enabled: boolean; value?: number },
) {
  const row = await ctx.db
    .query("platformFlags")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (row) {
    await ctx.db.patch(row._id, fields);
  } else {
    await ctx.db.insert("platformFlags", { key, ...fields });
  }
}

/**
 * Prekidač kojim Jovan RUČNO otvara Studio javnosti (brif F1: default OFF,
 * produkcija se ne menja dok se ovo ne pozove). `internalMutation` namerno -
 * nema UI-ja za lansiranje proizvoda; poziva se sa
 * `npx convex run studioAdmin:setStudioPublicFlag '{"enabled":true}' --prod`.
 * Gašenje istom komandom sa `false` momentalno vraća današnje ponašanje
 * (osoblje + uspavana formula upisa).
 */
export const setStudioPublicFlag = internalMutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    await upsertPlatformFlag(ctx, STUDIO_PUBLIC_FLAG_KEY, { enabled: args.enabled });
    return null;
  },
});

/**
 * Numerički limiti javnog Studija, u istoj tabeli kao fleg (brif F2.4).
 * `key` je ime polja iz `STUDIO_PUBLIC_CONFIG_KEYS` (npr. "maxJobsPerMinute"),
 * ne sirovi ključ reda - allowlist je time ugrađen u validator poziva.
 * `enabled: false` vraća taj limit na podrazumevanu vrednost bez brisanja reda.
 */
export const setStudioPublicLimit = internalMutation({
  args: {
    key: v.union(
      v.literal("maxConcurrentJobs"),
      v.literal("maxJobsPerMinute"),
      v.literal("maxJobsPerDay"),
      v.literal("maxDailyCredits"),
    ),
    value: v.number(),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.value) || args.value <= 0) {
      throw new Error("NEVALIDAN_LIMIT");
    }
    await upsertPlatformFlag(ctx, STUDIO_PUBLIC_CONFIG_KEYS[args.key], {
      enabled: args.enabled ?? true,
      value: args.value,
    });
    return null;
  },
});

/**
 * Odbijeni promptovi (studio-public F2.5) - obrasci, ne sadržaj: hash + dužina
 * + kategorija. Isti hash iznova = neko sondira blok listu. Admin vidi i ID
 * korisnika (isti nivo kao `getUsageSummary` koji vraća email); prompt tekst
 * ne postoji nigde, ni za admina.
 */
export const listModerationEvents = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminRead(ctx);
    const rows = await ctx.db.query("studioModerationLog").order("desc").take(200);
    return rows.map((row) => ({
      userId: row.userId,
      category: row.category,
      promptHash: row.promptHash,
      promptLength: row.promptLength,
      modelSlug: row.modelSlug,
      createdAt: row.createdAt,
    }));
  },
});

/**
 * Propušteni promptovi (nalaz V8) - otisci, ne sadržaj: hash + dužina + model.
 * Odvojeno od `listModerationEvents` da propušteni (mnogo brojniji) ne zatrpaju
 * odbijene. Trag je tu da bypass keyword-filtera ne bude nem: isti hash koji se
 * i u `studioModerationLog` pojavljuje kao ODBIJEN znači da je neko istu ideju
 * provukao varijantom. Prompt tekst ne postoji nigde, ni za admina.
 */
export const listPromptLog = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminRead(ctx);
    const rows = await ctx.db.query("studioPromptLog").order("desc").take(200);
    return rows.map((row) => ({
      userId: row.userId,
      promptHash: row.promptHash,
      promptLength: row.promptLength,
      modelSlug: row.modelSlug,
      createdAt: row.createdAt,
    }));
  },
});

/** Trenutno stanje javnog flega i limita za admin uvid; čitanje kao `getKillSwitchState`. */
export const getStudioPublicConfig = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminRead(ctx);
    const flag = await ctx.db
      .query("platformFlags")
      .withIndex("by_key", (q) => q.eq("key", STUDIO_PUBLIC_FLAG_KEY))
      .unique();
    const limits: Record<string, { value: number | null; default: number }> = {};
    for (const prop of Object.keys(STUDIO_PUBLIC_CONFIG_KEYS) as Array<
      keyof typeof STUDIO_PUBLIC_CONFIG_KEYS
    >) {
      const row = await ctx.db
        .query("platformFlags")
        .withIndex("by_key", (q) => q.eq("key", STUDIO_PUBLIC_CONFIG_KEYS[prop]))
        .unique();
      limits[prop] = {
        value: row?.enabled && typeof row.value === "number" ? row.value : null,
        default: PUBLIC_LIMIT_DEFAULTS[prop],
      };
    }
    // Odsutan red = OFF - suprotno od kill switch-a, vidi STUDIO_PUBLIC_FLAG_KEY.
    return { publicEnabled: flag?.enabled === true, limits };
  },
});
