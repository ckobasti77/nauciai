/// <reference types="vite/client" />

/**
 * Projekti montaže (Crea K19, plan K17 §2.3): vlasništvo radova (tuđ i DEMO
 * odbijeni), dokument preko granice → `{ ok:false }`, limit od 50 projekata,
 * tuđ projekat se ne vidi, istekao rad je `expired`, brisanje projekta ne
 * briše radove, i poslednji izvoz.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { addAudio, addMainClips, emptyTimeline, serializeTimeline, TIMELINE_LIMITS } from "../lib/crea-timeline";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MONTAGE_LIMITS } from "./creaMontagesCore";
import schema from "./schema";
import { MOCK_REQUEST_PREFIX } from "./studioCore";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

async function seedUser(t: TestConvex, email = "mila@example.com") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Mila Crea",
      username: email.split("@")[0],
      role: "moderator",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function seedJob(
  t: TestConvex,
  userId: Id<"users">,
  opts: { kind?: "video" | "image" | "audio"; status?: "done" | "running"; mock?: boolean; withFile?: boolean } = {},
) {
  return t.run(async (ctx) => {
    const outputStorageId = opts.withFile === false ? undefined : await ctx.storage.store(new Blob(["mp4"]));
    return ctx.db.insert("generationJobs", {
      userId,
      modelSlug: "veo-31-lite",
      kind: opts.kind ?? "video",
      params: "{}",
      promptHash: "0",
      status: opts.status ?? "done",
      creditCost: 44,
      ...(opts.mock ? { falRequestId: `${MOCK_REQUEST_PREFIX}1` } : {}),
      ...(outputStorageId ? { outputStorageId } : {}),
      createdAt: 1,
      completedAt: 2,
    });
  });
}

const clip = (jobId: string, media: "video" | "image" = "video") => ({
  src: { jobId },
  media,
  in: 0,
  out: 3,
  speed: 1,
  volumeDb: 0,
  muted: false,
  fit: "cover" as const,
});

function docWith(jobIds: string[], music?: string): string {
  let timeline = addMainClips(emptyTimeline(), jobIds.map((jobId) => clip(jobId)));
  if (music) timeline = addAudio(timeline, { src: { jobId: music }, in: 0, out: 5, start: 0, volumeDb: 0, role: "music", fadeIn: 0, fadeOut: 1 }).timeline;
  return serializeTimeline(timeline);
}

describe("čuvanje projekta montaže", () => {
  test("sačuvaj → spisak → otvori: dokument, trajanje i adrese radova", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const a = await seedJob(t, userId);
    const b = await seedJob(t, userId);
    const song = await seedJob(t, userId, { kind: "audio" });
    const saved = await asUser.mutation(api.creaMontages.saveMontage, {
      title: "  Leto  na moru ",
      doc: docWith([a, b], song),
      origin: "rucno",
    });
    if (!saved.ok) throw new Error(saved.reason);

    const list = await asUser.query(api.creaMontages.listMine, {});
    expect(list).toEqual([
      expect.objectContaining({ _id: saved.id, title: "Leto na moru", durationS: 6, origin: "rucno" }),
    ]);
    expect(list[0]).not.toHaveProperty("doc");

    const montage = await asUser.query(api.creaMontages.getMontage, { id: saved.id });
    expect(montage?.doc).toBe(docWith([a, b], song));
    expect(montage?.media[a]).toEqual({ url: expect.any(String), kind: "video", expired: false });
    expect(montage?.media[song]).toMatchObject({ kind: "audio", expired: false });

    // Izmena postojećeg projekta.
    const updated = await asUser.mutation(api.creaMontages.saveMontage, { id: saved.id, title: "Leto", doc: docWith([b]), origin: "rucno" });
    expect(updated).toEqual({ ok: true, id: saved.id });
    expect((await asUser.query(api.creaMontages.getMontage, { id: saved.id }))?.title).toBe("Leto");
  });

  test("tuđ, DEMO, nezavršen ili rad pogrešne vrste se odbija i ništa se ne upisuje", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "nikola@example.com");
    const foreign = await seedJob(t, other.userId);
    const demo = await seedJob(t, userId, { mock: true });
    const running = await seedJob(t, userId, { status: "running" });
    const sound = await seedJob(t, userId, { kind: "audio" });
    for (const jobId of [foreign, demo, running, sound]) {
      expect(await asUser.mutation(api.creaMontages.saveMontage, { title: "x", doc: docWith([jobId]), origin: "rucno" })).toEqual({
        ok: false,
        reason: "RAD_NIJE_DOSTUPAN",
      });
    }
    // Id koji nije id rada (npr. izmišljen) takođe.
    expect(await asUser.mutation(api.creaMontages.saveMontage, { title: "x", doc: docWith(["nepostoji"]), origin: "rucno" })).toEqual({
      ok: false,
      reason: "RAD_NIJE_DOSTUPAN",
    });
    expect(await asUser.query(api.creaMontages.listMine, {})).toEqual([]);
  });

  test("dokument preko granice ili neispravan → { ok:false }", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const huge = JSON.stringify({ ...emptyTimeline(), pad: "x".repeat(TIMELINE_LIMITS.jsonChars) });
    expect(await asUser.mutation(api.creaMontages.saveMontage, { title: "x", doc: huge, origin: "rucno" })).toEqual({
      ok: false,
      reason: "NEISPRAVAN_DOKUMENT",
    });
    expect(await asUser.mutation(api.creaMontages.saveMontage, { title: "x", doc: '{"v":9}', origin: "ritam" })).toEqual({
      ok: false,
      reason: "NEISPRAVAN_DOKUMENT",
    });
  });

  test("najviše 50 projekata po korisniku", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < MONTAGE_LIMITS.perUser; index += 1) {
        await ctx.db.insert("creaMontages", {
          userId,
          title: `P${index}`,
          doc: serializeTimeline(emptyTimeline()),
          jobIds: [],
          durationS: 0,
          origin: "rucno",
          createdAt: index,
          updatedAt: index,
        });
      }
    });
    expect(await asUser.mutation(api.creaMontages.saveMontage, { title: "51.", doc: serializeTimeline(emptyTimeline()), origin: "rucno" })).toEqual({
      ok: false,
      reason: "LIMIT_PROJEKATA",
    });
    expect(await asUser.query(api.creaMontages.listMine, {})).toHaveLength(MONTAGE_LIMITS.perUser);
  });

  test("tuđ projekat: getMontage je null, izmena i brisanje ne prolaze; gost ne vidi ništa", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "nikola@example.com");
    const a = await seedJob(t, userId);
    const saved = await asUser.mutation(api.creaMontages.saveMontage, { title: "Moje", doc: docWith([a]), origin: "rucno" });
    if (!saved.ok) throw new Error(saved.reason);
    expect(await other.asUser.query(api.creaMontages.getMontage, { id: saved.id })).toBeNull();
    expect(await other.asUser.mutation(api.creaMontages.saveMontage, { id: saved.id, title: "Ukradeno", doc: docWith([]), origin: "rucno" })).toEqual({
      ok: false,
      reason: "PROJEKAT_NIJE_DOSTUPAN",
    });
    expect(await other.asUser.mutation(api.creaMontages.deleteMontage, { id: saved.id })).toEqual({ ok: false });
    expect((await other.asUser.query(api.creaMontages.resolveMedia, { jobIds: [a] }))[a]).toEqual({ url: null, kind: "video", expired: true });
    await expect(t.query(api.creaMontages.listMine, {})).rejects.toThrow();
  });

  test("istekao rad je „expired\", a brisanje projekta ne briše radove", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const live = await seedJob(t, userId);
    const expired = await seedJob(t, userId, { withFile: false });
    const saved = await asUser.mutation(api.creaMontages.saveMontage, { title: "Stari", doc: docWith([live, expired]), origin: "rucno" });
    if (!saved.ok) throw new Error(saved.reason);
    const media = (await asUser.query(api.creaMontages.getMontage, { id: saved.id }))!.media;
    expect(media[live].expired).toBe(false);
    expect(media[expired]).toEqual({ url: null, kind: "video", expired: true });

    expect(await asUser.mutation(api.creaMontages.deleteMontage, { id: saved.id })).toEqual({ ok: true });
    expect(await asUser.query(api.creaMontages.getMontage, { id: saved.id })).toBeNull();
    const jobs = await t.run(async (ctx) => [await ctx.db.get(live), await ctx.db.get(expired)]);
    expect(jobs.every((job) => job !== null)).toBe(true);
  });

  test("poslednji izvoz se pamti samo za svoj projekat i svoj rad", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "nikola@example.com");
    const a = await seedJob(t, userId);
    const exported = await seedJob(t, userId);
    const foreign = await seedJob(t, other.userId);
    const saved = await asUser.mutation(api.creaMontages.saveMontage, { title: "Izvoz", doc: docWith([a]), origin: "ritam" });
    if (!saved.ok) throw new Error(saved.reason);
    expect(await asUser.mutation(api.creaMontages.markExported, { id: saved.id, jobId: foreign })).toEqual({ ok: false });
    expect(await asUser.mutation(api.creaMontages.markExported, { id: saved.id, jobId: exported })).toEqual({ ok: true });
    expect((await asUser.query(api.creaMontages.listMine, {}))[0]).toMatchObject({ lastExportJobId: exported, origin: "ritam" });
  });
});
