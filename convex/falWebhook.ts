import { v } from "convex/values";

import { internal } from "./_generated/api";
import { httpAction, internalMutation } from "./_generated/server";
import {
  base64UrlToBytes,
  bytesToHex,
  buildSignedMessage,
  extractErrorMessage,
  extractJwkPublicKeys,
  extractOutputUrl,
  FAL_JWKS_URL,
  hexToBytes,
  isTimestampFresh,
  JWKS_CACHE_TTL_MS,
  parseWebhookBody,
  readWebhookHeaders,
} from "./falWebhookCore";
import { readReportedSeconds } from "./studioSettlementCore";

const ED25519 = { name: "Ed25519" } as const;

/**
 * JWKS se kešira NAJVIŠE 24h (STUDIO-PLAN 4.3). Keš je po izolatu, dakle
 * best-effort - Convex sme da podigne nov izolat kad hoće, i tada se JWKS
 * povlači ponovo. To je tačno ono što keš i treba da bude: ušteda, ne stanje.
 */
let jwksCache: { keys: CryptoKey[]; fetchedAt: number } | null = null;

async function importEd25519Keys(encoded: string[]): Promise<CryptoKey[]> {
  const keys: CryptoKey[] = [];
  for (const x of encoded) {
    const raw = base64UrlToBytes(x);
    if (!raw) continue;
    try {
      keys.push(await crypto.subtle.importKey("raw", raw, ED25519, false, ["verify"]));
    } catch {
      // Ključ koji nije Ed25519 se preskače - set sme da sadrži i druge tipove.
    }
  }

  return keys;
}

/** Baca kad JWKS ne može da se dohvati; pozivalac to pretvara u 500 da fal ponovi. */
async function loadJwksKeys(): Promise<CryptoKey[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) return jwksCache.keys;

  const response = await fetch(FAL_JWKS_URL);
  if (!response.ok) throw new Error(`JWKS dohvat nije uspeo (${response.status})`);

  const keys = await importEd25519Keys(extractJwkPublicKeys(await response.json()));
  if (keys.length === 0) throw new Error("JWKS ne sadrži nijedan upotrebljiv Ed25519 ključ.");

  jwksCache = { keys, fetchedAt: Date.now() };

  return keys;
}

async function verifyWithAnyKey(
  keys: CryptoKey[],
  signature: Uint8Array<ArrayBuffer>,
  message: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  for (const key of keys) {
    if (await crypto.subtle.verify(ED25519, key, signature, message)) return true;
  }

  return false;
}

/**
 * fal webhook (STUDIO-PLAN 4.2 korak 3 i 4.3). Ovo NIJE HMAC kao Stripe, nego
 * Ed25519 potpis nad JWKS-om sa `rest.fal.ai`.
 *
 * Handler mora da bude BRZ: fal daje 15 s na prvi pokušaj i do 31 pokušaj.
 * Zato se ovde samo verifikuje i upisuje, a skidanje fajla ide u zakazanu
 * akciju (`persistOutput`).
 */
