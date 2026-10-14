/// <reference types="vite/client" />

/**
 * Napredak IGRA-e (K04): nivo, niz dana, 24 bedža, dnevnik viđenog i napredak člana.
 *
 * Lekcije i radovi u Crei prolaze kroz PRAVE mutacije (`courses.markProgress`,
 * `studio.finalizeOutput`), pa upit čita iste redove kao u produkciji. Prihvatanje:
 * sve je samo prikaz - nijedan put ovde ne dodeljuje XP, kredite ni nagrade.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { IGRA_BADGE_KEYS, MENTOR_HELPFUL_ANSWERS, type IgraBadgeKey } from "../lib/igra-badges";
import { planCelebrations, type IgraProgressFresh } from "../lib/igra-celebrations";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { badgeSeenKey, freshSeenKeys } from "./igraCore";
import { LEADERBOARD_XP, syncLeaderboardSourceEvent, type LeaderboardSourceType } from "./leaderboardCore";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

/** Ponedeljak, leto: Beograd je UTC+2. */
const MON = "2026-07-06";
const TUE = "2026-07-07";
const WED = "2026-07-08";
const NEXT_MON = "2026-07-13";
/** Trenutak u Beogradu leti (`2026-07-06`, `22:30`). */
const summer = (dayKey: string, time: string) => Date.parse(`${dayKey}T${time}:00+02:00`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(summer(MON, "10:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

async function seedUser(
  t: TestConvex,
  opts: { email?: string; role?: "student" | "pro_student" | "moderator" | "admin"; username?: string } = {},
) {
  const email = opts.email ?? "mila@example.com";
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Mila Igra",
      firstName: "Mila",
      lastName: "Petrović",
      username: opts.username ?? email.split("@")[0]!.replace(/[^a-z0-9_]/g, "_"),
      role: opts.role ?? "student",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      emailVerificationTime: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return { userId, as: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function seedTrack(t: TestConvex, slug: string) {
  return t.run((ctx) =>
    ctx.db.insert("courseTracks", { slug, titleSr: `Staza ${slug}`, titleEn: `Track ${slug}`, status: "published" as const, sortOrder: 1, createdAt: 1, updatedAt: 1 }),
  );
}

/** Objavljen kurs sa `lessons` objavljenih lekcija (brojač kao posle `recomputePublishedLessonCount`). */
async function seedCourse(
  t: TestConvex,
  slug: string,
  opts: { lessons: number; trackId?: Id<"courseTracks">; status?: "draft" | "published" | "archived" } = { lessons: 1 },
) {
  return t.run(async (ctx) => {
    const courseId = await ctx.db.insert("courses", {
      ...(opts.trackId ? { trackId: opts.trackId } : {}),
      slug,
      titleSr: `Kurs ${slug}`,
      titleEn: `Course ${slug}`,
      subtitleSr: "",
      subtitleEn: "",
      descriptionSr: "",
      descriptionEn: "",
      status: opts.status ?? "published",
      sortOrder: 1,
      publishedLessonCount: opts.lessons,
      updatedAt: 1,
    });
    const lessonIds: Id<"lessons">[] = [];
    for (let i = 0; i < opts.lessons; i += 1) {
      lessonIds.push(
        await ctx.db.insert("lessons", {
          courseId,
          slug: `${slug}-${i + 1}`,
          titleSr: `Lekcija ${i + 1}`,
          titleEn: `Lesson ${i + 1}`,
          summarySr: "",
          summaryEn: "",
          durationSeconds: 60,
          isPublished: true,
          sortOrder: i,
          updatedAt: 1,
        }),
      );
    }
    return { courseId, lessonIds };
  });
}

type Seeded = Awaited<ReturnType<typeof seedUser>>;

/** Završena lekcija kroz pravu mutaciju (XP, brojači, dan aktivnosti). */
async function completeLesson(user: Seeded, lessonId: Id<"lessons">, completed = true) {
  await user.as.mutation(api.courses.markProgress, { lessonId, completed, positionSeconds: 0 });
}

/** Gotov rad u Crei kroz pravi `finalizeOutput` (kao u `creaGame.test.ts`). */
async function finishWork(
  t: TestConvex,
  userId: Id<"users">,
  opts: { kind?: "image" | "video" | "audio"; modelSlug?: string; creaTechniques?: string[] } = {},
) {
  const jobId = await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: opts.modelSlug ?? "nano-banana-2",
      kind: opts.kind ?? "image",
      provider: "google" as const,
      params: JSON.stringify({ prompt: "mačka" }),
      promptHash: "0".repeat(16),
      status: "done" as const,
      creditCost: 16,
      ...(opts.creaTechniques ? { creaTechniques: opts.creaTechniques } : {}),
      createdAt: Date.now(),
    }),
  );
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["izlaz"])));
  await t.mutation(internal.studio.finalizeOutput, { jobId, storageId, byteSize: 5 });
}

/** XP događaj kroz pravi sync (za vrste koje nemaju kratku javnu mutaciju u testu). */
async function xpEvent(t: TestConvex, userId: Id<"users">, sourceType: LeaderboardSourceType, sourceId: string, active = true) {
  await t.run((ctx) => syncLeaderboardSourceEvent(ctx, { userId, sourceType, sourceId, active }));
}

/** Red rang-liste upisan direktno (tuđi XP, tačne granice). */
async function setStats(
  t: TestConvex,
  userId: Id<"users">,
  opts: { xp: number; period?: "all_time" | "week"; periodKey?: string; eligible?: boolean },
) {
  const period = opts.period ?? "all_time";
  const periodKey = opts.periodKey ?? (period === "all_time" ? "all" : MON);
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("leaderboardStats")
      .withIndex("by_userId_and_scopeKey_and_period_and_periodKey", (q) =>
        q.eq("userId", userId).eq("scopeKey", "global").eq("period", period).eq("periodKey", periodKey),
      )
      .unique();
    if (row) await ctx.db.patch(row._id, { xp: opts.xp });
    else {
      await ctx.db.insert("leaderboardStats", {
        userId,
        scopeKind: "global",
        scopeKey: "global",
        period,
        periodKey,
        xp: opts.xp,
        completedLessons: 0,
        completedTasks: 0,
        helpfulAnswers: 0,
        eligible: opts.eligible ?? true,
        updatedAt: 1,
      });
    }
  });
}

