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

// Vlasništvo kursa za PRIKAZ ("da li je student otključao kurs"), NE provera
// pristupa — pravila pristupa ostaju u `helpers.requireCourseAccess`. Isti pojam
// kao `courses.getAppNavigation` (`owned`): aktivan upis ili staff rola. Čita se
// jednom pa deli između `studentCoursesSlice` (filter resume/nextLessons) i
// `firstRunSlice` (štikliranje prvog koraka), da se nikad ne raziđu.
type Ownership = { isStaff: boolean; ownedCourseIds: Set<Id<"courses">> };

async function computeOwnership(ctx: QueryCtx, userId: Id<"users">, role: string | undefined): Promise<Ownership> {
  const isStaff = role === "admin" || role === "moderator" || role === "pro_student";
  const enrollments = await ctx.db
    .query("enrollments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(200);
  return {
    isStaff,
    ownedCourseIds: new Set(enrollments.filter((row) => row.status === "active").map((row) => row.courseId)),
  };
}

function truncateSnippet(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > SNIPPET_MAX ? `${trimmed.slice(0, SNIPPET_MAX).trimEnd()}…` : trimmed;
}

// ── resume / progress / nextLessons ─────────────────────────────────────────
// Lean putanja: NE koristi `courses.getAppNavigation` (čita sve lessonParts bodies
// i potpisuje 2 URL/kurs). Ranije je za SVAKI objavljeni kurs radila zaseban
// `lessons.take(1000)` — broj upita 2 + N, plafon 50.000 pročitanih dokumenata na
// najopterećenijoj strani. Sada je broj upita ~konstantan:
//   • `totalLessons` iz denormalizovanog `courses.publishedLessonCount`
//     (održava `courses.recomputePublishedLessonCount`);
//   • `completedLessons` i `lastActivityAt` po kursu iz već pročitanih `progress`
//     redova (`progress.courseId` je uvek `lesson.courseId`);
//   • lekcije se čitaju LENJO, samo za kurseve koje stvarno dodirnemo za
//     resume/nextLessons (tipično 1–2 kursa), pa se cover potpisuje samo za resume.
// Napomena o ponašanju (svesno prihvaćeno): `completedLessons`/`lastActivityAt`
// sada broje i progres na lekciji koja je naknadno sakrivena (isPublished=false),
// dok ju je ranija petlja preskakala. U uobičajenom slučaju (bez sakrivanja
// završenih lekcija) vrednosti su identične.
async function studentCoursesSlice(ctx: QueryCtx, userId: Id<"users">, ownership: Ownership) {
  const published = await ctx.db
    .query("courses")
    .withIndex("by_status", (q) => q.eq("status", "published"))
    .take(50);
  // Resume / nextLessons / progress SME da bira samo iz kurseva koje je student
  // otključao (isti pojam `owned` kao `courses.getAppNavigation`: aktivan upis ili
  // staff rola). Ranije je birao iz SVIH objavljenih kurseva, pa je „Nastavi lekciju"
  // i prozor „Sledeće lekcije" nudio lekcije zaključanih kurseva (UX-BOOST §1B dug).
  // Staff (kome je sve otključano) vidi sve, kao i u katalogu.
  const courses = ownership.isStaff
    ? published
    : published.filter((course) => ownership.ownedCourseIds.has(course._id));
  if (courses.length === 0) {
    return {
      resume: null,
      progress: { completedLessons: 0, totalLessons: 0, percent: 0 },
      nextLessons: [],
      activity: [],
    };
  }

  const progressRows = await ctx.db
    .query("progress")
    .withIndex("by_user_course", (q) => q.eq("userId", userId))
    .take(1000);
  const progressByLesson = new Map(progressRows.map((row) => [row.lessonId, row]));

  // Dnevni ritam za RITAM zonu (ActivityPanel): završene lekcije po UTC danu.
  // Nepromenjeno — kao i ranije gleda sve progres redove; `new Date(ms)` je
  // deterministički iz sačuvanog `updatedAt`, nije čitanje zidnog sata.
  const activityCounts = new Map<string, number>();
  for (const row of progressRows) {
    if (!row.completed) continue;
    const day = new Date(row.updatedAt).toISOString().slice(0, 10);
    activityCounts.set(day, (activityCounts.get(day) ?? 0) + 1);
  }
  const activity = [...activityCounts.entries()]
    .map(([day, completed]) => ({ day, completed }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const publishedCourseIds = new Set(courses.map((course) => course._id));

  // completedLessons + lastActivityAt po kursu iz progres redova (bez čitanja lekcija).
  let completedLessons = 0;
  const lastActivityByCourse = new Map<Id<"courses">, number>();
  for (const row of progressRows) {
    if (!publishedCourseIds.has(row.courseId)) continue;
    if (row.completed) completedLessons += 1;
    const prev = lastActivityByCourse.get(row.courseId) ?? 0;
    if (row.updatedAt > prev) lastActivityByCourse.set(row.courseId, row.updatedAt);
  }

  // Lenjo čitanje objavljenih lekcija kursa, sa kešom. Isti `take(1000)` pa filter
  // isPublished kao ranija petlja → identičan redosled i plafon po kursu.
  const lessonsCache = new Map<Id<"courses">, Doc<"lessons">[]>();
  const readPublishedLessons = async (courseId: Id<"courses">) => {
    let lessons = lessonsCache.get(courseId);
    if (!lessons) {
      lessons = (
        await ctx.db
          .query("lessons")
          .withIndex("by_course_and_sortOrder", (q) => q.eq("courseId", courseId))
          .take(1000)
      ).filter((lesson) => lesson.isPublished);
      lessonsCache.set(courseId, lessons);
    }
    return lessons;
  };

  // totalLessons iz denormalizovanog brojača; fallback na čitanje samo za kurseve
  // kojima brojač još nije popunjen (prozor pre `backfillPublishedLessonCount`).
  // Posle backfilla ova petlja ne radi nijedno čitanje.
  let totalLessons = 0;
  for (const course of courses) {
    if (typeof course.publishedLessonCount === "number") {
      totalLessons += course.publishedLessonCount;
    } else {
      totalLessons += (await readPublishedLessons(course._id)).length;
    }
  }
  const percent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  // Redosled kurseva identičan ranijem: angažovani (lastActivityAt desc, stabilno
  // po originalnom redosledu na jednakost) pa neangažovani u originalnom redosledu.
  const withOrder = courses.map((course, index) => ({
    course,
    index,
    lastActivityAt: lastActivityByCourse.get(course._id) ?? 0,
  }));
  const engaged = withOrder
    .filter((entry) => entry.lastActivityAt > 0)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt || a.index - b.index);
  const nonEngaged = withOrder.filter((entry) => entry.lastActivityAt === 0);
  const ordered = [...engaged, ...nonEngaged];

  // Jedan prolaz kroz `ordered`: prvi kurs sa neodrađenom lekcijom je resume
  // (ekvivalentno starom `engaged.find(nextLesson) ?? perCourse.find(nextLesson)`),
  // a nextLessons se pune istim redom do 3. Prekidamo čim je resume nađen i
  // nextLessons pun — lekcije se čitaju tipično za 1–2 kursa umesto za sve.
  const isUncompleted = (lesson: Doc<"lessons">) => !progressByLesson.get(lesson._id)?.completed;
  let resumeCourse: Doc<"courses"> | null = null;
  let resumeLesson: Doc<"lessons"> | null = null;
  let resumeLessons: Doc<"lessons">[] = [];
  const nextLessons: Array<{
    courseSlug: string;
    lessonSlug: string;
    title: { sr: string; en: string };
    durationSeconds: number;
  }> = [];
  for (const { course } of ordered) {
    const lessons = await readPublishedLessons(course._id);
    for (const lesson of lessons) {
      if (!isUncompleted(lesson)) continue;
      if (!resumeCourse) {
        resumeCourse = course;
        resumeLesson = lesson;
        resumeLessons = lessons;
      }
      if (nextLessons.length < 3) {
        nextLessons.push({
          courseSlug: course.slug,
          lessonSlug: lesson.slug,
          title: { sr: lesson.titleSr, en: lesson.titleEn },
          durationSeconds: lesson.durationSeconds,
        });
      }
      if (nextLessons.length >= 3) break;
    }
    if (resumeCourse && nextLessons.length >= 3) break;
  }

  let resume = null;
  if (resumeCourse && resumeLesson) {
    const course = resumeCourse;
    const lesson = resumeLesson;
    const position = resumeLessons.findIndex((item) => item._id === lesson._id) + 1;
    resume = {
      courseSlug: course.slug,
      lessonSlug: lesson.slug,
      courseTitle: { sr: course.titleSr, en: course.titleEn },
      lessonTitle: { sr: lesson.titleSr, en: lesson.titleEn },
      position,
      total: resumeLessons.length,
      coverUrl: course.coverStorageId ? await ctx.storage.getUrl(course.coverStorageId) : null,
    };
  }

  return { resume, progress: { completedLessons, totalLessons, percent }, nextLessons, activity };
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

// ── first run (checklist prvih koraka) ──────────────────────────────────────
// Dva podatka bez kojih se pozdravni hero na `/app` ne može štiklirati iz
// stvarnih podataka, a agregat ih do sada nije nosio. Oba su indeksirana čitanja
// sa `take()`; treći korak čeka `progress.completedLessons`, koji već postoji.
// `hasUnlockedCourse` je isti pojam vlasništva kao `courses.getAppNavigation`
// (`owned`): aktivan upis ili staff rola. To je PRIKAZ, ne provera pristupa —
// pravila pristupa ostaju u `helpers.requireCourseAccess`.
async function firstRunSlice(ctx: QueryCtx, userId: Id<"users">, ownership: Ownership) {
  const ownPosts = await ctx.db
    .query("communityPosts")
    .withIndex("by_author", (q) => q.eq("authorId", userId))
    .take(1);
  return {
    // Isti pojam vlasništva kao filter u `studentCoursesSlice` — čita se jednom
    // (`computeOwnership`) pa deli, da se ova dva izlaza nikad ne raziđu.
    hasUnlockedCourse: ownership.isStaff || ownership.ownedCourseIds.size > 0,
    hasCommunityPost: ownPosts.length > 0,
  };
}

// ── admin (spremnost + nacrti + na čekanju + novi članovi) — samo za admina ───
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

  // Nacrti: oba čitanja idu kroz status indeks, pa je cena konstantna. Lekcije
  // NISU ovde — `lessons.isPublished` nema indeks, pa bi „koliko lekcija je u
  // nacrtu" značilo skeniranje lekcija svakog kursa na svakom učitavanju table.
  const [draftTracks, draftCourses] = await Promise.all([
    ctx.db
      .query("courseTracks")
      .withIndex("by_status_and_sortOrder", (q) => q.eq("status", "draft"))
      .take(20),
    ctx.db
      .query("courses")
      .withIndex("by_status", (q) => q.eq("status", "draft"))
      .take(20),
  ]);
  const draftItems = [
    ...draftTracks.map((track) => ({
      kind: "track" as const,
      title: { sr: track.titleSr, en: track.titleEn },
      trackId: track._id,
      courseId: null,
    })),
    ...draftCourses.map((course) => ({
      kind: "course" as const,
      title: { sr: course.titleSr, en: course.titleEn },
      trackId: course.trackId ?? null,
      courseId: course._id,
    })),
  ];

  // Poslednji registrovani: `order("desc")` čita po `_creationTime`, pa se dodiruje
  // samo nekoliko dokumenata. Spojeni i anonimizovani nalozi ispadaju — oni nisu
  // „novi član", nego trag migracije.
  const recentUserRows = await ctx.db.query("users").order("desc").take(12);
  const recentUsers = recentUserRows
    .filter((user) => !user.mergedInto && !user.anonymizedAt && !user.isAnonymous)
    .slice(0, 3)
    .map((user) => ({
      name: user.name ?? user.username ?? "—",
      username: user.username ?? null,
      at: user.createdAt ?? user._creationTime,
    }));

  return {
    pendingApprovals,
    readiness: { ready: blocking === 0, blocking },
    drafts: { total: draftItems.length, items: draftItems.slice(0, 3) },
    recentUsers,
  };
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
      // Dnevni ritam za RITAM zonu (ActivityPanel). Nije u §6 obliku, ali je nužno:
      // pod pravilom „jedan query", zona D nema drugi izvor podataka.
      activity: v.array(v.object({ day: v.string(), completed: v.number() })),
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
      // Signali za checklist prvih koraka (pozdravni hero). `completedLessons`
      // za drugi korak već stoji u `progress`, pa se ovde ne ponavlja.
      firstRun: v.object({
        hasUnlockedCourse: v.boolean(),
        hasCommunityPost: v.boolean(),
      }),
      admin: v.union(
        v.null(),
        v.object({
          pendingApprovals: v.number(),
          readiness: v.object({ ready: v.boolean(), blocking: v.number() }),
          drafts: v.object({
            total: v.number(),
            items: v.array(
              v.object({
                kind: v.union(v.literal("track"), v.literal("course")),
                title: localizedText,
                trackId: v.union(v.id("courseTracks"), v.null()),
                courseId: v.union(v.id("courses"), v.null()),
              }),
            ),
          }),
          recentUsers: v.array(
            v.object({
              name: v.string(),
              username: v.union(v.string(), v.null()),
              at: v.number(),
            }),
          ),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return null;

    const { role } = await getCurrentProfile(ctx);
    const isAdmin = role === "admin";

    // Vlasništvo se čita jednom pa deli — `studentCoursesSlice` i `firstRunSlice`
    // moraju da vide isti skup otključanih kurseva.
    const ownership = await computeOwnership(ctx, userId, role);

    // Jedan poziv notifikacionih brojača (nosi i community i notifications count
    // i pendingApprovals) — ne dupliramo skeniranje nepročitanih.
    const counts = await getCommunityNotificationCountsHelper(ctx, userId);

    const [courses, messages, community, notifications, studio, study, leaderboard, firstRun, admin] =
      await Promise.all([
        studentCoursesSlice(ctx, userId, ownership),
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
        firstRunSlice(ctx, userId, ownership),
        isAdmin ? adminSlice(ctx, counts.pendingApprovals) : Promise.resolve(null),
      ]);

    return {
      resume: courses.resume,
      progress: courses.progress,
      nextLessons: courses.nextLessons,
      activity: courses.activity,
      messages,
      community: { unreadNotifications: counts.community, items: community },
      notifications: { total: counts.total, items: notifications },
      studio,
      study,
      leaderboard: leaderboard.row ? { rank: leaderboard.row.rank, points: leaderboard.row.xp } : null,
      firstRun,
      admin,
    };
  },
});
