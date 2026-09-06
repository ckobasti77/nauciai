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

/* ── Poza ravni iz homografije (L3.1: hover po normali lista) ──────────────────────────
   Kamera sa žižnom daljinom `f` (px slike) i glavnom tačkom `principal` (centar slike):
     K = [ f 0 cx ; 0 f cy ; 0 0 1 ].
   Ako `h` preslikava jedinični kvadrat ravni (u, v) u px slike, onda je K⁻¹·H = λ·[a b t]:
   `a`, `b` su pravci u- i v-ose ravni u prostoru kamere (dužine = fizičke dužine ivica),
   `t` je položaj ugla (0,0). Normala ravni je a × b — krst-proizvod NE traži da su ose
   ortogonalne (crtež nije obavezno fizički konzistentan), pa se R ne ortonormalizuje.
   Skala λ se fiksira tako da |a| = 1: jedinica prostora = ŠIRINA ravni (u-ivica). */

export type Vec3 = readonly [number, number, number];

export type PlanePose = {
  /** Pravac u-ose ravni u prostoru kamere, |axisU| = 1 (jedinica = širina ravni). */
  axisU: Vec3;
  /** Pravac v-ose ravni (dužina = visina ravni u jedinicama širine). */
  axisV: Vec3;
  /** Položaj ugla (u, v) = (0, 0). */
  origin: Vec3;
  /** Jedinična normala ravni, okrenuta KA kameri (z < 0). */
  normal: Vec3;
};

export type Camera = { focal: number; principal: Point };

export function decomposeHomography(h: Homography, camera: Camera): PlanePose {
  const { focal, principal } = camera;
  const [cx, cy] = principal;
  const column = (i: number): Vec3 => [(h[i] - cx * h[6 + i]) / focal, (h[3 + i] - cy * h[6 + i]) / focal, h[6 + i]];
  let a = column(0);
  let b = column(1);
  let t = column(2);
  // Homografija je do na znak: ravan mora biti ISPRED kamere (t.z > 0).
  if (t[2] < 0) {
    a = negate(a);
    b = negate(b);
    t = negate(t);
  }
  const scale = 1 / length(a);
  a = times(a, scale);
  b = times(b, scale);
  t = times(t, scale);
  let n = cross(a, b);
  n = times(n, 1 / length(n));
  if (n[2] > 0) n = negate(n);
  return { axisU: a, axisV: b, origin: t, normal: n };
}

/** Tačka ravni (u, v), podignuta za `lift` (u jedinicama širine ravni) duž normale, u 3D. */
export function planePoint(pose: PlanePose, [u, v]: Point, lift = 0): Vec3 {
  const { axisU: a, axisV: b, origin: t, normal: n } = pose;
  return [
    a[0] * u + b[0] * v + t[0] + n[0] * lift,
    a[1] * u + b[1] * v + t[1] + n[1] * lift,
    a[2] * u + b[2] * v + t[2] + n[2] * lift,
  ];
}

/** Perspektivna projekcija 3D tačke prostora kamere u px slike. */
export function projectPoint(p: Vec3, camera: Camera): Point {
  const [cx, cy] = camera.principal;
  return [(camera.focal * p[0]) / p[2] + cx, (camera.focal * p[1]) / p[2] + cy];
}

const negate = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
const times = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