/**
 * Puna nedeljna lista: deset učenika daleko ispred. Bez nje je na praznoj listi svako sa
 * 100 XP nedeljno među prvih 10, pa bi „Top 10" stizao uz svaku prvu lekciju.
 */
async function seedBusyWeek(t: TestConvex, weekKey = MON) {
  for (let i = 0; i < 10; i += 1) {
    const other = await seedUser(t, { email: `vrh${i}@example.com` });
    await setStats(t, other.userId, { xp: 5000, period: "week", periodKey: weekKey });
  }
}

async function ledgerOf(t: TestConvex, userId: Id<"users">) {
  return t.run(async (ctx) =>
    (await ctx.db.query("igraSeen").withIndex("by_user_key", (q) => q.eq("userId", userId)).collect()).map((row) => row.key),
  );
}

async function progressOf(user: Seeded, todayKey: string) {
  const progress = await user.as.query(api.igra.getMyProgress, { todayKey });
  if (!progress) throw new Error("nema napretka");
  return progress;
}

function badgeOf(progress: { badges: ReadonlyArray<{ key: IgraBadgeKey; state: string; unlockedAt: number | null; progress: unknown }> }, key: IgraBadgeKey) {
  return progress.badges.find((badge) => badge.key === key)!;
}

function stateOf(progress: Parameters<typeof badgeOf>[0], key: IgraBadgeKey) {
  return badgeOf(progress, key).state;
}

