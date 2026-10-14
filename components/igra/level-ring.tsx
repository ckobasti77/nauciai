import { cn } from "@/components/ui/primitives";
import { levelRingGeometry } from "@/lib/igra-shell";

/**
 * Prsten nivoa (K06): SVG krug u kodu, bez slike. Podloga je `--igra-track`, a marker ide
 * od vrha u smeru kazaljke do `progress` (0..1 kroz tekući nivo). Crta se PREKO najbližeg
 * `relative` pretka, centriran, pa ne menja raspored: prečnik veći od pretka daje oreol
 * oko avatara, isti ili manji prsten oko broja nivoa. Dekorativan je - vrednost izgovara
 * dugme koje ga nosi.
 */
export function LevelRing({ progress, size, stroke = 3, className }: { progress: number; size: number; stroke?: number; className?: string }) {
  const ring = levelRingGeometry(size, stroke, progress);
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      className={cn("pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 -rotate-90", className)}
    >
      <circle cx={ring.center} cy={ring.center} r={ring.radius} strokeWidth={stroke} className="stroke-igra-track" />
      {/* Prazan prsten nema marker: zaobljen kraj linije bi i na nuli ostavio tačku. */}
      {ring.offset < ring.circumference ? (
        <circle
          cx={ring.center}
          cy={ring.center}
          r={ring.radius}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={ring.circumference}
          strokeDashoffset={ring.offset}
          className="stroke-igra-marker transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
      ) : null}
    </svg>
  );
}
