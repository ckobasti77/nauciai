import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  effectiveRoleForProfile,
  ensureProfile,
  isInitialAdminEmail,
  requireAdmin,
  requireUserId,
  getCurrentProfile,
} from "./helpers";
import { syncLeaderboardEligibilityForUser } from "./leaderboardCore";
import {
  isValidUsername,
  normalizeUsername,
  USERNAME_VALIDATION_MESSAGE_SR,
} from "../lib/username-policy";

const avatarPresetValidator = v.union(
  v.literal("mythic-mentor"),
  v.literal("cosmic-scholar"),
  v.literal("hybrid-guardian"),
);

const AVATAR_PRESET_URLS = {
  "mythic-mentor": "/images/avatars/mythic-mentor.png",
  "cosmic-scholar": "/images/avatars/cosmic-scholar.png",
  "hybrid-guardian": "/images/avatars/hybrid-guardian.png",
} as const;

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_BIO_LENGTH = 280;
const PROFILE_LIST_LIMIT = 200;
const assignableRoleValidator = v.union(
  v.literal("student"),
  v.literal("pro_student"),
  v.literal("moderator"),
);

function normalizeNamePart(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizePublicUrl(value: string | undefined, label: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} mora biti ispravan URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} mora početi sa http:// ili https://.`);
  }
  return parsed.toString();
}

function profileResponse(user: {
  _id: Id<"users">;
  _creationTime: number;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  avatarUrl?: string;
  avatarStorageId?: Id<"_storage">;
  avatarPreset?: "mythic-mentor" | "cosmic-scholar" | "hybrid-guardian";
  role?: "student" | "pro_student" | "moderator" | "admin";
  language?: "sr" | "en";
  bio?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  linkedinUrl?: string;
  youtubeUrl?: string;
  dmPrivacy?: "requests" | "following" | "nobody";
  searchText?: string;
  createdAt?: number;
  updatedAt?: number;
}) {
  const email = String(user.email ?? "").trim().toLowerCase();
  return {
    _id: user._id,
    _creationTime: user._creationTime,
    userId: user._id,
    email: user.email,
    name: user.name ?? email.split("@")[0] ?? "Student",
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    avatarUrl: user.avatarUrl,
    avatarStorageId: user.avatarStorageId,
    avatarPreset: user.avatarPreset,
    role: effectiveRoleForProfile(email, user.role),
    language: user.language ?? ("sr" as const),
    bio: user.bio,
    websiteUrl: user.websiteUrl,
    instagramUrl: user.instagramUrl,
    linkedinUrl: user.linkedinUrl,
    youtubeUrl: user.youtubeUrl,
    dmPrivacy: user.dmPrivacy ?? "requests",
    searchText: user.searchText,
    createdAt: user.createdAt ?? user._creationTime,
    updatedAt: user.updatedAt ?? user._creationTime,
  };
}

export const createAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const isUsernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const normalized = normalizeUsername(args.username);
    if (!normalized || !isValidUsername(normalized)) return false;

    const authUser = await ctx.db
      .query("users")
      .withIndex("username", (q) => q.eq("username", normalized))
      .unique();
    return !authUser;
  },
});

export const getViewerProfileStatus = query({
  args: {},
  handler: async (ctx) => {
    const { userId, profile } = await getCurrentProfile(ctx);
    const authUser = await ctx.db.get(userId);
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .take(10);
    const hasPassword = accounts.some((account) => account.provider === "password");
    const hasGoogle = accounts.some((account) => account.provider === "google");
    const isGoogleOnly = hasGoogle && !hasPassword;
    const hasEmail = Boolean(String(authUser?.email ?? profile.email ?? "").trim());
    const emailVerifiedForCourses = isGoogleOnly
      ? Boolean(authUser?.appEmailVerificationTime || authUser?.passwordEmailVerificationTime)
      : Boolean(authUser?.appEmailVerificationTime || authUser?.passwordEmailVerificationTime || authUser?.emailVerificationTime);
    const missing = profile.username ? [] : ["username" as const];
    return {
      complete: missing.length === 0,
      missing,
      isAdmin: profile.role === "admin",
      username: profile.username,
      email: authUser?.email ?? profile.email,
      hasEmail,
      emailVerifiedForCourses,
      emailVerifiedForPassword: emailVerifiedForCourses,
      authProviders: accounts.map((account) => account.provider),
      hasPassword,
      isGoogleOnly,
      advisories: {
        emailVerification: hasEmail && !emailVerifiedForCourses,
        password: !hasPassword,
      },
    };
  },
});

export const listProfilesForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await getCurrentProfile(ctx);
    if (profile.role !== "admin") {
      throw new Error("Forbidden");
    }

    const users = await ctx.db.query("users").order("asc").take(PROFILE_LIST_LIMIT);
    return users.filter((user) => !user.mergedInto).map(profileResponse);
  },
});

