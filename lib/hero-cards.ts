import {
  applyHomography,
  decomposeHomography,
  homographyToMatrix3d,
  planePoint,
  projectPoint,
  solveHomography,
  type Camera,
  type PlanePose,
  type Point,
  type Quad,
} from "@/lib/homography";
import { heroCardLift } from "@/lib/motion-contract";

/**
 * Geometrija hero kartica (L3 / L3.1): 4 klikabilne kartice „leže" na listu sveske u hero
 * videu. Dve geometrije, po orijentaciji ekrana (isti prag kao za izbor videa):
 *
 * LANDSCAPE — `hero-v2-poster.png` (1920×1072, prvi = poslednji frejm, sveska statična).
 *   Merenje (sharp, ray-cast iz centra lista + TLS fit svake ivice, RMS ≈ 1 px):
 *   uglovi lista TL (1300, 397) · TR (1737, 547) · BR (1430, 969) · BL (1004, 618)
 *   spirala je uz ivicu BL–TL (prstenovi su celi VAN lista, u ≈ −0.01…−0.04)
 *   uvijeni ugao lista: vrh u uv (0.928, 0.897), počinje od v ≥ 0.865 za u > 0.9
 *   Ploče: kolone u ∈ [0.08, 0.50] i [0.54, 0.96]; redovi v ∈ [0.05, 0.43] i [0.47, 0.85].
 *
 * PORTRET — `hero-v2-portrait-poster.png` (1064×1920), ista metoda (RMS 0.9–1.8 px):
 *   uglovi lista TL (472, 1100) · TR (912, 1232) · BR (620, 1768) · BL (127, 1589)
 *   ivice: gornja 459 px, donja 524 px, leva 599 px, desna 611 px (skoro afin list)
 *   spirala uz levu ivicu TL–BL, prstenovi celi VAN lista (u ≤ 0.005)
 *   ruka robota dodiruje gornju ivicu do v = 0.045 (u ≈ 0.2–0.35) → red 1 od v = 0.06
 *   uvijeni ugao: mastilo od v ≥ 0.87 za u ≥ 0.85 → red 2 do v = 0.85
 *   Ploče: kolone u ∈ [0.07, 0.505] i [0.535, 0.97]; redovi v ∈ [0.06, 0.44] i [0.47, 0.85].
 *
 * List je PRAZAN (nema nacrtanih ploča), pa su ploče definisane u prostoru samog lista: 2×2,
 * sve četiri iste u uv koordinatama — perspektiva ih na ekranu skraćuje, pa su KARTICE
 * RAZLIČITIH veličina (bliža veća, dalja manja) i svaka puni svoju ploču na pravoj CSS veličini.
 *
 * `HERO_PLATES` / `HERO_PLATES_PORTRAIT` su ISPISANE konstante (normalizovano 0–1 u odnosu
 * na video), a `derivePlateQuad` ih ponovo izvodi iz lista + uv — test čuva da se ne raziđu.
 *
 * ŽIŽNA DALJINA (`focalPx`, za hover po normali — vidi `pagePose`): crtež je ilustracija,
 * ne fizički konzistentna kamera, pa je f izbor koji daje podizanje PRAVO NAGORE po ekranu
 * uz ~0 promene veličine. Landscape 1200 (= CSS perspective 1200 na 1920 širine: normala
 * (−0.22, −0.86, −0.45), Δ centra (−3, −31) px za h = 6 %, širina ×1.002). Portret 3600
 * (samokalibracija r1·r2 = 0 daje 3604; sa 665 bi kartica „padala" 13 px NADOLE i rasla 4 %):
 * normala (−0.02, −0.77, −0.64), Δ (−0.5, −21) px, širina ×1.005.
 */

export type HeroGeometry = "landscape" | "portrait";

export type HeroPlateUv = {
  readonly columns: readonly [readonly [number, number], readonly [number, number]];
  readonly rows: readonly [readonly [number, number], readonly [number, number]];
};

