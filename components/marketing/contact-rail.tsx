"use client";

import { gsap } from "gsap";
import { Mail, Phone, Share2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/components/ui/primitives";
import { tabTrapAction } from "@/lib/focus-trap";
import { marketingContent, type Locale } from "@/lib/i18n";
import { pageMotionContract } from "@/lib/motion-contract";
import {
  SOCIAL_KEYS,
  type PlatformContact,
  type PlatformSocialKey,
  type PlatformSocials,
} from "@/lib/platform-settings";

const SOCIAL_NAMES: Record<PlatformSocialKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  threads: "Threads",
};

// Ista kriva kao kratke fokusirane interakcije u `lib/motion-contract` — traka
// je mala i lokalna, kao i "focus" scena.
const ITEM_EASE = pageMotionContract.focus.itemEase;

const RAIL_BUTTON_CLASS =
  "grid size-12 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[3px_3px_0_var(--shadow-hard)] transition hover:-translate-y-0.5 hover:bg-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const SOCIAL_ICON_BUTTON_CLASS =
  "grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper-strong text-ink opacity-0 translate-y-2 shadow-[2px_2px_0_var(--shadow-hard)] transition-colors hover:-translate-y-0.5 hover:bg-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

function SocialGlyph({ network, className }: { network: PlatformSocialKey; className?: string }) {
  switch (network) {
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M13.5 21v-7.2h2.4l.4-2.8h-2.8v-1.8c0-.8.2-1.3 1.4-1.3h1.5V5.2c-.3 0-1.1-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.6v2h-2.4v2.8h2.4V21h2.8z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M14 3h2.2c.3 1.7 1.4 3 3.1 3.4v2.2c-1.2 0-2.3-.3-3.3-1v6c0 2.9-2.4 5.3-5.3 5.3S5.4 16.5 5.4 13.6c0-2.8 2.2-5.1 5-5.3v2.2c-1.5.2-2.7 1.5-2.7 3.1 0 1.7 1.4 3.1 3.1 3.1s3.1-1.4 3.1-3.1V3z" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
          <rect x="2.5" y="6" width="19" height="12" rx="3.5" />
          <path d="M10.3 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "threads":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className} aria-hidden="true">
          <path d="M12 3c-3 0-5 2-5 5 0 2 1 3 3 3.5-2 .3-4 1.7-4 4.5 0 3 2.5 5 6 5 4 0 6.5-2.5 6.5-6 0-2.5-1-4-2.5-5" />
        </svg>
      );
  }
}

/**
 * Leva kontakt traka (N5), pandan `ScrollToTop`-u na desnoj ivici. Renderuje se
 * samo na javnim stranama (`(marketing)/layout.tsx`), koje jedine imaju i
 * podnožje sa istim kontaktima za < 640px.
 *
 * Podaci stižu već razrešeni kroz `resolveSettings` (N1): prazno polje znači
 * da dugme ne postoji, nema mrtvih linkova.
 */
export function ContactRail({
  locale,
  contact,
  socials,
}: {
  locale: Locale;
  contact: PlatformContact;
  socials: PlatformSocials;
}) {
  const t = marketingContent[locale].contactRail;
  const socialEntries = SOCIAL_KEYS.filter((key) => socials[key]);
  const [open, setOpen] = useState(false);
  const socialRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const isFirstRender = useRef(true);

  // Zatvara na klik van trake, Escape (i vraca fokus na dugme), i na skrol.
  // Tab dok je otvoreno kruzi samo kroz dugme i ikonice (isti racun kao modal
  // fokus zamka u `components/ui/dialog.tsx`, preko `tabTrapAction`).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (socialRef.current && !socialRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !socialRef.current) return;
      const controls = Array.from(
        socialRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"),
      ).filter((element) => element.offsetParent !== null);
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const action = tabTrapAction({
        count: controls.length,
        activeIndex: active ? controls.indexOf(active) : -1,
        activeInside: socialRef.current.contains(document.activeElement),
        shiftKey: event.shiftKey,
      });
      if (action.kind === "native") return;
      event.preventDefault();
      if (action.kind === "container") socialRef.current.focus();
      else controls[action.index].focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Ikonice ulaze odozdo nagore uz stagger od 40ms, izlaze obrnuto i brze
  // (140ms); bez stagger-a i pokreta kad korisnik trazi manje animacija.
  useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const items = listRef.current
      ? Array.from(listRef.current.querySelectorAll<HTMLElement>("[data-rail-icon]"))
      : [];
    if (!items.length) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (open) {
      if (reduced) {
        gsap.set(items, { opacity: 1, y: 0 });
      } else {
        gsap.fromTo(
          items,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.2, ease: ITEM_EASE, stagger: 0.04, overwrite: true },
        );
      }
    } else if (reduced) {
      gsap.set(items, { opacity: 0, y: 8 });
    } else {
      gsap.to(items, {
        opacity: 0,
        y: 8,
        duration: 0.14,
        ease: ITEM_EASE,
        stagger: { each: 0.04, from: "end" },
        overwrite: true,
      });
    }
  }, [open]);

  if (!contact.phone && !contact.email && socialEntries.length === 0) return null;

  return (
    <div className="fixed bottom-[calc(5rem_+_env(safe-area-inset-bottom))] left-4 z-40 hidden flex-col-reverse items-center gap-3 sm:left-6 sm:flex md:bottom-6">
      {contact.phone ? (
        <a href={`tel:${contact.phone}`} aria-label={t.phoneLabel} title={t.phoneLabel} className={RAIL_BUTTON_CLASS}>
          <Phone className="size-5" aria-hidden="true" />
        </a>
      ) : null}
      {contact.email ? (
        <a href={`mailto:${contact.email}`} aria-label={t.emailLabel} title={t.emailLabel} className={RAIL_BUTTON_CLASS}>
          <Mail className="size-5" aria-hidden="true" />
        </a>
      ) : null}
      {socialEntries.length > 0 ? (
        <div ref={socialRef} className="relative">
          <div
            ref={listRef}
            inert={!open}
            className="absolute bottom-full left-1/2 mb-3 flex -translate-x-1/2 flex-col-reverse items-center gap-2"
          >
            {socialEntries.map((key) => (
              <a
                key={key}
                data-rail-icon
                href={socials[key]}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={SOCIAL_NAMES[key]}
                title={SOCIAL_NAMES[key]}
                className={SOCIAL_ICON_BUTTON_CLASS}
              >
                <SocialGlyph network={key} className="size-4" />
              </a>
            ))}
          </div>
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-label={open ? t.socialsCloseLabel : t.socialsLabel}
            title={open ? t.socialsCloseLabel : t.socialsLabel}
            onClick={() => setOpen((value) => !value)}
            className={cn(RAIL_BUTTON_CLASS, open && "bg-yellow")}
          >
            <Share2 className="size-5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
