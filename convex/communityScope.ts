import { v, type Infer } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const communityScopeValidator = v.union(
  v.object({ kind: v.literal("global") }),
  v.object({ kind: v.literal("track"), trackId: v.id("courseTracks") }),
  v.object({ kind: v.literal("course"), courseId: v.id("courses") }),
);

export type CommunityScope = Infer<typeof communityScopeValidator>;

export type ResolvedCommunityScope =
  | { kind: "global"; scopeKey: "global" }
  | { kind: "track"; scopeKey: string; trackId: Id<"courseTracks"> }
  | {
      kind: "course";
      scopeKey: string;
      courseId: Id<"courses">;
      trackId?: Id<"courseTracks">;
    };

type DatabaseCtx = QueryCtx | MutationCtx;

export function globalCommunityScope(): ResolvedCommunityScope {
  return { kind: "global", scopeKey: "global" };
}

export async function resolveCommunityScope(
  ctx: DatabaseCtx,
  scope: CommunityScope,
): Promise<ResolvedCommunityScope> {
  if (scope.kind === "global") {
    return globalCommunityScope();
  }

  if (scope.kind === "track") {
    const track = await ctx.db.get(scope.trackId);
    if (!track || track.status === "archived") {
      throw new Error("Smer nije pronađen.");
    }
    return {
      kind: "track",
      scopeKey: `track:${scope.trackId}`,
      trackId: scope.trackId,
    };
  }

  const course = await ctx.db.get(scope.courseId);
  if (!course || course.status === "archived") {
    throw new Error("Kurs nije pronađen.");
  }

  return {
    kind: "course",
    scopeKey: `course:${scope.courseId}`,
    courseId: scope.courseId,
    ...(course.trackId ? { trackId: course.trackId } : {}),
  };
}

export async function resolveLegacyPostScope(
  ctx: DatabaseCtx,
  courseId?: Id<"courses">,
): Promise<ResolvedCommunityScope> {
  return courseId
    ? resolveCommunityScope(ctx, { kind: "course", courseId })
    : globalCommunityScope();
}

export function scopeFields(scope: ResolvedCommunityScope) {
  return {
    scopeKind: scope.kind,
    scopeKey: scope.scopeKey,
    trackId: "trackId" in scope ? scope.trackId : undefined,
    courseId: scope.kind === "course" ? scope.courseId : undefined,
  };
}
