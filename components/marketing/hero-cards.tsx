"use client";

import { gsap } from "gsap";
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

import {
  HERO_GEOMETRY,
  HERO_PLATES,
  heroPlates,
  liftMatrix3d,
  plateLayout,
  type HeroGeometry,
  type HeroPlate,
  type HeroPlateKey,
  type PlateLayout,
} from "@/lib/hero-cards";
import { marketingContent, withLocale, type Locale } from "@/lib/i18n";
import { heroCardLift } from "@/lib/motion-contract";

/**
 * Hero kartice (L3 / L3.1): 4 klikabilne kartice na listu sveske u hero videu.
 *
 * `HeroCards3d` — sloj u ISTOM roditelju i sa ISTOM klasom (`.hero-cover-media`) kao
 * `<video>` u `HeroLoop`, pa deli njegovu geometriju (landscape: contain / desno; portret:
 * height-fit / centrirano) na svakoj rezoluciji. Geometrija se čita iz samog box-a (CSS mu
 * daje `aspect-ratio` po orijentaciji): visina > širina ⇒ portret list. Svaka kartica dobija
 * layout box = veličina svoje ploče u CSS px i `matrix3d` homografiju (`plateLayout`) koja
 * box položi tačno na ploču; ResizeObserver to piše inline na svaki resize (bez setState po
 * frejmu). Kartice su namerno RAZLIČITIH veličina — bliža ploča je veća i nosi više sadržaja
 * (container query u globals.css). Prikaz/skrivanje sloja i pragove rešava CSS (`@media` u
 * globals.css, izveden iz `heroCardsMediaQuery()`), a ne JS — SSR i prvi kadar su tačni.
 *
 * HOVER (L3.1): kartica se podiže PO NORMALI LISTA. `plateLayout` daje i podignut quad
 * (`plateLiftedQuadVideoPx`: dekompozicija homografije lista → normala, h = 6 % širine
 * lista); GSAP tween-uje `t` 0→1 (200 ms, ease iz `heroCardLift`) i po frejmu se piše
 * `liftMatrix3d(layout, t)` — homografija ka linearno interpolisanim uglovima, a NE CSS
 * interpolacija dve `matrix3d` vrednosti (ta „talasa"). Senka ostaje na papiru: JS piše
 * `--hero-lift-sx/sy` (lokalni px, suprotno od podizanja), CSS ih dodaje na osnovni offset.
 * Active spušta karticu na list (120 ms); reduced-motion skače bez tween-a; touch pointer ne
 * podiže (tap odmah navigira).
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

type CardState = {
  layout: PlateLayout;
  /** Trenutni lift 0–1 (GSAP tween-uje ovaj objekat). */
  lift: { t: number };
  /** Cilj: 1 dok je kartica pod kursorom/fokusom, 0 inače; pritisak privremeno spušta na 0. */
  hovered: boolean;
  pressed: boolean;
};

