"use client";

import {
  ArrowUpRight,
  BookOpen,
  CreditCard,
  Crown,
  GraduationCap,
  LogOut,
  Settings,
  Shield,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { SoundToggle } from "@/components/app/sound-toggle";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { LanguageToggle } from "@/components/marketing/language-toggle";
import { CreditIcon } from "@/components/studio/credit-icon";
import { cn } from "@/components/ui/primitives";
import { dictionary, type Locale, withLocale } from "@/lib/i18n";
import { formatCreditsLong } from "@/lib/studio-params";

/** Kartica kredita — stoji i u mobilnom zaglavlju sidebara i u redu alatki ovog menija. */
export function CreditsBalancePill({
  locale,
  balance,
  className,
}: {
  locale: Locale;
  balance: number | null | undefined;
  className?: string;
}) {
  if (balance === null) return null;

  return (
    <Link
      href={withLocale(locale, "/app/credits")}
      aria-label={
        balance === undefined
          ? locale === "sr"
            ? "Stanje kredita"
            : "Credits balance"
          : locale === "sr"
            ? `Stanje: ${formatCreditsLong(balance, locale)}`
            : `Balance: ${formatCreditsLong(balance, locale)}`
      }
      className={cn(
        "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border-2 border-ink px-2.5 py-1 text-xs font-black transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        balance === 0 ? "bg-amber-100 text-amber-900" : "bg-paper-strong text-ink",
        className,
      )}
    >
      <CreditIcon className="size-3.5" />
      <span>{balance === undefined ? "—" : balance.toLocaleString(locale === "sr" ? "sr-RS" : "en-US")}</span>
    </Link>
  );
}

/** Shared so the rail can decide whether to offer Upgrade without re-deriving the plan. */
export function resolvePlan(role?: string, plan?: string) {
  const normalizedRole = role ?? "student";
  return plan ?? (normalizedRole === "admin" ? "admin" : normalizedRole === "moderator" ? "moderator" : "free");
}

export function planOffersUpgrade(plan: string) {
  return plan === "free" || plan === "lite";
}

export function SidebarRoleBadge({
  role,
  plan,
  locale,
  variant = "inline",
}: {
  role?: string;
  plan?: string;
  locale: Locale;
  variant?: "inline" | "collapsed";
}) {
  const resolvedPlan = resolvePlan(role, plan);

  const label =
    resolvedPlan === "admin"
      ? "Administrator"
      : resolvedPlan === "moderator"
        ? "Moderator"
        : resolvedPlan === "pro"
          ? "Pro plan"
          : resolvedPlan === "lite"
            ? "Lite plan"
            : "Free plan";

  // The profile card is the narrowest place this badge has ever lived; the full label
  // would push the name into a two-character truncation.
  const shortLabel =
    resolvedPlan === "admin"
      ? "Admin"
      : resolvedPlan === "moderator"
        ? "Mod"
        : resolvedPlan === "pro"
          ? "Pro"
          : resolvedPlan === "lite"
            ? "Lite"
            : "Free";

  const RoleIcon =
    resolvedPlan === "admin"
      ? ShieldCheck
      : resolvedPlan === "moderator"
        ? Shield
        : resolvedPlan === "pro"
          ? Crown
          : resolvedPlan === "lite"
            ? GraduationCap
            : BookOpen;

  const tone = cn(
    resolvedPlan === "admin" && "bg-yellow",
    resolvedPlan === "moderator" && "bg-ink text-paper-strong",
    resolvedPlan === "pro" && "bg-[#dfc4ff] dark:text-paper",
    resolvedPlan === "lite" && "bg-[#d1e5ff] dark:text-paper",
    resolvedPlan === "free" && "bg-[#ffeed1] dark:text-paper",
  );

  if (variant === "collapsed") {
    return (
      <span
        role="status"
        aria-label={`${locale === "sr" ? "Uloga" : "Role"}: ${label}`}
        title={label}
        className={cn(
          "flex size-9 items-center justify-center rounded-full border-2 border-ink text-ink shadow-[2px_2px_0_0_var(--shadow-hard-12)]",
          tone,
        )}
      >
        <RoleIcon className="size-4" />
      </span>
    );
  }

  return (
    <span
      role="status"
      aria-label={`${locale === "sr" ? "Uloga" : "Role"}: ${label}`}
      title={label}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full border-2 border-ink px-2 py-1 type-eyebrow-sm text-ink shadow-[2px_2px_0_0_var(--shadow-hard-12)]",
        tone,
      )}
    >
      <RoleIcon className="size-3" />
      <span>{shortLabel}</span>
    </span>
  );
}

const ROW =
  "flex min-h-11 items-center justify-between gap-3 bg-paper-strong px-3 py-2 text-[13px] font-black uppercase text-ink transition hover:bg-yellow/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink";
const ROW_ICON = "inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-paper text-ink";

function MenuRow({
  href,
  onNavigate,
  icon,
  children,
  tone,
}: {
  href: string;
  onNavigate: () => void;
  icon: ReactNode;
  children: ReactNode;
  tone?: "upgrade";
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className={cn(ROW, tone === "upgrade" && "bg-yellow hover:bg-yellow/80")}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className={cn(ROW_ICON, tone === "upgrade" && "bg-paper-strong")}>{icon}</span>
        <span className="truncate">{children}</span>
      </span>
    </Link>
  );
}

