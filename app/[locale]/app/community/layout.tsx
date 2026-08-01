import { Suspense, type ReactNode } from "react";

import { CommunityShell } from "@/components/app/community-v2/community-shell";
import { CommunityRouteSkeleton } from "@/components/app/community-v2/community-shared";
import { normalizeLocale } from "@/lib/i18n";

export default async function CommunityLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;

  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1180px] space-y-6">
          <div className="h-64 animate-pulse rounded-[16px] bg-ink/10" />
          <CommunityRouteSkeleton />
        </div>
      }
    >
      <CommunityShell
        locale={normalizeLocale(localeParam)}
        hasConvex={Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)}
      >
        {children}
      </CommunityShell>
    </Suspense>
  );
}
