"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { api } from "@/convex/_generated/api";
import { type Locale, withLocale } from "@/lib/i18n";

export function ProfileSetupGate({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const isProfileRoute = pathname === withLocale(locale, "/app/profile");
  const status = useQuery(
    api.profiles.getViewerProfileStatus,
    isAuthenticated && !isProfileRoute ? {} : "skip",
  );

  useEffect(() => {
    if (!isLoading && isAuthenticated && !isProfileRoute && status && !status.complete) {
      const returnTo = `${pathname}${window.location.search}`;
      router.replace(`${withLocale(locale, "/app/profile")}?onboarding=1&returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [isAuthenticated, isLoading, isProfileRoute, locale, pathname, router, status]);

  if (isProfileRoute || !isAuthenticated) return <>{children}</>;
  if (isLoading || status === undefined || !status.complete) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="rounded-[16px] border-2 border-ink bg-yellow/25 px-6 py-5 text-center shadow-[5px_5px_0_0_rgba(14,49,88,0.12)]">
          <p className="text-lg font-black text-ink">{locale === "sr" ? "Pripremamo tvoj profil…" : "Preparing your profile…"}</p>
          <p className="mt-1 text-sm font-bold text-muted">{locale === "sr" ? "Dovrši setup da nastaviš." : "Complete setup to continue."}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
