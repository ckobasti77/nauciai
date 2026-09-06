/**
 * Naizmenične površine landinga i javnih strana (v3). Dve boje se smenjuju po
 * DUBINI: sekcija je nivo N, a element u njoj koji crta SVOJU pozadinu je nivo
 * N+1 — suprotna boja. Nema treće boje i nema čiste bele; obe su tokeni
 * (`--surface-a` = krem heroja #FDEED8, `--surface-b` = #F4F0E8) sa tamnim
 * parnjacima u tamnoj temi. Klase `bg-surface-a/-b` dolaze iz `@theme` u
 * `app/globals.css`.
 *
 * Ovo je JEDAN izvor istine za parnost — determinístički, bez CSS trika. Komponente
 * prosleđuju `level` naniže i uvećavaju ga (`nextLevel`) kad crtaju sopstvenu
 * pozadinu. `lib/surface.test.ts` čuva parnost.
 */

export type SurfaceLevel = 0 | 1;

/** Parnost nivoa u 0/1, otporna na negativne i necele ulaze. */
function parity(level: number): SurfaceLevel {
  return (Math.abs(Math.trunc(level)) % 2) as SurfaceLevel;
}

/** Klasa pozadine po parnosti nivoa. Paran nivo = A, neparan = B. */
export function surfaceClass(level: number): "bg-surface-a" | "bg-surface-b" {
  return parity(level) === 0 ? "bg-surface-a" : "bg-surface-b";
}

/** Ista parnost kao `surfaceClass`, ali kao CSS promenljiva — za SVG fill/pozadinu talasa. */
export function surfaceVar(level: number): "var(--surface-a)" | "var(--surface-b)" {
  return parity(level) === 0 ? "var(--surface-a)" : "var(--surface-b)";
}

/** Sledeći nivo u dubinu (element sa sopstvenom pozadinom): obrne parnost, uvek 0/1. */
export function nextLevel(level: number): SurfaceLevel {
  return parity(level) === 0 ? 1 : 0;
}