describe("igra.getMyProgress", () => {
  test("gost dobija null; neispravan dan se odbija", async () => {
    const t = makeT();
    expect(await t.query(api.igra.getMyProgress, { todayKey: MON })).toBeNull();
    const { as } = await seedUser(t);
    await expect(as.query(api.igra.getMyProgress, { todayKey: "juče" })).rejects.toThrow("NEISPRAVAN_DAN");
    await expect(as.query(api.igra.getMyProgress, { todayKey: "2026-02-30" })).rejects.toThrow("NEISPRAVAN_DAN");
  });

  test("prazan korisnik: nivo 1, bez niza, sve zaključano, ništa novo", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    const progress = await progressOf(mila, MON);

    expect(progress.xp).toBe(0);
    expect(progress.weekXp).toBe(0);
    expect(progress.weekRank).toBeNull();
    expect(progress.level).toEqual({
      level: 1,
      name: { sr: "Početnik", en: "Beginner" },
      minXp: 0,
      nextMinXp: 100,
      xpIntoLevel: 0,
      xpForNext: 100,
      progress: 0,
    });
    expect(progress.streak).toMatchObject({ current: 0, best: 0, todayDone: false, freezes: 0 });
    expect(progress.streak.recent).toHaveLength(14);
    expect(progress.badges.map((badge) => badge.key)).toEqual(IGRA_BADGE_KEYS);
    // Izazov je „uskoro" dok je javna galerija Cree ugašena; sve ostalo je zaključano.
    expect(progress.badges.filter((badge) => badge.state !== "locked").map((badge) => [badge.key, badge.state])).toEqual([["izazov", "soon"]]);
    expect(progress.badges.every((badge) => badge.unlockedAt === null)).toBe(true);
    expect(badgeOf(progress, "pet-lekcija").progress).toEqual({ current: 0, target: 5 });
    expect(badgeOf(progress, "prva-lekcija").progress).toBeNull();
    expect(badgeOf(progress, "izazov").progress).toBeNull();
    expect(progress.fresh).toEqual({ level: null, badges: [], courses: [], ledgerEmpty: true });
    expect(progress).toMatchObject({ banner: null, eligible: true, username: "mila" });
  });

  test("aktivan korisnik: tri dana lekcija i rad u Crei (stvarne mutacije)", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    await seedBusyWeek(t);
    const trackId = await seedTrack(t, "ai-osnove");
    const a = await seedCourse(t, "a", { lessons: 2, trackId });
    const b = await seedCourse(t, "b", { lessons: 1, trackId });
    const c = await seedCourse(t, "c", { lessons: 4 });

    // Ponedeljak u 10 h: ceo kurs A i prva slika u Crei.
    await completeLesson(mila, a.lessonIds[0]!);
    await completeLesson(mila, a.lessonIds[1]!);
    await finishWork(t, mila.userId);
    // Utorak u 22:30: kurs B (cela staza) - noćna tura.
    vi.setSystemTime(summer(TUE, "22:30"));
    await completeLesson(mila, b.lessonIds[0]!);
    // Sreda u 6:30: dve lekcije kursa C - rano jutro.
    vi.setSystemTime(summer(WED, "06:30"));
    await completeLesson(mila, c.lessonIds[0]!);
    await completeLesson(mila, c.lessonIds[1]!);

    const progress = await progressOf(mila, WED);
    const xp = 5 * LEADERBOARD_XP.lesson + LEADERBOARD_XP.crea_first_work + LEADERBOARD_XP.crea_daily_work;
    expect(xp).toBe(540);
    expect(progress.xp).toBe(xp);
    expect(progress.weekXp).toBe(xp);
    // Deset učenika deli prvo mesto, pa je Mila druga (isti XP deli mesto, kao na rang-listi).
    expect(progress.weekRank).toBe(2);
    expect(progress.level).toMatchObject({ level: 3, name: { sr: "Skicar", en: "Sketcher" }, xpIntoLevel: 240, xpForNext: 160, progress: 0.6 });
    expect(progress.streak).toMatchObject({ current: 3, best: 3, todayDone: true });

    const fresh: IgraBadgeKey[] = ["prva-lekcija", "pet-lekcija", "prvi-kurs", "staza", "nocna-sova", "rani-pevac", "prvi-rad", "niz-3"];
    expect(progress.fresh.badges).toEqual(fresh);
    for (const key of fresh) expect(badgeOf(progress, key), key).toMatchObject({ state: "fresh", unlockedAt: null, progress: null });
    expect(badgeOf(progress, "tri-kursa")).toMatchObject({ state: "locked", progress: { current: 2, target: 3 } });
    expect(badgeOf(progress, "deset-radova")).toMatchObject({ state: "locked", progress: { current: 1, target: 10 } });
    expect(badgeOf(progress, "niz-7")).toMatchObject({ state: "locked", progress: { current: 3, target: 7 } });
    expect(stateOf(progress, "prvi-zadatak")).toBe("locked");
    expect(stateOf(progress, "prvi-video")).toBe("locked");
    expect(stateOf(progress, "top-10")).toBe("locked");
    expect(progress.fresh.level).toBe(3);
    expect(progress.fresh.courses).toEqual([
      { key: `course:${a.courseId}`, title: { sr: "Kurs a", en: "Course a" } },
      { key: `course:${b.courseId}`, title: { sr: "Kurs b", en: "Course b" } },
    ]);
    expect(progress.fresh.ledgerEmpty).toBe(true);

    // Prvi kontakt: domaćin slavlja (K03) od ovoga pravi JEDAN zbir i upisuje sve što pokriva.
    const freshForHost: IgraProgressFresh = progress.fresh;
    const plan = planCelebrations(freshForHost, freshForHost.ledgerEmpty);
    expect(plan.show).toHaveLength(1);
    expect(plan.show[0]).toMatchObject({ kind: "summary", level: 3, badges: 8 });
    expect(plan.markKeys).toHaveLength(12);
    vi.setSystemTime(summer(WED, "07:00"));
    const seenAt = Date.now();
    await mila.as.mutation(api.igra.markSeen, { keys: plan.markKeys });
    expect((await ledgerOf(t, mila.userId)).sort()).toEqual([...plan.markKeys].sort());
    const seen = await progressOf(mila, WED);
    expect(seen.fresh).toEqual({ level: null, badges: [], courses: [], ledgerEmpty: false });
    for (const key of fresh) expect(badgeOf(seen, key), key).toMatchObject({ state: "unlocked", unlockedAt: seenAt });
    expect(stateOf(seen, "tri-kursa")).toBe("locked");

    // Drugi talas: ostatak kursa C = treći kurs i nivo 4. Slavi se samo novo.
    await completeLesson(mila, c.lessonIds[2]!);
    await completeLesson(mila, c.lessonIds[3]!);
    const next = await progressOf(mila, WED);
    expect(next.xp).toBe(740);
    expect(next.level.level).toBe(4);
    expect(next.fresh).toEqual({
      level: 4,
      badges: ["tri-kursa"],
      courses: [{ key: `course:${c.courseId}`, title: { sr: "Kurs c", en: "Course c" } }],
      ledgerEmpty: false,
    });
  });

  test("granice nivoa: prag pripada višem nivou, a proslavljen nivo se ne slavi ponovo", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    const levelAt = async (xp: number) => {
      await setStats(t, mila.userId, { xp });
      const progress = await progressOf(mila, MON);
      return { level: progress.level.level, fresh: progress.fresh.level, xpForNext: progress.level.xpForNext, bar: progress.level.progress };
    };

    expect(await levelAt(99)).toEqual({ level: 1, fresh: null, xpForNext: 1, bar: 0.99 });
    expect(await levelAt(100)).toEqual({ level: 2, fresh: 2, xpForNext: 200, bar: 0 });
    expect(await levelAt(299)).toMatchObject({ level: 2, fresh: 2 });
    expect(await levelAt(300)).toMatchObject({ level: 3, fresh: 3 });
    expect(await levelAt(1399)).toMatchObject({ level: 4, fresh: 4 });
    expect(await levelAt(1400)).toMatchObject({ level: 5, fresh: 5 });
    expect(await levelAt(19999)).toMatchObject({ level: 11, fresh: 11 });
    expect(await levelAt(20000)).toEqual({ level: 12, fresh: 12, xpForNext: null, bar: 1 });

    // Nivo 12 je viđen; pad XP-a ga ne „oduzima" i povratak se ne slavi ponovo.
    await mila.as.mutation(api.igra.markSeen, { keys: ["level:12"] });
    expect(await levelAt(20000)).toMatchObject({ level: 12, fresh: null });
    expect(await levelAt(5600)).toMatchObject({ level: 8, fresh: null });
    expect(await levelAt(25000)).toMatchObject({ level: 12, fresh: null });
  });

  test("niz preko ponoći u Beogradu: 23:30 i 00:30 su dva dana", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    const course = await seedCourse(t, "ponoc", { lessons: 3 });

    // Oba trenutka su ISTI dan po UTC-u (21:30Z i 22:30Z), a dva dana u Beogradu.
    vi.setSystemTime(summer(MON, "23:30"));
    expect(new Date().toISOString()).toBe("2026-07-06T21:30:00.000Z");
    await completeLesson(mila, course.lessonIds[0]!);
    expect((await progressOf(mila, MON)).streak).toMatchObject({ current: 1, best: 1, todayDone: true });

    vi.setSystemTime(summer(TUE, "00:30"));
    expect(new Date().toISOString()).toBe("2026-07-06T22:30:00.000Z");
    // Ponoć je prošla, a današnja lekcija još nije završena: niz od juče i dalje važi.
    expect((await progressOf(mila, TUE)).streak).toMatchObject({ current: 1, todayDone: false });
    await completeLesson(mila, course.lessonIds[1]!);

    const tuesday = await progressOf(mila, TUE);
    expect(tuesday.streak).toMatchObject({ current: 2, best: 2, todayDone: true });
    expect(tuesday.streak.recent.slice(-2)).toEqual([
      { dayKey: MON, state: "active" },
      { dayKey: TUE, state: "active" },
    ]);
    // Obe lekcije su noćna tura (posle 22 h, pre 4 h).
    expect(stateOf(tuesday, "nocna-sova")).toBe("fresh");
    expect(stateOf(tuesday, "rani-pevac")).toBe("locked");

    // Sreda bez aktivnosti ne prekida niz (ima se do ponoći); četvrtak ga prekida.
    expect((await progressOf(mila, WED)).streak).toMatchObject({ current: 2, todayDone: false });
    expect((await progressOf(mila, "2026-07-09")).streak).toMatchObject({ current: 0, best: 2 });
  });

  test("Crea bedževi: oblasti, tehnika, recept i 10 radova (stvarni radovi)", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    await seedBusyWeek(t);

    await finishWork(t, mila.userId, { kind: "video", modelSlug: "grok-video-15-lite", creaTechniques: ["kamera:fpv"] });
    const first = await progressOf(mila, MON);
    expect(first.fresh.badges).toEqual(["prvi-rad", "prvi-video", "tehnika"]);
    expect(stateOf(first, "prvi-zvuk")).toBe("locked");
    expect(stateOf(first, "recept")).toBe("locked");

    await finishWork(t, mila.userId, { kind: "audio" });
    await finishWork(t, mila.userId, { creaTechniques: ["recept:profilna"] });
    for (let i = 0; i < 6; i += 1) await finishWork(t, mila.userId);
    const nine = await progressOf(mila, MON);
    expect(nine.fresh.badges).toEqual(["prvi-rad", "prvi-video", "prvi-zvuk", "recept", "tehnika"]);
    expect(badgeOf(nine, "deset-radova")).toMatchObject({ state: "locked", progress: { current: 9, target: 10 } });

    await finishWork(t, mila.userId);
    const ten = await progressOf(mila, MON);
    expect(stateOf(ten, "deset-radova")).toBe("fresh");
    expect(badgeOf(ten, "sto-radova")).toMatchObject({ state: "locked", progress: { current: 10, target: 100 } });
    // Rad je i aktivan dan: niz teče i bez lekcije.
    expect(ten.streak).toMatchObject({ current: 1, todayDone: true });
  });

  test("izazov: uskoro dok je galerija ugašena, pa po odobrenom učešću", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    expect(stateOf(await progressOf(mila, MON), "izazov")).toBe("soon");

    await t.mutation(internal.creaFlags.setCreaFlag, { key: "crea_public_gallery", enabled: true });
    expect(stateOf(await progressOf(mila, MON), "izazov")).toBe("locked");

    await xpEvent(t, mila.userId, "crea_challenge", MON);
    expect(stateOf(await progressOf(mila, MON), "izazov")).toBe("fresh");
    // Moderacija skine prijavu: učešće više ne važi.
    await xpEvent(t, mila.userId, "crea_challenge", MON, false);
    expect(stateOf(await progressOf(mila, MON), "izazov")).toBe("locked");
  });

  test("zajednica: objava, glasovi, korisni odgovori i partner za učenje", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    const jova = await seedUser(t, { email: "jova@example.com" });
    const { courseId } = await seedCourse(t, "zajednica", { lessons: 1 });

    const insertPost = (authorId: Id<"users">, status: "published" | "draft", upvoteCount: number) =>
      t.run((ctx) =>
        ctx.db.insert("communityPosts", {
          authorId,
          language: "sr" as const,
          title: "Kako da počnem?",
          body: "Pitanje.",
          visibility: "members" as const,
          status,
          upvoteCount,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      );

    // Nacrt sa mnogo glasova se ne računa ni kao objava ni kao „omiljen".
    await insertPost(mila.userId, "draft", 50);
    let progress = await progressOf(mila, MON);
    expect(stateOf(progress, "prva-objava")).toBe("locked");
    expect(badgeOf(progress, "omiljen")).toMatchObject({ state: "locked", progress: { current: 0, target: 10 } });

    const postId = await insertPost(mila.userId, "published", 9);
    await t.run((ctx) =>
      ctx.db.insert("profileContributions", {
        userId: mila.userId,
        postId,
        hasThread: true,
        hasComments: false,
        threadCount: 1,
        commentCount: 0,
        lastActivityAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    progress = await progressOf(mila, MON);
    expect(stateOf(progress, "prva-objava")).toBe("fresh");
    expect(badgeOf(progress, "omiljen")).toMatchObject({ state: "locked", progress: { current: 9, target: 10 } });
    await t.run((ctx) => ctx.db.patch(postId, { upvoteCount: 10 }));
    expect(stateOf(await progressOf(mila, MON), "omiljen")).toBe("fresh");

    await xpEvent(t, mila.userId, "helpful_comment", "komentar-1");
    progress = await progressOf(mila, MON);
    expect(stateOf(progress, "koristan-odgovor")).toBe("fresh");
    expect(badgeOf(progress, "mentor")).toMatchObject({ state: "locked", progress: { current: 1, target: 5 } });
    for (let i = 2; i <= 5; i += 1) await xpEvent(t, mila.userId, "helpful_comment", `komentar-${i}`);
    expect(stateOf(await progressOf(mila, MON), "mentor")).toBe("fresh");

    // Drugi put do „Mentora": partner za učenje, bez ijednog korisnog odgovora.
    expect(stateOf(await progressOf(jova, MON), "mentor")).toBe("locked");
    await t.run(async (ctx) => {
      const base = { pairKey: "par", courseId, createdAt: 1, updatedAt: 1 };
      const inviteId = await ctx.db.insert("studyPartnerInvites", { ...base, senderId: jova.userId, recipientId: mila.userId, status: "accepted" });
      const partnershipId = await ctx.db.insert("studyPartnerships", { ...base, userAId: jova.userId, userBId: mila.userId, createdFromInviteId: inviteId });
      await ctx.db.insert("studyPartnershipMembers", { partnershipId, userId: jova.userId, partnerId: mila.userId, courseId, createdAt: 1, updatedAt: 1 });
    });
    expect(stateOf(await progressOf(jova, MON), "mentor")).toBe("fresh");
  });

  test("top 10 nedeljne liste: 12 korisnika, granica mesta, prag XP-a i osoblje", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    // 11 drugih učenika: 1.200, 1.100 … 200 XP ove nedelje.
    for (let i = 0; i < 11; i += 1) {
      const other = await seedUser(t, { email: `ucenik${i}@example.com` });
      await setStats(t, other.userId, { xp: 1200 - i * 100, period: "week" });
    }
    // Osoblje ima najviše XP-a, ali nije na listi i nikome ne zauzima mesto.
    const staff = await seedUser(t, { email: "moderator@example.com", role: "moderator" });
    await setStats(t, staff.userId, { xp: 9000, period: "week", eligible: false });

    // 250 XP: deset učenika je ispred - 11. mesto.
    await setStats(t, mila.userId, { xp: 250, period: "week" });
    let progress = await progressOf(mila, WED);
    expect(progress.weekXp).toBe(250);
    expect(progress.weekRank).toBe(11);
    expect(stateOf(progress, "top-10")).toBe("locked");

    // 300 XP: deli 10. mesto (isti XP nije „ispred").
    await setStats(t, mila.userId, { xp: 300, period: "week" });
    progress = await progressOf(mila, WED);
    expect(stateOf(progress, "top-10")).toBe("fresh");
    expect(progress.fresh.badges).toEqual(["top-10"]);

    // Moje mesto na nedeljnoj listi je isto ono koje pokazuje postojeća rang-lista.
    expect(progress.weekRank).toBe(10);
    const row = await mila.as.query(api.leaderboard.getViewerLeaderboardRow, { scope: { kind: "global" }, period: "week" });
    expect(row).toMatchObject({ eligible: true, row: { rank: progress.weekRank, xp: 300 } });

    const staffProgress = await progressOf(staff, WED);
    expect(stateOf(staffProgress, "top-10")).toBe("locked");
    expect(staffProgress).toMatchObject({ eligible: false, weekXp: 9000, weekRank: null });

    // Bedž je viđen; sledeće nedelje Mila nije ni blizu vrha, a bedž ostaje.
    await mila.as.mutation(api.igra.markSeen, { keys: ["badge:top-10"] });
    vi.setSystemTime(summer("2026-07-20", "10:00"));
    progress = await progressOf(mila, "2026-07-20");
    expect(progress.weekXp).toBe(0);
    expect(progress.weekRank).toBeNull();
    expect(stateOf(progress, "top-10")).toBe("unlocked");
  });

  test("mesto na nedeljnoj listi: prva sam bez ikoga ispred, a čitanje staje na 100 redova", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    await setStats(t, mila.userId, { xp: 50, period: "week" });
    expect((await progressOf(mila, MON)).weekRank).toBe(1);

    // 99 učenika ispred, svaki sa drugim XP-om: 100. mesto, isto kao na rang-listi.
    const others: Id<"users">[] = [];
    for (let i = 0; i < 100; i += 1) others.push((await seedUser(t, { email: `lista${i}@example.com` })).userId);
    for (let i = 0; i < 99; i += 1) await setStats(t, others[i]!, { xp: 1000 + i, period: "week" });
    expect((await progressOf(mila, MON)).weekRank).toBe(100);
    const row = await mila.as.query(api.leaderboard.getViewerLeaderboardRow, { scope: { kind: "global" }, period: "week" });
    expect(row.row?.rank).toBe(100);

    // Stoti red ispred: upit u ljusci više ne broji (tačno mesto ostaje u rang-listi).
    await setStats(t, others[99]!, { xp: 2000, period: "week" });
    expect((await progressOf(mila, MON)).weekRank).toBeNull();
    expect((await mila.as.query(api.leaderboard.getViewerLeaderboardRow, { scope: { kind: "global" }, period: "week" })).row?.rank).toBe(101);
  });

  test("top 10: ispod 100 XP nedeljno se ne računa; važi i prošla nedelja", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    await setStats(t, mila.userId, { xp: 90, period: "week" });
    // Prva na listi, ali sa 90 XP: ponedeljak ujutru ne deli bedž.
    expect(stateOf(await progressOf(mila, MON), "top-10")).toBe("locked");
    // Na listi sa manje od 10 ljudi dovoljno je 100 XP te nedelje (jedna lekcija).
    await setStats(t, mila.userId, { xp: 100, period: "week" });
    expect(stateOf(await progressOf(mila, MON), "top-10")).toBe("fresh");

    // Sledećeg ponedeljka nema XP-a ove nedelje, ali prošla nedelja još važi.
    const next = await progressOf(mila, NEXT_MON);
    expect(next.weekXp).toBe(0);
    expect(stateOf(next, "top-10")).toBe("fresh");
    // Dve nedelje kasnije više ne.
    expect(stateOf(await progressOf(mila, "2026-07-20"), "top-10")).toBe("locked");
  });
});

