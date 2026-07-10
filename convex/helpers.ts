import { getAuthUserId } from "@convex-dev/auth/server";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { syncLeaderboardEligibilityForUser } from "./leaderboardCore";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["trialing", "active"]);

type AnyCtx = {
  auth: unknown;
  db: unknown;
  storage?: unknown;
};

type QueryBuilderLike = {
  eq: (field: string, value: unknown) => QueryBuilderLike;
};

type QueryLike = {
  withIndex: (name: string, callback: (q: QueryBuilderLike) => QueryBuilderLike) => QueryLike;
  unique: () => Promise<DocLike | null>;
  collect: () => Promise<DocLike[]>;
};

type DatabaseLike = {
  get: (...args: unknown[]) => Promise<DocLike | null>;
  query: (table: string) => QueryLike;
  insert?: (table: string, value: Record<string, unknown>) => Promise<string>;
  patch?: (id: unknown, value: Record<string, unknown>) => Promise<void>;
};

type DocLike = Record<string, unknown> & {
  _id: string;
  userId?: string;
  email?: string;
  image?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  status?: string;
  avatarUrl?: string;
  avatarStorageId?: string;
  avatarPreset?: string;
  username?: string;
  searchText?: string;
};

const DEFAULT_AVATAR_PRESET = "mythic-mentor";
const DEFAULT_AVATAR_URL = "/images/avatars/mythic-mentor.png";

export const profileRoles = ["student", "pro_student", "moderator", "admin"] as const;
export const assignableProfileRoles = ["student", "pro_student", "moderator"] as const;

export type ProfileRole = (typeof profileRoles)[number];
export type AssignableProfileRole = (typeof assignableProfileRoles)[number];

function dbFrom(ctx: AnyCtx): DatabaseLike {
  return ctx.db as DatabaseLike;
}

