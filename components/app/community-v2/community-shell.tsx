"use client";

import {
  BarChart3,
  Bell,
  BookOpenText,
  ChevronRight,
  Menu,
  MessageSquareText,
  PenLine,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

import { fallbackCommunityFilters, useCommunityFilters } from "./community-data";
import type { CommunityFilters } from "./community-types";

type CommunityNavItem = {
  id: string;
  path: string;
  labelSr: string;
  labelEn: string;
  icon: typeof MessageSquareText;
  badge?: number;
};

const PRESERVED_SEARCH_KEYS = ["scope", "track", "course", "q", "sort"];

function activeCommunitySection(pathname: string) {
  const match = pathname.match(/\/community\/([^/?#]+)/);
  const segment = match?.[1];
  if (!segment || segment === "new" || segment === "edit" || !Number.isNaN(Number(segment))) {
    return "discussions";
  }
  if (["discussions", "my-threads", "mentions", "members", "leaderboard", "moderation"].includes(segment)) {
    return segment;
  }
  return "discussions";
}

function navHref(locale: Locale, path: string, searchParams: URLSearchParams) {
  const preserved = new URLSearchParams();
  PRESERVED_SEARCH_KEYS.forEach((key) => {
    searchParams.getAll(key).forEach((value) => preserved.append(key, value));
  });
  const query = preserved.toString();
  return `${withLocale(locale, `/app/community/${path}`)}${query ? `?${query}` : ""}`;
}

function NavBadge({ count, locale }: { count?: number; locale: Locale }) {
  if (!count) return null;
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-full border border-ink bg-yellow px-1.5 py-0.5 font-mono text-[10px] font-black leading-none text-ink">
      <span className="sr-only">{locale === "sr" ? "Nepročitano:" : "Unread:"}</span>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function CommunityNavLink({
  item,
  locale,
  active,
  href,
  onNavigate,
  mobile = false,
}: {
  item: CommunityNavItem;
  locale: Locale;
  active: boolean;
  href: string;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const Icon = item.icon;
  const label = locale === "sr" ? item.labelSr : item.labelEn;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-black transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow",
        mobile && "w-full justify-between rounded-[12px] px-4",
        active
          ? "border-yellow bg-yellow text-ink shadow-[2px_2px_0_rgba(255,255,255,0.22)]"
          : mobile
            ? "border-line bg-white text-ink hover:border-ink hover:bg-yellow/15"
            : "border-white/15 bg-white/5 text-white/78 hover:border-white/35 hover:bg-white/10 hover:text-white",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <NavBadge count={item.badge} locale={locale} />
    </Link>
  );
}

export function CommunityShell({
  locale,
  hasConvex,
  children,
}: {
  locale: Locale;
  hasConvex: boolean;
  children: ReactNode;
}) {
  if (hasConvex) {
    return <LiveCommunityShell locale={locale}>{children}</LiveCommunityShell>;
  }

  return (
    <CommunityShellView locale={locale} filters={fallbackCommunityFilters} isLoading={false}>
      {children}
    </CommunityShellView>
  );
}

function LiveCommunityShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const { filters, isLoading } = useCommunityFilters(true);

  return (
    <CommunityShellView locale={locale} filters={filters} isLoading={isLoading}>
      {children}
    </CommunityShellView>
  );
}

function CommunityShellView({
  locale,
  filters,
  isLoading,
  children,
}: {
  locale: Locale;
  filters: CommunityFilters;
  isLoading: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const activeSection = activeCommunitySection(pathname);
  const isStaff = filters.viewer.role === "admin" || filters.viewer.role === "moderator";

  const navItems = useMemo<CommunityNavItem[]>(
    () => [
      {
        id: "discussions",
        path: "discussions",
        labelSr: "Diskusije",
        labelEn: "Discussions",
        icon: MessageSquareText,
      },
      {
        id: "my-threads",
        path: "my-threads",
        labelSr: "Moji tredovi",
        labelEn: "My threads",
        icon: BookOpenText,
        badge: filters.counts?.myThreads,
      },
      {
        id: "mentions",
        path: "mentions",
        labelSr: "Pominjanja",
        labelEn: "Mentions",
        icon: Bell,
        badge: filters.counts?.mentions,
      },
      {
        id: "members",
        path: "members",
        labelSr: "Članovi",
        labelEn: "Members",
        icon: Users,
      },
      {
        id: "leaderboard",
        path: "leaderboard",
        labelSr: "Leaderboard",
        labelEn: "Leaderboard",
        icon: BarChart3,
      },
      ...(isStaff
        ? [
            {
              id: "moderation",
              path: "moderation",
              labelSr: "Odobrenja",
              labelEn: "Approvals",
              icon: ShieldCheck,
              badge: filters.counts?.pendingApprovals,
            },
          ]
        : []),
    ],
    [filters.counts?.mentions, filters.counts?.myThreads, filters.counts?.pendingApprovals, isStaff],
  );

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const menuButton = menuButtonRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      menuButton?.focus();
    };
  }, [mobileMenuOpen]);

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-6" aria-busy={isLoading}>
      <section className="relative overflow-hidden rounded-[16px]! border-2 border-ink bg-ink text-white shadow-[6px_6px_0_rgba(244,190,48,0.65)]">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[34%] border-l border-white/10 bg-[radial-gradient(circle_at_center,rgba(244,190,48,0.22)_0_2px,transparent_2px)] [background-size:24px_24px] md:block" />
        <div className="relative p-5 sm:p-7 lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-yellow">
                <Sparkles className="size-4" aria-hidden="true" />
                <p className="font-mono text-[11px] font-black uppercase tracking-[0.18em]">AI Studio Commons</p>
              </div>
              <h1 className="mt-3 text-[clamp(2rem,5vw,4rem)] font-black leading-[0.94] tracking-[-0.055em]">
                {locale === "sr" ? "Uči javno. Napreduj zajedno." : "Learn in public. Grow together."}
              </h1>
              <p className="mt-4 max-w-xl text-sm font-bold leading-6 text-white/72 sm:text-base">
                {locale === "sr"
                  ? "Pitaj, podeli workflow i poveži svaku diskusiju sa smerom i kursom na kom radiš."
                  : "Ask, share a workflow, and connect every discussion to the track and course you are building in."}
              </p>
            </div>
            <Link
              href={withLocale(locale, "/app/community/new")}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-yellow bg-yellow px-5 text-sm font-black text-ink shadow-[3px_3px_0_rgba(255,255,255,0.22)] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:translate-y-0"
            >
              <PenLine className="size-4" aria-hidden="true" />
              {locale === "sr" ? "Pokreni diskusiju" : "Start a discussion"}
            </Link>
          </div>

          <nav className="mt-7 hidden flex-wrap gap-2 sm:flex" aria-label={locale === "sr" ? "Sekcije zajednice" : "Community sections"}>
            {navItems.map((item) => (
              <CommunityNavLink
                key={item.id}
                item={item}
                locale={locale}
                active={activeSection === item.id}
                href={navHref(locale, item.path, new URLSearchParams(searchParams.toString()))}
              />
            ))}
          </nav>

          <div className="mt-6 flex items-center justify-between gap-3 sm:hidden">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/55">
                {locale === "sr" ? "Trenutna sekcija" : "Current section"}
              </p>
              <p className="mt-1 truncate text-sm font-black text-white">
                {locale === "sr"
                  ? navItems.find((item) => item.id === activeSection)?.labelSr
                  : navItems.find((item) => item.id === activeSection)?.labelEn}
              </p>
            </div>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/35 bg-white/10 px-4 text-sm font-black text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow"
              aria-haspopup="dialog"
              aria-expanded={mobileMenuOpen}
            >
              <Menu className="size-4" aria-hidden="true" />
              {locale === "sr" ? "Sve sekcije" : "All sections"}
            </button>
          </div>
        </div>
      </section>

      <main>{children}</main>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 sm:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 h-full w-full rounded-none bg-ink/55 backdrop-blur-[2px]"
            style={{ borderRadius: 0 }}
            onClick={() => setMobileMenuOpen(false)}
            aria-label={locale === "sr" ? "Zatvori meni" : "Close menu"}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="community-mobile-menu-title"
            className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-[24px]! border-2 border-b-0 border-ink bg-paper p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(14,49,88,0.25)]"
          >
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-ink/18" aria-hidden="true" />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg text-ink/70">AI Studio Commons</p>
                <h2 id="community-mobile-menu-title" className="text-xl font-black text-ink">
                  {locale === "sr" ? "Izaberi sekciju" : "Choose a section"}
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="grid size-11 place-items-center rounded-full border border-ink bg-white text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                aria-label={locale === "sr" ? "Zatvori" : "Close"}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <nav className="mt-5 grid gap-2" aria-label={locale === "sr" ? "Sekcije zajednice" : "Community sections"}>
              {navItems.map((item) => (
                <CommunityNavLink
                  key={item.id}
                  item={item}
                  locale={locale}
                  active={activeSection === item.id}
                  href={navHref(locale, item.path, new URLSearchParams(searchParams.toString()))}
                  onNavigate={() => setMobileMenuOpen(false)}
                  mobile
                />
              ))}
            </nav>
            <Link
              href={withLocale(locale, "/app/community/new")}
              onClick={() => setMobileMenuOpen(false)}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-between rounded-[12px] border-2 border-ink bg-yellow px-4 text-sm font-black text-ink shadow-[3px_3px_0_rgba(14,49,88,0.16)]"
            >
              <span className="flex items-center gap-2">
                <PenLine className="size-4" aria-hidden="true" />
                {locale === "sr" ? "Pokreni diskusiju" : "Start a discussion"}
              </span>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </section>
        </div>
      ) : null}
    </div>
  );
}
