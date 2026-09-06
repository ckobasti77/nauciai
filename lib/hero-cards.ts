import { applyHomography, homographyToMatrix3d, solveHomography, type Point, type Quad } from "@/lib/homography";

/**
 * Geometrija hero kartica (L3): 4 klikabilne kartice „leže" na listu sveske u hero videu.
 *
 * IZMERENO iz `public/images/landing/hero-v2-poster.png` (1920×1072, prvi = poslednji frejm;
 * sveska je statična kroz ceo loop). List sveske je PRAZAN (nema nacrtanih ploča), pa su
 * ploče definisane u prostoru samog lista: 2 kolone × 2 reda, sve četiri iste u uv
 * koordinatama lista — perspektiva ih na ekranu skraćuje, pa su KARTICE RAZLIČITIH
 * veličina (bliža veća, dalja manja) i svaka puni svoju ploču na pravoj CSS veličini.
 *
 * Merenje (skripta sa sharp, ray-cast iz centra lista + TLS fit svake ivice, RMS ≈ 1 px):
 *   uglovi lista TL (1300, 397) · TR (1737, 547) · BR (1430, 969) · BL (1004, 618)
 *   spirala je uz ivicu BL–TL (prstenovi su celi VAN lista, u ≈ −0.01…−0.04)
 *   uvijeni ugao lista: vrh u uv (0.928, 0.897), počinje od v ≥ 0.865 za u > 0.9
 * Ploče: kolone u ∈ [0.08, 0.50] i [0.54, 0.96]; redovi v ∈ [0.05, 0.43] i [0.47, 0.85].
 * Donji red se završava iznad uvijenog ugla; levi inset drži rastojanje od spirale.
 *
 * `HERO_PLATES` su ISPISANE konstante (normalizovano 0–1 u odnosu na 1920×1072), a
 * `derivePlateQuad` ih ponovo izvodi iz lista + uv — test čuva da se ne raziđu.
 */

export const HERO_VIDEO = { width: 1920, height: 1072 } as const;

/** Uglovi lista sveske u px videa (TL, TR, BR, BL). */
export const HERO_PAGE_QUAD: Quad = [
  [1300.0, 397.2],
  [1737.4, 547.3],
  [1430.1, 969.4],
  [1004.0, 617.6],
];

/** Ploče u prostoru lista: u duž TL→TR, v duž TL→BL. */
export const HERO_PLATE_UV = {
  columns: [
    [0.08, 0.5],
    [0.54, 0.96],
  ],
  rows: [
    [0.05, 0.43],
    [0.47, 0.85],
  ],
} as const;

export type HeroPlateKey = "courses" | "studio" | "community" | "account";

export type HeroPlate = {
  key: HeroPlateKey;
  column: 0 | 1;
  row: 0 | 1;
  /** Uglovi ploče normalizovani 0–1 (x / 1920, y / 1072), redosled TL, TR, BR, BL. */
  quad: Quad;
};

/**
 * Redosled = redosled kartica: 1 Kursevi, 2 Studio, 3 Zajednica, 4 Registracija (ili
 * Kontrolna tabla za ulogovanog). Px u 1920×1072 (za proveru):
 *   courses   (1313, 415) (1466, 470) (1364, 565) (1212, 492)
 *   studio    (1483, 476) (1701, 554) (1604, 682) (1381, 574)
 *   community (1201, 501) (1352, 577) (1224, 696) (1080, 594)
 *   account   (1369, 585) (1592, 697) (1464, 866) (1241, 708)
 */
export const HERO_PLATES: readonly HeroPlate[] = [
  {
    key: "courses",
    column: 0,
    row: 0,
    quad: [
      [0.6837, 0.387],
      [0.7636, 0.4381],
      [0.7103, 0.5274],
      [0.6315, 0.4588],
    ],
  },
  {
    key: "studio",
    column: 1,
    row: 0,
    quad: [
      [0.7726, 0.4439],
      [0.886, 0.5164],
      [0.8353, 0.6361],
      [0.7193, 0.5352],
    ],
  },
  {
    key: "community",
    column: 0,
    row: 1,
    quad: [
      [0.6254, 0.4671],
      [0.7041, 0.5379],
      [0.6376, 0.6493],
      [0.5624, 0.5538],
    ],
  },
  {
    key: "account",
    column: 1,
    row: 1,
    quad: [
      [0.713, 0.5459],
      [0.8293, 0.6505],
      [0.7625, 0.808],
      [0.6463, 0.6604],
    ],
  },
];