export function HeroCards3d({ locale, signedIn }: { locale: Locale; signedIn: boolean }) {
  const layerRef = useRef<HTMLElement>(null);
  const label = marketingContent[locale].hero.cards.label;
  const items = cardItems(locale, signedIn);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const cards = Array.from(layer.querySelectorAll<HTMLElement>("[data-plate]"));
    const states = new Map<HTMLElement, CardState>();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const paint = (card: HTMLElement, state: CardState) => {
      const { layout, lift } = state;
      card.style.transform = liftMatrix3d(layout, lift.t);
      card.style.setProperty("--hero-lift-sx", `${(layout.shadow[0] * lift.t).toFixed(2)}px`);
      card.style.setProperty("--hero-lift-sy", `${(layout.shadow[1] * lift.t).toFixed(2)}px`);
    };

    const apply = () => {
      // `display: none` ispod praga → širina 0 → ništa ne pišemo; kad media query upali
      // sloj, ResizeObserver javi novu širinu i tek tada računamo geometriju.
      const width = layer.offsetWidth;
      const height = layer.offsetHeight;
      if (width <= 0) return;
      const geometry: HeroGeometry = height > width ? "portrait" : "landscape";
      const plates = heroPlates(geometry);
      const scale = width / HERO_GEOMETRY[geometry].video.width;
      for (const card of cards) {
        const plate = plates.find((p) => p.key === (card.dataset.plate as HeroPlateKey));
        if (!plate) continue;
        const layout = plateLayout(plate, scale);
        const previous = states.get(card);
        const state: CardState = previous
          ? { ...previous, layout }
          : { layout, lift: { t: 0 }, hovered: false, pressed: false };
        states.set(card, state);
        card.style.width = `${layout.width}px`;
        card.style.height = `${layout.height}px`;
        paint(card, state);
      }
      layer.dataset.ready = "";
    };

    const settle = (card: HTMLElement, duration: number) => {
      const state = states.get(card);
      if (!state) return;
      const target = state.hovered && !state.pressed ? 1 : 0;
      gsap.killTweensOf(state.lift);
      if (reduceMotion.matches || duration === 0) {
        state.lift.t = target;
        paint(card, state);
        return;
      }
      gsap.to(state.lift, {
        t: target,
        duration,
        ease: heroCardLift.ease,
        overwrite: true,
        onUpdate: () => paint(card, state),
      });
    };

    const isHoverPointer = (event: PointerEvent) => event.pointerType !== "touch";

    const onPointerEnter = (event: PointerEvent) => {
      if (!isHoverPointer(event)) return;
      const card = event.currentTarget as HTMLElement;
      const state = states.get(card);
      if (!state) return;
      state.hovered = true;
      settle(card, heroCardLift.duration);
    };
    const onPointerLeave = (event: PointerEvent) => {
      const card = event.currentTarget as HTMLElement;
      const state = states.get(card);
      if (!state) return;
      state.hovered = card.matches(":focus-visible");
      state.pressed = false;
      settle(card, heroCardLift.duration);
    };
    const onPointerDown = (event: PointerEvent) => {
      const card = event.currentTarget as HTMLElement;
      const state = states.get(card);
      if (!state) return;
      state.pressed = true;
      settle(card, heroCardLift.activeDuration);
    };
    const onPointerUp = (event: PointerEvent) => {
      const card = event.currentTarget as HTMLElement;
      const state = states.get(card);
      if (!state) return;
      state.pressed = false;
      if (!isHoverPointer(event)) state.hovered = false;
      settle(card, heroCardLift.duration);
    };
    const onFocus = (event: FocusEvent) => {
      const card = event.currentTarget as HTMLElement;
      const state = states.get(card);
      if (!state || !card.matches(":focus-visible")) return;
      state.hovered = true;
      settle(card, heroCardLift.duration);
    };
    const onBlur = (event: FocusEvent) => {
      const card = event.currentTarget as HTMLElement;
      const state = states.get(card);
      if (!state) return;
      state.hovered = card.matches(":hover");
      state.pressed = false;
      settle(card, heroCardLift.duration);
    };

    for (const card of cards) {
      card.addEventListener("pointerenter", onPointerEnter);
      card.addEventListener("pointerleave", onPointerLeave);
      card.addEventListener("pointerdown", onPointerDown);
      card.addEventListener("pointerup", onPointerUp);
      card.addEventListener("pointercancel", onPointerUp);
      card.addEventListener("focus", onFocus);
      card.addEventListener("blur", onBlur);
    }

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(layer);
    return () => {
      observer.disconnect();
      for (const card of cards) {
        card.removeEventListener("pointerenter", onPointerEnter);
        card.removeEventListener("pointerleave", onPointerLeave);
        card.removeEventListener("pointerdown", onPointerDown);
        card.removeEventListener("pointerup", onPointerUp);
        card.removeEventListener("pointercancel", onPointerUp);
        card.removeEventListener("focus", onFocus);
        card.removeEventListener("blur", onBlur);
        const state = states.get(card);
        if (state) gsap.killTweensOf(state.lift);
      }
    };
  }, []);

  return (
    <nav ref={layerRef} aria-label={label} className="hero-cover-media hero-cards-3d" data-dual="">
      {items.map(({ plate, title, line, href, Icon }) => (
        <Link
          key={plate.key}
          href={href}
          data-plate={plate.key}
          aria-label={`${title} — ${line}`}
          className="hero-card"
        >
          <span className="hero-card-face">
            {/* Akcentni potez uz gornju ivicu (v2): suptilan u mirovanju, iscrta se preko cele
                širine na hover/focus (scaleX 0→1). */}
            <span className="hero-card-accent" aria-hidden="true" />
            <span className="hero-card-iconwrap">
              {/* Iskra sevne jednom iza ikone na hover/focus. */}
              <Sparkles aria-hidden="true" className="hero-card-spark" />
              <Icon aria-hidden="true" className="hero-card-icon" />
            </span>
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
  const navRef = useRef<HTMLElement>(null);

  // Na dodiru nema hover-a: ista koreografija (potez/ikona/iskra) se odigra JEDNOM kad red uđe
  // u kadar — `.is-drawn` na <nav> upali animacije (CSS), IntersectionObserver ga skine iz
  // posmatranja. reduced-motion: global blok gasi trajanja, pa je efekat statičan.
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nav.classList.add("is-drawn");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            nav.classList.add("is-drawn");
            io.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(nav);
    return () => io.disconnect();
  }, []);

  return (
    <nav
      ref={navRef}
      aria-label={label}
      className="hero-cards-row absolute inset-x-0 z-20 overflow-x-auto"
      style={{ bottom: "calc(var(--marquee-h) + 12px)" }}
    >
      <ul className="flex snap-x snap-mandatory gap-3 px-4 sm:px-6 lg:px-8">
        {items.map(({ plate, title, line, href, Icon }) => (
          <li key={plate.key} className="flex min-w-[168px] flex-1 snap-start">
            <Link
              href={href}
              data-plate={plate.key}
              aria-label={`${title} — ${line}`}
              className="hero-row-card relative flex h-16 w-full items-center gap-3 rounded-[16px] border-2 border-ink bg-paper-strong px-4 font-display text-lg leading-none text-ink shadow-[3px_3px_0_0_var(--shadow-hard-16)] transition-transform duration-[180ms] ease-[var(--ease-studio-out)] hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span className="hero-row-accent" aria-hidden="true" />
              <span className="hero-card-iconwrap hero-row-iconwrap shrink-0">
                <Sparkles aria-hidden="true" className="hero-card-spark" />
                <Icon aria-hidden="true" className="hero-card-icon" />
              </span>
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
