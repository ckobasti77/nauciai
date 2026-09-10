"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { ThemeToggle } from "@/components/app/theme-toggle";
import { AccountMenu } from "@/components/marketing/account-menu";
import { LanguageToggle } from "@/components/marketing/language-toggle";
import { BrandMark, LinkButton, cn } from "@/components/ui/primitives";
import { SmartStickyHeader } from "@/components/ui/smart-sticky";
import { courses, primaryCourseSlug, websitesCourseSlug } from "@/lib/content";
import type { ViewerProfile } from "@/lib/current-viewer";
import { dictionary, localized, otherLocale, withLocale, type Locale } from "@/lib/i18n";
import { parsePath } from "@/lib/routes";

const NAV_LINK_CLASS =
  "rounded-[8px] underline-offset-4 transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const NAV_TRIGGER_CLASS =
  "inline-flex items-center gap-1 rounded-[8px] underline-offset-4 transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * Kanonske putanje čije strane pod providnim navbarom imaju SVETAO full-bleed heroj
 * (krem ostrvo u obe teme). Dve posledice, obe kroz `data-over-light` na headeru:
 *  1. tokeni u navbaru se drže svetle palete dok se ne skrola (globals.css),
 *     jer bi mastilo tamne teme nestalo na kremu;
 *  2. `.public-shell` ne rezerviše visinu navbara — heroj namerno ide POD njega.
 * Poredi se sa `parsePath(pathname).canonicalPath`, pa važi u oba jezika i bez obzira
 * na to da li rewrite otkrije javnu ili internu formu putanje.
 * N7: /courses i /community dele isti full-bleed krem hero (`PageHero`).
 */
const LIGHT_HERO_PATHS = ["/", "/studio", "/courses", "/community"];

type NavMenuItem = {
  href: string;
  label: string;
  sub?: string;
  /** Odvaja stavku od prethodne tankom linijom (npr. „Svi kursevi" ispod kurseva). */
  divider?: boolean;
  active: boolean;
};

/**
 * Padajući meni gornje navigacije (Kursevi / Alati). Isti obrazac zatvaranja kao
 * `AccountMenu`: klik van i Escape (ovde i Tab van, jer je disclosure meni sa
 * strelicama). Hover ima 150ms kašnjenje zatvaranja da mala pauza između dugmeta
 * i panela ne zatvori meni. Tokeni (bg-paper-strong/border-ink/text-muted) su
 * namerno isti kao ostatak headera — panel je potomak `.marketing-header`, pa
 * automatski nasledi svetlu paletu preko `data-over-light` (globals.css).
 */
