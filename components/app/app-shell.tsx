import type { ReactNode } from "react";
import { cookies } from "next/headers";

import { AppSidebar } from "@/components/app/app-sidebar";
import { ChatDock } from "@/components/app/chat/chat-dock";
import { ChatNotifications } from "@/components/app/chat/chat-notifications";
import { ProfileSetupGate } from "@/components/app/profile-setup-gate";
import { SuspensionGate } from "@/components/app/suspension-gate";
import { ViewerPresence } from "@/components/app/viewer-presence";
import { getAppGateState } from "@/lib/app-gates";
import { APP_SIDEBAR_COOKIE, parseAppSidebarPreferences } from "@/lib/app-sidebar-preferences";
import { getAppNavigationData } from "@/lib/app-navigation";
import type { Locale } from "@/lib/i18n";

export async function AppShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [navigation, cookieStore, gates] = await Promise.all([
    getAppNavigationData(locale),
    cookies(),
    getAppGateState(),
  ]);
  const initialSidebarPreferences = parseAppSidebarPreferences(cookieStore.get(APP_SIDEBAR_COOKIE)?.value);
  const gatedChildren = process.env.NEXT_PUBLIC_CONVEX_URL ? (
    <ProfileSetupGate locale={locale} initialProfileComplete={gates.profileComplete}>{children}</ProfileSetupGate>
  ) : (
    children
  );

  const shell = (
    <div className="min-h-screen bg-paper text-ink">
      {process.env.NEXT_PUBLIC_CONVEX_URL ? <ViewerPresence /> : null}
      <div className="shell-container mx-auto flex min-h-screen min-w-0 w-full flex-col min-[1600px]:w-[calc(100%_-_48px)] min-[1600px]:max-w-[1760px] md:flex-row">
        <AppSidebar
          locale={locale}
          navigation={navigation}
          hasConvex={Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)}
          initialPreferences={initialSidebarPreferences}
        />
        {/* pb clears the fixed bottom tab bar in app-sidebar.tsx (min-h-14 + 2px border). */}
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 pt-5 pb-[calc(4.5rem_+_env(safe-area-inset-bottom))] sm:px-6 md:px-8 md:pt-8 md:pb-8">
          {gatedChildren}
        </main>
      </div>
      {/* Notifications mount on every route and breakpoint; the dock stays desktop-only. */}
      {process.env.NEXT_PUBLIC_CONVEX_URL ? <ChatNotifications locale={locale} /> : null}
      {process.env.NEXT_PUBLIC_CONVEX_URL ? <ChatDock locale={locale} /> : null}
    </div>
  );

  return process.env.NEXT_PUBLIC_CONVEX_URL ? (
    <SuspensionGate locale={locale} initialSuspension={gates.suspension}>{shell}</SuspensionGate>
  ) : shell;
}
