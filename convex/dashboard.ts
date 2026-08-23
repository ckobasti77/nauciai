import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import {
  computeChatInboxSummary,
  getChatInboxAggregateSummary,
} from "./chatInboxSummaryCore";
import { globalCommunityScope } from "./communityScope";
import { courseReadiness } from "./contentReadiness";
import { currentUserId, getCurrentProfile } from "./helpers";
import { getViewerLeaderboardRowCore } from "./leaderboardReadCore";
import { getCommunityNotificationCountsHelper } from "./notifications";
import { getStudyHubAggregateSummary } from "./studyHubSummaryCore";

// Jedan agregatni query koji hrani celu komandnu tablu (`/app`), umesto sedam
// nezavisnih subscription-a. Kompozicija ide preko postojećih core helper-a i
// direktnih projekcija tabela; svaka lista je `.take(3)` na serveru, a `admin`
// grana se računa samo za administratora. Oblik je fiksan — Dashboard UI (faza 3b)
// renderuje tačno ovo. Vraća `null` za neautentifikovanog korisnika.

const SNIPPET_MAX = 120;
const localizedText = v.object({ sr: v.string(), en: v.string() });

function truncateSnippet(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > SNIPPET_MAX ? `${trimmed.slice(0, SNIPPET_MAX).trimEnd()}…` : trimmed;
}

// ── resume / progress / nextLessons ─────────────────────────────────────────
// Lean putanja: NE koristi `courses.getAppNavigation` (čita sve lessonParts bodies
// i potpisuje 2 URL/kurs). Ovde čitamo objavljene kurseve + njihove lekcije +
// progres viewer-a, i potpisujemo samo cover resume-kursa.
async function studentCoursesSlice(ctx: QueryCtx, userId: Id<"users">) {
  const courses = await ctx.db
    .query("courses")
    .withIndex("by_status", (q) => q.eq("status", "published"))
    .take(50);
  if (courses.length === 0) {
    return { resume: null, progress: { completedLessons: 0, totalLessons: 0, percent: 0 }, nextLessons: [] };
  }

  const progressRows = await ctx.db
    .query("progress")
    .withIndex("by_user_course", (q) => q.eq("userId", userId))
    .take(1000);
  const progressByLesson = new Map(progressRows.map((row) => [row.lessonId, row]));

  type CourseEntry = {
    course: Doc<"courses">;
    lessons: Doc<"lessons">[];
    total: number;
    lastActivityAt: number;
    nextLesson: Doc<"lessons"> | null;
  };
  const perCourse: CourseEntry[] = [];
  let completedLessons = 0;
  let totalLessons = 0;

  for (const course of courses) {
    const lessons = (
      await ctx.db
        .query("lessons")
        .withIndex("by_course_and_sortOrder", (q) => q.eq("courseId", course._id))
        .take(1000)
    ).filter((lesson) => lesson.isPublished);

    let lastActivityAt = 0;
    let nextLesson: Doc<"lessons"> | null = null;
    for (const lesson of lessons) {
      const row = progressByLesson.get(lesson._id);
      if (row?.completed) {
        completedLessons += 1;
      } else if (!nextLesson) {
        nextLesson = lesson;
      }
      if (row && row.updatedAt > lastActivityAt) {
        lastActivityAt = row.updatedAt;
      }
    }
    totalLessons += lessons.length;
    perCourse.push({ course, lessons, total: lessons.length, lastActivityAt, nextLesson });
  }

  const percent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  // Resume: najskorije aktivan kurs koji još ima sledeću lekciju; ako viewer nema
  // nijedan progres, prvi objavljen kurs sa objavljenom lekcijom ("Započni").
  const engaged = perCourse
    .filter((entry) => entry.lastActivityAt > 0)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  const resumeEntry =
    engaged.find((entry) => entry.nextLesson) ?? perCourse.find((entry) => entry.nextLesson) ?? null;

  let resume = null;
  if (resumeEntry?.nextLesson) {
    const lesson = resumeEntry.nextLesson;
    const position = resumeEntry.lessons.findIndex((item) => item._id === lesson._id) + 1;
    resume = {
      courseSlug: resumeEntry.course.slug,
      lessonSlug: lesson.slug,
      courseTitle: { sr: resumeEntry.course.titleSr, en: resumeEntry.course.titleEn },
      lessonTitle: { sr: lesson.titleSr, en: lesson.titleEn },
      position,
      total: resumeEntry.total,
      coverUrl: resumeEntry.course.coverStorageId
        ? await ctx.storage.getUrl(resumeEntry.course.coverStorageId)
        : null,
    };
  }

  // Sledeće lekcije (max 3): najpre iz aktivnih kurseva, pa iz ostalih.
  const ordered = [...engaged, ...perCourse.filter((entry) => entry.lastActivityAt === 0)];
  const nextLessons: Array<{
    courseSlug: string;
    lessonSlug: string;
    title: { sr: string; en: string };
    durationSeconds: number;
  }> = [];
  for (const entry of ordered) {
    for (const lesson of entry.lessons) {
      if (nextLessons.length >= 3) break;
      if (!progressByLesson.get(lesson._id)?.completed) {
        nextLessons.push({
          courseSlug: entry.course.slug,
          lessonSlug: lesson.slug,
          title: { sr: lesson.titleSr, en: lesson.titleEn },
          durationSeconds: lesson.durationSeconds,
        });
      }
    }
    if (nextLessons.length >= 3) break;
  }

  return { resume, progress: { completedLessons, totalLessons, percent }, nextLessons };
}

