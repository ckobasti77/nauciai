import { parsePath } from "./routes";

export type PageMotionVariant = "showcase" | "standard" | "focus";

export const pageMotionContract = {
  showcase: {
    pageDuration: 0.48,
    itemDuration: 0.58,
    stagger: 0.07,
    pageEase: "back.out(1.55)",
    itemEase: "back.out(1.7)",
    pageY: 22,
    itemY: 20,
  },
  standard: {
    pageDuration: 0.36,
    itemDuration: 0.42,
    stagger: 0.05,
    pageEase: "power3.out",
    itemEase: "power2.out",
    pageY: 14,
    itemY: 12,
  },
  focus: {
    pageDuration: 0.24,
    itemDuration: 0.28,
    stagger: 0.025,
    pageEase: "power2.out",
    itemEase: "power2.out",
    pageY: 8,
    itemY: 6,
  },
} as const;

// Patterni rade nad KANONSKOM putanjom (bez locale prefiksa): `sr` je sada
// jezik-bez-prefiksa, pa bi obavezan /sr|/en tiho promašio početnu i /app i vratio
// showcase strane na standard.
const rootPattern = /^\/$/;
const appRootPattern = /^\/app\/?$/;
// Course detail, not a lesson beneath it.
const courseDetailPattern = /^\/app\/classroom\/courses\/[^/]+\/?$/;

export function pageMotionVariantForPath(pathname: string): PageMotionVariant {
  const { canonicalPath } = parsePath(pathname);
  if (
    rootPattern.test(canonicalPath) ||
    appRootPattern.test(canonicalPath) ||
    // Course detail used to live at /app?course=… and so inherited the app root's
    // showcase treatment. Moving it to its own path must not quietly demote it.
    courseDetailPattern.test(canonicalPath) ||
    canonicalPath.includes("/app/community")
  ) {
    return "showcase";
  }

  if (/\/app\/classroom\/courses\/[^/]+\/lessons\/[^/]+(?:\/edit)?\/?$/.test(canonicalPath)) {
    return "focus";
  }

  return "standard";
}

/**
 * The pathname alone identifies a scene. Course detail was the one exception — it used to
 * be a search param on /app — and it now has its own segment, so no search param may key
 * an entrance again: community filters and lesson view modes must not replay it.
 */
export function pageMotionSceneKey(pathname: string): string {
  return pathname;
}

/**
 * Hero kartica (L3.1): podizanje po normali lista na hover/focus. JS interpoliše uglove
 * ploče (0 → podignut quad) i rešava homografiju po frejmu, GSAP vodi tajming (rAF samo dok
 * traje prelaz — 200 ms ≈ 12 frejmova). `ease` je GSAP parnjak CSS `--ease-studio-out`.
 * `heightRatio` = visina podizanja kao deo ŠIRINE lista (6 %). `activeDuration` = povratak
 * na list pri pritisku.
 */
export const heroCardLift = {
  duration: 0.2,
  activeDuration: 0.12,
  ease: "power3.out",
  heightRatio: 0.06,
} as const;

/**
 * Crea „živi" (K25, U3/U4/U16): rečnik pokreta sveske. Trajanja su u sekundama, krive su
 * cubic-bezier nizovi (motion/react ih prima direktno, CSS kroz `cubicBezierCss`).
 *
 * - `pageTurn`: prelaz između oblasti (Početak · Slika · Video · Zvuk) kao listanje - list se
 *   okrene oko hrbata u smeru taba. Ugao i pomak su namerno mali (vestibularno bezbedno).
 * - `sheetFlip`: kartica ulazi kao list sveske koji legne na mesto oko leve ivice.
 * - `pencilFill`: „Generiši" se puni kao potez olovke dok se posao šalje.
 * - `sketch`: ekran čekanja - olovka crta skicu; `strokeSeconds` je jedan potez u praznom hodu.
 * - `reveal`: otkrivanje gotovog rada (polaroid se razvija, filmska traka, kaseta).
 */