/**
 * Meni naloga u dashboardu (N9) — isti oblik kao dropdown naloga na javnim stranama
 * (`components/marketing/account-menu.tsx`): isti radius, ista tvrda senka, isti repić
 * ka dugmetu koje ga otvara, prvi red liste JE profil (slika u krugu + ime + @korisničko
 * ime + uloga desno), pa linkovi, pa red alatki, pa „Odjavi se" preko cele širine.
 *
 * Sadržaj je dashboardski: umesto Zajednice/Poruka (koje ovde stoje u samoj navigaciji)
 * idu Podešavanja i Pretplata, a red alatki nosi kredite, zvuk, temu i jezik.
 *
 * Isti panel koristi i prošireni sidebar (iznad kartice profila) i rail (desno od
 * avatara) — razlikuje ih samo strana na koju gleda repić.
 */
export function AppAccountMenu({
  locale,
  name,
  username,
  initials,
  avatarUrl,
  role,
  plan,
  needsAttention = false,
  creditsBalance,
  languageHref,
  upgradeHref,
  onNavigate,
  onSignOut,
  signOutPending = false,
  placement,
  className,
}: {
  locale: Locale;
  name: string;
  username?: string;
  initials: string;
  avatarUrl?: string;
  role?: string;
  plan?: string;
  needsAttention?: boolean;
  creditsBalance?: number | null;
  languageHref: string;
  /** Kad plan nudi nadogradnju — inače se red ne renderuje. */
  upgradeHref?: string;
  onNavigate: () => void;
  onSignOut: () => void;
  signOutPending?: boolean;
  /** `above` = iznad kartice profila (repić dole), `right` = pored raila (repić levo). */
  placement: "above" | "right";
  className?: string;
}) {
  const t = dictionary[locale];

  return (
    <div
      role="menu"
      aria-label={t.accountMenu}
      className={cn(
        "absolute z-50 w-[min(19.5rem,calc(100vw-2rem))] rounded-[16px] border-2 border-ink bg-paper-strong p-2 text-ink shadow-[8px_8px_0_0_var(--shadow-hard-14)]",
        placement === "above" ? "bottom-[calc(100%+0.65rem)] left-3" : "bottom-0 left-[calc(100%+0.9rem)]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute size-4 rotate-45 border-ink bg-paper-strong",
          placement === "above" ? "-bottom-2 left-6 border-b-2 border-r-2" : "-left-2 bottom-6 border-b-2 border-l-2",
        )}
      />

      <div className="overflow-hidden rounded-[12px] divide-y divide-line/80">
        <Link
          href={withLocale(locale, "/app/profile")}
          role="menuitem"
          onClick={onNavigate}
          className={ROW}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="relative inline-flex size-7 shrink-0 items-center justify-center">
              <span className="flex size-7 items-center justify-center overflow-hidden rounded-full bg-yellow text-[10px] font-black text-ink">
                {avatarUrl ? (
                  /* Avatar URLs are user-provided at runtime and intentionally avoid Next image host restrictions. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </span>
              {/* Upozorenja o nalogu nose istu tačku kao na javnim stranama — meni ne
                  ponavlja spisak, on stoji na /app/profile gde se i rešava. */}
              {needsAttention ? (
                <span
                  aria-label={locale === "sr" ? "Nalog traži pažnju" : "Account needs attention"}
                  className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border border-ink bg-amber-400"
                />
              ) : null}
            </span>
            <span className="flex min-w-0 flex-col text-left leading-tight">
              <span className="truncate text-[13px] font-black uppercase">{name}</span>
              {username ? (
                <span className="truncate font-mono text-[11px] font-bold normal-case text-muted">@{username}</span>
              ) : null}
            </span>
          </span>
          <SidebarRoleBadge role={role} plan={plan} locale={locale} />
        </Link>

        <MenuRow href={`${withLocale(locale, "/app/profile")}#account-settings`} onNavigate={onNavigate} icon={<Settings className="size-3.5" />}>
          {t.accountSettings}
        </MenuRow>
        <MenuRow href={withLocale(locale, "/app/billing")} onNavigate={onNavigate} icon={<CreditCard className="size-3.5" />}>
          {t.billing}
        </MenuRow>
        {upgradeHref ? (
          <MenuRow href={upgradeHref} onNavigate={onNavigate} icon={<ArrowUpRight className="size-3.5" />} tone="upgrade">
            {t.upgradePlan}
          </MenuRow>
        ) : null}
      </div>

      {/* Red alatki: krediti levo, prekidači desno (zvuk, tema, jezik). */}
      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-line/90 pt-1.5">
        <CreditsBalancePill locale={locale} balance={creditsBalance} />
        <div className="flex items-center gap-1.5">
          <SoundToggle locale={locale} iconOnly />
          <ThemeToggle locale={locale} />
          <LanguageToggle locale={locale} href={languageHref} />
        </div>
      </div>

      <div className="mt-1.5">
        <button
          type="button"
          role="menuitem"
          onClick={onSignOut}
          disabled={signOutPending}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[12px] bg-ink px-3 py-2 text-left text-[13px] font-black uppercase text-paper-strong transition hover:bg-ink/90 dark:hover:bg-ink/85 disabled:cursor-wait disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-paper-strong text-ink">
              <LogOut className="size-3.5" />
            </span>
            <span className="truncate">{t.signOut}</span>
          </span>
          {signOutPending ? <span className="font-mono text-[11px] text-paper-strong/70">...</span> : null}
        </button>
      </div>
    </div>
  );
}
