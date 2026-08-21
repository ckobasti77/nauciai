import { cronJobs } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { env, internalAction, internalMutation } from "./_generated/server";
import { applyLotExpiry } from "./credits";
import {
  dayKey,
  decideGlobalCostAction,
  GLOBAL_COST_HEARTBEAT_KEY,
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
 *
 * Isti prolaz čisti i ULAZNE uploade preko `studioUploads.expiresAt`, iz dva
 * razloga koja dele jedan indeks (`by_expiry`) i istu posledicu (blob I red se
 * brišu zajedno):
 *
 * 1. nalaz R4 - upload koji niko nije upotrebio nosi 24h rok od okačivanja;
 * 2. nalaz N7 - upload koji JESTE ušao u posao dobija rok kad taj posao
 *    završi (`studio.finalizeOutput` ga postavlja na isti trenutak kad i
 *    izlaz, produžujući ga ako je fajl deljen sa drugim, još otvorenim
 *    poslom). Do N7 je `createJob` taj rok trajno sklanjao, pa je ulaz živeo
 *    zauvek i posle isteka svog izlaza.
 *
 * I dozvole za upload (`studioUploadGrants`, X5) idu odavde: one nemaju fajl,
 * samo red, i posle sat vremena ne vrede ništa - ni potrošene ni nepotrošene.
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

    const orphans = await ctx.db
      .query("studioUploads")
      .withIndex("by_expiry", (q) => q.gt("expiresAt", 0).lte("expiresAt", now))
      .take(EXPIRY_BATCH_LIMIT);

    for (const upload of orphans) {
      await ctx.storage.delete(upload.storageId);
      await ctx.db.delete(upload._id);
    }

    // Dozvole za upload (X5, nalaz N3). Jedan prolaz pokriva i istekle i
    // iskorišćene: potrošena dozvola nosi isti `expiresAt` kao i neiskorišćena,
    // pa nestaje najkasnije sat vremena posle uploada. Fajla ovde nema - grant
    // je samo red.
    const grants = await ctx.db
      .query("studioUploadGrants")
      .withIndex("by_expiry", (q) => q.lte("expiresAt", now))
      .take(EXPIRY_BATCH_LIMIT);

    for (const grant of grants) {
      await ctx.db.delete(grant._id);
    }

    return { cleared: expired.length, uploads: orphans.length, grants: grants.length };
  },
});

/**
 * Globalni dnevni plafon troška (STUDIO-PLAN 4.4, nalaz R1). Ovo je jedina
 * transakcija u lancu: čita današnji zbir, pita `decideGlobalCostAction` i
 * **odmah upisuje posledicu**. Mejl šalje akcija iznad, posle commit-a - kad bi
 * upis čekao da mejl prođe, pokvaren Resend ključ bi značio da se Studio nikad
 * ne ugasi, a to je tačno ono zbog čega ovaj plafon postoji.
 *
 * Zbir ide preko `by_day` bez `take`-a: `studioUsageDaily` je jedan red po
 * korisniku po danu, a odsečen zbir bi bio **manji od stvarnog**, dakle plafon
 * koji tiho ne opali. Convex-ov limit čitanja po transakciji (16 384 reda) je
 * gornja granica; preko toga prolaz pukne glasno, što je bolje od nule na
 * zbiru. `studioAdmin.getUsageSummary` sme da kapira jer crta ekran, ne gasi.
 *
 * `costUsd` upisuje `createJob` u trenutku REZERVACIJE i refund ga ne vraća,
 * pa je ovaj zbir gornja procena stvarnog računa. To je namerno u ovu stranu:
 * plafon radije opali ranije nego posle poslatog novca.
 */
export const applyGlobalCostAction = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const day = dayKey(now);

    const usage = await ctx.db
      .query("studioUsageDaily")
      .withIndex("by_day", (q) => q.eq("day", day))
      .collect();
    const totalCostUsd = usage.reduce((sum, row) => sum + row.costUsd, 0);

    const flag = await ctx.db
      .query("platformFlags")
      .withIndex("by_key", (q) => q.eq("key", STUDIO_FLAG_KEY))
      .unique();
    // Ceo dan se čita, ne `first`: uz alarm (N5) sada može da stoji i
    // `cron_failed` red istog dana, pa se tip proverava u JS-u umesto da se
    // uvodi drugi indeks za najviše dva reda po danu.
    const alarmRows = await ctx.db
      .query("studioCostAlarms")
      .withIndex("by_day", (q) => q.eq("day", day))
      .collect();
    // Izostavljen `type` je zatečen red iz vremena pre N5 - čita se kao alarm,
    // ne kao treće, nepoznato stanje.
    const alarmSentToday = alarmRows.some((row) => (row.type ?? "alarm") === "alarm");

    const action = decideGlobalCostAction(totalCostUsd, {
      alarmSentToday,
      // Red koji ne postoji znači "nikad nije ni gašen", isto čitanje kao
      // `studio.createJob` i `studioAdmin.getKillSwitchState`.
      studioEnabled: flag ? flag.enabled : true,
    });

    if (action === "kill") {
      if (flag) await ctx.db.patch(flag._id, { enabled: false });
      else await ctx.db.insert("platformFlags", { key: STUDIO_FLAG_KEY, enabled: false });
    } else if (action === "alarm") {
      await ctx.db.insert("studioCostAlarms", { day, type: "alarm" });
    }

    // Heartbeat (N5): osvežava se SAMO kad prolaz stigne dovde bez bacanja -
    // pukla mutacija se cela povuče, pa red ostaje na poslednjem uspehu i
    // admin ekran vidi mrtav cron i bez mejla.
    const heartbeat = await ctx.db
      .query("studioCronHeartbeats")
      .withIndex("by_key", (q) => q.eq("key", GLOBAL_COST_HEARTBEAT_KEY))
      .unique();
    if (heartbeat) await ctx.db.patch(heartbeat._id, { lastRunAt: now });
    else await ctx.db.insert("studioCronHeartbeats", { key: GLOBAL_COST_HEARTBEAT_KEY, lastRunAt: now });

    return { action, day, totalCostUsd };
  },
});

