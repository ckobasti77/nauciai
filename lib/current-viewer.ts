import "server-only";

import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import type { Locale } from "@/lib/i18n";

export type ViewerProfile = {
  name?: string;
  email?: string;
  avatarUrl?: string;
  role?: string;
  language?: Locale;
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
