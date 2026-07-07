import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { ensureProfile, requireUserId } from "./helpers";

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

export const updateViewerProfile = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    language: v.optional(v.union(v.literal("sr"), v.literal("en"))),
    avatarPreset: v.optional(avatarPresetValidator),
    avatarStorageId: v.optional(v.id("_storage")),
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

    const patch: {
      firstName: string;
      lastName: string;
      name: string;
      language?: "sr" | "en";
      avatarUrl?: string;
      avatarPreset?: "mythic-mentor" | "cosmic-scholar" | "hybrid-guardian";
      avatarStorageId?: Id<"_storage">;
      updatedAt: number;
    } = {
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      ...(args.language ? { language: args.language } : {}),
      updatedAt: Date.now(),
    };

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
