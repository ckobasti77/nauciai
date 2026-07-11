import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app/app-sidebar";
import { ProfileSetupGate } from "@/components/app/profile-setup-gate";
import { getAppNavigationData } from "@/lib/app-navigation";
import type { Locale } from "@/lib/i18n";

export async function AppShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const navigation = await getAppNavigationData(locale);
  const gatedChildren = process.env.NEXT_PUBLIC_CONVEX_URL ? (
    <ProfileSetupGate locale={locale}>{children}</ProfileSetupGate>
  ) : (
    children
  );

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col lg:flex-row">
        <AppSidebar locale={locale} navigation={navigation} hasConvex={Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)} />
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {gatedChildren}
        </main>
      </div>
    </div>
  );
}
