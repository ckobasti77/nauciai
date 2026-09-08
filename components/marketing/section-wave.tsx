import { cn } from "@/components/ui/primitives";
import { surfaceVar, type SurfaceLevel } from "@/lib/surface";

/**
 * Talasasti razdelnik — JEDINA granica između dve sekcije (v3).
 *
 * Iznad krive `<svg>` je PROVIDAN, pa se vidi prava pozadina gornje sekcije (uključujući
 * `sketch-grid` mrežu, koja tako ide neprekinuto do samog poteza talasa). Boja se i dalje
 * menja PO talasu, ne po pravoj liniji:
 *   · `<svg>` nema pozadinu → sve iznad krive je pozadina gornje sekcije, kakva god bila;
 *   · prva `<path>` prati talas pa se zatvara do dna viewBox-a, `fill` = boja DONJE
 *     sekcije (`to`) → sve ispod talasa dobija novu boju;
 *   · druga `<path>` je samo linija talasa (`--ink`, 2px, `non-scaling-stroke`) → jedina
 *     vidljiva linija granice.
 * Rezultat: iznad talasa prava boja gornje sekcije (sa mrežom), ispod druga boja, između
 * njih jedan tamni potez i nijedna prava linija. Donju boju bira `lib/surface.ts` iz nivoa
 * površine, pa se poklapa sa sekcijom u obe teme.
 *
 * Pozicioniranje bira pozivalac klasom (`section-wave` uz dno, `section-wave` +
 * `section-wave-top` uz vrh, ili footer). Traka jaše na granici (translateY ±50%): gornja
 * polovina je providna (vidi se sekcija iznad), donja polovina prekriva gornju ivicu donje
 * sekcije bojom `to` (nevidljivo, ista boja) — ostaje samo talasasti potez. Dekorativna:
 * `aria-hidden`, `pointer-events-none`.
 *
 * IZUZETAK: ispod heroa NEMA talasa (talas bi sekao logo i traku ishoda) — pozivalac ga
 * tamo prosto ne renderuje.
 */
export function SectionWave({
  to,
  className,
}: {
  /** Nivo površine DONJE sekcije (ispod talasa). */
  to: SurfaceLevel;
  className?: string;
}) {
  // Identičan talas za ispunu i za potez: crest/trough oko sredine viewBox-a (y=20),
  // amplituda ~12 → ostaje u okviru 0..40 sa marginom.
  const wave =
    "M0 20 C 90 8 270 8 360 20 C 450 32 630 32 720 20 C 810 8 990 8 1080 20 C 1170 32 1350 32 1440 20";

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 40"
      preserveAspectRatio="none"
      className={cn("pointer-events-none w-full", className)}
      fill="none"
    >
      {/* Ispuna ISPOD talasa = boja donje sekcije. */}
      <path d={`${wave} L1440 40 L0 40 Z`} style={{ fill: surfaceVar(to) }} />
      {/* Jedina linija granice: tamni potez po talasu. */}
      <path
        d={wave}
        stroke="var(--ink)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
