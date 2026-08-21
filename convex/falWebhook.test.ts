/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  base64UrlToBytes,
  buildSignedMessage,
  bytesToHex,
  extractErrorMessage,
  extractJwkPublicKeys,
  extractOutputUrl,
  hexToBytes,
  isTimestampFresh,
  parseWebhookBody,
  readWebhookHeaders,
} from "./falWebhookCore";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * `ReturnType<typeof convexTest>` bi izgubilo šemu i `withIndex` bi se tipizirao
 * kao sistemski indeks; vezivanje za `schema` čuva imena indeksa u tipovima.
 */
type TestConvexWithSchema = TestConvex<typeof schema>;

const encoder = new TextEncoder();

const REQUEST_ID = "d9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b";
const FAL_USER_ID = "user-fal-123";
const JOB_COST = 20;
const GRANTED = 100;
const OUTPUT_URL = "https://fal.media/files/panda/output.png";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generateKeyPair() {
  return (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
}

async function publicKeyX(keyPair: CryptoKeyPair): Promise<string> {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey)));
}

// Ključ kojim fal "potpisuje" u ovim testovima.
const falKeys = await generateKeyPair();
// Ključ koji u JWKS-u stoji ISPRED pravog: dokazuje da prolazi bilo koji ključ
// iz seta, ne samo prvi.
const rotatedKeys = await generateKeyPair();
// Ključ koji NIJE u JWKS-u - njime se potpisuju lažni pozivi.
const foreignKeys = await generateKeyPair();