describe("igra.markSeen", () => {
  test("traži prijavu", async () => {
    const t = makeT();
    await expect(t.mutation(api.igra.markSeen, { keys: ["summary"] })).rejects.toThrow("Unauthorized");
  });

  test("upisuje samo zarađeno, jednom, i samo svoje", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    const jova = await seedUser(t, { email: "jova@example.com" });
    await seedBusyWeek(t);
    const course = await seedCourse(t, "prvi", { lessons: 2 });
    const other = await seedCourse(t, "drugi", { lessons: 1 });
    await completeLesson(mila, course.lessonIds[0]!);

    // Klijent traži više nego što je zaradio: nezarađen bedž, tuđ nivo, nezavršen kurs, đubre.
    const keys = [
      "badge:prva-lekcija",
      "level:2",
      "badge:sto-radova",
      "badge:top-10",
      "badge:nepostoji",
      "level:12",
      "level:1",
      `course:${course.courseId}`,
      `course:${other.courseId}`,
      "toString",
      "",
    ];
    await mila.as.mutation(api.igra.markSeen, { keys });
    expect((await ledgerOf(t, mila.userId)).sort()).toEqual(["badge:prva-lekcija", "level:2"]);

    // Ponovljen poziv (i duplikati u istom pozivu) ne upisuju ništa novo.
    await mila.as.mutation(api.igra.markSeen, { keys: [...keys, ...keys] });
    await mila.as.mutation(api.igra.markSeen, { keys: ["summary", "summary"] });
    await mila.as.mutation(api.igra.markSeen, { keys: ["summary"] });
    expect((await ledgerOf(t, mila.userId)).sort()).toEqual(["badge:prva-lekcija", "level:2", "summary"]);

    // Jova nije ništa zaradio: Milini ključevi njemu ne prolaze, a Milin dnevnik ostaje isti.
    await jova.as.mutation(api.igra.markSeen, { keys: ["badge:prva-lekcija", "level:2"] });
    expect(await ledgerOf(t, jova.userId)).toEqual([]);
    expect((await progressOf(jova, MON)).fresh.ledgerEmpty).toBe(true);
    expect(await ledgerOf(t, mila.userId)).toHaveLength(3);
  });

  test("bedž iz dnevnika ostaje i kad pravilo prestane da važi", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    await seedBusyWeek(t);
    const course = await seedCourse(t, "jedan", { lessons: 1 });
    await completeLesson(mila, course.lessonIds[0]!);
    await mila.as.mutation(api.igra.markSeen, { keys: ["badge:prva-lekcija", "badge:prvi-kurs", `course:${course.courseId}`, "level:2"] });

    // Lekcija je vraćena na „nije završena": XP i brojači padaju, dnevnik ne.
    await completeLesson(mila, course.lessonIds[0]!, false);
    const progress = await progressOf(mila, MON);
    expect(progress.xp).toBe(0);
    expect(progress.level.level).toBe(1);
    expect(stateOf(progress, "prva-lekcija")).toBe("unlocked");
    expect(stateOf(progress, "prvi-kurs")).toBe("unlocked");
    expect(progress.fresh).toEqual({ level: null, badges: [], courses: [], ledgerEmpty: false });

    // Ponovo završena: ništa se ne slavi drugi put.
    await completeLesson(mila, course.lessonIds[0]!);
    expect((await progressOf(mila, MON)).fresh).toEqual({ level: null, badges: [], courses: [], ledgerEmpty: false });
  });

  test("najviše 40 ključeva po pozivu", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    const course = await seedCourse(t, "limit", { lessons: 1 });
    await completeLesson(mila, course.lessonIds[0]!);
    const noise = Array.from({ length: 40 }, (_, i) => `sum:${i}`);
    await mila.as.mutation(api.igra.markSeen, { keys: [...noise, "badge:prva-lekcija"] });
    expect(await ledgerOf(t, mila.userId)).toEqual([]);
    await mila.as.mutation(api.igra.markSeen, { keys: [...noise.slice(1), "badge:prva-lekcija"] });
    expect(await ledgerOf(t, mila.userId)).toEqual(["badge:prva-lekcija"]);
  });
});

