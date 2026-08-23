import { describe, expect, it } from "vitest";

import {
  activeSectionId,
  resolveSidebarContext,
  sectionsFor,
} from "./sidebar-contexts";

const staffOpts = { isStaff: true, isAdmin: true, params: {} };
const studentOpts = { isStaff: false, isAdmin: false, params: {} };

describe("sidebar contexts — resolve", () => {
  it("falls back to home for the dashboard and unknown areas, in either locale", () => {
    expect(resolveSidebarContext("/sr/app").id).toBe("home");
    expect(resolveSidebarContext("/en/app").id).toBe("home");
    expect(resolveSidebarContext("/sr/app/messages").id).toBe("home");
    expect(resolveSidebarContext("/sr/app/credits").id).toBe("home");
  });

  it("resolves studio from its route and any deeper node, in either locale", () => {
    expect(resolveSidebarContext("/sr/app/studio").id).toBe("studio");
    expect(resolveSidebarContext("/en/app/studio").id).toBe("studio");
    expect(resolveSidebarContext("/sr/app/studio/m/12345").id).toBe("studio");
  });

  it("does not mistake a sibling route with the same prefix for studio", () => {
    expect(resolveSidebarContext("/sr/app/studios").id).toBe("home");
  });

  it("home carries no rendered sections (the classic slot renders home in Phase 1)", () => {
    expect(resolveSidebarContext("/sr/app").sections).toHaveLength(0);
  });
});

describe("sidebar contexts — studio sections", () => {
  const studio = resolveSidebarContext("/sr/app/studio");

  it("exposes the studio taxonomy in order, mapped from STUDIO_SECTIONS", () => {
    const ids = sectionsFor(studio, studentOpts).map((section) => section.id);
    expect(ids).toEqual(["all", "images", "videos", "audio"]);
  });

  it("carries the library group heading", () => {
    expect(studio.groupLabelSr).toBe("Biblioteka");
    expect(studio.groupLabelEn).toBe("Library");
  });

  it("builds each section href as a ?kind= filter over the studio route", () => {
    const byId = Object.fromEntries(studio.sections.map((section) => [section.id, section]));
    expect(byId.all.href("sr", {})).toBe("/sr/app/studio");
    expect(byId.images.href("sr", {})).toBe("/sr/app/studio?kind=image");
    expect(byId.videos.href("en", {})).toBe("/en/app/studio?kind=video");
    expect(byId.audio.href("sr", {})).toBe("/sr/app/studio?kind=audio");
  });

  it("resolves the active section from the ?kind= filter, falling back to all", () => {
    const sp = (kind?: string) => new URLSearchParams(kind ? `kind=${kind}` : "");
    expect(activeSectionId(studio, "/sr/app/studio", sp("image"), {})).toBe("images");
    expect(activeSectionId(studio, "/sr/app/studio", sp("video"), {})).toBe("videos");
    expect(activeSectionId(studio, "/sr/app/studio", sp("audio"), {})).toBe("audio");
    expect(activeSectionId(studio, "/sr/app/studio", sp(), {})).toBe("all");
    expect(activeSectionId(studio, "/sr/app/studio", sp("bogus"), {})).toBe("all");
  });

  it("does not hide any studio section from students (studio has none staff-only)", () => {
    expect(sectionsFor(studio, staffOpts).map((s) => s.id)).toEqual(
      sectionsFor(studio, studentOpts).map((s) => s.id),
    );
  });
});