export const creaMotion = {
  pageTurn: { duration: 0.42, ease: [0.16, 1, 0.3, 1], rotateY: 14, x: 28, perspective: 1400 },
  sheetFlip: { duration: 0.36, ease: [0.16, 1, 0.3, 1], rotateY: -58, stagger: 0.04, maxStaggerItems: 8 },
  pencilFill: { duration: 0.9, ease: [0.65, 0, 0.35, 1] },
  sketch: { strokeSeconds: 1.4, wiggleSeconds: 0.9 },
  reveal: { polaroid: 2.2, film: 1.3, kaseta: 1.5, ease: [0.16, 1, 0.3, 1] },
  /** Savet „Dok čekaš, nauči" (U6) se menja posle ovoliko milisekundi. */
  tipRotateMs: 20_000,
} as const;

export type CreaCurve = readonly [number, number, number, number];

export type CreaMotionParams = {
  isReduced: boolean;
  pageTurn: { duration: number; ease: CreaCurve; rotateY: number; x: number; perspective: number };
  sheetFlip: { duration: number; ease: CreaCurve; rotateY: number; stagger: number; maxStaggerItems: number };
  pencilFill: { duration: number; ease: CreaCurve; animate: boolean };
  /** `false` = skica se crta odjednom (pun crtež, olovka miruje). */
  sketchAnimated: boolean;
  reveal: { polaroid: number; film: number; kaseta: number; ease: CreaCurve };
  /** Konfete samo uz dozvoljen pokret (canvas-confetti ima i svoj `disableForReducedMotion`). */
  confetti: boolean;
  /** 3D maskota (canvas) samo uz dozvoljen pokret; inače poster. */
  mascot3d: boolean;
};

/**
 * Parametri pokreta Cree za dati izbor korisnika. Uz `prefers-reduced-motion` nema prostornog
 * pokreta (ugao 0, pomak 0), sve je kratak pretapanje ili trenutno, bez petlji, konfeta i 3D-a.
 */
export function creaMotionFor(reduced: boolean): CreaMotionParams {
  if (reduced) {
    return {
      isReduced: true,
      pageTurn: { duration: 0.12, ease: [0, 0, 1, 1], rotateY: 0, x: 0, perspective: creaMotion.pageTurn.perspective },
      sheetFlip: { duration: 0, ease: [0, 0, 1, 1], rotateY: 0, stagger: 0, maxStaggerItems: 0 },
      pencilFill: { duration: 0, ease: [0, 0, 1, 1], animate: false },
      sketchAnimated: false,
      reveal: { polaroid: 0, film: 0, kaseta: 0, ease: [0, 0, 1, 1] },
      confetti: false,
      mascot3d: false,
    };
  }
  return {
    isReduced: false,
    pageTurn: { ...creaMotion.pageTurn },
    sheetFlip: { ...creaMotion.sheetFlip },
    pencilFill: { ...creaMotion.pencilFill, animate: true },
    sketchAnimated: true,
    reveal: { ...creaMotion.reveal },
    confetti: true,
    mascot3d: true,
  };
}

/** Smer listanja: napred (+1) kad je novi tab desno od starog, nazad (-1) levo, 0 kad se ne zna. */
export function pageTurnDirection(order: readonly string[], from: string | null, to: string | null): -1 | 0 | 1 {
  const a = from === null ? -1 : order.indexOf(from);
  const b = to === null ? -1 : order.indexOf(to);
  if (a === b) return 0;
  return b > a ? 1 : -1;
}

/** `[0.16, 1, 0.3, 1]` → `cubic-bezier(0.16, 1, 0.3, 1)` za `style`/`transition` u CSS-u. */
export function cubicBezierCss(curve: CreaCurve): string {
  return `cubic-bezier(${curve.join(", ")})`;
}