function NavMenu({ label, items, active }: { label: string; items: NavMenuItem[]; active: boolean }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function openNow() {
    clearCloseTimer();
    setOpen(true);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => clearCloseTimer, []);

  function focusFirstItem() {
    panelRef.current?.querySelector<HTMLAnchorElement>("a[role='menuitem']")?.focus();
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openNow();
      requestAnimationFrame(focusFirstItem);
    }
  }

  function handlePanelKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = Array.from(panelRef.current?.querySelectorAll<HTMLAnchorElement>("a[role='menuitem']") ?? []);
    if (!links.length) return;
    const currentIndex = links.indexOf(document.activeElement as HTMLAnchorElement);
    event.preventDefault();
    const nextIndex =
      event.key === "ArrowDown" ? (currentIndex + 1) % links.length : (currentIndex - 1 + links.length) % links.length;
    links[nextIndex]?.focus();
  }

  function handleBlurCapture(event: React.FocusEvent) {
    if (!rootRef.current?.contains(event.relatedTarget as Node)) {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative" onMouseEnter={openNow} onMouseLeave={scheduleClose} onBlurCapture={handleBlurCapture}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-current={active ? "page" : undefined}
        onClick={() => (open ? setOpen(false) : openNow())}
        onKeyDown={handleTriggerKeyDown}
        className={cn(NAV_TRIGGER_CLASS, active && "underline")}
      >
        {label}
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={menuId}
          ref={panelRef}
          role="menu"
          onKeyDown={handlePanelKeyDown}
          className="absolute left-1/2 top-[calc(100%+0.65rem)] z-50 w-72 -translate-x-1/2 rounded-[16px] border-2 border-ink bg-paper-strong p-2 text-left text-ink shadow-[8px_8px_0_0_var(--shadow-hard-14)]"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              aria-current={item.active ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={cn(
                "flex min-h-11 flex-col justify-center gap-0.5 rounded-[12px] px-3 py-2 transition hover:bg-yellow/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink",
                item.divider && "mt-1 border-t border-line pt-3",
              )}
            >
              <span className="text-sm font-black">{item.label}</span>
              {item.sub ? <span className="text-xs font-bold text-muted">{item.sub}</span> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type MobileEntry =
  | { type: "eyebrow"; key: string; label: string }
  | { type: "link"; href: string; label: string; sub?: string; active: boolean; divider?: boolean };

/**
 * Gornja navigacija SVIH javnih strana — renderuje je `(marketing)/layout.tsx`,
 * isto kao što je sidebar wrapper za komandnu tablu. Klijentska je zbog
 * `usePathname()`: iz putanje se izvodi i `data-over-light` i jezički prekidač
 * koji ostaje na istoj strani umesto da vraća na početnu.
 */
export function PublicHeader({
  locale,
  viewerProfile,
}: {
  locale: Locale;
  viewerProfile: ViewerProfile;
}) {
  const t = dictionary[locale];
  const pathname = usePathname();
  const { canonicalPath } = parsePath(pathname);
  const overLight = LIGHT_HERO_PATHS.includes(canonicalPath);

  // Prekidač jezika ostaje na istoj strani: kanonska putanja se samo prevede u drugi
  // jezik (prevedeni segment, npr. /pretplata <-> /en/pricing, pređe sam).
  const languageHref = withLocale(otherLocale(locale), canonicalPath);

  const videoCourse = courses.find((course) => course.slug === primaryCourseSlug) ?? courses[0];
  const vibeCourse = courses.find((course) => course.slug === websitesCourseSlug) ?? courses[1];

  const coursesMenuItems: NavMenuItem[] = [
    {
      href: withLocale(locale, `/courses/${videoCourse.slug}`),
      label: localized(videoCourse.title, locale),
      sub: localized(videoCourse.subtitle, locale),
      active: canonicalPath === `/courses/${videoCourse.slug}`,
    },
    {
      href: withLocale(locale, `/courses/${vibeCourse.slug}`),
      label: localized(vibeCourse.title, locale),
      sub: localized(vibeCourse.subtitle, locale),
      active: canonicalPath === `/courses/${vibeCourse.slug}`,
    },
    {
      href: withLocale(locale, "/courses"),
      label: t.navAllCourses,
      divider: true,
      active: canonicalPath === "/courses",
    },
  ];

  const toolsMenuItems: NavMenuItem[] = [
    {
      href: withLocale(locale, "/mcp"),
      label: t.navMcp,
      sub: t.navMcpSub,
      active: canonicalPath === "/mcp",
    },
    {
      href: withLocale(locale, "/3d"),
      label: t.nav3d,
      sub: t.nav3dSub,
      active: canonicalPath === "/3d",
    },
  ];
  if (viewerProfile) {
    toolsMenuItems.push({
      href: withLocale(locale, "/app/profile/api-keys"),
      label: t.navApiKeys,
      sub: t.navApiKeysSub,
      active: canonicalPath === "/app/profile/api-keys",
    });
  }

  const coursesActive = coursesMenuItems.some((item) => item.active);
  const toolsActive = toolsMenuItems.some((item) => item.active);
  const studioActive = canonicalPath === "/studio";
  const communityActive = canonicalPath === "/community";
  const pricingActive = canonicalPath === "/pricing";

  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuId = useId();
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Zatvara mobilni meni na promenu rute. Namerno NIJE efekat (React-ov obrazac
  // "adjusting state during render" umesto useEffect) — setState u renderu je
  // dozvoljen i izbegava `react-hooks/set-state-in-effect`.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  useEffect(() => {
    if (!mobileOpen) return;

    const panel = mobilePanelRef.current;
    const hamburger = hamburgerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!panel?.contains(target) && !hamburger?.contains(target)) {
        setMobileOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.body.style.overflow = previousOverflow;
      const active = document.activeElement;
      if (!active || active === document.body || panel?.contains(active)) {
        hamburger?.focus();
      }
    };
  }, [mobileOpen]);

  const mobileEntries: MobileEntry[] = [
    { type: "eyebrow", key: "courses", label: t.navCourses },
    ...coursesMenuItems.map((item) => ({
      type: "link" as const,
      href: item.href,
      label: item.label,
      sub: item.sub,
      active: item.active,
      divider: item.divider,
    })),
    { type: "link", href: withLocale(locale, "/studio"), label: t.navStudio, active: studioActive },
    { type: "link", href: withLocale(locale, "/community"), label: t.navCommunity, active: communityActive },
    { type: "link", href: withLocale(locale, "/pricing"), label: t.navPricing, active: pricingActive },
    { type: "eyebrow", key: "tools", label: t.navTools },
    ...toolsMenuItems.map((item) => ({
      type: "link" as const,
      href: item.href,
      label: item.label,
      sub: item.sub,
      active: item.active,
    })),
  ];

  return (
    <SmartStickyHeader
      overlay
      scrollBackground
      data-marketing-auth={viewerProfile ? "authenticated" : "anonymous"}
      data-over-light={overLight ? "true" : "false"}
      className="marketing-header top-0 z-40"
    >
      {/* Tri jednake kolone (1fr) unutar istog `max-w-7xl` kontejnera, pa nav
          linkovi padaju tačno na sredinu strane. Ispod `md` sredina se sakriva,
          a mreža se vraća na `justify-between` da desni klaster ne bude stisnut
          u trećinu uskog ekrana. */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 sm:px-6 md:grid md:grid-cols-3 lg:px-8">
        <div className="flex min-w-0 items-center justify-start">
          <BrandMark href={withLocale(locale)} label={t.appName} />
        </div>
        <nav className="hidden items-center justify-center gap-6 text-sm font-extrabold md:flex">
          <NavMenu label={t.navCourses} items={coursesMenuItems} active={coursesActive} />
          <Link
            href={withLocale(locale, "/studio")}
            aria-current={studioActive ? "page" : undefined}
            className={cn(NAV_LINK_CLASS, studioActive && "underline")}
          >
            {t.navStudio}
          </Link>
          <Link
            href={withLocale(locale, "/community")}
            aria-current={communityActive ? "page" : undefined}
            className={cn(NAV_LINK_CLASS, communityActive && "underline")}
          >
            {t.navCommunity}
          </Link>
          {/* N6: pretplata ima svoju stranu (segment se prevodi kroz `withLocale`), pa
              link više ne vodi na sidro „#pricing" na landingu. */}
          <Link
            href={withLocale(locale, "/pricing")}
            aria-current={pricingActive ? "page" : undefined}
            className={cn(NAV_LINK_CLASS, pricingActive && "underline")}
          >
            {t.navPricing}
          </Link>
          <NavMenu label={t.navTools} items={toolsMenuItems} active={toolsActive} />
        </nav>
        <div className="flex items-center justify-end gap-2">
          <LanguageToggle locale={locale} href={languageHref} />
          <ThemeToggle locale={locale} />
          <button
            ref={hamburgerRef}
            type="button"
            aria-label={mobileOpen ? t.navMenuClose : t.navMenuOpen}
            aria-expanded={mobileOpen}
            aria-controls={mobileMenuId}
            onClick={() => setMobileOpen((value) => !value)}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink transition hover:-translate-y-0.5 hover:bg-yellow/25 active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:hidden"
          >
            {mobileOpen ? <X className="size-4 shrink-0" aria-hidden="true" /> : <Menu className="size-4 shrink-0" aria-hidden="true" />}
          </button>
          {viewerProfile ? (
            <Link
              href={withLocale(locale, "/app")}
              className="inline-flex min-h-9 items-center justify-center rounded-full border-2 border-ink bg-ink px-2.5 py-1.5 text-[11px] font-black uppercase text-paper-strong shadow-[3px_3px_0_0_var(--yellow)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--yellow)] active:translate-y-0 active:shadow-[3px_3px_0_0_var(--yellow)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink max-[380px]:hidden sm:px-3 sm:text-xs"
            >
              {t.navDashboard}
            </Link>
          ) : null}
          {viewerProfile ? (
            <AccountMenu locale={locale} profile={viewerProfile} />
          ) : (
            <LinkButton href={withLocale(locale, "/sign-in")} tone="paper" className="hidden sm:inline-flex">
              {t.signIn}
            </LinkButton>
          )}
        </div>
      </div>

      {mobileOpen ? (
        <div
          id={mobileMenuId}
          ref={mobilePanelRef}
          className="absolute inset-x-0 top-full border-b-2 border-ink bg-paper-strong text-ink shadow-[0_8px_18px_-16px_var(--shadow-hard-55)] md:hidden"
        >
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6 lg:px-8">
            {mobileEntries.map((entry) =>
              entry.type === "eyebrow" ? (
                <p key={entry.key} className="type-eyebrow px-3 pt-3 text-muted first:pt-0">
                  {entry.label}
                </p>
              ) : (
                <Link
                  key={entry.href}
                  href={entry.href}
                  aria-current={entry.active ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex min-h-11 flex-col justify-center gap-0.5 rounded-[12px] px-3 py-2 text-sm font-black transition hover:bg-yellow/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink",
                    entry.active && "underline underline-offset-4",
                    entry.divider && "mt-2 border-t border-line pt-4",
                  )}
                >
                  <span>{entry.label}</span>
                  {entry.sub ? <span className="text-xs font-bold text-muted">{entry.sub}</span> : null}
                </Link>
              ),
            )}
            <div className="mt-2 border-t border-line pt-3">
              {viewerProfile ? (
                <Link
                  href={withLocale(locale, "/app")}
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-11 items-center rounded-[12px] bg-ink px-3 text-sm font-black uppercase text-paper-strong"
                >
                  {t.navDashboard}
                </Link>
              ) : (
                <Link
                  href={withLocale(locale, "/sign-in")}
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-11 items-center rounded-[12px] border-2 border-ink bg-paper-strong px-3 text-sm font-black text-ink"
                >
                  {t.signIn}
                </Link>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </SmartStickyHeader>
  );
}
