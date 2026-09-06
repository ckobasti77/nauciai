"use client";

import {
  ArrowRight,
  GraduationCap,
  LayoutDashboard,
  MessageCircle,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef } from "react";

import { HERO_PLATES, HERO_VIDEO, plateLayout, type HeroPlate } from "@/lib/hero-cards";
import { marketingContent, withLocale, type Locale } from "@/lib/i18n";

/**
 * Hero kartice (L3): 4 klikabilne kartice na listu sveske u hero videu.
 *
 * `HeroCards3d` — sloj u ISTOM roditelju i sa ISTOM klasom (`.hero-cover-media`) kao
 * `<video>` u `HeroLoop`, pa deli njegovu geometriju (contain po širini / visini, desno
 * poravnanje na lg+) na svakoj rezoluciji. Svaka kartica dobija layout box = veličina
 * svoje ploče u CSS px i `matrix3d` homografiju (`plateLayout`) koja box položi tačno na
 * ploču; ResizeObserver to piše inline na svaki resize (bez setState po frejmu). Kartice su
 * namerno RAZLIČITIH veličina — bliža ploča je veća i nosi više sadržaja (container query
 * u globals.css). Prikaz/skrivanje sloja i praga rešava CSS (`@media` u globals.css,
 * izveden iz `heroCardsBreakpoint()`), a ne JS — SSR i prvi kadar su tačni.
 *
 * `HeroCardsRow` — ispod praga iste 4 kartice kao horizontalni snap red iznad trake.
 *
 * Oba su uvek u DOM-u; CSS gasi jedan (`display: none` ga vadi iz tab reda i a11y stabla).
 * Četvrta ploča: Registracija za anonimnog, Kontrolna tabla za ulogovanog (server zna).
 */

type CardVariant = "courses" | "studio" | "community" | "signIn" | "dashboard";

const ICON: Record<CardVariant, LucideIcon> = {
  courses: GraduationCap,
  studio: Sparkles,
  community: MessageCircle,
  signIn: UserPlus,
  dashboard: LayoutDashboard,
};

const HREF: Record<CardVariant, string> = {
  courses: "/courses",
  studio: "/studio",
  community: "/community",
  signIn: "/sign-in",
  dashboard: "/app",
};

type CardItem = {
  plate: HeroPlate;
  variant: CardVariant;
  title: string;
  line: string;
  href: string;
  Icon: LucideIcon;
};

function cardItems(locale: Locale, signedIn: boolean): CardItem[] {
  const copy = marketingContent[locale].hero.cards;
  return HERO_PLATES.map((plate) => {
    const variant: CardVariant = plate.key === "account" ? (signedIn ? "dashboard" : "signIn") : plate.key;
    return {
      plate,
      variant,
      title: copy[variant].title,
      line: copy[variant].line,
      href: withLocale(locale, HREF[variant]),
      Icon: ICON[variant],
    };
  });
}

export function HeroCards3d({ locale, signedIn }: { locale: Locale; signedIn: boolean }) {
  const layerRef = useRef<HTMLElement>(null);
  const label = marketingContent[locale].hero.cards.label;
  const items = cardItems(locale, signedIn);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const cards = Array.from(layer.querySelectorAll<HTMLElement>("[data-plate]"));

    const apply = () => {
      // `display: none` ispod praga → širina 0 → ništa ne pišemo; kad media query upali
      // sloj, ResizeObserver javi novu širinu i tek tada računamo geometriju.
      const width = layer.offsetWidth;
      if (width <= 0) return;
      const scale = width / HERO_VIDEO.width;
      for (const card of cards) {
        const plate = HERO_PLATES.find((p) => p.key === card.dataset.plate);
        if (!plate) continue;
        const layout = plateLayout(plate, scale);
        card.style.width = `${layout.width}px`;
        card.style.height = `${layout.height}px`;
        card.style.transform = layout.matrix3d;
      }
      layer.dataset.ready = "";
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);

  return (
    <nav ref={layerRef} aria-label={label} className="hero-cover-media hero-cards-3d">
      {items.map(({ plate, title, line, href, Icon }) => (
        <Link
          key={plate.key}
          href={href}
          data-plate={plate.key}
          aria-label={`${title} — ${line}`}
          className="hero-card"
        >
          <span className="hero-card-face">
            <Icon aria-hidden="true" className="hero-card-icon" />
            <span className="hero-card-title font-display">{title}</span>
            <span className="hero-card-line font-bold">{line}</span>
            <ArrowRight aria-hidden="true" className="hero-card-arrow" />
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function HeroCardsRow({ locale, signedIn }: { locale: Locale; signedIn: boolean }) {
  const label = marketingContent[locale].hero.cards.label;
  const items = cardItems(locale, signedIn);

  return (
    <nav
      aria-label={label}
      className="hero-cards-row absolute inset-x-0 z-20 overflow-x-auto"
      style={{ bottom: "calc(var(--marquee-h) + 12px)" }}
    >
      <ul className="flex snap-x snap-mandatory gap-3 px-4 sm:px-6 lg:px-8">
        {items.map(({ plate, title, line, href, Icon }) => (
          <li key={plate.key} className="flex min-w-[168px] flex-1 snap-start">
            <Link
              href={href}
              aria-label={`${title} — ${line}`}
              className="flex h-16 w-full items-center gap-3 rounded-[16px] border-2 border-ink bg-paper-strong px-4 font-display text-lg leading-none text-ink shadow-[3px_3px_0_0_var(--shadow-hard-16)] transition-transform duration-[180ms] ease-[var(--ease-studio-out)] hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
