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
const PROFILE_LIST_LIMIT = 200;
const assignableRoleValidator = v.union(
  v.literal("student"),
  v.literal("pro_student"),
  v.literal("moderator"),
);

function normalizeNamePart(value: string) {
  return value.trim().replace(/\s+/g, " ");
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

    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .take(100);
    if (profiles.length) return false;

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
    const emailVerifiedForPassword = isGoogleOnly
      ? Boolean(authUser?.passwordEmailVerificationTime)
      : Boolean(authUser?.passwordEmailVerificationTime || authUser?.emailVerificationTime);
    const missing = profile.username ? [] : ["username" as const];
    return {
      complete: missing.length === 0,
      missing,
      username: profile.username,
      email: authUser?.email ?? profile.email,
      hasEmail,
      emailVerifiedForPassword,
      authProviders: accounts.map((account) => account.provider),
      hasPassword,
      isGoogleOnly,
      advisories: {
        emailVerification: hasEmail && !emailVerifiedForPassword,
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

    const profiles = await ctx.db.query("profiles").order("asc").take(PROFILE_LIST_LIMIT);
    return profiles.map((profile) => ({
      ...profile,
      role: effectiveRoleForProfile(String(profile.email ?? ""), profile.role),
    }));
  },
});

export const setProfileRole = mutation({
  args: {
    profileId: v.id("profiles"),
    role: assignableRoleValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const profile = await ctx.db.get(args.profileId);
    if (!profile) {
      throw new Error("Profile not found");
    }

    const email = String(profile.email ?? "").trim().toLowerCase();
    if (email && isInitialAdminEmail(email)) {
      throw new Error("Admin role is controlled by INITIAL_ADMIN_EMAILS.");
    }

    await ctx.db.patch(args.profileId, {
      role: args.role,
      updatedAt: Date.now(),
    });
    await syncLeaderboardEligibilityForUser(
      ctx,
      profile.userId,
      args.role === "student" || args.role === "pro_student",
    );

    return ctx.db.get(args.profileId);
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
      updatedAt: number;
    } = {
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      searchText: `${firstName} ${lastName} ${String(nextUsername ?? "")}`.trim(),
      ...(args.language ? { language: args.language } : {}),
      updatedAt: Date.now(),
    };

    if (args.username !== undefined) {
      const normalizedUsername = normalizeUsername(args.username);
      if (normalizedUsername) {
        if (!isValidUsername(normalizedUsername)) {
          throw new Error(USERNAME_VALIDATION_MESSAGE_SR);
        }
        const existingRows = await ctx.db
          .query("profiles")
          .withIndex("by_username", (q) => q.eq("username", normalizedUsername))
          .take(100);
        const existing = existingRows.find((row) => row.userId !== profile.userId);
        if (existing && existing.userId !== profile.userId) {
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

    await ctx.db.patch(profile._id as Id<"profiles">, patch);
    const viewer = await ctx.db.get(profile.userId as Id<"users">);
    if (args.username !== undefined && viewer) {
      await ctx.db.patch(viewer._id, { username: patch.username });
    }
    const updated = await ctx.db.get(profile._id as Id<"profiles">);
    if (!updated) {
      return null;
    }

    const avatarUrl = updated.avatarStorageId
      ? await ctx.storage.getUrl(updated.avatarStorageId)
      : updated.avatarUrl;

    return {
      ...updated,
      avatarUrl: avatarUrl ?? updated.avatarUrl,
    };
  },
});