describe("igra.getMemberProgress", () => {
  test("traži prijavu; nepostojeći i spojen nalog nemaju napredak", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    await expect(t.query(api.igra.getMemberProgress, { username: "mila", todayKey: MON })).rejects.toThrow("Unauthorized");
    expect(await mila.as.query(api.igra.getMemberProgress, { username: "niko", todayKey: MON })).toBeNull();
    expect(await mila.as.query(api.igra.getMemberProgress, { username: "   ", todayKey: MON })).toBeNull();

    const old = await seedUser(t, { email: "stari@example.com" });
    await t.run((ctx) => ctx.db.patch(old.userId, { mergedInto: mila.userId }));
    expect(await mila.as.query(api.igra.getMemberProgress, { username: "stari", todayKey: MON })).toBeNull();
  });

  test("drugi vide samo dnevnik i samo ono što je javno", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    const jova = await seedUser(t, { email: "jova@example.com" });
    await seedBusyWeek(t);
    const course = await seedCourse(t, "javno", { lessons: 5 });

    // Mila: lekcija u 23 h (noćna sova), video u Crei, pa još četiri lekcije.
    vi.setSystemTime(summer(MON, "23:00"));
    await completeLesson(mila, course.lessonIds[0]!);
    await finishWork(t, mila.userId, { kind: "video", modelSlug: "grok-video-15-lite" });
    const earned = (await progressOf(mila, MON)).fresh.badges;
    expect(earned).toEqual(["prva-lekcija", "nocna-sova", "prvi-rad", "prvi-video"]);

    // Dok Mila ne vidi svoje bedževe, ni drugi ih ne vide (pravila se za drugoga ne računaju).
    const before = (await jova.as.query(api.igra.getMemberProgress, { username: "Mila", todayKey: MON }))!;
    expect(before.badges.map((badge) => badge.key)).toEqual(IGRA_BADGE_KEYS);
    expect(before.badges.filter((badge) => badge.state === "unlocked")).toEqual([]);

    await mila.as.mutation(api.igra.markSeen, { keys: [...earned.map((key) => `badge:${key}`), "level:2"] });
    const member = (await jova.as.query(api.igra.getMemberProgress, { username: "mila", todayKey: MON }))!;
    // 140 XP = nivo 2 na skali IGRA-e.
    expect(member.xp).toBe(LEADERBOARD_XP.lesson + LEADERBOARD_XP.crea_first_work + LEADERBOARD_XP.crea_daily_work);
    expect(member.level).toMatchObject({ level: 2, name: { sr: "Radoznalac", en: "Curious" } });
    expect(member.banner).toBeNull();
    const states = Object.fromEntries(member.badges.map((badge) => [badge.key, badge.state]));
    expect(states["prva-lekcija"]).toBe("unlocked");
    expect(states["pet-lekcija"]).toBe("locked");
    // Vreme učenja nije javno: i zarađena „Noćna sova" i nezarađen „Rani pevac" su skriveni.
    expect(states["nocna-sova"]).toBe("hidden");
    expect(states["rani-pevac"]).toBe("hidden");
    // Crea grupa i nizovi su skriveni dok đačka knjižica nije javna; „Mentor" dok broj
    // korisnih odgovora nije dovoljan (partnerstvo za učenje nije javno).
    const crea: IgraBadgeKey[] = ["prvi-rad", "deset-radova", "sto-radova", "prvi-video", "prvi-zvuk", "recept", "tehnika", "izazov"];
    for (const key of [...crea, "niz-3", "niz-7", "niz-30", "mentor"] as const) expect(states[key], key).toBe("hidden");
    expect(member.badges.filter((badge) => badge.state === "hidden")).toHaveLength(14);

    await mila.as.mutation(api.creaGame.setReportCardPublic, { reportCardPublic: true });
    const open = Object.fromEntries((await jova.as.query(api.igra.getMemberProgress, { username: "mila", todayKey: MON }))!.badges.map((badge) => [badge.key, badge.state]));
    expect(open["prvi-rad"]).toBe("unlocked");
    expect(open["prvi-video"]).toBe("unlocked");
    expect(open["prvi-zvuk"]).toBe("locked");
    expect(open["niz-3"]).toBe("locked");
    expect(open["nocna-sova"]).toBe("hidden");
    // Broj radova nema ni javna knjižica.
    expect(open["deset-radova"]).toBe("hidden");
    expect(open["sto-radova"]).toBe("hidden");

    // Vlasnik na svom profilu vidi sve svoje, i bez javne knjižice.
    await mila.as.mutation(api.creaGame.setReportCardPublic, { reportCardPublic: false });
    const own = Object.fromEntries((await mila.as.query(api.igra.getMemberProgress, { username: "mila", todayKey: MON }))!.badges.map((badge) => [badge.key, badge.state]));
    expect(own["nocna-sova"]).toBe("unlocked");
    expect(own["prvi-video"]).toBe("unlocked");
    expect(Object.values(own)).not.toContain("hidden");
  });

  test("neispravan dan se odbija", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    await expect(mila.as.query(api.igra.getMemberProgress, { username: "mila", todayKey: "juče" })).rejects.toThrow("NEISPRAVAN_DAN");
  });

  test("niz, broj radova i „Mentor“: drugi ih vide samo kad je to i danas javno", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    const jova = await seedUser(t, { email: "jova@example.com" });
    // Dnevnik kao posle Milinih slavlja: niz od 7 dana, 10 radova i „Mentor" preko partnera.
    await t.run(async (ctx) => {
      for (const key of ["niz-3", "niz-7", "deset-radova", "mentor"]) {
        await ctx.db.insert("igraSeen", { userId: mila.userId, key: `badge:${key}`, seenAt: 1 });
      }
    });
    const seenBy = async (viewer: Seeded) =>
      Object.fromEntries((await viewer.as.query(api.igra.getMemberProgress, { username: "mila", todayKey: MON }))!.badges.map((badge) => [badge.key, badge.state]));

    // Privatna knjižica i 0 korisnih odgovora: ništa od toga drugi ne vide.
    let states = await seenBy(jova);
    for (const key of ["niz-3", "niz-7", "niz-30", "deset-radova", "mentor"]) expect(states[key], key).toBe("hidden");

    // Javna knjižica već pokazuje niz, ali ne i broj radova.
    await mila.as.mutation(api.creaGame.setReportCardPublic, { reportCardPublic: true });
    states = await seenBy(jova);
    expect(states["niz-3"]).toBe("unlocked");
    expect(states["niz-7"]).toBe("unlocked");
    expect(states["niz-30"]).toBe("locked");
    expect(states["deset-radova"]).toBe("hidden");
    expect(states.mentor).toBe("hidden");

    // „Mentor" je javan tek uz javan broj korisnih odgovora (`getPublicProfile.stats`).
    await t.run((ctx) =>
      ctx.db.insert("leaderboardStats", {
        userId: mila.userId,
        scopeKind: "global",
        scopeKey: "global",
        period: "all_time",
        periodKey: "all",
        xp: 100,
        completedLessons: 0,
        completedTasks: 0,
        helpfulAnswers: MENTOR_HELPFUL_ANSWERS,
        eligible: true,
        updatedAt: 1,
      }),
    );
    expect((await seenBy(jova)).mentor).toBe("unlocked");

    // Vlasnik vidi sve svoje.
    states = await seenBy(mila);
    for (const key of ["niz-3", "niz-7", "deset-radova", "mentor"]) expect(states[key], key).toBe("unlocked");
  });

  test("radovi za godinu: samo vlasniku, ni uz javnu knjižicu", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    const jova = await seedUser(t, { email: "jova@example.com" });
    await finishWork(t, mila.userId);
    await finishWork(t, mila.userId);
    // Stari dani: 364 dana unazad ulazi u godinu, 365 ne ulazi.
    await t.run(async (ctx) => {
      for (const [daysAgo, creaWorks] of [[364, 3], [365, 50]] as const) {
        const dayKey = new Date(Date.parse(`${MON}T12:00:00Z`) - daysAgo * 86_400_000).toISOString().slice(0, 10);
        await ctx.db.insert("profileActivityDays", { userId: mila.userId, dayKey, lessons: 0, tasks: 0, threads: 0, comments: 0, creaWorks, updatedAt: 1 });
      }
    });

    expect((await mila.as.query(api.igra.getMemberProgress, { username: "mila", todayKey: MON }))!.works).toBe(5);
    expect((await jova.as.query(api.igra.getMemberProgress, { username: "mila", todayKey: MON }))!.works).toBeNull();
    // Javna knjižica obećava „ime, korisničko ime i ocene - ništa drugo", a pomeranjem
    // `todayKey` drugi bi mogao da rekonstruiše dane, pa broj ostaje samo vlasniku.
    await mila.as.mutation(api.creaGame.setReportCardPublic, { reportCardPublic: true });
    expect((await jova.as.query(api.igra.getMemberProgress, { username: "mila", todayKey: MON }))!.works).toBeNull();
    expect((await jova.as.query(api.igra.getMemberProgress, { username: "mila", todayKey: TUE }))!.works).toBeNull();
  });

  test("osoblje nema nivo ni XP, kao na profilu danas", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    const moderator = await seedUser(t, { email: "moderator@example.com", role: "moderator" });
    await setStats(t, moderator.userId, { xp: 5000, eligible: false });
    const member = (await mila.as.query(api.igra.getMemberProgress, { username: "moderator", todayKey: MON }))!;
    expect(member.xp).toBeNull();
    expect(member.level).toBeNull();
    expect(member.badges).toHaveLength(24);
  });
});

