import { useId } from "react";

import type { CreaStyle } from "@/lib/crea-styles";

/**
 * Ilustrativna sličica stila (K13, S8): pozadina u dve boje + motiv, kao SVG.
 * Nije generisana slika - to je odluka ovog koraka (tokom runa se ne generiše
 * ništa). Boje su podaci stila (sadržaj, kao paleta), pa nisu tokeni teme.
 */
export function StyleThumb({ style, className }: { style: Pick<CreaStyle, "thumb">; className?: string }) {
  const id = useId().replace(/:/g, "");
  const { bg, fg, motif } = style.thumb;
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true" className={className} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={bg[0]} />
          <stop offset="1" stopColor={bg[1]} />
        </linearGradient>
      </defs>
      <rect width="64" height="48" fill={`url(#g${id})`} />
      <Motif motif={motif} fg={fg} />
    </svg>
  );
}

function Motif({ motif, fg }: { motif: CreaStyle["thumb"]["motif"]; fg: string }) {
  switch (motif) {
    case "sun":
      return <circle cx="44" cy="18" r="9" fill={fg} />;
    case "grain":
      return (
        <g fill={fg} opacity="0.55">
          {Array.from({ length: 36 }, (_, i) => (
            <circle key={i} cx={(i * 37 + (i % 5) * 11) % 64} cy={(i * 7 + Math.floor(i / 6) * 13) % 48} r={0.9 + (i % 3) * 0.3} />
          ))}
        </g>
      );
    case "dots":
      return (
        <g fill={fg}>
          {Array.from({ length: 12 }, (_, i) => (
            <circle key={i} cx={8 + (i % 4) * 16} cy={10 + Math.floor(i / 4) * 14} r={2.5 + (i % 2)} />
          ))}
        </g>
      );
    case "lines":
      return (
        <g stroke={fg} strokeWidth="1.2" opacity="0.8">
          {[10, 18, 26, 34, 42].map((y) => (
            <line key={y} x1="4" y1={y} x2="60" y2={y} />
          ))}
          <path d="M14 30 q8 -14 16 0 t16 0" fill="none" strokeWidth="2" />
        </g>
      );
    case "grid":
      return (
        <g stroke={fg} strokeWidth="1.5" opacity="0.85">
          {[16, 32, 48].map((x) => (
            <line key={`x${x}`} x1={x} y1="0" x2={x} y2="48" />
          ))}
          {[12, 24, 36].map((y) => (
            <line key={`y${y}`} x1="0" y1={y} x2="64" y2={y} />
          ))}
        </g>
      );
    case "halftone":
      return (
        <g fill={fg}>
          {Array.from({ length: 30 }, (_, i) => {
            const col = i % 6;
            const row = Math.floor(i / 6);
            return <circle key={i} cx={6 + col * 11} cy={6 + row * 9} r={0.6 + col * 0.55} />;
          })}
        </g>
      );
    case "brush":
      return <path d="M6 34 C18 18 30 40 42 22 S58 18 60 12" fill="none" stroke={fg} strokeWidth="6" strokeLinecap="round" />;
    case "pixels":
      return (
        <g fill={fg}>
          {[[20, 16], [26, 16], [32, 16], [38, 16], [20, 22], [38, 22], [20, 28], [26, 28], [32, 28], [38, 28], [26, 34], [32, 34]].map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="6" height="6" />
          ))}
        </g>
      );
    case "blob":
      return <path d="M22 12 C34 4 50 12 48 26 C46 40 28 44 18 36 C8 28 12 18 22 12 Z" fill={fg} />;
    case "frame":
      return <rect x="10" y="8" width="44" height="32" fill="none" stroke={fg} strokeWidth="4" />;
    case "stripes":
      return (
        <g fill={fg}>
          {[0, 1, 2].map((i) => (
            <rect key={i} x="0" y={28 + i * 7} width="64" height="4" />
          ))}
          <circle cx="32" cy="18" r="8" />
        </g>
      );
    case "waves":
      return (
        <g fill="none" stroke={fg} strokeWidth="2.5" strokeLinecap="round">
          <path d="M2 30 q8 -8 16 0 t16 0 t16 0 t16 0" />
          <path d="M2 38 q8 -8 16 0 t16 0 t16 0 t16 0" opacity="0.6" />
        </g>
      );
    case "cube":
      return (
        <g stroke={fg} strokeWidth="2" strokeLinejoin="round" fill="none">
          <path d="M32 10 L46 18 L46 34 L32 42 L18 34 L18 18 Z" />
          <path d="M18 18 L32 26 L46 18 M32 26 L32 42" />
        </g>
      );
    case "star":
      return <path d="M32 8 L36 20 L49 20 L39 28 L43 40 L32 32 L21 40 L25 28 L15 20 L28 20 Z" fill={fg} />;
  }
}
