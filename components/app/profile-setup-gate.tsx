"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { api } from "@/convex/_generated/api";
import { type Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

/**
 * Auth loading remains gated, but profile completion is intentionally advisory.
 * Login completion sends viewers without a username to Profile once; after that
 * they can browse the app and Community in read-only mode.
 */
export function ProfileSetupGate({
  locale,
  initialProfileComplete,
  children,
}: {
  locale: Locale;
  initialProfileComplete: boolean | null;
  children: React.ReactNode;
}) {
  // isAuthenticated only drives the subscription argument, never render output.
  const { isAuthenticated } = useConvexAuth();
  const pathname = usePathname();
  const router = useRouter();
  const status = useQuery(api.profiles.getViewerProfileStatus, isAuthenticated ? {} : "skip");
  const profilePath = withLocale(locale, "/app/profile");
  // `false` is a meaningful resolved value, so test for `undefined` rather than using `??`.
  // `null` means unknown (signed out, or the server read failed) and must neither block nor redirect.
  const complete = status === undefined ? initialProfileComplete : status.complete;
  const needsUsername = complete === false;

  useEffect(() => {
    if (!needsUsername || pathname === profilePath) return;
    const returnTo = encodeURIComponent(pathname);
    router.replace(`${profilePath}?onboarding=1&focus=username&returnTo=${returnTo}`);
  }, [needsUsername, pathname, profilePath, router]);

  if (needsUsername && pathname !== profilePath) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="rounded-[16px] border-2 border-ink bg-yellow/25 px-6 py-5 text-center shadow-[5px_5px_0_0_var(--shadow-hard-12)]">
          <p className="text-lg font-black text-ink">
            {locale === "sr" ? "Vodimo te na Profil…" : "Taking you to your profile…"}
          </p>
          <p className="mt-1 text-sm font-bold text-muted">
            {locale === "sr"
              ? "Fali još jedna stvar: izaberi korisničko ime i vraćamo te ovde."
              : "One thing is missing: choose a username and we will bring you back here."}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
