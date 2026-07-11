"use client";

import { useConvexAuth } from "@convex-dev/auth/react";

import { type Locale } from "@/lib/i18n";

/**
 * Auth loading remains gated, but profile completion is intentionally advisory.
 * Login completion sends viewers without a username to Profile once; after that
 * they can browse the app and Community in read-only mode.
 */
export function ProfileSetupGate({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const { isLoading } = useConvexAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="rounded-[16px] border-2 border-ink bg-yellow/25 px-6 py-5 text-center shadow-[5px_5px_0_0_rgba(14,49,88,0.12)]">
          <p className="text-lg font-black text-ink">
            {locale === "sr" ? "Pripremamo tvoj nalog…" : "Preparing your account…"}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
