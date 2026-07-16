import type { ReactNode } from "react";
import { cookies } from "next/headers";

import { AppSidebar } from "@/components/app/app-sidebar";
import { ChatDock } from "@/components/app/chat/chat-dock";
import { ProfileSetupGate } from "@/components/app/profile-setup-gate";
import { SuspensionGate } from "@/components/app/suspension-gate";
import { ViewerPresence } from "@/components/app/viewer-presence";
import { APP_SIDEBAR_COOKIE, parseAppSidebarPreferences } from "@/lib/app-sidebar-preferences";
import { getAppNavigationData } from "@/lib/app-navigation";
import type { Locale } from "@/lib/i18n";

export async function AppShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [navigation, cookieStore] = await Promise.all([getAppNavigationData(locale), cookies()]);
  const initialSidebarPreferences = parseAppSidebarPreferences(cookieStore.get(APP_SIDEBAR_COOKIE)?.value);
  const gatedChildren = process.env.NEXT_PUBLIC_CONVEX_URL ? (
    <ProfileSetupGate locale={locale}>{children}</ProfileSetupGate>
  ) : (
    children
  );

  const shell = (
    <div className="min-h-screen bg-paper text-ink">
      {process.env.NEXT_PUBLIC_CONVEX_URL ? <ViewerPresence /> : null}
      <div className="shell-container mx-auto flex min-h-screen min-w-0 w-full flex-col min-[1600px]:w-[calc(100%_-_48px)] min-[1600px]:max-w-[1760px] lg:flex-row">
        <AppSidebar
          locale={locale}
          navigation={navigation}
          hasConvex={Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)}
          initialPreferences={initialSidebarPreferences}
        />
        <main data-motion="page" className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {gatedChildren}
        </main>
      </div>
      {process.env.NEXT_PUBLIC_CONVEX_URL ? <ChatDock locale={locale} /> : null}
    </div>
  );

  return process.env.NEXT_PUBLIC_CONVEX_URL ? (
    <SuspensionGate locale={locale}>{shell}</SuspensionGate>
  ) : shell;
}
