import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

const PRESET_URLS = {
  "mythic-mentor": "/images/avatars/mythic-mentor.png",
  "cosmic-scholar": "/images/avatars/cosmic-scholar.png",
  "hybrid-guardian": "/images/avatars/hybrid-guardian.png",
} as const;

/** Canonical avatar precedence used by every Convex-backed surface. */
export async function resolvedProfileAvatarUrl(
  ctx: Pick<QueryCtx, "storage">,
  profile: {
    avatarStorageId?: Id<"_storage"> | string;
    avatarPreset?: keyof typeof PRESET_URLS | string;
    avatarUrl?: string;
  } | null | undefined,
  providerImage?: string | null,
) {
  if (profile?.avatarStorageId) {
    const uploaded = await ctx.storage.getUrl(profile.avatarStorageId as Id<"_storage">);
    if (uploaded) return uploaded;
  }
  if (profile?.avatarPreset && profile.avatarPreset in PRESET_URLS) return PRESET_URLS[profile.avatarPreset as keyof typeof PRESET_URLS];
  return profile?.avatarUrl || providerImage || undefined;
}
