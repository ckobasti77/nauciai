"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef } from "react";

import { withLocale, type Locale, type MarqueeItem, type MarqueeTarget } from "@/lib/i18n";

/**
 * Traka ishoda usidrena uz dno heroa (L1.1). 40 pojmova, svaki je <Link> na svoju sekciju.
 *
 * Petlja: DVE identične kopije liste u `.marquee-track`; CSS pomera za -50% pa se vrati na
 * isti kadar → bešavno. Brzina KONSTANTNA (~80px/s): trajanje = širina jedne kopije / 80,
 * izmereno u `useLayoutEffect` (+ ResizeObserver), a ne fiksno.
 *
 * TERMINAL „generisanje" (L1.1): pojam van ekrana / u ulasku je `is-pending` — tekst je širine
 * 0 uz `overflow: hidden` pa se NE vidi NIJEDNO slovo; vidi se samo Sparkles koji „diše"
 * (studio-breathe), BEZ kursora. Kad pojam CEO uđe u kadar trake (IntersectionObserver
 * threshold 1.0) ulazi u FIFO red kucanja (L3.1): kuca najviše JEDAN pojam u datom trenutku,
 * sledeći kreće na `animationend` prethodnog; višak preko 2 u redu se rešava odmah bez kucanja.
 * `is-typing`: širina 0→100% u `steps(N)` (N = broj karaktera; trajanje+koraci postavljeni
 * inline iz JS-a) uz trepćući blok-kursor (border-right, ne propušta tekst; postoji SAMO dok
 * kuca), pa na kraju kucanja → resolved (kursor nestaje, Sparkles se stiša na ink/40, tekst
 * pun). Kad pojam potpuno izađe levo → opet `is-pending`, pa se u sledećem krugu ponovo
 * „kuca". Širinu reda drži nevidljivi duplikat (`.marquee-ghost`) pa traka ne skače dok se
 * tekst ispisuje. Samo classList + inline `animation` u IO callback-u (bez setState po
 * frejmu); animiraju se width/opacity/boja.
 *
 * POVRATAK NA TAB (L3.1): na `visibilitychange: hidden` / `window blur` traka se pauzira
 * (`is-paused`) i aktivno kucanje se završi; na `visible` / `focus` / `pageshow` (bfcache) se
 * skine pauza i RE-SYNC bez animacija (u kadru = resolved, desno van = pending), pa kucaju
 * tek pojmovi koji od tada uđu.
 *
 * `bg-yellow` čini traku žutim OSTRVOM svetle palete (globals.css) → `text-ink` je uvek
 * tamnoplavo mastilo u obe teme. Druga kopija je `aria-hidden` + `tabIndex -1`. Uz
 * `prefers-reduced-motion`: traka stoji, nema pending/typing, sve je statično resolved i
 * pojmovi se lome u redove (flex-wrap) — sve u globals.css.
 */

const HREF_BY_TARGET: Record<MarqueeTarget, string> = {
  va: "/courses/video-audio-ai",
  vc: "/courses/vibe-coding",
  studio: "/studio",
  community: "/community",
};