describe("igra.setBanner", () => {
  test("traži prijavu i poznat baner", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    await expect(t.mutation(api.igra.setBanner, { banner: "sveska" })).rejects.toThrow("Unauthorized");
    await expect(mila.as.mutation(api.igra.setBanner, { banner: "baner.sveska" })).rejects.toThrow("NEPOZNAT_BANER");
    await expect(mila.as.mutation(api.igra.setBanner, { banner: "zlato" })).rejects.toThrow("NEPOZNAT_BANER");
  });

  test("otključava se nivoom koji računa server, i vidi se na profilu", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    const jova = await seedUser(t, { email: "jova@example.com" });

    // Nivo 1: samo podrazumevana sveska.
    await expect(mila.as.mutation(api.igra.setBanner, { banner: "laboratorija" })).rejects.toThrow("BANER_ZAKLJUCAN");
    expect((await progressOf(mila, MON)).banner).toBeNull();
    await mila.as.mutation(api.igra.setBanner, { banner: "sveska" });
    expect((await progressOf(mila, MON)).banner).toBe("sveska");

    // 300 XP = nivo 3: laboratorija da, studio (nivo 5) ne.
    await setStats(t, mila.userId, { xp: 300 });
    await mila.as.mutation(api.igra.setBanner, { banner: "laboratorija" });
    await expect(mila.as.mutation(api.igra.setBanner, { banner: "studio" })).rejects.toThrow("BANER_ZAKLJUCAN");
    expect((await progressOf(mila, MON)).banner).toBe("laboratorija");
    expect((await jova.as.query(api.igra.getMemberProgress, { username: "mila", todayKey: MON }))!.banner).toBe("laboratorija");

    // XP padne ispod praga: profil se vraća na podrazumevani, izbor ostaje sačuvan.
    await setStats(t, mila.userId, { xp: 299 });
    expect((await progressOf(mila, MON)).banner).toBeNull();
    expect((await jova.as.query(api.igra.getMemberProgress, { username: "mila", todayKey: MON }))!.banner).toBeNull();
    expect(await t.run(async (ctx) => (await ctx.db.get(mila.userId))!.igraBanner)).toBe("laboratorija");
    await setStats(t, mila.userId, { xp: 20000 });
    expect((await progressOf(mila, MON)).banner).toBe("laboratorija");
    await mila.as.mutation(api.igra.setBanner, { banner: "okean" });
    expect((await progressOf(mila, MON)).banner).toBe("okean");
  });

  test("menja samo svoj profil i ništa ne dodeljuje", async () => {
    const t = makeT();
    const mila = await seedUser(t);
    const jova = await seedUser(t, { email: "jova@example.com" });
    await setStats(t, mila.userId, { xp: 1400 });
    const before = await t.run(async (ctx) => (await ctx.db.query("leaderboardStats").take(10)).map((row) => row.xp));
    await mila.as.mutation(api.igra.setBanner, { banner: "studio" });
    expect(await t.run(async (ctx) => (await ctx.db.get(jova.userId))!.igraBanner ?? null)).toBeNull();
    expect(await t.run(async (ctx) => (await ctx.db.query("leaderboardStats").take(10)).map((row) => row.xp))).toEqual(before);
    expect(await ledgerOf(t, mila.userId)).toEqual([]);
  });
});