// ── messages (nepročitane konverzacije) ─────────────────────────────────────
// unreadTotal preko iste 3-tier logike kao `chat.getInboxSummary`; items su lean
// projekcija (podskup `chat.inboxItem`) nad `chatMembers` sa hasUnread=true.
async function messagesSlice(ctx: QueryCtx, userId: Id<"users">) {
  const summary = await ctx.db
    .query("chatInboxSummaries")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  let unreadTotal: number;
  if (summary?.aggregateReady) {
    unreadTotal = (await getChatInboxAggregateSummary(ctx, userId)).totalUnread;
  } else if (summary?.ready) {
    unreadTotal = summary.totalUnread;
  } else {
    unreadTotal = (await computeChatInboxSummary(ctx, userId)).totalUnread;
  }

  const memberships = await ctx.db
    .query("chatMembers")
    .withIndex("by_userId_and_hasUnread_and_lastDeliveredAt", (q) =>
      q.eq("userId", userId).eq("hasUnread", true),
    )
    .order("desc")
    .take(3);

  const items: Array<{
    conversationId: Id<"chatConversations">;
    title: string | null;
    snippet: string | null;
    at: number | null;
    avatarUrl: string | null;
  }> = [];
  for (const membership of memberships) {
    if (membership.status === "left" || membership.status === "removed") continue;
    const conversation = await ctx.db.get(membership.conversationId);
    if (!conversation || conversation.deletedAt) continue;

    let title = conversation.title ?? null;
    let avatarUrl: string | null = null;
    if (conversation.kind !== "group") {
      const others = await ctx.db
        .query("chatMembers")
        .withIndex("by_conversationId_and_status_and_joinedAt", (q) =>
          q.eq("conversationId", conversation._id).eq("status", "active"),
        )
        .take(3);
      const other = others.find((row) => row.userId !== userId);
      if (other) {
        const user = await ctx.db.get(other.userId);
        title = user?.name ?? title;
        avatarUrl = user?.avatarUrl ?? user?.image ?? null;
      }
    } else if (conversation.imageStorageId) {
      avatarUrl = await ctx.storage.getUrl(conversation.imageStorageId);
    }

    let snippet: string | null = null;
    if (conversation.lastMessageSequence) {
      const last = await ctx.db
        .query("chatMessages")
        .withIndex("by_conversationId_and_sequence", (q) =>
          q.eq("conversationId", conversation._id).eq("sequence", conversation.lastMessageSequence!),
        )
        .unique();
      const body = last && !last.deletedAt ? last.body : undefined;
      snippet = body ? truncateSnippet(body) : null;
    }

    items.push({
      conversationId: conversation._id,
      title,
      snippet,
      at: conversation.lastMessageAt ?? null,
      avatarUrl,
    });
  }

  return { unreadTotal, items };
}

// ── community (nove teme) ───────────────────────────────────────────────────
async function communityItems(ctx: QueryCtx) {
  const posts = await ctx.db
    .query("communityPosts")
    .withIndex("by_status_and_createdAt", (q) => q.eq("status", "published"))
    .order("desc")
    .take(3);
  return Promise.all(
    posts.map(async (post) => {
      const author = await ctx.db.get(post.authorId);
      return {
        postId: post._id,
        title: post.title,
        author: author?.name ?? author?.username ?? "Član zajednice",
        replies: post.commentCount ?? 0,
        at: post.createdAt,
      };
    }),
  );
}

// ── notifications (najnovija) ───────────────────────────────────────────────
async function notificationItems(ctx: QueryCtx, userId: Id<"users">) {
  const rows = await ctx.db
    .query("notifications")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(3);
  return rows.map((row) => ({
    kind: row.kind ?? "system",
    title: row.title,
    at: row.createdAt,
    href: row.postId ? `/app/community/${row.postId}` : "/app/community/notifications",
  }));
}