const jwksBody = JSON.stringify({
  keys: [
    { kty: "OKP", crv: "Ed25519", x: await publicKeyX(rotatedKeys) },
    // Neispravni unosi u setu ne smeju da obore verifikaciju - samo se preskaču.
    { kty: "OKP", crv: "Ed25519", x: "AAAA" },
    { kty: "RSA", n: "nema-x-polje", e: "AQAB" },
    { kty: "OKP", crv: "Ed25519", x: await publicKeyX(falKeys) },
  ],
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(jwksBody, { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type OmittableHeader = "request-id" | "user-id" | "timestamp" | "signature";

const HEADER_SUFFIX: Record<OmittableHeader, string> = {
  "request-id": "Request-Id",
  "user-id": "User-Id",
  timestamp: "Timestamp",
  signature: "Signature",
};

type SignedRequestOptions = {
  body: string;
  /** Telo koje se potpisuje, ako se razlikuje od poslatog (test izmene tela). */
  signedBody?: string;
  requestId?: string;
  userId?: string;
  timestampSeconds?: number;
  signWith?: CryptoKeyPair;
  signature?: string;
  omitHeader?: OmittableHeader;
};

/** Sklapa `RequestInit` tačno po algoritmu iz STUDIO-PLAN 4.3. */
async function signedRequest(options: SignedRequestOptions): Promise<RequestInit> {
  const requestId = options.requestId ?? REQUEST_ID;
  const userId = options.userId ?? FAL_USER_ID;
  const timestamp = String(options.timestampSeconds ?? Math.floor(Date.now() / 1000));

  const signedBytes = encoder.encode(options.signedBody ?? options.body);
  const digest = await crypto.subtle.digest("SHA-256", signedBytes);
  const message = encoder.encode(
    `${requestId}\n${userId}\n${timestamp}\n${bytesToHex(new Uint8Array(digest))}`,
  );
  const rawSignature = await crypto.subtle.sign(
    { name: "Ed25519" },
    (options.signWith ?? falKeys).privateKey,
    message,
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Fal-Webhook-Request-Id": requestId,
    "X-Fal-Webhook-User-Id": userId,
    "X-Fal-Webhook-Timestamp": timestamp,
    "X-Fal-Webhook-Signature": options.signature ?? bytesToHex(new Uint8Array(rawSignature)),
  };
  if (options.omitHeader) delete headers[`X-Fal-Webhook-${HEADER_SUFFIX[options.omitHeader]}`];

  return { method: "POST", headers, body: options.body };
}

/**
 * Namerno neuredan JSON (višak razmaka): da je implementacija hešovala
 * re-serijalizovan JSON umesto sirovih bajtova tela, potpis više ne bi
 * odgovarao i svaki test ispod bi pao na 401.
 */
function okBody(url: string = OUTPUT_URL): string {
  return `{ "request_id" : "${REQUEST_ID}",  "status":"OK" ,  "payload": { "images": [ { "url": "${url}" } ] } }`;
}

function errorBody(): string {
  return `{ "request_id" : "${REQUEST_ID}",  "status":"ERROR" ,  "error": "ValidationError",  "payload": { "detail": "prompt je odbijen" } }`;
}

/**
 * Posao u stanju `running` sa stvarno skinutim kreditima - kao posle
 * `createJob` (A9) i `markJobRunning`. Refund se oslanja na `spend`
 * transakciju, pa ona mora da postoji.
 */
async function seedRunningJob(
  t: TestConvexWithSchema,
  opts: { falRequestId?: string; status?: "running" | "done" } = {},
) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "student@example.com", name: "Studio Student" }),
  );
  const jobId = await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: "flux-2-flash",
      kind: "image" as const,
      params: JSON.stringify({ prompt: "a fox" }),
      promptHash: "0123456789abcdef",
      status: opts.status ?? ("running" as const),
      creditCost: JOB_COST,
      falRequestId: opts.falRequestId ?? REQUEST_ID,
      createdAt: Date.now(),
    }),
  );

  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: GRANTED,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${jobId}` },
  });
  await t.mutation(internal.credits.spendCredits, { userId, amount: JOB_COST, jobId });

  return { userId, jobId };
}

function jobOf(t: TestConvexWithSchema, jobId: Id<"generationJobs">) {
  return t.run((ctx) => ctx.db.get(jobId));
}

async function balanceOf(t: TestConvexWithSchema, userId: Id<"users">) {
  const row = await t.run((ctx) =>
    ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
  );

  return row?.balance ?? 0;
}

function refundsFor(t: TestConvexWithSchema, jobId: Id<"generationJobs">) {
  return t.run((ctx) =>
    ctx.db
      .query("creditTransactions")
      .withIndex("by_job_type", (q) => q.eq("jobId", jobId).eq("type", "refund"))
      .collect(),
  );
}

function scheduledIn(t: TestConvexWithSchema) {
  return t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
}

/**
 * Zakazane funkcije jednog imena. Uspešan webhook zakazuje DVE (X2): skidanje
 * fajla i poravnanje kredita - pa broj po imenu kaže više od ukupnog zbira.
 */
async function scheduledNamed(t: TestConvexWithSchema, name: string) {
  return (await scheduledIn(t)).filter((entry) => entry.name.includes(name));
}

function post(t: TestConvexWithSchema, init: RequestInit) {
  return t.fetch("/fal/webhook", init);
}

// ── 1. neispravan potpis ───────────────────────────────────────────────────

test("neispravan potpis -> 401, posao i kredit nepromenjeni", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);

  const response = await post(t, await signedRequest({ body: errorBody(), signWith: foreignKeys }));

  expect(response.status).toBe(401);
  expect((await jobOf(t, jobId))?.status).toBe("running");
  expect(await balanceOf(t, userId)).toBe(GRANTED - JOB_COST);
  expect(await refundsFor(t, jobId)).toHaveLength(0);
});

test("telo izmenjeno posle potpisa -> 401 (hash ide nad sirovim bajtovima)", async () => {
  const t = convexTest(schema, modules);
  const { jobId } = await seedRunningJob(t);

  const response = await post(t, await signedRequest({ body: errorBody(), signedBody: okBody() }));

  expect(response.status).toBe(401);
  expect((await jobOf(t, jobId))?.status).toBe("running");
});

test("potpis koji nije heksadecimalan -> 401", async () => {
  const t = convexTest(schema, modules);
  const { jobId } = await seedRunningJob(t);

  const response = await post(t, await signedRequest({ body: okBody(), signature: "ne-hex!!" }));

  expect(response.status).toBe(401);
  expect((await jobOf(t, jobId))?.status).toBe("running");
});

// ── 2. timestamp ───────────────────────────────────────────────────────────

test("timestamp stariji od 300 s -> 401, posao i kredit nepromenjeni", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);

  const response = await post(
    t,
    await signedRequest({
      body: errorBody(),
      timestampSeconds: Math.floor(Date.now() / 1000) - 301,
    }),
  );

  expect(response.status).toBe(401);
  expect((await jobOf(t, jobId))?.status).toBe("running");
  expect(await balanceOf(t, userId)).toBe(GRANTED - JOB_COST);
  expect(await refundsFor(t, jobId)).toHaveLength(0);
});

test("timestamp iz budućnosti van tolerancije -> 401", async () => {
  const t = convexTest(schema, modules);
  const { jobId } = await seedRunningJob(t);

  const response = await post(
    t,
    await signedRequest({
      body: okBody(),
      timestampSeconds: Math.floor(Date.now() / 1000) + 301,
    }),
  );

  expect(response.status).toBe(401);
  expect((await jobOf(t, jobId))?.status).toBe("running");
});

test("timestamp unutar tolerancije (299 s) prolazi", async () => {
  const t = convexTest(schema, modules);
  const { jobId } = await seedRunningJob(t);

  const response = await post(
    t,
    await signedRequest({
      body: okBody(),
      timestampSeconds: Math.floor(Date.now() / 1000) - 299,
    }),
  );

  expect(response.status).toBe(200);
  expect((await jobOf(t, jobId))?.status).toBe("done");
});

// ── 3. nedostajući headeri ─────────────────────────────────────────────────

test("fali X-Fal-Webhook-Signature -> 401, posao i kredit nepromenjeni", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);

  const response = await post(
    t,
    await signedRequest({ body: errorBody(), omitHeader: "signature" }),
  );

  expect(response.status).toBe(401);
  expect((await jobOf(t, jobId))?.status).toBe("running");
  expect(await balanceOf(t, userId)).toBe(GRANTED - JOB_COST);
  expect(await refundsFor(t, jobId)).toHaveLength(0);
});

test.each(["request-id", "user-id", "timestamp"] as const)(
  "fali X-Fal-Webhook-%s header -> 401",
  async (omitHeader) => {
    const t = convexTest(schema, modules);
    const { jobId } = await seedRunningJob(t);

    const response = await post(t, await signedRequest({ body: okBody(), omitHeader }));

    expect(response.status).toBe(401);
    expect((await jobOf(t, jobId))?.status).toBe("running");
  },
);

// ── 4. ERROR webhook -> refund ─────────────────────────────────────────────

test("validan ERROR webhook -> posao refunded, kredit vraćen tačno jednom", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);

  const response = await post(t, await signedRequest({ body: errorBody() }));

  expect(response.status).toBe(200);
  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("refunded");
  expect(job?.error).toBe('ValidationError: {"detail":"prompt je odbijen"}');
  expect(job?.completedAt).toBeGreaterThan(0);

  const refunds = await refundsFor(t, jobId);
  expect(refunds).toHaveLength(1);
  expect(refunds[0].amount).toBe(JOB_COST);
  expect(await balanceOf(t, userId)).toBe(GRANTED);
  expect(await scheduledIn(t)).toHaveLength(0);
});

// ── 5. idempotencija ───────────────────────────────────────────────────────

test("isti validan ERROR webhook 5 puta -> kredit vraćen tačno jednom", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await post(t, await signedRequest({ body: errorBody() }));
    expect(response.status).toBe(200);
  }

  expect(await refundsFor(t, jobId)).toHaveLength(1);
  expect(await balanceOf(t, userId)).toBe(GRANTED);
  expect((await jobOf(t, jobId))?.status).toBe("refunded");
});

test("posao koji više nije running se ne dira (zakasneli retry)", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t, { status: "done" });

  const response = await post(t, await signedRequest({ body: errorBody() }));

  expect(response.status).toBe(200);
  expect((await jobOf(t, jobId))?.status).toBe("done");
  expect(await refundsFor(t, jobId)).toHaveLength(0);
  expect(await balanceOf(t, userId)).toBe(GRANTED - JOB_COST);
});

// ── 6. OK webhook ──────────────────────────────────────────────────────────

test("validan OK webhook -> posao done sa fal URL-om, bez refunda", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);

  const response = await post(t, await signedRequest({ body: okBody() }));

  expect(response.status).toBe(200);
  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("done");
  expect(job?.falOutputUrl).toBe(OUTPUT_URL);
  expect(job?.completedAt).toBeGreaterThan(0);

  expect(await refundsFor(t, jobId)).toHaveLength(0);
  expect(await balanceOf(t, userId)).toBe(GRANTED - JOB_COST);

  // Skidanje fajla ide u zakazanu akciju, ne u handler.
  const scheduled = await scheduledNamed(t, "persistOutput");
  expect(scheduled).toHaveLength(1);
  expect(scheduled[0].args[0]).toEqual({ jobId });
  // Poravnanje (X2) ide istim putem i iz istog razloga.
  const settlement = await scheduledNamed(t, "settleJobCredits");
  expect(settlement).toHaveLength(1);
  expect(settlement[0].args[0]).toEqual({ jobId });
});

test("dupli OK webhook ne zakazuje persistOutput dvaput", async () => {
  const t = convexTest(schema, modules);
  const { jobId } = await seedRunningJob(t);

  await post(t, await signedRequest({ body: okBody() }));
  const second = await post(t, await signedRequest({ body: okBody("https://fal.media/drugo.png") }));

  expect(second.status).toBe(200);
  expect(await scheduledNamed(t, "persistOutput")).toHaveLength(1);
  expect(await scheduledNamed(t, "settleJobCredits")).toHaveLength(1);
  expect((await jobOf(t, jobId))?.falOutputUrl).toBe(OUTPUT_URL);
});

// ── 7. nepoznat request_id ─────────────────────────────────────────────────

test("nepoznat request_id -> 200 i ništa se ne menja", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);

  const response = await post(
    t,
    await signedRequest({ body: errorBody(), requestId: "nepostojeci-zahtev" }),
  );

  expect(response.status).toBe(200);
  expect((await jobOf(t, jobId))?.status).toBe("running");
  expect(await refundsFor(t, jobId)).toHaveLength(0);
  expect(await balanceOf(t, userId)).toBe(GRANTED - JOB_COST);
  expect(await scheduledIn(t)).toHaveLength(0);
});

// ── 8. telo koje ne razumemo ───────────────────────────────────────────────

test("validan potpis ali nepoznat status -> 200, posao ostaje running", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);

  const response = await post(
    t,
    await signedRequest({ body: JSON.stringify({ status: "IN_PROGRESS" }) }),
  );

  expect(response.status).toBe(200);
  expect((await jobOf(t, jobId))?.status).toBe("running");
  expect(await balanceOf(t, userId)).toBe(GRANTED - JOB_COST);
  expect(await refundsFor(t, jobId)).toHaveLength(0);
});

// ── čiste funkcije iz falWebhookCore ───────────────────────────────────────

describe("falWebhookCore", () => {
  test("readWebhookHeaders traži sva četiri headera", () => {
    const complete = {
      "X-Fal-Webhook-Request-Id": "r",
      "X-Fal-Webhook-User-Id": "u",
      "X-Fal-Webhook-Timestamp": "1",
      "X-Fal-Webhook-Signature": "ab",
    };
    expect(readWebhookHeaders(new Headers(complete))).toEqual({
      requestId: "r",
      userId: "u",
      timestamp: "1",
      signature: "ab",
    });

    for (const missing of Object.keys(complete)) {
      const headers = new Headers(complete);
      headers.delete(missing);
      expect(readWebhookHeaders(headers)).toBeNull();
    }
  });

  test("isTimestampFresh drži toleranciju od 300 s u oba smera", () => {
    const now = 1_800_000_000_000;
    const seconds = Math.floor(now / 1000);
    expect(isTimestampFresh(String(seconds), now)).toBe(true);
    expect(isTimestampFresh(String(seconds - 300), now)).toBe(true);
    expect(isTimestampFresh(String(seconds + 300), now)).toBe(true);
    expect(isTimestampFresh(String(seconds - 301), now)).toBe(false);
    expect(isTimestampFresh(String(seconds + 301), now)).toBe(false);
    // Milisekunde umesto sekundi su tipična greška - i one moraju da padnu.
    expect(isTimestampFresh(String(now), now)).toBe(false);
    expect(isTimestampFresh("nije-broj", now)).toBe(false);
  });

  test("buildSignedMessage spaja tačno četiri dela novim redom", () => {
    expect(
      buildSignedMessage({ requestId: "r", userId: "u", timestamp: "7", signature: "x" }, "abcd"),
    ).toBe("r\nu\n7\nabcd");
  });

  test("hexToBytes prihvata samo paran niz hex cifara", () => {
    expect(Array.from(hexToBytes("00ff10") ?? [])).toEqual([0, 255, 16]);
    expect(Array.from(hexToBytes("00FF") ?? [])).toEqual([0, 255]);
    expect(hexToBytes("")).toBeNull();
    expect(hexToBytes("abc")).toBeNull();
    expect(hexToBytes("zz")).toBeNull();
  });

  test("base64UrlToBytes dekoduje bez dopune, sa - i _", () => {
    const bytes = new Uint8Array([251, 255, 190, 1, 2]);
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).not.toContain("=");
    expect(Array.from(base64UrlToBytes(encoded) ?? [])).toEqual(Array.from(bytes));
    expect(base64UrlToBytes("ima razmak")).toBeNull();
    expect(base64UrlToBytes("sa+plusom/")).toBeNull();
  });

  test("bytesToHex dopunjava vodeću nulu", () => {
    expect(bytesToHex(new Uint8Array([0, 15, 16, 255]))).toBe("000f10ff");
  });

  test("extractJwkPublicKeys uzima samo unose sa string `x` poljem", () => {
    const jwks = { keys: [{ x: "aaa" }, { x: 5 }, {}, null, { kty: "RSA" }, { x: "bbb" }] };
    expect(extractJwkPublicKeys(jwks)).toEqual(["aaa", "bbb"]);
    expect(extractJwkPublicKeys({})).toEqual([]);
    expect(extractJwkPublicKeys({ keys: "ne-niz" })).toEqual([]);
    expect(extractJwkPublicKeys(null)).toEqual([]);
  });

  test("parseWebhookBody vraća null za sve što nije JSON objekat", () => {
    expect(parseWebhookBody('{"status":"OK","payload":{"a":1}}')).toEqual({
      status: "OK",
      payload: { a: 1 },
      error: null,
    });
    expect(parseWebhookBody("nije json")).toBeNull();
    expect(parseWebhookBody("[1,2]")).toBeNull();
    expect(parseWebhookBody("null")).toBeNull();
  });

  test("extractOutputUrl prepoznaje oblike slike, videa i zvuka", () => {
    expect(extractOutputUrl({ images: [{ url: "https://a/slika.png" }] })).toBe(
      "https://a/slika.png",
    );
    expect(extractOutputUrl({ video: { url: "https://a/klip.mp4" } })).toBe("https://a/klip.mp4");
    expect(extractOutputUrl({ audio: { url: "https://a/zvuk.mp3" } })).toBe("https://a/zvuk.mp3");
    expect(extractOutputUrl({ url: "https://a/direktno.png" })).toBe("https://a/direktno.png");
    expect(extractOutputUrl({ images: [] })).toBeNull();
    expect(extractOutputUrl({ nesto: "drugo" })).toBeNull();
    expect(extractOutputUrl(null)).toBeNull();
  });

  test("extractErrorMessage spaja tip i detalje, i uvek vraća nešto", () => {
    expect(extractErrorMessage({ status: "ERROR", error: "Boom", payload: null })).toBe("Boom");
    expect(extractErrorMessage({ status: "ERROR", error: "Boom", payload: "detalj" })).toBe(
      "Boom: detalj",
    );
    expect(extractErrorMessage({ status: "ERROR", error: null, payload: null })).toBe(
      "fal je vratio grešku bez opisa.",
    );
    expect(
      extractErrorMessage({ status: "ERROR", error: "x".repeat(900), payload: null }),
    ).toHaveLength(500);
  });
});
