/**
 * Bez treperenja (Crea K20, V17; plan K17 §5): svetlina kadra koja „pulsira"
 * (veštačko svetlo pod 50 Hz, timelapse, AI video koji trepće) se ujednači. Uređaj
 * izmeri prosečnu svetlinu svakog kadra, a ovde se računa koliko svaki kadar
 * treba da posvetli ili potamni da bi pratio GLATKU svetlinu okoline (klizni
 * prosek). Spora promena svetla (oblak, zalazak) i rez između scena ostaju -
 * prosek se računa samo unutar jedne scene.
 *
 * Čiste funkcije - testira ih `crea-deflicker.test.ts`.
 */

/** Širina kliznog proseka u sekundama (centrirano). */
export const DEFLICKER_WINDOW_S = 0.5;
/** Najviše koliko jedan kadar sme da se posvetli/potamni. */
export const DEFLICKER_GAIN_RANGE = { min: 0.8, max: 1.25 } as const;
/** Skok svetline veći od ovoga (deo) između dva kadra je rez, ne treperenje. */
export const DEFLICKER_CUT_JUMP = 0.35;
/** Gotovo crn kadar se ne dira. */
const DARK_LUMA = 6;

/** Prosečna svetlina (Rec. 601, 0..255) RGBA piksela. */
export function frameLuma(rgba: Uint8ClampedArray): number {
  const pixels = Math.floor(rgba.length / 4);
  if (pixels === 0) return 0;
  let sum = 0;
  for (let index = 0; index < pixels; index++) {
    const offset = index * 4;
    sum += 0.299 * rgba[offset]! + 0.587 * rgba[offset + 1]! + 0.114 * rgba[offset + 2]!;
  }
  return sum / pixels;
}

/** Granice scena: indeksi kadrova gde počinje nova scena (uvek uključuje 0). */
export function sceneStarts(lumas: readonly number[], jump = DEFLICKER_CUT_JUMP): number[] {
  const starts = lumas.length > 0 ? [0] : [];
  for (let index = 1; index < lumas.length; index++) {
    const a = lumas[index - 1]!;
    const b = lumas[index]!;
    const base = Math.max(DARK_LUMA, Math.min(a, b));
    if (Math.abs(b - a) / base > jump) starts.push(index);
  }
  return starts;
}

/**
 * Centriran klizni prosek unutar scene. Na ivici scene prozor se skraćuje
 * simetrično, pa spora promena (rampa) ostaje tačno ista i na početku i na kraju.
 */
export function smoothedLumas(lumas: readonly number[], fps: number, windowS = DEFLICKER_WINDOW_S): number[] {
  const half = Math.max(1, Math.round((windowS * fps) / 2));
  const starts = sceneStarts(lumas);
  const out = new Array<number>(lumas.length).fill(0);
  for (let scene = 0; scene < starts.length; scene++) {
    const from = starts[scene]!;
    const to = scene + 1 < starts.length ? starts[scene + 1]! : lumas.length;
    for (let index = from; index < to; index++) {
      const reach = Math.min(half, index - from, to - 1 - index);
      const lo = index - reach;
      const hi = index + reach;
      let sum = 0;
      for (let k = lo; k <= hi; k++) sum += lumas[k]!;
      out[index] = sum / (hi - lo + 1);
    }
  }
  return out;
}

/** Pojačanje po kadru: glatka svetlina / izmerena, u granicama `DEFLICKER_GAIN_RANGE`. */
export function deflickerGains(lumas: readonly number[], fps: number, windowS = DEFLICKER_WINDOW_S): number[] {
  const smooth = smoothedLumas(lumas, fps, windowS);
  return lumas.map((luma, index) => {
    if (luma < DARK_LUMA) return 1;
    const gain = smooth[index]! / luma;
    return Math.min(DEFLICKER_GAIN_RANGE.max, Math.max(DEFLICKER_GAIN_RANGE.min, gain));
  });
}

/**
 * Koliko video treperi: prosečno odstupanje od glatke svetline, kao deo
 * proseka (0 = mirno; 0,05 = 5 %). Služi za poruku pre i posle.
 */
export function flickerAmount(lumas: readonly number[], fps: number, windowS = DEFLICKER_WINDOW_S): number {
  if (lumas.length < 3) return 0;
  const smooth = smoothedLumas(lumas, fps, windowS);
  let deviation = 0;
  let total = 0;
  for (let index = 0; index < lumas.length; index++) {
    deviation += Math.abs(lumas[index]! - smooth[index]!);
    total += smooth[index]!;
  }
  return total > 0 ? deviation / total : 0;
}

/** Ispod ovoga se treperenje ne vidi - alat kaže „ovaj video ne treperi". */
export const FLICKER_VISIBLE = 0.008;
