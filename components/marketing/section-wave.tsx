import { cn } from "@/components/ui/primitives";
import { surfaceVar, type SurfaceLevel } from "@/lib/surface";

/**
 * Talasasti razdelnik — JEDINA granica između dve sekcije (v3).
 *
 * Ranije su se videle tri linije: tamna talasasta, svetlija talasasta i ravna
 * horizontalna gde se menja boja pozadine. Sada je razdelnik NEPROVIDNA traka koja
 * sama nosi obe boje, pa se boja menja PO talasu, ne po pravoj liniji:
 *   · pozadina `<svg>`-a = boja GORNJE sekcije (`from`) → sve iznad talasa;
 *   · prva `<path>` prati talas pa se zatvara do dna viewBox-a, `fill` = boja DONJE
 *     sekcije (`to`) → sve ispod talasa;
 *   · druga `<path>` je samo linija talasa (`--ink`, 2px, `non-scaling-stroke`) → jedina
 *     vidljiva linija granice.
 * Rezultat: iznad talasa tačno jedna boja, ispod druga, između njih jedan tamni potez i
 * nijedna prava linija. Boje bira `lib/surface.ts` iz nivoa površina, pa se poklapaju sa
 * sekcijama u obe teme.
 *
 * Pozicioniranje bira pozivalac klasom (`section-wave` uz dno, `section-wave` +
 * `section-wave-top` uz vrh, ili footer). Traka jaše na granici (translateY ±50%), pa
 * pola prekriva donju ivicu gornje sekcije (bg = `from`, nevidljivo) a pola gornju ivicu
 * donje (bg = `to`, nevidljivo) — ostaje samo talasasti potez. Dekorativna:
 * `aria-hidden`, `pointer-events-none`.
 *
 * IZUZETAK: ispod heroa NEMA talasa (talas bi sekao logo i traku ishoda) — pozivalac ga
 * tamo prosto ne renderuje.
 */
export function SectionWave({
  from,
  to,
  className,
}: {
  /** Nivo površine GORNJE sekcije (iznad talasa). */
  from: SurfaceLevel;
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
      style={{ background: surfaceVar(from) }}
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