export const setProfileRole = mutation({
  args: {
    profileId: v.id("users"),
    role: assignableRoleValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const user = await ctx.db.get(args.profileId);
    if (!user || user.mergedInto) {
      throw new Error("Profile not found");
    }

    const email = String(user.email ?? "").trim().toLowerCase();
    if (email && isInitialAdminEmail(email)) {
      throw new Error("Admin role is controlled by INITIAL_ADMIN_EMAILS.");
    }

    await ctx.db.patch(args.profileId, {
      role: args.role,
      updatedAt: Date.now(),
    });
    await syncLeaderboardEligibilityForUser(
      ctx,
      user._id,
      args.role === "student" || args.role === "pro_student",
    );

    const updated = await ctx.db.get(args.profileId);
    return updated ? profileResponse(updated) : null;
  },
});

export const updateViewerProfile = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    language: v.optional(v.union(v.literal("sr"), v.literal("en"))),
    avatarPreset: v.optional(avatarPresetValidator),
    avatarStorageId: v.optional(v.id("_storage")),
    username: v.optional(v.string()),
    bio: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    instagramUrl: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
    dmPrivacy: v.optional(v.union(v.literal("requests"), v.literal("following"), v.literal("nobody"))),
  },
  handler: async (ctx, args) => {
    const profile = await ensureProfile(ctx);
    if (!profile) {
      throw new Error("Profile not found");
    }

    const firstName = normalizeNamePart(args.firstName);
    const lastName = normalizeNamePart(args.lastName);
    if (!firstName || !lastName) {
      throw new Error("Ime i prezime su obavezni.");
    }

    const nextUsername = args.username !== undefined ? normalizeUsername(args.username) : profile.username;
    const bio = args.bio?.trim() || undefined;
    if (bio && bio.length > MAX_BIO_LENGTH) {
      throw new Error(`Biografija može imati najviše ${MAX_BIO_LENGTH} znakova.`);
    }

    const patch: {
      firstName: string;
      lastName: string;
      name: string;
      searchText: string;
      language?: "sr" | "en";
      avatarUrl?: string;
      avatarPreset?: "mythic-mentor" | "cosmic-scholar" | "hybrid-guardian";
      avatarStorageId?: Id<"_storage">;
      username?: string | undefined;
      bio?: string;
      websiteUrl?: string;
      instagramUrl?: string;
      linkedinUrl?: string;
      youtubeUrl?: string;
      dmPrivacy?: "requests" | "following" | "nobody";
      updatedAt: number;
    } = {
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      searchText: `${firstName} ${lastName} ${String(nextUsername ?? "")}`.trim(),
      ...(args.language ? { language: args.language } : {}),
      bio,
      websiteUrl: normalizePublicUrl(args.websiteUrl, "Website"),
      instagramUrl: normalizePublicUrl(args.instagramUrl, "Instagram"),
      linkedinUrl: normalizePublicUrl(args.linkedinUrl, "LinkedIn"),
      youtubeUrl: normalizePublicUrl(args.youtubeUrl, "YouTube"),
      ...(args.dmPrivacy ? { dmPrivacy: args.dmPrivacy } : {}),
      updatedAt: Date.now(),
    };

    if (args.username !== undefined) {
      const normalizedUsername = normalizeUsername(args.username);
      if (normalizedUsername) {
        if (!isValidUsername(normalizedUsername)) {
          throw new Error(USERNAME_VALIDATION_MESSAGE_SR);
        }
        const existing = await ctx.db
          .query("users")
          .withIndex("username", (q) => q.eq("username", normalizedUsername))
          .unique();
        if (existing && existing._id !== profile.userId) {
          throw new Error("Korisnicko ime je vec zauzeto.");
        }
        patch.username = normalizedUsername;
      } else {
        patch.username = undefined;
      }
    }

    if (args.avatarStorageId) {
      const metadata = await ctx.db.system.get("_storage", args.avatarStorageId);
      if (!metadata) {
        throw new Error("Avatar upload nije pronadjen.");
      }
      if (!metadata.contentType?.startsWith("image/")) {
        throw new Error("Avatar mora da bude slika.");
      }
      if (metadata.size > MAX_AVATAR_BYTES) {
        throw new Error("Avatar mora da bude manji od 5MB.");
      }

      const avatarUrl = await ctx.storage.getUrl(args.avatarStorageId);
      if (!avatarUrl) {
        throw new Error("Avatar URL nije dostupan.");
      }

      patch.avatarStorageId = args.avatarStorageId;
      patch.avatarUrl = avatarUrl;
      patch.avatarPreset = undefined;
    } else if (args.avatarPreset) {
      patch.avatarPreset = args.avatarPreset;
      patch.avatarUrl = AVATAR_PRESET_URLS[args.avatarPreset];
      patch.avatarStorageId = undefined;
    }

    await ctx.db.patch(profile.userId as Id<"users">, patch);
    const updated = await ctx.db.get(profile.userId as Id<"users">);
    if (!updated) {
      return null;
    }

    const avatarUrl = updated.avatarStorageId
      ? await ctx.storage.getUrl(updated.avatarStorageId)
      : updated.avatarUrl;

    return {
      ...profileResponse(updated),
      avatarUrl: avatarUrl ?? updated.avatarUrl,
    };
  },
});