export type HeroGeometrySpec = {
  video: { readonly width: number; readonly height: number };
  /** Uglovi lista sveske u px videa (TL, TR, BR, BL). */
  pageQuad: Quad;
  /** Ploče u prostoru lista: u duž TL→TR, v duž TL→BL. */
  plateUv: HeroPlateUv;
  /** Žižna daljina u px videa (glavna tačka = centar videa). */
  focalPx: number;
};

export const HERO_GEOMETRY: Record<HeroGeometry, HeroGeometrySpec> = {
  landscape: {
    video: { width: 1920, height: 1072 },
    pageQuad: [
      [1300.0, 397.2],
      [1737.4, 547.3],
      [1430.1, 969.4],
      [1004.0, 617.6],
    ],
    plateUv: {
      columns: [
        [0.08, 0.5],
        [0.54, 0.96],
      ],
      rows: [
        [0.05, 0.43],
        [0.47, 0.85],
      ],
    },
    focalPx: 1200,
  },
  portrait: {
    video: { width: 1064, height: 1920 },
    pageQuad: [
      [472.4, 1100.3],
      [912.2, 1232.1],
      [619.5, 1768.2],
      [126.9, 1589.4],
    ],
    plateUv: {
      columns: [
        [0.07, 0.505],
        [0.535, 0.97],
      ],
      rows: [
        [0.06, 0.44],
        [0.47, 0.85],
      ],
    },
    focalPx: 3600,
  },
};

/** Landscape aliasi (L3 imena). */
export const HERO_VIDEO = HERO_GEOMETRY.landscape.video;
export const HERO_PAGE_QUAD = HERO_GEOMETRY.landscape.pageQuad;
export const HERO_PLATE_UV = HERO_GEOMETRY.landscape.plateUv;

export type HeroPlateKey = "courses" | "studio" | "community" | "account";