describe("ključevi dnevnika (čiste funkcije)", () => {
  test("server (`freshSeenKeys`) i domaćin slavlja (`planCelebrations`) grade iste ključeve", () => {
    const fresh = {
      level: 3,
      badges: ["prva-lekcija", "niz-3", "mentor"] as IgraBadgeKey[],
      courses: [{ key: "course:kurs1", title: { sr: "Kurs", en: "Course" } }],
      ledgerEmpty: false,
    };
    expect(badgeSeenKey("niz-3")).toBe("badge:niz-3");
    expect(freshSeenKeys(fresh)).toEqual(["level:3", "badge:prva-lekcija", "badge:niz-3", "badge:mentor", "course:kurs1"]);
    expect([...planCelebrations(fresh, false).markKeys].sort()).toEqual([...freshSeenKeys(fresh)].sort());
    // Zbir prvog kontakta dodaje samo `summary`, koji `markSeen` uvek pušta.
    expect(planCelebrations(fresh, true).markKeys.filter((key) => !freshSeenKeys(fresh).includes(key))).toEqual(["summary"]);
    expect(freshSeenKeys({ level: null, badges: [], courses: [], ledgerEmpty: false })).toEqual([]);
  });
});

describe("samo prikaz (O6)", () => {
  const source = ["igra.ts", "igraCore.ts"].map((file) => readFileSync(join(__dirname, file), "utf8")).join("\n");

  test("IGRA ne dodeljuje XP, kredite ni nagrade", () => {
    expect(source).not.toMatch(/applyGrant|creditLots|creditTransactions|awardCreaXp|syncLeaderboardSourceEvent|LEADERBOARD_XP|stripe/i);
  });

  test("jedini upisi su dnevnik viđenog i izbor banera (K13)", () => {
    const writes = [...source.matchAll(/ctx\.db\.(insert|patch|replace|delete)\(([^,)]*)/g)].map((match) => `${match[1]} ${match[2]}`);
    expect(writes).toEqual(['patch "users"', 'insert "igraSeen"']);
    // Baner menja samo jedno polje profila.
    expect(source).toContain('ctx.db.patch("users", userId, { igraBanner: args.banner })');
  });

  test("nijedno čitanje nije neograničeno", () => {
    expect(source).not.toMatch(/\.collect\(\)|\.paginate\(|for await/);
  });
});