describe("sidebar contexts — community sections", () => {
  const community = resolveSidebarContext("/sr/app/community/discussions");

  it("resolves community from its route and deeper nodes, in either locale", () => {
    expect(resolveSidebarContext("/sr/app/community").id).toBe("community");
    expect(resolveSidebarContext("/en/app/community/discussions").id).toBe("community");
    expect(resolveSidebarContext("/sr/app/community/12345").id).toBe("community");
  });

  it("shows five sections to students and adds moderation for staff", () => {
    const studentIds = sectionsFor(community, studentOpts).map((s) => s.id);
    const staffIds = sectionsFor(community, staffOpts).map((s) => s.id);
    expect(studentIds).toEqual(["discussions", "my-threads", "notifications", "members", "leaderboard"]);
    expect(staffIds).toContain("moderation");
    expect(staffIds).toHaveLength(studentIds.length + 1);
  });

  it("reads thread/new/edit as discussions, mentions as notifications", () => {
    const sp = new URLSearchParams();
    expect(activeSectionId(community, "/sr/app/community/12345", sp, {})).toBe("discussions");
    expect(activeSectionId(community, "/sr/app/community/new", sp, {})).toBe("discussions");
    expect(activeSectionId(community, "/sr/app/community/edit", sp, {})).toBe("discussions");
    expect(activeSectionId(community, "/sr/app/community/mentions", sp, {})).toBe("notifications");
    expect(activeSectionId(community, "/sr/app/community/moderation", sp, {})).toBe("moderation");
  });

  it("carries each section's badge key through to the shared shape", () => {
    const byId = Object.fromEntries(community.sections.map((s) => [s.id, s]));
    expect(byId["my-threads"].badgeKey).toBe("myThreads");
    expect(byId.notifications.badgeKey).toBe("community");
    expect(byId.moderation.badgeKey).toBe("pendingApprovals");
    expect(byId.discussions.badgeKey).toBeUndefined();
  });

  it("preserves scope/track/course/q/sort (incl. URL-encoded q) across a section switch", () => {
    const preserved = new URLSearchParams("scope=course&track=x&course=y&q=neko%20pitanje&sort=new");
    const notifications = community.sections.find((s) => s.id === "notifications")!;
    const href = notifications.href("sr", { preserved });

    expect(href.startsWith("/sr/app/community/notifications?")).toBe(true);
    const carried = new URLSearchParams(href.split("?")[1]);
    expect(carried.get("scope")).toBe("course");
    expect(carried.get("track")).toBe("x");
    expect(carried.get("course")).toBe("y");
    expect(carried.get("q")).toBe("neko pitanje");
    expect(carried.get("sort")).toBe("new");
  });

  it("omits the query when there is nothing to preserve", () => {
    const discussions = community.sections.find((s) => s.id === "discussions")!;
    expect(discussions.href("en", {})).toBe("/en/app/community/discussions");
  });
});

describe("sidebar contexts — admin sections", () => {
  const admin = resolveSidebarContext("/sr/app/admin/content");
  const moderatorOpts = { isStaff: true, isAdmin: false, params: {} };

  it("resolves admin from its route and every sub-route, in either locale", () => {
    expect(resolveSidebarContext("/sr/app/admin").id).toBe("admin");
    expect(resolveSidebarContext("/sr/app/admin/users").id).toBe("admin");
    expect(resolveSidebarContext("/en/app/admin/chat").id).toBe("admin");
    expect(resolveSidebarContext("/sr/app/admin/studio").id).toBe("admin");
  });

  it("gates sections by role: admin sees all, moderator sees only chat safety, student none", () => {
    expect(sectionsFor(admin, staffOpts).map((s) => s.id)).toEqual([
      "content",
      "users",
      "growth",
      "analytics",
      "chat",
      "studio",
    ]);
    expect(sectionsFor(admin, moderatorOpts).map((s) => s.id)).toEqual(["chat"]);
    expect(sectionsFor(admin, studentOpts)).toHaveLength(0);
  });

  it("resolves the active section by full route", () => {
    const sp = new URLSearchParams();
    expect(activeSectionId(admin, "/sr/app/admin/content", sp, {})).toBe("content");
    expect(activeSectionId(admin, "/sr/app/admin/users", sp, {})).toBe("users");
    expect(activeSectionId(admin, "/en/app/admin/chat", sp, {})).toBe("chat");
    // A query string on the route does not change which section is active.
    expect(activeSectionId(admin, "/sr/app/admin/content", new URLSearchParams("track=t"), {})).toBe("content");
  });

  it("builds each section href as a full locale-prefixed route", () => {
    const byId = Object.fromEntries(admin.sections.map((s) => [s.id, s]));
    expect(byId.content.href("sr", {})).toBe("/sr/app/admin/content");
    expect(byId.chat.href("en", {})).toBe("/en/app/admin/chat");
    expect(byId.studio.href("sr", {})).toBe("/sr/app/admin/studio");
  });
});

