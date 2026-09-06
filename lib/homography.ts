/**
 * Ravanska homografija (projektivna transformacija) iz 4 tačke u 4 tačke.
 *
 * Koristi je hero (L3): pravougaonik kartice (virtuelni px) legne TAČNO na četvorougao
 * ploče izmeren na listu sveske u videu, pa kartica izgleda kao da je zalepljena na list
 * u istoj perspektivi. Rezultat ide u CSS `matrix3d` (vidi `homographyToMatrix3d`).
 *
 * Matrica je 3×3, red po red, normalizovana na h33 = 1:
 *   [ h11 h12 h13 ]   x' = (h11·x + h12·y + h13) / w
 *   [ h21 h22 h23 ]   y' = (h21·x + h22·y + h23) / w
 *   [ h31 h32  1  ]   w  =  h31·x + h32·y + 1
 */

export type Point = readonly [number, number];
/** Redosled: gore-levo, gore-desno, dole-desno, dole-levo. */
export type Quad = readonly [Point, Point, Point, Point];
/** 3×3, red po red (h11, h12, h13, h21, …, h33 = 1). */
export type Homography = readonly [number, number, number, number, number, number, number, number, number];

/**
 * Rešava 8 nepoznatih (h11…h32) iz 8 jednačina (2 po tački) Gausovom eliminacijom sa
 * parcijalnim pivotom. Baca ako su tačke degenerisane (3 kolinearne → singularan sistem).
 */
export function solveHomography(src: Quad, dst: Quad): Homography {
  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [X, Y] = dst[i];
    rows.push([x, y, 1, 0, 0, 0, -X * x, -X * y, X]);
    rows.push([0, 0, 0, x, y, 1, -Y * x, -Y * y, Y]);
  }

  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
    }
    if (Math.abs(rows[pivot][col]) < 1e-12) {
      throw new Error("solveHomography: degenerisane tačke (singularan sistem)");
    }
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = rows[r][col] / rows[col][col];
      if (factor === 0) continue;
      for (let k = col; k <= n; k++) rows[r][k] -= factor * rows[col][k];
    }
  }

  const h = rows.map((row, i) => row[n] / row[i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyHomography(h: Homography, [x, y]: Point): Point {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/**
 * CSS `matrix3d(...)` je 4×4 u COLUMN-major redosledu. 2D projektivnu matricu ugrađujemo
 * tako da x i y (i w) rade kao homografija, a z ostaje netaknut (identitet):
 *
 *   kolona 1: (h11, h21, 0, h31)   kolona 3: (0, 0, 1, 0)
 *   kolona 2: (h12, h22, 0, h32)   kolona 4: (h13, h23, 0, h33)
 *
 * Element se transformiše sa `transform-origin: 0 0`, pa je ulaz koordinata u px od
 * gornjeg levog ugla elementa.
 */
export function homographyToMatrix3d(h: Homography): string {
  const f = (v: number) => String(Number(v.toPrecision(12)));
  const values = [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, h[8]];
  return `matrix3d(${values.map(f).join(", ")})`;
}
