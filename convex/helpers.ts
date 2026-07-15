import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { env } from "./_generated/server";
import { normalizeEmail, parseAdminEmails } from "../lib/admin-emails";
import type { MutationCtx } from "./_generated/server";
import { syncLeaderboardEligibilityForUser } from "./leaderboardCore";
import {
  isValidUsername,
  normalizeUsername,
  USERNAME_VALIDATION_MESSAGE_SR,
} from "../lib/username-policy";

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

const DEFAULT_AVATAR_URL = "/images/avatars/mythic-mentor.png";
export const profileRoles = ["student", "pro_student", "moderator", "admin"] as const;
export const assignableProfileRoles = ["student", "pro_student", "moderator"] as const;

export type ProfileRole = (typeof profileRoles)[number];
export type AssignableProfileRole = (typeof assignableProfileRoles)[number];

function dbFrom(ctx: AnyCtx): DatabaseLike {
  return ctx.db as DatabaseLike;
}

function initialAdminEmails(): Set<string> {
  return parseAdminEmails(env.INITIAL_ADMIN_EMAILS);
}

function isAssignableProfileRole(value: unknown): value is AssignableProfileRole {
  return (
    typeof value === "string" &&
    (assignableProfileRoles as readonly string[]).includes(value)
  );
}

export function isInitialAdminEmail(email: string) {
  return initialAdminEmails().has(normalizeEmail(email));
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
  if (!user) throw new Error("User not found");
  const authName = String(authProfile.name ?? user.name ?? email.split("@")[0] ?? "Student").trim();
  const parts = namePartsFrom(String(user.name ?? authName), email);
  const firstName = String(user.firstName ?? parts.firstName);
  const lastName = String(user.lastName ?? parts.lastName);
  const username = user.username ?? normalizeUsername(authProfile.username as string | undefined);

  if (username && !isValidUsername(username)) {
    throw new Error(USERNAME_VALIDATION_MESSAGE_SR);
  }

  if (username) {
    const duplicate = await ctx.db
      .query("users")
      .withIndex("username", (q) => q.eq("username", username))
      .unique();
    if (duplicate && duplicate._id !== userId) {
      throw new Error("Korisničko ime je već zauzeto.");
    }
  }

  const role = effectiveRoleForProfile(email, user.role);
  const name = fullNameFrom(firstName, lastName, authName);
  const avatarUrl = user.avatarUrl ?? (String(authProfile.image ?? user.image ?? "") || DEFAULT_AVATAR_URL);
  const now = Date.now();
  const patch = {
    name,
    firstName,
    lastName,
    ...(username ? { username } : {}),
    avatarUrl,
    avatarPreset: user.avatarStorageId ? undefined : user.avatarPreset,
    role,
    language: user.language ?? ("sr" as const),
    searchText: `${name} ${username ?? ""} ${email}`.trim(),
    createdAt: user.createdAt ?? now,
    updatedAt: user.updatedAt ?? now,
  };

  await ctx.db.patch(userId, patch);
  return ctx.db.get(userId);
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
  const missing = current.profile.username ? [] : ["username"];
  if (missing.length > 0) {
    throw new ConvexError({
      code: "PROFILE_INCOMPLETE",
      missing,
    });
  }
  return current;
}

export async function getCurrentProfile(ctx: AnyCtx) {
  const userId = await requireUserId(ctx);
  const db = dbFrom(ctx);
  const user = await db.get(userId);
  if (!user) throw new Error("Unauthorized");
  const email = String(user.email ?? "").toLowerCase();
  const role = effectiveRoleForProfile(email, user.role);
  const fallbackName = String(user.name ?? email.split("@")[0] ?? "Student");
  const derivedParts = namePartsFrom(fallbackName, email);
  const firstName = String(user.firstName ?? derivedParts.firstName);
  const lastName = String(user.lastName ?? derivedParts.lastName);
  const displayName = fullNameFrom(firstName, lastName, fallbackName);
  const profile = {
    _id: user._id,
    _creationTime: user._creationTime,
    userId,
    email: user.email,
    role,
    name: displayName,
    firstName,
    lastName,
    username: user.username,
    avatarUrl: user.avatarUrl ?? user.image ?? DEFAULT_AVATAR_URL,
    avatarStorageId: user.avatarStorageId,
    avatarPreset: user.avatarStorageId ? undefined : user.avatarPreset,
    language: user.language ?? "sr",
    searchText: user.searchText,
    createdAt: user.createdAt ?? user._creationTime,
    updatedAt: user.updatedAt ?? user._creationTime,
  } as DocLike;

  return {
    existing: user as DocLike,
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

  if (!db.patch) {
    throw new Error("Profile bootstrap requires a write-capable Convex context.");
  }

  const { existing, userId, email, role, name, firstName, lastName, avatarUrl } = current;

  if (!existing) throw new Error("Profile not found");

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
  }
  if (!existing.searchText) {
    patch.searchText = `${name} ${String(existing.username ?? "")} ${email}`.trim();
  }
  if (!existing.username && current.profile.username) {
    patch.username = current.profile.username;
  }
  if (Object.keys(patch).length) {
    await db.patch(userId, { ...patch, updatedAt: now });
    if (existing.role !== role) {
      await syncLeaderboardEligibilityForUser(
        ctx as MutationCtx,
        userId as Id<"users">,
        role === "student" || role === "pro_student",
      );
    }
    return (await getCurrentProfile(ctx)).profile;
  }

  return current.profile;
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
  const { userId, profile } = await getCurrentProfile(ctx);
  if (!profile) {
    throw new Error("Unauthorized");
  }

  if (profile.role === "admin") {
    return profile;
  }

  const [authUser, accounts] = await Promise.all([
    dbFrom(ctx).get(userId),
    dbFrom(ctx)
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .take(10),
  ]);
  const hasPassword = accounts.some((account) => account.provider === "password");
  const hasGoogle = accounts.some((account) => account.provider === "google");
  const isGoogleOnly = hasGoogle && !hasPassword;
  const emailVerifiedForCourses = isGoogleOnly
    ? Boolean(authUser?.appEmailVerificationTime || authUser?.passwordEmailVerificationTime)
    : Boolean(authUser?.appEmailVerificationTime || authUser?.passwordEmailVerificationTime || authUser?.emailVerificationTime);
  if (!emailVerifiedForCourses) {
    throw new Error("EMAIL_VERIFICATION_REQUIRED");
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
