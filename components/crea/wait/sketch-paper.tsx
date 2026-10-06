"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/components/ui/primitives";
import type { CreaWaitKind } from "@/lib/crea-wait";

/**
 * List sveske na kojem olovka crta skicu dok Crea radi (K25, U3). Konture (mastilo) se crtaju
 * u prvoj polovini napretka, bojenje (žuta šrafura) u drugoj - isto kao koraci „Crta" → „Boji".
 *
 * Crta se kroz `stroke-dashoffset` (jedan rAF, bez React stanja po frejmu); olovka prati vrh
 * linije. Kad čeka sledeći delić napretka, olovka „šara" u mestu - ekran je živ, ali ne laže
 * napredak. Uz smanjen pokret (`animated: false`) nema petlje: skica stoji na tačnom napretku,
 * olovka miruje na vrhu linije. Petlja staje kad je list van ekrana ili je kartica skrivena.
 */

type Sketch = { outline: readonly string[]; color: readonly string[] };

const SKETCHES: Record<CreaWaitKind, Sketch> = {
  image: {
    outline: [
      "M18 128 C70 120 150 134 222 124",
      "M26 124 L72 66 L96 94 L128 52 L178 124",
      "M182 40 a14 14 0 1 0 28 0 a14 14 0 1 0 -28 0",
      "M204 124 L204 100",
      "M192 92 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0",
    ],
    color: ["M186 36 L206 30 L184 44 L210 37 L188 51 L207 45", "M118 64 L136 61 L112 78 L142 74 L106 92 L150 88", "M195 90 L212 84 L196 98 L214 92"],
  },
  video: {
    outline: [
      "M44 72 L198 72 L198 136 L44 136 Z",
      "M44 72 L48 46 L202 40 L198 72",
      "M110 88 L110 122 L140 105 Z",
      "M66 120 L88 120 M154 120 L176 120",
    ],
    color: ["M52 50 L60 68 L74 47 L82 68 L96 46 L104 68 L118 45 L126 68 L140 44 L148 68 L162 43 L170 68 L184 42 L192 68", "M114 94 L114 116 L120 112 L120 98 L126 101 L126 109"],
  },
  audio: {
    outline: [
      "M18 104 Q28 80 38 104 Q48 128 58 104 Q68 64 78 104 Q88 140 98 104 Q108 84 118 104",
      "M150 116 L150 52 L196 44 L196 108",
      "M138 116 a12 9 0 1 0 24 0 a12 9 0 1 0 -24 0",
      "M184 108 a12 9 0 1 0 24 0 a12 9 0 1 0 -24 0",
    ],
    color: ["M141 116 L159 111 L142 121 L158 118", "M187 108 L205 103 L188 113 L204 110", "M154 56 L192 49 L154 62 L192 55"],
  },
};

/** Deo napretka koji pripada konturama; ostatak je bojenje. */
const OUTLINE_SHARE = 0.55;

type Measured = { el: SVGPathElement; length: number; start: number; end: number };

function measure(paths: SVGPathElement[], outlineCount: number): Measured[] {
  const lengths = paths.map((el) => el.getTotalLength());
  const groups: Array<[number, number, number, number]> = [
    [0, outlineCount, 0, OUTLINE_SHARE],
    [outlineCount, paths.length, OUTLINE_SHARE, 1],
  ];
  const out: Measured[] = [];
  for (const [from, to, start, end] of groups) {
    const total = lengths.slice(from, to).reduce((sum, value) => sum + value, 0) || 1;
    let cursor = start;
    for (let index = from; index < to; index += 1) {
      const share = ((end - start) * lengths[index]!) / total;
      out.push({ el: paths[index]!, length: lengths[index]!, start: cursor, end: cursor + share });
      cursor += share;
    }
  }
  return out;
}

/** Iscrta skicu do napretka `p`; vraća vrh olovke (tačka na liniji koja se upravo crta). */
function draw(measured: Measured[], p: number): { x: number; y: number } {
  let head = { x: 24, y: 128 };
  for (const item of measured) {
    const local = Math.min(1, Math.max(0, (p - item.start) / (item.end - item.start)));
    item.el.style.strokeDashoffset = String(item.length * (1 - local));
    if (local > 0) {
      const point = item.el.getPointAtLength(item.length * local);
      head = { x: point.x, y: point.y };
    }
  }
  return head;
}

