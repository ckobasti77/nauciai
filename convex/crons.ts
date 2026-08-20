import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";
import { env, internalAction, internalMutation } from "./_generated/server";
import { applyLotExpiry } from "./credits";
import {
  dayKey,
  decideGlobalCostAction,
  GLOBAL_DAILY_ALARM_USD,
  GLOBAL_DAILY_KILL_USD,
  type GlobalCostAction,
  STUDIO_FLAG_KEY,
} from "./studioCore";
import { parseAdminEmails } from "../lib/admin-emails";

/**
 * Poruka koju zaglavljen posao dobija u `error`. Namerno je drugačija od svake
 * fal greške: kad se u podršci vidi ovaj kod, zna se da odgovor nikad nije
 * stigao, a ne da je model odbio posao.
 */
export const STUCK_JOB_ERROR = "ISTEKAO_BEZ_ODGOVORA";

/**
 * `running` čeka fal webhook; 30 minuta je daleko iznad najsporijeg modela iz
 * kataloga. `reserved` čeka samo `submitJob`, zakazan na 0 ms - posle 5 minuta
 * u tom stanju akcija sigurno nije odradila do kraja.
 */
const STUCK_AFTER_MS = { running: 30 * 60 * 1000, reserved: 5 * 60 * 1000 } as const;

/**
 * Gornja granica upisa po prolazu. Prolaz je jedna transakcija, pa bez granice
 * jedan veliki zaostatak obara i sam sebe i svaki naredni prolaz; ovako se
 * zaostatak drenira na svakih 15 minuta po 100 poslova.
 */
const REAP_BATCH_LIMIT = 100;

/** Isto obrazloženje, za dnevne prolaze. */
const EXPIRY_BATCH_LIMIT = 100;

/**
 * Posao koji je ostao u `running` znači skinute kredite bez rezultata **i**
 * trajno zauzeto jedno od 3 mesta u limitu paralelnih poslova - tri takva i
 * Studio tom korisniku više nikad ne radi. `failJob` radi ceo niz
 * failed -> refund -> refunded i idempotentan je, pa drugi prolaz zatiče posao
 * u `refunded` i ne vidi ga kroz `by_status_created`.
 */
export const reapStuckJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let budget = REAP_BATCH_LIMIT;
    let reaped = 0;

    for (const status of ["running", "reserved"] as const) {
      if (budget === 0) break;

      const stale = await ctx.db
        .query("generationJobs")
        .withIndex("by_status_created", (q) =>
          q.eq("status", status).lt("createdAt", now - STUCK_AFTER_MS[status]),
        )
        .take(budget);
      budget -= stale.length;

      for (const job of stale) {
        // Ugnježdena mutacija je podtransakcija: ako refund jednog posla pukne,
        // njegovi upisi se povuku sami, a ostali poslovi iz prolaza prolaze.
        // Bez ovoga bi jedan pokvaren red zauvek obarao ceo reaper - a reaper
        // koji ne radi je tačno stanje zbog kojeg postoji.
        try {
          await ctx.runMutation(internal.studio.failJob, {
            jobId: job._id,
            error: STUCK_JOB_ERROR,
          });
          reaped += 1;
        } catch (error) {
          console.error(`reapStuckJobs: posao ${job._id} nije refundiran`, error);
        }
      }
    }

    return { reaped };
  },
});

/**
 * Krediti ističu 12 meseci od dodele (STUDIO-PLAN D.2). `planSpend` istekle
 * lotove već preskače, ali ih niko ne gasi, pa keširan balans posle godinu dana
 * pokazuje broj veći od stvarno potrošivog. Ovaj prolaz je jedini koji taj
 * broj vraća u istinu.
 *
 * `by_expiry` nema `remaining` u sebi, pa se već ugašeni lotovi odbacuju
 * `filter`-om pre `take`-a - inače bi posle prve godine prolaz trošio ceo
 * budžet na lotove koji su odavno na nuli.
 */
export const expireCredits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("creditLots")
      .withIndex("by_expiry", (q) => q.lte("expiresAt", now))
      .filter((q) => q.gt(q.field("remaining"), 0))
      .take(EXPIRY_BATCH_LIMIT);

    for (const lot of expired) {
      await applyLotExpiry(ctx, lot, now);
    }

    return { expired: expired.length };
  },
});

/**
 * Tiered retencija iz STUDIO-PLAN 0.2: fajl se briše iz storage-a, **red
 * ostaje**. Metapodatak (prompt, model, cena) živi zauvek da bi galerija mogla
 * da ponudi "Generiši ponovo" - istek fajla je tako prihod, a ne gubitak.
 *
 * `expiresAt` popunjava `persistOutput`, i to samo poslovima koji su stvarno
 * dobili fajl. Donja granica `> 0` je zato obavezna: poslovi bez `expiresAt`
 * stoje u indeksu ispod svakog broja, pa bi ih čist `lte(now)` sve pokupio.
 */
export const expireGenerationFiles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("generationJobs")
      .withIndex("by_expiry", (q) => q.gt("expiresAt", 0).lte("expiresAt", now))
      .filter((q) => q.neq(q.field("outputStorageId"), undefined))
      .take(EXPIRY_BATCH_LIMIT);

    for (const job of expired) {
      if (job.outputStorageId) await ctx.storage.delete(job.outputStorageId);
      // Poster ide zajedno sa fajlom: polje se ionako prazni, pa bi blob bez
      // ijedne reference u bazi ostao zauvek naplativ.
      if (job.posterStorageId) await ctx.storage.delete(job.posterStorageId);
      await ctx.db.patch(job._id, { outputStorageId: undefined, posterStorageId: undefined });
    }

    return { cleared: expired.length };
  },
});

const crons = cronJobs();

crons.interval("studio: zaglavljeni poslovi", { minutes: 15 }, internal.crons.reapStuckJobs, {});
// Google nema webhookove za video (STUDIO-CATALOG-V4 3.7), pa je ovo jedini put
// kojim gotov Veo Fast ili Gemini Omni posao stiže do korisnika. Minut je Convex
// minimum. `reapStuckJobs` iznad ostaje mreža ispod pollera i ne sme da se gasi:
// posao koji poller iz bilo kog razloga promaši refundira se posle 30 minuta.
crons.interval(
  "studio: google poller",
  { minutes: 1 },
  internal.providers.google.pollGoogleVideoJobs,
  {},
);
crons.cron("studio: istek kredita", "15 3 * * *", internal.crons.expireCredits, {});
crons.cron("studio: istek fajlova", "45 3 * * *", internal.crons.expireGenerationFiles, {});

export default crons;