function initialAdminEmails(): Set<string> {
  return new Set(
    (process.env.INITIAL_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isAssignableProfileRole(value: unknown): value is AssignableProfileRole {
  return (
    typeof value === "string" &&
    (assignableProfileRoles as readonly string[]).includes(value)
  );
}

export function isInitialAdminEmail(email: string) {
  return initialAdminEmails().has(email.trim().toLowerCase());
}

export function effectiveRoleForProfile(email: string, currentRole?: unknown): ProfileRole {
  if (isInitialAdminEmail(email)) {
    return "admin";
  }

  return isAssignableProfileRole(currentRole) ? currentRole : "student";
}

function namePartsFrom(name: string, email: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const fallback = email.split("@")[0] || "Student";

  return {
    firstName: parts[0] || fallback,
    lastName: parts.slice(1).join(" "),
  };
}

function fullNameFrom(firstName: string, lastName: string, fallback: string) {
  const joined = [firstName, lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");

  return joined || fallback;
}

export async function currentUserId(ctx: AnyCtx) {
  return getAuthUserId(ctx as never);
}

export async function requireUserId(ctx: AnyCtx) {
  const userId = await currentUserId(ctx);
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

export async function getCurrentProfile(ctx: AnyCtx) {
  const userId = await requireUserId(ctx);
  const db = dbFrom(ctx);
  const user = await db.get(userId);
  const email = String(user?.email ?? "").toLowerCase();
  const existing = await db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();

  const role = effectiveRoleForProfile(email, existing?.role);
  const name = user?.name ?? email.split("@")[0] ?? "Student";
  const derivedParts = namePartsFrom(String(existing?.name ?? name), email);
  const firstName = String(existing?.firstName ?? derivedParts.firstName);
  const lastName = String(existing?.lastName ?? derivedParts.lastName);
  const displayName = fullNameFrom(firstName, lastName, String(existing?.name ?? name));
  const existingAvatarPreset = existing?.avatarStorageId
    ? undefined
    : existing?.avatarPreset ?? DEFAULT_AVATAR_PRESET;

  const profile = existing
    ? {
        ...existing,
        role,
        name: displayName,
        firstName,
        lastName,
        avatarUrl: existing.avatarUrl ?? user?.image ?? DEFAULT_AVATAR_URL,
        avatarPreset: existingAvatarPreset,
      }
    : ({
        _id: "",
        userId,
        email,
        name: displayName,
        firstName,
        lastName,
        avatarUrl: user?.image ?? DEFAULT_AVATAR_URL,
        avatarPreset: DEFAULT_AVATAR_PRESET,
        role,
        language: "sr",
      } as DocLike);

  return {
    existing,
    profile,
    userId,
    email,
    role,
    name: displayName,
    firstName,
    lastName,
    avatarUrl: profile.avatarUrl,
  };
}

export async function ensureProfile(ctx: AnyCtx) {
  const current = await getCurrentProfile(ctx);
  const now = Date.now();

  const db = dbFrom(ctx);

  if (!db.insert || !db.patch) {
    throw new Error("Profile bootstrap requires a write-capable Convex context.");
  }

  const { existing, userId, email, role, name, firstName, lastName, avatarUrl } = current;

  if (!existing) {
    const profileId = await db.insert("profiles", {
      userId,
      email,
      name,
      firstName,
      lastName,
      avatarUrl,
      avatarPreset: DEFAULT_AVATAR_PRESET,
      role,
      language: "sr",
      searchText: `${name} ${email}`.trim(),
      createdAt: now,
      updatedAt: now,
    });
    return db.get(profileId);
  }

  const patch: Record<string, unknown> = {};
  if (existing.role !== role) {
    patch.role = role;
  }
  if (!existing.firstName && firstName) {
    patch.firstName = firstName;
  }
  if (!existing.lastName && lastName) {
    patch.lastName = lastName;
  }
  if (!existing.avatarUrl && !existing.avatarStorageId) {
    patch.avatarUrl = avatarUrl ?? DEFAULT_AVATAR_URL;
    patch.avatarPreset = DEFAULT_AVATAR_PRESET;
  }
  if (!existing.searchText) {
    patch.searchText = `${name} ${String(existing.username ?? "")} ${email}`.trim();
  }
  if (Object.keys(patch).length) {
    await db.patch(existing._id, { ...patch, updatedAt: now });
    if (existing.role !== role) {
      await syncLeaderboardEligibilityForUser(
        ctx as MutationCtx,
        userId as Id<"users">,
        role === "student" || role === "pro_student",
      );
    }
    return db.get(existing._id);
  }

  return existing;
}

export async function requireAdmin(ctx: AnyCtx) {
  const profile = await ensureProfile(ctx);
  if (!profile || profile.role !== "admin") {
    throw new Error("Forbidden");
  }
  return profile;
}

export async function requireCommunityModerator(ctx: AnyCtx) {
  const profile = await ensureProfile(ctx);
  if (!profile || (profile.role !== "admin" && profile.role !== "moderator")) {
    throw new Error("Forbidden");
  }
  return profile;
}

export async function hasActiveSubscription(ctx: AnyCtx, userId: string, courseId: string) {
  const db = dbFrom(ctx);
  const subscriptions = await db
    .query("subscriptions")
    .withIndex("by_user_status", (q) => q.eq("userId", userId))
    .collect();
  const subscription = subscriptions.find((item) => item.courseId === courseId);

  return Boolean(
    subscription &&
      typeof subscription.status === "string" &&
      ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status),
  );
}

export async function requireCourseAccess(ctx: AnyCtx, courseId: string) {
  const { profile } = await getCurrentProfile(ctx);
  if (!profile) {
    throw new Error("Unauthorized");
  }

  if (profile.role === "admin") {
    return profile;
  }

  const course = await dbFrom(ctx).get(courseId);
  if (!course || course.status !== "published") {
    throw new Error("Course not found");
  }

  return profile;
}

export function requireSyncSecret(syncSecret: string) {
  const expected = process.env.WEBHOOK_SYNC_SECRET;
  if (!expected || syncSecret !== expected) {
    throw new Error("Forbidden");
  }
}