function placePencil(pencil: SVGGElement | null, x: number, y: number) {
  pencil?.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(32)`);
}

export function SketchPaper({
  kind,
  progress,
  animated,
  label,
  className,
}: {
  kind: CreaWaitKind;
  /** 0..1 - koliko skice treba da bude nacrtano. */
  progress: number;
  animated: boolean;
  label: string;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pencilRef = useRef<SVGGElement>(null);
  const measuredRef = useRef<Measured[]>([]);
  const shownRef = useRef(0);
  const targetRef = useRef(progress);
  const sketch = SKETCHES[kind];

  useEffect(() => {
    targetRef.current = progress;
  }, [progress]);

  // Mere linija (jednom po vrsti skice); dužina ide u `stroke-dasharray`.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const paths = Array.from(svg.querySelectorAll<SVGPathElement>("path[data-stroke]"));
    const measured = measure(paths, sketch.outline.length);
    for (const item of measured) {
      item.el.style.strokeDasharray = String(item.length);
      item.el.style.strokeDashoffset = String(item.length);
    }
    measuredRef.current = measured;
    shownRef.current = 0;
  }, [sketch]);

  // Bez pokreta: skica stoji na tačnom napretku, olovka na vrhu linije.
  useEffect(() => {
    if (animated) return;
    const head = draw(measuredRef.current, progress);
    placePencil(pencilRef.current, head.x, head.y);
  }, [animated, progress, sketch]);

  // Sa pokretom: jedna petlja koja „dostiže" napredak i šara u mestu dok čeka.
  useEffect(() => {
    if (!animated) return;
    const svg = svgRef.current;
    if (!svg) return;
    let frame = 0;
    let last = performance.now();
    let visible = true;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const target = targetRef.current;
      const shown = shownRef.current;
      const next = target < shown - 0.05 ? target : shown + (target - shown) * Math.min(1, dt * 2.2);
      shownRef.current = next;
      const head = draw(measuredRef.current, next);
      // Dok čeka sledeći delić: kratki potezi olovke u mestu (ili lagano kuckanje pre prvog poteza).
      const t = now / 1000;
      const idle = Math.abs(target - next) < 0.004;
      const wobbleX = idle ? Math.sin(t * 9) * (target === 0 ? 0.8 : 2.2) : 0;
      const wobbleY = idle ? (target === 0 ? -Math.abs(Math.sin(t * 4)) * 5 : Math.cos(t * 7) * 1.4) : 0;
      placePencil(pencilRef.current, head.x + wobbleX, head.y + wobbleY);
      if (visible && !document.hidden) frame = requestAnimationFrame(tick);
      else frame = 0;
    };
    const resume = () => {
      if (frame === 0 && visible && !document.hidden) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      resume();
    });
    observer.observe(svg);
    document.addEventListener("visibilitychange", resume);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", resume);
    };
  }, [animated, sketch]);

  return (
    <svg ref={svgRef} viewBox="0 0 240 160" role="img" aria-label={label} className={cn("block h-auto w-full", className)}>
      {/* Linije sveske i margina */}
      <g stroke="var(--line)" strokeWidth="1">
        {[34, 58, 82, 106, 130, 154].map((y) => (
          <line key={y} x1="0" y1={y} x2="240" y2={y} />
        ))}
      </g>
      <line x1="12" y1="0" x2="12" y2="160" stroke="var(--yellow)" strokeWidth="1.5" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {sketch.outline.map((d, index) => (
          <path key={`o${index}`} data-stroke="" d={d} stroke="var(--ink)" strokeWidth="2.4" />
        ))}
        {sketch.color.map((d, index) => (
          <path key={`c${index}`} data-stroke="" d={d} stroke="var(--yellow)" strokeWidth="5" />
        ))}
      </g>
      {/* Olovka: vrh je u (0, 0), telo ide naviše pa se nagne. */}
      <g ref={pencilRef} transform="translate(24 128) rotate(32)" strokeLinejoin="round">
        <polygon points="0,0 -2.4,-5.5 2.4,-5.5" fill="var(--ink)" />
        <polygon points="-2.4,-5.5 2.4,-5.5 5.5,-14 -5.5,-14" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.3" />
        <rect x="-5.5" y="-46" width="11" height="32" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="1.3" />
        <line x1="0" y1="-14" x2="0" y2="-46" stroke="var(--ink)" strokeWidth="0.8" opacity="0.4" />
        <rect x="-5.5" y="-52" width="11" height="6" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.3" />
        <rect x="-5.5" y="-60" width="11" height="8" rx="2.5" fill="var(--ink)" />
      </g>
    </svg>
  );
}