const PIXELS_PER_SECOND = 80;
const MS_PER_CHAR = 45;
const TYPE_MIN_S = 0.5;
const TYPE_MAX_S = 1.4;

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

  // Terminal state-machine: pending → (red) → typing → resolved → (izlaz levo) → pending.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const nodes = Array.from(viewport.querySelectorAll<HTMLLIElement>(".marquee-item"));

    // Treperenje kursora (border-right ink↔providno) — SAMO dok pojam kuca. Animaciju width-a
    // (kucanje) i kursor vodimo INLINE kroz `animation` shorthand: `steps(N)` mora biti
    // literalan (var() u steps() nije svuda podržan), a inline kontrola izbegava sudar
    // tajminga sa CSS-om.
    const CARET = "marquee-caret 1s linear infinite";

    // Red kucanja (L3.1): kuca najviše JEDAN pojam; ostali koji su ceo ušli čekaju u FIFO redu
    // (bez kursora, samo Sparkles diše). Ako red naraste preko 2 (brz resize), najstariji
    // čekajući se rešava odmah bez kucanja.
    const QUEUE_MAX = 2;
    let queue: HTMLLIElement[] = [];
    let active: HTMLLIElement | null = null;

    const setPending = (li: HTMLLIElement) => {
      const type = li.querySelector<HTMLElement>(".marquee-type");
      li.classList.remove("is-typing");
      li.classList.add("is-pending");
      if (type) type.style.animation = "none"; // tekst širine 0 (CSS) → NIŠTA se ne vidi, bez kursora
    };

    const startTyping = (li: HTMLLIElement) => {
      const type = li.querySelector<HTMLElement>(".marquee-type");
      if (!type) return;
      const chars = Math.max(1, Number(li.dataset.len) || 1);
      const dur = Math.min(TYPE_MAX_S, Math.max(TYPE_MIN_S, (chars * MS_PER_CHAR) / 1000));
      li.classList.remove("is-pending");
      li.classList.add("is-typing");
      type.style.animation = `marquee-type ${dur}s steps(${chars}, end) forwards, ${CARET}`;
    };

    const resolve = (li: HTMLLIElement) => {
      const type = li.querySelector<HTMLElement>(".marquee-type");
      li.classList.remove("is-pending", "is-typing");
      if (type) type.style.animation = "none"; // pun tekst (CSS width:100%), bez kursora
    };

    const startNext = () => {
      if (active) return;
      const next = queue.shift();
      if (!next) return;
      active = next;
      startTyping(next);
    };

    const enqueue = (li: HTMLLIElement) => {
      if (queue.includes(li)) return;
      queue.push(li);
      while (queue.length > QUEUE_MAX) {
        const oldest = queue.shift();
        if (oldest) resolve(oldest);
      }
      startNext();
    };

    const drop = (li: HTMLLIElement) => {
      queue = queue.filter((item) => item !== li);
      if (active === li) {
        active = null;
        startNext();
      }
    };

    // Re-sync bez animacija: sve što je u kadru (ili ulazi) = resolved, sve desno van = pending.
    // Tek pojmovi koji od ovog trenutka ceo uđu kucaju.
    const resync = () => {
      queue = [];
      active = null;
      const rootRight = viewport.getBoundingClientRect().right;
      for (const li of nodes) {
        if (li.getBoundingClientRect().left >= rootRight) setPending(li);
        else resolve(li);
      }
    };

    resync();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const li = entry.target as HTMLLIElement;
          if (entry.intersectionRatio >= 0.99) {
            // Pojam je CEO u kadru → u red za kucanje (samo ako je čekao kao pending).
            if (li.classList.contains("is-pending")) enqueue(li);
          } else if (!entry.isIntersecting) {
            // Potpuno van kadra. Reset u pending SAMO kad je izašao levo (desni ulaz ne dira).
            const root = entry.rootBounds;
            if (root && entry.boundingClientRect.right <= root.left + 1) {
              drop(li);
              setPending(li);
            }
          }
        }
      },
      { root: viewport, threshold: [0, 1] },
    );
    nodes.forEach((node) => observer.observe(node));

    // Kraj kucanja → resolved (pun tekst, kursor nestaje) → sledeći iz reda.
    const handleAnimationEnd = (event: AnimationEvent) => {
      if (event.animationName !== "marquee-type") return;
      const li = (event.target as HTMLElement).closest<HTMLLIElement>(".marquee-item");
      if (!li) return;
      resolve(li);
      if (active === li) active = null;
      startNext();
    };
    viewport.addEventListener("animationend", handleAnimationEnd);

    // Pauza dok je tab/prozor sakriven ili bez fokusa (traka stoji, aktivno kucanje se
    // završava odmah), pa po povratku re-sync bez kucanja — inače bi sve što je „ušlo" u
    // međuvremenu (5+ pojmova) krenulo da kuca odjednom.
    let paused = false;
    const pause = () => {
      if (paused) return;
      paused = true;
      track.classList.add("is-paused");
      if (active) resolve(active);
      active = null;
      queue = [];
    };
    const resume = () => {
      if (!paused) return;
      paused = false;
      track.classList.remove("is-paused");
      resync();
    };
    const handleVisibility = () => (document.visibilityState === "hidden" ? pause() : resume());
    const handlePageShow = () => {
      // bfcache povratak: stanje je zamrznuto, samo re-sync.
      paused = true;
      resume();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", pause);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", handlePageShow);

    // Resize (rotacija, promena prozora) menja trajanje petlje pa traka „skoči": pojmovi koji
    // odjednom osvanu u kadru NE kucaju — re-sync kao pri povratku na tab (odloženo na rAF).
    let resizeFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (!paused) resync();
      });
    });
    resizeObserver.observe(viewport);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      cancelAnimationFrame(resizeFrame);
      viewport.removeEventListener("animationend", handleAnimationEnd);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [items, locale]);

  // Procena do prvog merenja: ~256px po pojmu / 80px/s ≈ 3.2s po pojmu.
  const initialDuration = `${(items.length * 3.2).toFixed(0)}s`;

  return (
    <div
      ref={viewportRef}
      role="region"
      aria-label={label}
      className="marquee-viewport absolute inset-x-0 bottom-0 z-30 overflow-hidden bg-yellow"
    >
      <p className="sr-only">{hint}</p>
      <div
        ref={trackRef}
        className="marquee-track flex w-max items-stretch"
        style={{ ["--marquee-duration" as string]: initialDuration }}
      >
        {[0, 1].map((copy) => (
          <ul
            key={copy}
            ref={copy === 0 ? copyRef : undefined}
            aria-hidden={copy === 1 ? true : undefined}
            className="marquee-copy flex w-max shrink-0 items-stretch"
          >
            {items.map((item, index) => (
              <li
                key={`${copy}-${index}`}
                data-len={item.label.length}
                className="marquee-item flex shrink-0 items-stretch"
              >
                <Link
                  href={withLocale(locale, HREF_BY_TARGET[item.target])}
                  tabIndex={copy === 1 ? -1 : undefined}
                  aria-hidden={copy === 1 ? true : undefined}
                  className="marquee-link relative flex items-center gap-2 whitespace-nowrap px-5 font-display text-xl text-ink sm:px-7 sm:text-2xl"
                >
                  <Sparkles aria-hidden="true" className="marquee-spark size-4 shrink-0 text-ink/40" />
                  <span className="marquee-term">
                    <span className="marquee-ghost" aria-hidden="true">
                      {item.label}
                    </span>
                    <span className="marquee-type">{item.label}</span>
                  </span>
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