export type HeroPlate = {
  key: HeroPlateKey;
  geometry: HeroGeometry;
  column: 0 | 1;
  row: 0 | 1;
  /** Uglovi ploče normalizovani 0–1 (x / širina, y / visina videa), redosled TL, TR, BR, BL. */
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
    geometry: "landscape",
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
    geometry: "landscape",
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
    geometry: "landscape",
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
    geometry: "landscape",
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
 * Portret ploče, isti redosled. Px u 1064×1920 (za proveru):
 *   courses   (484, 1135) (673, 1192) (560, 1372) (363, 1309)
 *   studio    (686, 1196) (883, 1256) (780, 1444) (574, 1377)
 *   community (353, 1323) (551, 1388) (424, 1591) (218, 1518)
 *   account   (565, 1392) (771, 1459) (654, 1672) (438, 1596)
 */
export const HERO_PLATES_PORTRAIT: readonly HeroPlate[] = [
  {
    key: "courses",
    geometry: "portrait",
    column: 0,
    row: 0,
    quad: [
      [0.4549, 0.5911],
      [0.6324, 0.6209],
      [0.5264, 0.7148],
      [0.3415, 0.6815],
    ],
  },
  {
    key: "studio",
    geometry: "portrait",
    column: 1,
    row: 0,
    quad: [
      [0.6449, 0.623],
      [0.83, 0.6541],
      [0.7327, 0.7519],
      [0.5395, 0.7172],
    ],
  },
  {
    key: "community",
    geometry: "portrait",
    column: 0,
    row: 1,
    quad: [
      [0.332, 0.6891],
      [0.5176, 0.7227],
      [0.3982, 0.8284],
      [0.2046, 0.7907],
    ],
  },
  {
    key: "account",
    geometry: "portrait",
    column: 1,
    row: 1,
    quad: [
      [0.5306, 0.725],
      [0.7245, 0.7601],
      [0.6147, 0.8707],
      [0.4118, 0.8311],
    ],
  },
];

export function heroPlates(geometry: HeroGeometry): readonly HeroPlate[] {
  return geometry === "portrait" ? HERO_PLATES_PORTRAIT : HERO_PLATES;
}

/**
 * Prag za 3D sloj: NAJMANJA (najdalja) ploča mora biti ≥ 80 CSS px široka — toliko treba
 * „maloj" kartici (ikona 18 + naslov 13 px u 2 reda, cilj ≥ 44 px). Ispod toga iste 4 kartice
 * idu kao snap red iznad trake. Bliže ploče su veće i nose više sadržaja (container query u
 * CSS-u: srednja od 110, puna od 150 px) — kartice su namerno RAZLIČITIH veličina.
 */
export const PLATE_MIN_CSS_PX = 80;

/** Dizajn prag (lg) ispod kog landscape ekran ne dobija 3D sloj bez obzira na visinu. */
export const LANDSCAPE_MIN_WIDTH = 1024;

function toQuad(points: Point[]): Quad {
  return [points[0], points[1], points[2], points[3]];
}

/** Četvorougao ploče u px videa. */
export function plateQuadVideoPx(plate: HeroPlate): Quad {
  const { width, height } = HERO_GEOMETRY[plate.geometry].video;
  return toQuad(plate.quad.map(([x, y]): Point => [x * width, y * height]));
}

const UNIT_SQUARE: Quad = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/** Homografija jedinični kvadrat lista (u, v) → px videa. */
export function pageHomography(geometry: HeroGeometry) {
  return solveHomography(UNIT_SQUARE, HERO_GEOMETRY[geometry].pageQuad);
}

/** Izvodi normalizovani quad ploče iz uglova lista + uv opsega (isti račun kao merenje). */
export function derivePlateQuad(column: 0 | 1, row: 0 | 1, geometry: HeroGeometry = "landscape"): Quad {
  const spec = HERO_GEOMETRY[geometry];
  const page = pageHomography(geometry);
  const [u0, u1] = spec.plateUv.columns[column];
  const [v0, v1] = spec.plateUv.rows[row];
  const corners: Quad = [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];
  return toQuad(
    corners.map((p): Point => {
      const [x, y] = applyHomography(page, p);
      return [x / spec.video.width, y / spec.video.height];
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
 * Prag 3D sloja po geometriji. Literal u `app/globals.css` mora biti jednak ovome — test to čuva.
 *
 * Landscape: video je `contain` (nikad krop): renderovana širina = min(vw, 100svh · 1920/1072).
 * Najmanja ploča ≥ 80 CSS px ⇔ renderovana širina ≥ 80 · 1920 / 165.7 = 928 ⇔ visina ≥ 519;
 * širina je dizajn prag lg (1024 > 927), pa je uslov `(orientation: landscape) and
 * (min-width: 1024px) and (min-height: 519px)`.
 *
 * Portret: video je height-fit (visina = 100svh, krop sa strane): renderovana širina =
 * 100svh · 1064/1920. Najmanja ploča ≥ 80 CSS px ⇔ visina ≥ 80 · 1920 / 202.1 = 761, pa je
 * uslov `(orientation: portrait) and (min-height: 761px)` (širina ne ulazi — samo krop).
 */
export function heroCardsBreakpoint(geometry: HeroGeometry = "landscape"): {
  minWidth?: number;
  minHeight: number;
} {
  const spec = HERO_GEOMETRY[geometry];
  const renderedWidth = (PLATE_MIN_CSS_PX * spec.video.width) / minPlateWidthVideoPx(heroPlates(geometry));
  const minHeight = Math.ceil((renderedWidth * spec.video.height) / spec.video.width);
  return geometry === "landscape" ? { minWidth: LANDSCAPE_MIN_WIDTH, minHeight } : { minHeight };
}

/** Media upit (literal) koji pali 3D sloj za datu geometriju. */
export function heroCardsMediaQuery(geometry: HeroGeometry): string {
  const { minWidth, minHeight } = heroCardsBreakpoint(geometry);
  const width = minWidth ? ` and (min-width: ${minWidth}px)` : "";
  return `@media (orientation: ${geometry})${width} and (min-height: ${minHeight}px)`;
}

/* ── Hover po normali lista ─────────────────────────────────────────────────────────── */

function cameraFor(geometry: HeroGeometry): Camera {
  const { video, focalPx } = HERO_GEOMETRY[geometry];
  return { focal: focalPx, principal: [video.width / 2, video.height / 2] };
}

const poseCache = new Map<HeroGeometry, PlanePose>();

/** Poza ravni lista u prostoru kamere (dekompozicija homografije lista; keširano). */
export function pagePose(geometry: HeroGeometry): PlanePose {
  let pose = poseCache.get(geometry);
  if (!pose) {
    pose = decomposeHomography(pageHomography(geometry), cameraFor(geometry));
    poseCache.set(geometry, pose);
  }
  return pose;
}

/**
 * Quad ploče podignute za `lift` (deo ŠIRINE lista) duž normale lista, u px videa — tj. gde
 * kartica „ide" kad se odlepi od papira pravo nagore u odnosu na svoju ravan.
 */
export function plateLiftedQuadVideoPx(plate: HeroPlate, lift: number = heroCardLift.heightRatio): Quad {
  const spec = HERO_GEOMETRY[plate.geometry];
  const pose = pagePose(plate.geometry);
  const camera = cameraFor(plate.geometry);
  const [u0, u1] = spec.plateUv.columns[plate.column];
  const [v0, v1] = spec.plateUv.rows[plate.row];
  const corners: Quad = [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];
  return toQuad(corners.map((uv) => projectPoint(planePoint(pose, uv, lift), camera)));
}

export type PlateLayout = {
  width: number;
  height: number;
  matrix3d: string;
  /** Ploča u CSS px sloja (TL, TR, BR, BL). */
  quad: Quad;
  /** Podignuta ploča u CSS px sloja. */
  liftedQuad: Quad;
  /** Pomeraj senke u LOKALNIM px kartice za pun lift (senka ostaje na papiru → beži suprotno). */
  shadow: Point;
};

const SHADOW_RATIO = 0.35;

/**
 * Layout box kartice i CSS `matrix3d` za dati `scale` (= širina sloja / širina videa, tj. CSS
 * px po px videa). Box je veličina ploče u CSS px; matrica preslikava (0,0)–(width,height) na
 * ploču u CSS px sloja. Računa se na svaki resize (4 rešavanja 8×8 — zanemarljivo).
 * `liftedQuad` je ista ploča podignuta po normali (za hover), `shadow` pomeraj senke.
 */
export function plateLayout(plate: HeroPlate, scale: number): PlateLayout {
  const size = plateSizeVideoPx(plate);
  const width = size.width * scale;
  const height = size.height * scale;
  const scaled = (q: Quad) => toQuad(q.map(([x, y]): Point => [x * scale, y * scale]));
  const quad = scaled(plateQuadVideoPx(plate));
  const liftedQuad = scaled(plateLiftedQuadVideoPx(plate));
  const box: Quad = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  const toLocal = solveHomography(quad, box);
  const center = centroid(quad);
  const liftedCenter = centroid(liftedQuad);
  const [lx0, ly0] = applyHomography(toLocal, center);
  const [lx1, ly1] = applyHomography(toLocal, liftedCenter);
  const shadow: Point = [-(lx1 - lx0) * SHADOW_RATIO, -(ly1 - ly0) * SHADOW_RATIO];
  return { width, height, quad, liftedQuad, shadow, matrix3d: homographyToMatrix3d(solveHomography(box, quad)) };
}

function centroid(q: Quad): Point {
  return [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];
}

/**
 * `matrix3d` za međustanje podizanja `t ∈ [0, 1]`: uglovi se linearno interpoliraju između
 * ploče i podignute ploče (podizanje je malo, pa je pravolinijska putanja uglova tačna do
 * na nevidljivu grešku), pa se homografija box → quad reši iznova. Nema CSS interpolacije
 * dve `matrix3d` vrednosti (dekompozicija perspektivnih matrica daje „talasanje").
 */
export function liftMatrix3d(layout: PlateLayout, t: number): string {
  if (t <= 0) return layout.matrix3d;
  const box: Quad = [
    [0, 0],
    [layout.width, 0],
    [layout.width, layout.height],
    [0, layout.height],
  ];
  const target = toQuad(
    layout.quad.map(([x, y], i): Point => {
      const [lx, ly] = layout.liftedQuad[i];
      return [x + (lx - x) * t, y + (ly - y) * t];
    }),
  );
  return homographyToMatrix3d(solveHomography(box, target));
}
