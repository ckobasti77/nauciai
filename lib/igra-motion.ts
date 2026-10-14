import type { Locale } from "./i18n";
import { pageMotionContract } from "./motion-contract";

/**
 * Pokret IGRA-e (K03, plan K01 §3.1): trajanja, krive, jedna odluka „animirati ili ne",
 * lenji GSAP pluginovi i formatiranje odometra. Ovde NEMA uvoza `gsap` na vrhu - jezgro
 * uvozi `components/igra/motion/gsap.ts`, a pluginovi stižu tek kroz `loadIgraPlugin`
 * (svaki u svom async chunk-u; čuva ih `npm run check:bundle`).
 */

/** Trajanja u sekundama, krive kao GSAP nazivi. Ulaz i stagger su `pageMotionContract.standard`. */
export const IGRA_MOTION = {
  micro: 0.16,
  enter: pageMotionContract.standard.itemDuration,
  /** Pomak ulaza u pikselima. */
  enterY: pageMotionContract.standard.itemY,
  stamp: 0.5,
  fill: 0.9,
  count: 1.1,
  /** Slavlje se samo gasi posle ovoliko (O9: ≤ 2,5 s). */
  celebrate: 2.5,
  stagger: pageMotionContract.standard.stagger,
  staggerMax: 8,
  ease: {
    out: pageMotionContract.standard.pageEase,
    stamp: "back.out(2.2)",
    fill: "power2.inOut",
    count: "power2.out",
  },
} as const;

/**
 * Jedina odluka „da li animirati": bez smanjenog pokreta i u aktivnom tabu (kadar prati
 * pozivalac, npr. IntersectionObserver). Kad vrati `false`, pozivalac odmah postavlja
 * krajnje stanje (vrednost, puna traka, pečat).
 */
export function shouldAnimate({ reduced, hidden = false }: { reduced: boolean; hidden?: boolean }): boolean {
  return !reduced && !hidden;
}

export type IgraPlugins = {
  Flip: typeof import("gsap/Flip").Flip;
  DrawSVG: typeof import("gsap/DrawSVGPlugin").DrawSVGPlugin;
  SplitText: typeof import("gsap/SplitText").SplitText;
};
export type IgraPluginName = keyof IgraPlugins;

const pluginLoads = new Map<IgraPluginName, Promise<unknown>>();

async function importPlugin(name: IgraPluginName): Promise<IgraPlugins[IgraPluginName]> {
  const { gsap } = await import("gsap");
  if (name === "Flip") {
    const { Flip } = await import("gsap/Flip");
    gsap.registerPlugin(Flip);
    return Flip;
  }
  if (name === "DrawSVG") {
    const { DrawSVGPlugin } = await import("gsap/DrawSVGPlugin");
    gsap.registerPlugin(DrawSVGPlugin);
    return DrawSVGPlugin;
  }
  const { SplitText } = await import("gsap/SplitText");
  gsap.registerPlugin(SplitText);
  return SplitText;
}

/**
 * GSAP plugin tek kad zatreba: dinamički uvoz + `registerPlugin`, jednom po pluginu.
 * Na serveru odbija (pluginovi diraju DOM); neuspeo uvoz se ne pamti, pa sledeći poziv
 * pokušava ponovo.
 */
export function loadIgraPlugin<Name extends IgraPluginName>(name: Name): Promise<IgraPlugins[Name]> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error(`IGRA: GSAP plugin ${name} postoji samo u pregledaču`));
  }
  let load = pluginLoads.get(name);
  if (!load) {
    load = importPlugin(name).catch((error: unknown) => {
      pluginLoads.delete(name);
      throw error;
    });
    pluginLoads.set(name, load);
  }
  return load as Promise<IgraPlugins[Name]>;
}

// ── Odometar ─────────────────────────────────────────────────────────────────

const THOUSANDS: Record<Locale, string> = { sr: ".", en: "," };

/** Ceo nenegativan broj; `NaN`, beskonačno i negativno → 0. */
function odometerValue(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/** Broj sa separatorom hiljada po jeziku: `1.250` (sr) / `1,250` (en). */
export function formatOdometer(value: number, locale: Locale): string {
  return String(odometerValue(value)).replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS[locale]);
}
