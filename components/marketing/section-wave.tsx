import { cn } from "@/components/ui/primitives";

/**
 * Talasasta „pocepana ivica papira" (v2) — razdelnik između sekcija landinga i vrha
 * podnožja. Ista ručno crtana putanja koja je ranije živela inline u `site-footer.tsx`.
 *
 * Dve putanje kao na sajtu: glavna u boji mastila i tanja, svetlija linija (`--line`)
 * pomerena par px naniže, pa izgleda kao ručno precrtana ivica. `preserveAspectRatio="none"`
 * rasteže je preko cele širine; `vector-effect: non-scaling-stroke` drži debljinu poteza
 * konstantnom bez obzira na razvlačenje. Dekorativna je: `aria-hidden`, `pointer-events-none`.
 *
 * Pozicioniranje bira pozivalac kroz `className`:
 *   · između sekcija: `section-wave` (usidren uz dno sekcije, translateY 50%, z-10) —
 *     radi i na granici dve različite pozadine (bg-paper ↔ bg-paper-strong) jer je SVG
 *     providan pa se sa svake strane vidi bg svoje sekcije;
 *   · prvi talas ispod trake heroa: `section-wave section-wave-top` (uz vrh #courses);
 *   · podnožje: `absolute inset-x-0 top-0 h-4 w-full`.
 */
export function SectionWave({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 24"
      preserveAspectRatio="none"
      className={cn("pointer-events-none w-full text-ink", className)}
      fill="none"
    >
      <path
        d="M0 13C90 6 180 19 270 11S450 5 540 14 720 20 810 10 990 6 1080 15 1260 20 1350 11 1440 8 1440 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0 18C120 12 210 22 330 16S540 12 660 19 870 22 990 15 1200 12 1320 18 1440 15 1440 15"
        className="stroke-line"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
