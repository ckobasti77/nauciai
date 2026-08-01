import "server-only";

import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

import type { ViewerSuspension } from "@/components/app/suspension-gate";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";

export type AppGateState = {
  suspension: ViewerSuspension | null;
  /** `null` means unknown: no Convex, no token, or the read failed. */
  profileComplete: boolean | null;
};

const UNKNOWN: AppGateState = { suspension: null, profileComplete: null };

/**
 * Reads the shell's gate flags server-side so SSR emits either the real shell or the
 * block screen, never a loading state. Both queries throw "Unauthorized" when signed
 * out, so both degrade to the unknown state.
 */
export async function getAppGateState(): Promise<AppGateState> {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return UNKNOWN;

  const token = await convexAuthNextjsToken();
  const convex = getConvexHttpClient(token);
  if (!convex) return UNKNOWN;

  const [suspension, profileStatus] = (await Promise.all([
    convex.query(convexQueries.getMySuspension, {}).catch(() => null),
    convex.query(convexQueries.getViewerProfileStatus, {}).catch(() => null),
  ])) as [ViewerSuspension | null, { complete?: boolean } | null];

  return {
    suspension,
    profileComplete: profileStatus ? profileStatus.complete === true : null,
  };
}
