"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ChevronDown, CreditCard, LogOut, UserRound, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { ViewerProfile } from "@/lib/current-viewer";
import { dictionary, type Locale, withLocale } from "@/lib/i18n";

type AccountProfile = NonNullable<ViewerProfile>;

function profileInitials(profile: AccountProfile) {
  const fallback = profile.email?.split("@")[0] ?? "AI";
  const source = profile.name ?? fallback;
  const initials = source
    .split(/\s+/)
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return initials || "AI";
}

function displayName(profile: AccountProfile, locale: Locale) {
  if (profile.name?.trim()) {
    return profile.name.trim();
  }

  if (profile.firstName?.trim() || profile.lastName?.trim()) {
    return [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  }

  return profile.email?.split("@")[0] || (locale === "sr" ? "Moj nalog" : "My account");
}

export function AccountMenu({ locale, profile }: { locale: Locale; profile: AccountProfile }) {
  const t = dictionary[locale];
  const router = useRouter();
  const { signOut } = useAuthActions();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const name = displayName(profile, locale);
  const email = profile.email ?? (locale === "sr" ? "Nalog bez emaila" : "Account without email");
  const initials = profileInitials(profile);
  const roleLabel =
    profile.role === "admin"
      ? "Admin"
      : profile.role === "pro_student"
        ? "Pro"
        : locale === "sr"
          ? "Student"
          : "Student";
  const avatarLabel = locale === "sr" ? "Otvori meni naloga" : "Open account menu";

  // Query notifications
  const summary = useQuery(api.notifications.getUserNotificationSummary, {});
  const overallCount = summary?.total ?? 0;
  const communityCount = summary?.community ?? 0;
  const billingCount = summary?.billing ?? 0;
  const profileStatus = useQuery(api.profiles.getViewerProfileStatus, {});
  const profileIncomplete = profileStatus?.complete === false;

  const menuLinks = [
    {
      href: withLocale(locale, "/app/community"),
      label: t.community,
      icon: MessageCircle,
      badge: communityCount,
    },
    {
      href: withLocale(locale, "/app/profile"),
      label: t.profile,
      icon: UserRound,
      badge: profileIncomplete ? 1 : 0,
    },
    {
      href: withLocale(locale, "/app/billing"),
      label: t.billing,
      icon: CreditCard,
      badge: billingCount,
    },
  ];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function handleSignOut() {
    setIsPending(true);
    try {
      await signOut();
      setIsOpen(false);
      router.push(withLocale(locale, "/sign-in"));
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={avatarLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((value) => !value)}
        className="group relative inline-flex h-11 items-center gap-1 rounded-full border-2 border-ink bg-white p-1 pr-2 text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5 hover:bg-yellow/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <span className="inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-ink bg-yellow text-xs font-black">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span>{initials}</span>
          )}
        </span>
        <ChevronDown
          className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
        {overallCount > 0 ? (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white border-2 border-ink shrink-0">
            {overallCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[calc(100vw-1.5rem)] max-w-[19.5rem] rounded-[16px] border-2 border-ink bg-white p-2.5 text-ink shadow-[8px_8px_0_0_rgba(14,49,88,0.14)] sm:w-[19.5rem]"
        >
          <span
            aria-hidden="true"
            className="absolute -top-2 right-6 size-4 rotate-45 border-l-2 border-t-2 border-ink bg-white"
          />

          <div className="rounded-[8px] border-2 border-dashed border-ink bg-paper p-3 text-center">
            <div className="mx-auto inline-flex size-16 items-center justify-center overflow-hidden rounded-full border-2 border-ink bg-yellow text-xl font-black shadow-[3px_3px_0_0_rgba(14,49,88,0.16)]">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <p className="mt-2 font-display text-3xl leading-none text-ink">{name}</p>
            {profile.username ? (
              <p className="mt-0.5 font-mono text-[11px] font-bold text-muted/80">@{profile.username}</p>
            ) : null}
            <p className="mt-1 break-all font-mono text-[11px] font-bold uppercase text-muted">{email}</p>
            {profileIncomplete ? (
              <p className="mt-2 rounded-full border border-amber-500 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-900">
                {locale === "sr" ? "Podesi username" : "Set your username"}
              </p>
            ) : null}
            <span className="mt-2 inline-flex rounded-full border-2 border-ink bg-white px-3 py-1 text-[10px] font-black uppercase leading-none text-ink">
              {roleLabel}
            </span>
          </div>

          <div className="mt-2 overflow-hidden rounded-[12px] divide-y divide-line/80">
            {menuLinks.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setIsOpen(false)}
                  className="group/link flex min-h-10 items-center justify-between gap-3 bg-white px-3 py-2 text-[13px] font-black uppercase text-ink transition hover:bg-yellow/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-paper text-ink">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge && item.badge > 0 ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white border border-ink shrink-0">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>

          <div className="mt-2 border-t border-line/90 pt-2">
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={isPending}
              className="flex min-h-10 w-full items-center justify-between gap-3 rounded-[10px] bg-ink px-3 py-2 text-left text-[13px] font-black uppercase text-white transition hover:bg-[#16446f] disabled:cursor-wait disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-ink">
                  <LogOut className="size-3.5" />
                </span>
                <span className="truncate">{locale === "sr" ? "Odjavi se" : "Sign out"}</span>
              </span>
              {isPending ? <span className="font-mono text-[11px] text-white/70">...</span> : null}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