/**
 * Jedan red po danu za PUKAO prolaz (N5) - isto obrazloženje kao alarm od
 * 50 $: cron se vrti na 15 minuta, pa bez ove brave isti kvar šalje mejl
 * skoro sto puta dnevno. Vraća da li je red već postojao, da pozivalac zna da
 * li mejl treba da krene.
 */
export const recordCronFailure = internalMutation({
  args: { day: v.string(), message: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("studioCostAlarms")
      .withIndex("by_day", (q) => q.eq("day", args.day))
      .collect();
    if (rows.some((row) => row.type === "cron_failed")) return { alreadyRecorded: true };

    await ctx.db.insert("studioCostAlarms", { day: args.day, type: "cron_failed", message: args.message });
    return { alreadyRecorded: false };
  },
});

/** Admin ekran sa prekidačem (P8); bez `SITE_URL`-a ostaje gola putanja. */
function adminStudioLink() {
  const siteUrl = String(env.SITE_URL ?? "").trim().replace(/\/$/, "");
  return `${siteUrl}/sr/app/admin/studio`;
}

function alertBody(action: Exclude<GlobalCostAction, "none">, day: string, totalCostUsd: number) {
  const spent = `${totalCostUsd.toFixed(2)} $`;
  if (action === "alarm") {
    return {
      subject: `Studio: dnevni trošak ${spent} (alarm na ${GLOBAL_DAILY_ALARM_USD} $)`,
      text: [
        `Studio je na dan ${day} (UTC) potrošio ${spent} kod provajdera.`,
        `Alarm je na ${GLOBAL_DAILY_ALARM_USD} $, a na ${GLOBAL_DAILY_KILL_USD} $ se Studio gasi sam.`,
        "Ovaj mejl stiže najviše jednom dnevno, iako se provera vrti na 15 minuta.",
        `Potrošnja: ${adminStudioLink()}`,
      ].join("\n\n"),
    };
  }
  return {
    subject: `Studio je AUTOMATSKI UGAŠEN (dnevni trošak ${spent})`,
    text: [
      `Studio je ugašen: na dan ${day} (UTC) je potrošeno ${spent}, preko plafona od ${GLOBAL_DAILY_KILL_USD} $.`,
      "Nove generacije od sada odbija `createJob` sa greškom STUDIO_PAUZIRAN. Poslovi koji su već krenuli idu do kraja.",
      `Studio se vraća ručno: ${adminStudioLink()} -> prekidač za Studio.`,
      "Dok traje isti UTC dan zbir se ne resetuje, pa se ručno upaljen Studio posle najviše 15 minuta gasi ponovo.",
    ].join("\n\n"),
  };
}

/**
 * Poruka za PUKAO prolaz (N5), sa istim linkom i istom "najviše jednom
 * dnevno" napomenom kao `alertBody` - razlika je što ovde nema iznosa, nego
 * tačna poruka greške, jer je to jedini trag kad ni Resend ne uspe.
 */
function cronFailureBody(day: string, message: string) {
  return {
    subject: `Studio: plafon troška NIJE proveren (${day})`,
    text: [
      `Provera globalnog dnevnog plafona za ${day} (UTC) je pukla i nije izvršena.`,
      `Greška: ${message}`,
      "Dok se ovo ne popravi, ni alarm od 50 $ ni gašenje na 100 $ ne rade - cron se vrti, ali ne stiže do kraja.",
      "Ovaj mejl stiže najviše jednom dnevno, iako se provera vrti na 15 minuta.",
      `Potrošnja: ${adminStudioLink()}`,
    ].join("\n\n"),
  };
}