export const handleFalWebhook = httpAction(async (ctx, request) => {
  // SIROVI bajtovi PRE bilo kakvog `.json()`: potpisan je hash bajtova koje je
  // fal poslao, a ne našeg re-serijalizovanog JSON-a.
  const raw = await request.arrayBuffer();

  const headers = readWebhookHeaders(request.headers);
  if (!headers) return new Response("Nedostaje X-Fal-Webhook-* header.", { status: 401 });
  if (!isTimestampFresh(headers.timestamp, Date.now())) {
    return new Response("Timestamp je van tolerancije.", { status: 401 });
  }

  const signature = hexToBytes(headers.signature);
  if (!signature) return new Response("Potpis nije heksadecimalan.", { status: 401 });

  const bodyHashHex = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", raw)));
  const message = new TextEncoder().encode(buildSignedMessage(headers, bodyHashHex));

  let keys: CryptoKey[];
  try {
    keys = await loadJwksKeys();
  } catch (error) {
    // 500, ne 401: ne znamo da li je potpis loš, samo da ne možemo da proverimo.
    // fal ponavlja, a keš se do tada verovatno oporavi.
    console.error("fal webhook: JWKS nedostupan", error);

    return new Response("JWKS trenutno nedostupan.", { status: 500 });
  }

  if (!(await verifyWithAnyKey(keys, signature, message))) {
    return new Response("Potpis nije validan.", { status: 401 });
  }

  const body = parseWebhookBody(new TextDecoder().decode(raw));
  // Potpis je validan, dakle telo JESTE od fal-a - ali ako ga ne razumemo, ne
  // smemo da nagadjamo ishod. 200 da fal prestane da ponavlja; posao ostaje
  // `running` i pokupiće ga stuck job reaper (STUDIO-PLAN 4.4).
  if (!body || (body.status !== "OK" && body.status !== "ERROR")) {
    console.error("fal webhook: nepoznat oblik tela", headers.requestId, body?.status);

    return new Response(null, { status: 200 });
  }

  // Trajanje obrađenog snimka, kad ga fal uz izlaz javi (X2, nalaz N2): po
  // njemu se posao poravnava odmah, umesto da čeka noćnu rekonsilijaciju.
  const reportedSeconds = body.status === "OK" ? readReportedSeconds(body.payload) : null;

  await ctx.runMutation(internal.falWebhook.applyWebhookResult, {
    falRequestId: headers.requestId,
    status: body.status,
    outputUrl: body.status === "OK" ? (extractOutputUrl(body.payload) ?? undefined) : undefined,
    error: body.status === "ERROR" ? extractErrorMessage(body) : undefined,
    ...(reportedSeconds !== null ? { reportedSeconds } : {}),
  });

  return new Response(null, { status: 200 });
});

/**
 * Jedini upis koji webhook radi. Interna je namerno: poziva je samo
 * `handleFalWebhook`, posle verifikacije potpisa.
 *
 * Idempotencija stoji na `job.status !== "running"`. fal ponavlja isti webhook
 * do 31 put, a prvi poziv posao izvede iz `running` (u `done` ili `refunded`),
 * pa svaki sledeći izadje odmah. Refund je i sam idempotentan preko
 * `by_job_type` indeksa u `credits.refundCredits` - dva sloja, jer je ovo
 * jedino mesto gde bi se kredit mogao vratiti dvaput.
 */
export const applyWebhookResult = internalMutation({
  args: {
    falRequestId: v.string(),
    status: v.union(v.literal("OK"), v.literal("ERROR")),
    outputUrl: v.optional(v.string()),
    error: v.optional(v.string()),
    // Trajanje izlaza koje je fal prijavio (X2) - ulaz u poravnanje.
    reportedSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("generationJobs")
      .withIndex("by_fal_request", (q) => q.eq("falRequestId", args.falRequestId))
      .unique();
    // Nije naš posao (tudji nalog, obrisan posao) - 200 bez buke.
    if (!job) return null;
    if (job.status !== "running") return null;

    if (args.status === "ERROR") {
      // `studio.failJob` već radi ceo neuspeh: failed -> refund -> refunded.
      await ctx.runMutation(internal.studio.failJob, {
        jobId: job._id,
        error: args.error ?? "fal je vratio grešku bez opisa.",
      });

      return null;
    }

    await ctx.db.patch(job._id, {
      status: "done",
      falOutputUrl: args.outputUrl,
      completedAt: Date.now(),
    });
    // Skidanje fajla NE ide ovde - handler mora da vrati 200 u roku od 15 s.
    await ctx.scheduler.runAfter(0, internal.studioActions.persistOutput, { jobId: job._id });
    // Isto važi i za poravnanje (X2): naplata razlike je zaseban posao od
    // isporuke, pa se zakazuje umesto da drži handler.
    await ctx.scheduler.runAfter(0, internal.studio.settleJobCredits, {
      jobId: job._id,
      ...(args.reportedSeconds !== undefined ? { reportedSeconds: args.reportedSeconds } : {}),
    });

    return null;
  },
});
