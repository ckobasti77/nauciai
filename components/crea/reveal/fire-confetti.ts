import { confettiShots } from "@/lib/crea-reveal";

/**
 * Konfete u žutoj i mastilu (K25, U4). `canvas-confetti` se učitava tek ovde (`import()`),
 * pa ne ulazi u početni chunk radionice. Boje su tokeni teme u trenutku pucanja; biblioteka
 * sama ćuti uz smanjen pokret (`disableForReducedMotion`), a pozivalac ionako proverava.
 */
export async function fireConfetti(anchor: HTMLElement | null, big: boolean): Promise<void> {
  const { default: confetti } = await import("canvas-confetti");
  const styles = getComputedStyle(document.documentElement);
  const yellow = styles.getPropertyValue("--yellow").trim() || "#f4be30";
  const ink = styles.getPropertyValue("--ink").trim() || "#0e3158";
  const rect = anchor?.getBoundingClientRect();
  const origin = rect
    ? { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height * 0.7) / window.innerHeight }
    : { x: 0.5, y: 0.6 };
  for (const shot of confettiShots(origin, { yellow, ink }, big)) void confetti(shot);
}