/**
 * Prag za 3D sloj: NAJMANJA (najdalja) ploča mora biti ≥ 110 CSS px široka — toliko treba
 * kompaktnoj kartici (ikona + naslov u 2 reda + strelica, cilj ≥ 44 px). Ispod toga iste
 * 4 kartice idu kao snap red iznad trake. Bliže ploče su veće i nose više sadržaja
 * (container query u CSS-u) — kartice su namerno RAZLIČITIH veličina, prate prostor lista.
 */
export const PLATE_MIN_CSS_PX = 110;

function toQuad(points: Point[]): Quad {
  return [points[0], points[1], points[2], points[3]];
}

/** Četvorougao ploče u px videa (1920×1072). */
export function plateQuadVideoPx(plate: HeroPlate): Quad {
  return toQuad(plate.quad.map(([x, y]): Point => [x * HERO_VIDEO.width, y * HERO_VIDEO.height]));
}

/** Izvodi normalizovani quad ploče iz uglova lista + uv opsega (isti račun kao merenje). */
export function derivePlateQuad(column: 0 | 1, row: 0 | 1): Quad {
  const page = solveHomography(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    HERO_PAGE_QUAD,
  );
  const [u0, u1] = HERO_PLATE_UV.columns[column];
  const [v0, v1] = HERO_PLATE_UV.rows[row];
  const corners: Quad = [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];
  return toQuad(
    corners.map((p): Point => {
      const [x, y] = applyHomography(page, p);
      return [x / HERO_VIDEO.width, y / HERO_VIDEO.height];
    }),
  );
}

const edge = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * Veličina ploče u px videa: prosek gornje i donje ivice (širina) i leve i desne (visina).
 * To je i veličina layout box-a kartice (× `scale`), pa se sadržaj slaže na PRAVOJ
 * veličini u CSS px, a homografija ga samo „položi" u perspektivu ploče.
 */
export function plateSizeVideoPx(plate: HeroPlate): { width: number; height: number } {
  const q = plateQuadVideoPx(plate);
  return {
    width: (edge(q[0], q[1]) + edge(q[3], q[2])) / 2,
    height: (edge(q[0], q[3]) + edge(q[1], q[2])) / 2,
  };
}

/** Širina najmanje (najdalje) ploče u px videa. */
export function minPlateWidthVideoPx(plates: readonly HeroPlate[] = HERO_PLATES): number {
  return Math.min(...plates.map((plate) => plateSizeVideoPx(plate).width));
}

/**
 * Video je `contain` (nikad krop): renderovana širina = min(vw, 100svh · 1920/1072).
 * Najmanja ploča ≥ 110 CSS px ⇔ renderovana širina ≥ 110 · 1920 / širina_ploče, tj.
 * viewport širine ≥ minWidth I visine ≥ minHeight. Literal u `app/globals.css`
 * (`@media (min-width: …) and (min-height: …)`) mora biti jednak ovome — test to čuva.
 */
export function heroCardsBreakpoint(plates: readonly HeroPlate[] = HERO_PLATES): {
  minWidth: number;
  minHeight: number;
} {
  const renderedWidth = (PLATE_MIN_CSS_PX * HERO_VIDEO.width) / minPlateWidthVideoPx(plates);
  return {
    minWidth: Math.ceil(renderedWidth),
    minHeight: Math.ceil((renderedWidth * HERO_VIDEO.height) / HERO_VIDEO.width),
  };
}

/**
 * Layout box kartice i CSS `matrix3d` za dati `scale` (= širina sloja / 1920, tj. CSS px po
 * px videa). Box je veličina ploče u CSS px; matrica preslikava (0,0)–(width,height) na
 * ploču u CSS px sloja. Računa se na svaki resize (4 rešavanja 8×8 — zanemarljivo).
 */
export function plateLayout(plate: HeroPlate, scale: number): { width: number; height: number; matrix3d: string } {
  const size = plateSizeVideoPx(plate);
  const width = size.width * scale;
  const height = size.height * scale;
  const source: Quad = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  const target = toQuad(plateQuadVideoPx(plate).map(([x, y]): Point => [x * scale, y * scale]));
  return { width, height, matrix3d: homographyToMatrix3d(solveHomography(source, target)) };
}
