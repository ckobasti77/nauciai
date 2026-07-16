import "server-only";

import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import type { Locale } from "@/lib/i18n";

export type ViewerProfile = {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarUrl?: string;
  avatarStorageId?: string;
  avatarPreset?: "mythic-mentor" | "cosmic-scholar" | "hybrid-guardian";
  role?: string;
  language?: Locale;
  updatedAt?: number;
  username?: string;
  bio?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  linkedinUrl?: string;
  youtubeUrl?: string;
  dmPrivacy?: "requests" | "following" | "nobody";
} | null;

type ViewerResult = {
  profile?: ViewerProfile;
} | null;

export async function getCurrentViewerProfile(): Promise<ViewerProfile> {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return null;
  }

  const token = await convexAuthNextjsToken();
  const convex = getConvexHttpClient(token);
  if (!convex) {
    return null;
  }

  const viewer = (await convex.query(convexQueries.viewer, {}).catch(() => null)) as ViewerResult;
  return viewer?.profile ?? null;
}