// ── studio (poslednja generisanja) ──────────────────────────────────────────
async function studioSlice(ctx: QueryCtx, userId: Id<"users">) {
  const [balanceRow, jobs] = await Promise.all([
    ctx.db.query("creditBalances").withIndex("by_user", (q) => q.eq("userId", userId)).unique(),
    ctx.db
      .query("generationJobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(3),
  ]);
  const items = await Promise.all(
    jobs.map(async (job) => {
      const storageId = job.posterStorageId ?? job.outputStorageId;
      return {
        jobId: job._id,
        kind: job.kind,
        thumbUrl: storageId ? await ctx.storage.getUrl(storageId) : null,
        at: job.completedAt ?? job.createdAt,
      };
    }),
  );
  return { creditsBalance: balanceRow?.balance ?? 0, items };
}

// ── study (pozivnice / partneri) ────────────────────────────────────────────
async function studySlice(ctx: QueryCtx, userId: Id<"users">) {
  const summary = await getStudyHubAggregateSummary(ctx, userId);
  return { pendingInvites: summary.pendingPartnerInviteCount, partners: summary.activePartnershipCount };
}

// ── admin (spremnost + na čekanju) — samo za administratora ──────────────────
async function adminSlice(ctx: QueryCtx, pendingApprovals: number) {
  const courses = await ctx.db
    .query("courses")
    .withIndex("by_status", (q) => q.eq("status", "published"))
    .take(50);
  let blocking = 0;
  for (const course of courses) {
    const readiness = await courseReadiness(ctx, course);
    blocking += readiness.items.filter((entry) => entry.blocking && !entry.ok).length;
  }
  return { pendingApprovals, readiness: { ready: blocking === 0, blocking } };
}

export const getDashboardOverview = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      resume: v.union(
        v.null(),
        v.object({
          courseSlug: v.string(),
          lessonSlug: v.string(),
          courseTitle: localizedText,
          lessonTitle: localizedText,
          position: v.number(),
          total: v.number(),
          coverUrl: v.union(v.string(), v.null()),
        }),
      ),
      progress: v.object({
        completedLessons: v.number(),
        totalLessons: v.number(),
        percent: v.number(),
      }),
      nextLessons: v.array(
        v.object({
          courseSlug: v.string(),
          lessonSlug: v.string(),
          title: localizedText,
          durationSeconds: v.number(),
        }),
      ),
      messages: v.object({
        unreadTotal: v.number(),
        items: v.array(
          v.object({
            conversationId: v.id("chatConversations"),
            title: v.union(v.string(), v.null()),
            snippet: v.union(v.string(), v.null()),
            at: v.union(v.number(), v.null()),
            avatarUrl: v.union(v.string(), v.null()),
          }),
        ),
      }),
      community: v.object({
        unreadNotifications: v.number(),
        items: v.array(
          v.object({
            postId: v.id("communityPosts"),
            title: v.string(),
            author: v.string(),
            replies: v.number(),
            at: v.number(),
          }),
        ),
      }),
      notifications: v.object({
        total: v.number(),
        items: v.array(
          v.object({
            kind: v.string(),
            title: v.string(),
            at: v.number(),
            href: v.string(),
          }),
        ),
      }),
      studio: v.object({
        creditsBalance: v.number(),
        items: v.array(
          v.object({
            jobId: v.id("generationJobs"),
            kind: v.string(),
            thumbUrl: v.union(v.string(), v.null()),
            at: v.number(),
          }),
        ),
      }),
      study: v.object({ pendingInvites: v.number(), partners: v.number() }),
      leaderboard: v.union(v.null(), v.object({ rank: v.number(), points: v.number() })),
      admin: v.union(
        v.null(),
        v.object({
          pendingApprovals: v.number(),
          readiness: v.object({ ready: v.boolean(), blocking: v.number() }),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return null;

    const { role } = await getCurrentProfile(ctx);
    const isAdmin = role === "admin";

    // Jedan poziv notifikacionih brojača (nosi i community i notifications count
    // i pendingApprovals) — ne dupliramo skeniranje nepročitanih.
    const counts = await getCommunityNotificationCountsHelper(ctx, userId);

    const [courses, messages, community, notifications, studio, study, leaderboard, admin] =
      await Promise.all([
        studentCoursesSlice(ctx, userId),
        messagesSlice(ctx, userId),
        communityItems(ctx),
        notificationItems(ctx, userId),
        studioSlice(ctx, userId),
        studySlice(ctx, userId),
        getViewerLeaderboardRowCore(ctx, userId, {
          scope: globalCommunityScope(),
          period: "week",
          role,
        }),
        isAdmin ? adminSlice(ctx, counts.pendingApprovals) : Promise.resolve(null),
      ]);

    return {
      resume: courses.resume,
      progress: courses.progress,
      nextLessons: courses.nextLessons,
      messages,
      community: { unreadNotifications: counts.community, items: community },
      notifications: { total: counts.total, items: notifications },
      studio,
      study,
      leaderboard: leaderboard.row ? { rank: leaderboard.row.rank, points: leaderboard.row.xp } : null,
      admin,
    };
  },
});
