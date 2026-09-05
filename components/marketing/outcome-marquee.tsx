"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef } from "react";

import { withLocale, type Locale, type MarqueeItem, type MarqueeTarget } from "@/lib/i18n";

/**
 * Traka ishoda usidrena uz dno heroa (L1). 40 pojmova, svaki je <Link> na svoju sekciju.
 *
 * Petlja: DVE identične kopije liste u `.marquee-track`; CSS pomera za -50% pa se vrati na
 * isti kadar → bešavno. Brzina je KONSTANTNA (~80px/s) nezavisno od broja/širine pojmova:
 * trajanje računamo iz izmerene širine jedne kopije (`--marquee-duration`), a ne fiksno.
 * Inicijalna procena po broju stavki drži razuman tempo do prvog merenja (bez skoka).
 *
 * „Generating" ulazak (naš Studio brend): svaki pojam, svaki put kad uđe s desne ivice,
 * odigra kratko stanje — Sparkles ispred teksta pulsira postojećom `studio-breathe`
 * animacijom, a tekst se otkriva s leva na desno (clip-path) uz blur→oštro. IntersectionObserver
 * (root = viewport) samo dodaje/skida klasu preko `classList` (bez setState po frejmu); klasu
 * skidamo na `animationend` reveal-a pa se efekat ponovi u svakom krugu. Sparkles je i separator
 * između pojmova (ink/40 kad miruje).
 *
 * `bg-yellow` čini traku žutim OSTRVOM svetle palete (globals.css) → `text-ink` je uvek
 * tamnoplavo mastilo u obe teme. Druga kopija je `aria-hidden` + `tabIndex -1` (čitač/tab je
 * ne diraju). Uz `prefers-reduced-motion`: traka stoji, nema generating efekta, pojmovi se
 * lome u redove (flex-wrap) da svi ostanu dostupni — sve u globals.css.
 */

const HREF_BY_TARGET: Record<MarqueeTarget, string> = {
  va: "/courses/video-audio-ai",
  vc: "/courses/vibe-coding",
  studio: "/studio",
  community: "/community",
};

const PIXELS_PER_SECOND = 80;

export function OutcomeMarquee({
  items,
  label,
  hint,
  locale,
}: {
  items: readonly MarqueeItem[];
  label: string;
  hint: string;
  locale: Locale;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLUListElement>(null);

  // Konstantna brzina: trajanje = širina jedne kopije / 80px/s. Merimo pre prvog kadra
  // (useLayoutEffect) i ponovo na resize / kad se font učita (ResizeObserver) — bez skoka.
  useLayoutEffect(() => {
    const copy = copyRef.current;
    const track = trackRef.current;
    if (!copy || !track) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const applyDuration = () => {
      const width = copy.getBoundingClientRect().width;
      if (width > 0) {
        track.style.setProperty("--marquee-duration", `${width / PIXELS_PER_SECOND}s`);
      }
    };

    applyDuration();
    const observer = new ResizeObserver(applyDuration);
    observer.observe(copy);
    return () => observer.disconnect();
  }, [items]);

  // „Generating" na svaki ulazak s desne ivice. IO okida samo classList; klasu skidamo kad
  // se reveal animacija završi (delegirani `animationend`) pa se ponovi u sledećem krugu.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Generating okidamo samo na PRAVI ulazak s desne ivice (prelaz van->u kadar), nikad
    // na pojmove koji su već u kadru pri učitavanju — inače bi blesnuli iz punog u skriveno.
    const offscreen = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (offscreen.has(entry.target)) {
              offscreen.delete(entry.target);
              entry.target.classList.add("is-generating");
            }
          } else {
            offscreen.add(entry.target);
          }
        }
      },
      { root: viewport, threshold: 0 },
    );

    const nodes = viewport.querySelectorAll<HTMLLIElement>(".marquee-item");
    nodes.forEach((node) => observer.observe(node));

    const handleAnimationEnd = (event: AnimationEvent) => {
      if (event.animationName !== "marquee-generate-reveal") return;
      (event.target as HTMLElement).closest(".marquee-item")?.classList.remove("is-generating");
    };
    viewport.addEventListener("animationend", handleAnimationEnd);

    return () => {
      observer.disconnect();
      viewport.removeEventListener("animationend", handleAnimationEnd);
    };
  }, [items, locale]);

  // Procena do prvog merenja: ~256px po pojmu / 80px/s ≈ 3.2s po pojmu.
  const initialDuration = `${(items.length * 3.2).toFixed(0)}s`;

  return (
    <div
      ref={viewportRef}
      role="region"
      aria-label={label}
      className="marquee-viewport absolute inset-x-0 bottom-0 z-30 overflow-hidden border-t-2 border-ink bg-yellow"
    >
      <p className="sr-only">{hint}</p>
      <div
        ref={trackRef}
        className="marquee-track flex w-max items-center"
        style={{ ["--marquee-duration" as string]: initialDuration }}
      >
        {[0, 1].map((copy) => (
          <ul
            key={copy}
            ref={copy === 0 ? copyRef : undefined}
            aria-hidden={copy === 1 ? true : undefined}
            className="marquee-copy flex w-max shrink-0 items-center"
          >
            {items.map((item, index) => (
              <li key={`${copy}-${index}`} className="marquee-item flex shrink-0 items-center">
                <Link
                  href={withLocale(locale, HREF_BY_TARGET[item.target])}
                  tabIndex={copy === 1 ? -1 : undefined}
                  aria-hidden={copy === 1 ? true : undefined}
                  className="marquee-link group/marquee relative flex min-h-11 items-center gap-2 whitespace-nowrap px-5 font-display text-xl text-ink sm:px-7 sm:text-2xl lg:text-3xl"
                >
                  <Sparkles aria-hidden="true" className="marquee-spark size-4 shrink-0 text-ink/40" />
                  <span className="marquee-label">{item.label}</span>
                  <ArrowRight aria-hidden="true" className="marquee-arrow size-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