describe("sidebar contexts — classroom sections", () => {
  const classroom = resolveSidebarContext("/sr/app/classroom");

  it("resolves classroom from the hub and every deeper node, in either locale", () => {
    expect(resolveSidebarContext("/sr/app/classroom").id).toBe("classroom");
    expect(resolveSidebarContext("/en/app/classroom").id).toBe("classroom");
    expect(resolveSidebarContext("/sr/app/classroom/tracks/video-audio").id).toBe("classroom");
    expect(resolveSidebarContext("/en/app/classroom/courses/websites/lessons/intro").id).toBe("classroom");
  });

  it("does not mistake a sibling route with the same prefix for classroom", () => {
    expect(resolveSidebarContext("/sr/app/classrooms").id).toBe("home");
  });

  it("shows only the three hub views until a track/course supplies params", () => {
    expect(sectionsFor(classroom, studentOpts).map((s) => s.id)).toEqual(["overview", "tracks", "courses"]);
  });

  it("reveals the conditional Smer/Kurs sections only with the matching param", () => {
    const inTrack = sectionsFor(classroom, { isStaff: false, isAdmin: false, params: { trackSlug: "video-audio" } });
    expect(inTrack.map((s) => s.id)).toEqual(["overview", "tracks", "courses", "track"]);

    const inCourse = sectionsFor(classroom, { isStaff: false, isAdmin: false, params: { courseSlug: "websites" } });
    expect(inCourse.map((s) => s.id)).toEqual(["overview", "tracks", "courses", "course"]);
  });

  it("computes the Smer · X / Kurs · Y label from the title params, else the bare prefix", () => {
    const track = classroom.sections.find((s) => s.id === "track")!;
    const course = classroom.sections.find((s) => s.id === "course")!;
    expect(track.dynamicLabel!({ trackSlug: "va", trackTitle: "Video i audio" }, "sr")).toBe("Smer · Video i audio");
    expect(course.dynamicLabel!({ courseSlug: "w", courseTitle: "Web" }, "en")).toBe("Course · Web");
    expect(track.dynamicLabel!({ trackSlug: "va" }, "sr")).toBe("Smer");
  });

  it("builds hub hrefs with ?view and detail hrefs through the route builders", () => {
    const byId = Object.fromEntries(classroom.sections.map((s) => [s.id, s]));
    expect(byId.overview.href("sr", {})).toBe("/sr/app/classroom");
    expect(byId.tracks.href("sr", {})).toBe("/sr/app/classroom?view=tracks");
    expect(byId.courses.href("en", {})).toBe("/en/app/classroom?view=courses");
    expect(byId.track.href("sr", { trackSlug: "video-audio" })).toBe("/sr/app/classroom/tracks/video-audio");
    expect(byId.course.href("en", { courseSlug: "websites" })).toBe("/en/app/classroom/courses/websites");
  });

  it("resolves the active hub view from ?view, and the detail sections from params", () => {
    const sp = (view?: string) => new URLSearchParams(view ? `view=${view}` : "");
    expect(activeSectionId(classroom, "/sr/app/classroom", sp(), {})).toBe("overview");
    expect(activeSectionId(classroom, "/sr/app/classroom", sp("tracks"), {})).toBe("tracks");
    expect(activeSectionId(classroom, "/sr/app/classroom", sp("courses"), {})).toBe("courses");
    // On a track route the conditional Smer section owns active, not the hub views.
    expect(activeSectionId(classroom, "/sr/app/classroom/tracks/va", sp(), { trackSlug: "va" })).toBe("track");
    // Inside a course detail Kurs is active; inside a lesson beneath it, nothing is.
    expect(activeSectionId(classroom, "/sr/app/classroom/courses/w", sp(), { courseSlug: "w" })).toBe("course");
    expect(
      activeSectionId(classroom, "/sr/app/classroom/courses/w/lessons/i", sp(), { courseSlug: "w", lessonSlug: "i" }),
    ).toBeNull();
  });
});