/**
 * Mejl adminima, istim putem kao `emailVerification.ts`. **Nikad ne baca**:
 * posledica u bazi je već upisana pre ovog poziva, pa greška ovde sme samo da
 * se zaloguje. Zato i sam log nosi kontekst - kad Resend ne radi, Convex log
 * je jedini trag da je plafon opalio (ili da provera nije ni uspela).
 */
async function sendAdminEmail(subject: string, text: string, logContext: Record<string, unknown>) {
  const apiKey = String(env.AUTH_RESEND_KEY ?? "").trim();
  const from = String(env.AUTH_RESEND_FROM ?? "").trim();
  const to = [...parseAdminEmails(env.INITIAL_ADMIN_EMAILS)];

  if (!apiKey || !from || to.length === 0) {
    console.error("studio_cost_alert_not_configured", {
      ...logContext,
      hasApiKey: Boolean(apiKey),
      hasFrom: Boolean(from),
      recipients: to.length,
    });
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!response.ok) {
      console.error("studio_cost_alert_provider_error", {
        ...logContext,
        status: response.status,
        providerRequestId: response.headers.get("x-request-id") ?? undefined,
      });
    }
  } catch (error) {
    console.error("studio_cost_alert_failed", logContext, error);
  }
}

async function sendGlobalCostEmail(
  action: Exclude<GlobalCostAction, "none">,
  day: string,
  totalCostUsd: number,
) {
  const { subject, text } = alertBody(action, day, totalCostUsd);
  await sendAdminEmail(subject, text, { action, day, totalCostUsd });
}

async function sendCronFailureEmail(day: string, message: string) {
  const { subject, text } = cronFailureBody(day, message);
  await sendAdminEmail(subject, text, { day, message });
}

/**
 * Peti cron (nalaz R1): dnevni limit po korisniku od 5 $ ne vidi zbir, pa je
 * ovo jedina automatska zaštita nad ukupnim računom sva tri provajdera.
 * Odluku donosi `decideGlobalCostAction` - ovde nema nijednog praga.
 *
 * Nalaz N5: `applyGlobalCostAction` ume da pukne (preko svega, npr. Convex-ov
 * limit od 16 384 reda po transakciji) i taj prolaz se do sada gubio nemo -
 * cron koji puca izgleda isto kao cron koji nema šta da radi. Sad se svaka
 * greška ovde HVATA, upisuje kao `cron_failed` red (najviše jedan dnevno) i
 * prijavljuje mejlom sa tačnom porukom - pa se PONOVO baca, da i Convex-ov
 * sopstveni dnevnik funkcija i dalje vidi neuspeh.
 */
export const enforceGlobalCostCap = internalAction({
  args: {},
  handler: async (ctx) => {
    let outcome: { action: GlobalCostAction; day: string; totalCostUsd: number };
    try {
      // Anotacija je obavezna: poziv ide na funkciju iz istog fajla, pa bi TS
      // inače pukao na kružnoj referenci (Convex guidelines, "Function calling").
      outcome = await ctx.runMutation(internal.crons.applyGlobalCostAction, {});
    } catch (error) {
      const day = dayKey(Date.now());
      const message = error instanceof Error ? error.message : String(error);
      let alreadyRecorded = false;
      try {
        const recorded = await ctx.runMutation(internal.crons.recordCronFailure, { day, message });
        alreadyRecorded = recorded.alreadyRecorded;
      } catch (recordError) {
        console.error("studio_cost_cron_failure_not_recorded", { day, message }, recordError);
      }
      if (!alreadyRecorded) await sendCronFailureEmail(day, message);

      throw error;
    }

    if (outcome.action !== "none") {
      await sendGlobalCostEmail(outcome.action, outcome.day, outcome.totalCostUsd);
    }
    return outcome;
  },
});

const crons = cronJobs();

crons.interval("studio: zaglavljeni poslovi", { minutes: 15 }, internal.crons.reapStuckJobs, {});
// 15 minuta je najgori slučaj prekoračenja: toliko zbir sme da raste preko
// plafona pre nego što se Studio ugasi. Isti period kao reaper iznad.
// Ime crona mora biti ASCII (Convex: "use ASCII letters that are not control
// characters"), zato "troska" bez kvačice - isto kao ostala četiri iznad.
crons.interval(
  "studio: globalni plafon troska",
  { minutes: 15 },
  internal.crons.enforceGlobalCostCap,
  {},
);
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
// fal u odgovoru posla nema cenu (za razliku od Google-a i BytePlus-a, koji
// vraćaju tokene), pa je ovo jedini put kojim stvarna fal cena dolazi do nas -
// `GET /v1/models/billing-events` za PRETHODNI UTC dan, spojen po
// `providerRequestId`-ju. Prethodni dan, ne tekući: događaji naplate ne stižu
// istog trenutka, a zatvoren dan se više ne menja.
crons.cron(
  "studio: fal rekonsilijacija",
  "30 4 * * *",
  internal.studioActualCost.reconcileFalCosts,
  {},
);

export default crons;
