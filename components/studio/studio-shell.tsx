import Link from "next/link";
import type { ReactNode } from "react";

import { SuspensionGate } from "@/components/app/suspension-gate";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { AccountMenu } from "@/components/marketing/account-menu";
import { BrandMark, LinkButton } from "@/components/ui/primitives";
import { getAppGateState } from "@/lib/app-gates";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { otherLocale, withLocale, type Locale } from "@/lib/i18n";
import { STUDIO_SHELL } from "@/lib/studio-messages";

/**
 * Tanki omotač samostalnog Studija (studio-public F3): logo, tema, nalog i
 * JEDAN tih cross-sell red - bez školskog sidebara, dock-a i onboarding
 * kapija. `<main>` NAMERNO ponavlja padding kontrakt `AppShell`-a
 * (components/app/app-shell.tsx L39: px-4 pt-5 sm:px-6 md:px-8 md:pt-8) -
 * negativne margine u `StudioPage` (L~700) računaju baš na te vrednosti da bi
 * `bg-studio-canvas` iskrvario do ivica; donji padding je manji jer ovde nema
 * fiksnog donjeg tab bara.
 *
 * Od školskih kapija ostaje SAMO `SuspensionGate` (suspenzija važi na celoj
 * platformi); `ProfileSetupGate` se preskače - Studio ne traži username, a
 * teranje kupca u školski onboarding je suprotno smislu tankog shell-a.
 */
export async function StudioShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  const [viewerProfile, gates] = await Promise.all([
    hasConvex ? getCurrentViewerProfile() : Promise.resolve(null),
    hasConvex ? getAppGateState() : Promise.resolve({ profileComplete: true, suspension: null }),
  ]);
  const signInHref = `${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(
    withLocale(locale, "/studio/app"),
  )}`;

  const shell = (
    <div className="min-h-screen bg-paper text-ink">
      <div className="shell-container mx-auto flex min-h-screen min-w-0 w-full flex-col min-[1600px]:w-[calc(100%-48px)] min-[1600px]:max-w-[1760px]">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b-2 border-ink/15 px-4 py-3 sm:px-6 md:px-8">
          <BrandMark href={withLocale(locale, "/studio")} />
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            {/* F5: jedan tih red, ništa više. */}
            <Link
              href={`${withLocale(locale)}#courses`}
              className="hidden rounded-full type-body-sm font-extrabold text-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 outline-offset-2 outline-ink md:inline-flex"
            >
              {STUDIO_SHELL.crossSell[locale]}
            </Link>
            <ThemeToggle locale={locale} />
            <Link
              href={withLocale(otherLocale(locale), "/studio/app")}
              aria-label={STUDIO_SHELL.localeSwitch[locale]}
              className="rounded-full type-body-sm font-black uppercase text-muted hover:text-ink focus-visible:outline-2 outline-offset-2 outline-ink"
            >
              {otherLocale(locale)}
            </Link>
            {viewerProfile ? (
              <AccountMenu locale={locale} profile={viewerProfile} />
            ) : (
              <LinkButton href={signInHref} tone="paper">
                {STUDIO_SHELL.signIn[locale]}
              </LinkButton>
            )}
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 md:px-8 md:pt-8 md:pb-8"
        >
          {children}
        </main>
      </div>
    </div>
  );

  return hasConvex ? (
    <SuspensionGate locale={locale} initialSuspension={gates.suspension}>
      {shell}
    </SuspensionGate>
  ) : (
    shell
  );
}
