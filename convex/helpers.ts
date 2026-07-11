import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { env } from "./_generated/server";
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
  take: (limit: number) => Promise<DocLike[]>;
  collect: () => Promise<DocLike[]>;
};

type DatabaseLike = {
  get: (...args: unknown[]) => Promise<DocLike | null>;
  query: (table: string) => QueryLike;
  insert?: (table: string, value: Record<string, unknown>) => Promise<string>;
  patch?: (id: unknown, value: Record<string, unknown>) => Promise<void>;
  delete?: (id: unknown) => Promise<void>;
};

type DocLike = Record<string, unknown> & {
  _id: string;
  _creationTime?: number;
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
  language?: "sr" | "en";
  searchText?: string;
};

const DEFAULT_AVATAR_PRESET = "mythic-mentor";
const DEFAULT_AVATAR_URL = "/images/avatars/mythic-mentor.png";
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,20}$/;

export const profileRoles = ["student", "pro_student", "moderator", "admin"] as const;
export const assignableProfileRoles = ["student", "pro_student", "moderator"] as const;

export type ProfileRole = (typeof profileRoles)[number];
export type AssignableProfileRole = (typeof assignableProfileRoles)[number];

export function normalizeUsername(value: string | undefined | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || undefined;
}

export function isValidUsername(value: string | undefined | null) {
  return Boolean(value && USERNAME_PATTERN.test(value));
}

function dbFrom(ctx: AnyCtx): DatabaseLike {
  return ctx.db as DatabaseLike;
}

function initialAdminEmails(): Set<string> {
  return new Set(
    (env.INITIAL_ADMIN_EMAILS ?? "")
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

/**
 * Creates the public profile projection at auth time. This is deliberately
 * shared by the Convex Auth callback and the lazy compatibility path so a
 * Google user can never appear as an anonymous community author while their
 * first write is still pending.
 */
export async function upsertProfileFromAuthUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  authProfile: Record<string, unknown> = {},
) {
  const user = await ctx.db.get(userId);
  const email = String(authProfile.email ?? user?.email ?? "").trim().toLowerCase();
  const authName = String(authProfile.name ?? user?.name ?? email.split("@")[0] ?? "Student").trim();
  const existingRows = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(100);
  const existing = [...existingRows].sort((a, b) => Number(a._creationTime ?? 0) - Number(b._creationTime ?? 0))[0] ?? null;
  const parts = namePartsFrom(String(existing?.name ?? authName), email);
  const firstName = String(existing?.firstName ?? parts.firstName);
  const lastName = String(existing?.lastName ?? parts.lastName);
  const username = normalizeUsername(authProfile.username as string | undefined) ?? existing?.username;

  if (username && !isValidUsername(username)) {
    throw new Error("Korisničko ime mora imati između 3 i 20 karaktera i može sadržati samo slova, brojeve, donje crte i crtice.");
  }

  if (username) {
    const duplicates = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .take(100);
    const duplicate = duplicates.find((profile) => profile.userId !== userId);
    if (duplicate && duplicate.userId !== userId) {
      throw new Error("Korisničko ime je već zauzeto.");
    }
  }

  const role = effectiveRoleForProfile(email, existing?.role);
  const avatarUrl = existing?.avatarUrl ?? (String(authProfile.image ?? user?.image ?? "") || DEFAULT_AVATAR_URL);
  const patch = {
    email: email || existing?.email,
    name: fullNameFrom(firstName, lastName, authName),
    firstName,
    lastName,
    ...(username ? { username } : {}),
    avatarUrl,
    avatarPreset: existing?.avatarStorageId ? undefined : existing?.avatarPreset ?? DEFAULT_AVATAR_PRESET,
    role,
    language: existing?.language ?? ("sr" as const),
    searchText: `${fullNameFrom(firstName, lastName, authName)} ${username ?? ""} ${email}`.trim(),
    updatedAt: Date.now(),
  };

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return ctx.db.get(existing._id);
  }

  return ctx.db.insert("profiles", {
    userId,
    ...patch,
    createdAt: Date.now(),
  });
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

export async function requireCompleteCommunityProfile(ctx: AnyCtx) {
  const current = await getCurrentProfile(ctx);
  if (!current.profile.username) {
    throw new ConvexError({
      code: "PROFILE_INCOMPLETE",
      missing: ["username"],
    });
  }
  return current;
}

export async function getCurrentProfile(ctx: AnyCtx) {
  const userId = await requireUserId(ctx);
  const db = dbFrom(ctx);
  const user = await db.get(userId);
  const email = String(user?.email ?? "").toLowerCase();
  const existingRows = await db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(100);
  // A profile is identified by userId. During cleanup of historical rows we
  // deliberately choose the oldest row so the public profile id is stable.
  const existing = [...existingRows].sort((a, b) => Number(a._creationTime ?? 0) - Number(b._creationTime ?? 0))[0] ?? null;

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
        username: existing.username ?? user?.username,
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
        username: user?.username,
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

  if (existing && db.delete) {
    const rows = await db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).take(100);
    if (rows.length > 1) {
      const ordered = [...rows].sort((a, b) => Number(a._creationTime ?? 0) - Number(b._creationTime ?? 0));
      const latest = [...rows].sort((a, b) => Number(b.updatedAt ?? b._creationTime ?? 0) - Number(a.updatedAt ?? a._creationTime ?? 0))[0];
      await db.patch(existing._id, {
        ...(latest.username ? { username: latest.username } : {}),
        ...(latest.name ? { name: latest.name } : {}),
        ...(latest.firstName ? { firstName: latest.firstName } : {}),
        ...(latest.lastName ? { lastName: latest.lastName } : {}),
        ...(latest.avatarUrl ? { avatarUrl: latest.avatarUrl } : {}),
        ...(latest.avatarStorageId ? { avatarStorageId: latest.avatarStorageId } : {}),
        ...(latest.avatarPreset ? { avatarPreset: latest.avatarPreset } : {}),
        ...(latest.language ? { language: latest.language } : {}),
        role,
        updatedAt: now,
      });
      for (const duplicate of ordered.slice(1)) await db.delete(duplicate._id);
      return db.get(existing._id);
    }
  }

  if (!existing) {
    const profileId = await db.insert("profiles", {
      userId,
      email,
      name,
      firstName,
      lastName,
      avatarUrl,
      avatarPreset: DEFAULT_AVATAR_PRESET,
      ...(current.profile.username ? { username: current.profile.username } : {}),
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
  if (!existing.username && current.profile.username) {
    patch.username = current.profile.username;
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
