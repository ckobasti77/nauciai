/**
 * Pametan isečak (S30, K09): slika za drugi format, a lice ostaje u kadru.
 *
 * Dva izvora: MediaPipe BlazeFace kaže gde su lica, a `smartcrop` (ivice, boja,
 * koža) predloži kadar kad lica nema. Ova čista pravila garantuju ono što
 * `smartcrop` ne garantuje: lice je CELO u kadru, sa malo vazduha iznad glave.
 * Kad sva lica ne mogu da stanu (grupna fotka u uskom formatu), prednost ima
 * najveće lice.
 */

import type { Box } from "./crea-crop";

/** Najveći isečak datog odnosa (širina / visina) koji staje u sliku. */
export function largestCropForAspect(width: number, height: number, aspect: number): { width: number; height: number } {
  if (width / height > aspect) {
    return { width: Math.max(1, Math.round(height * aspect)), height };
  }
  return { width, height: Math.max(1, Math.round(width / aspect)) };
}

/**
 * Lice sa vazduhom oko sebe: kosa iznad čela (BlazeFace hvata od obrva), uši sa
 * strane, brada ispod. Ovaj okvir je ono što MORA da bude u kadru.
 */
export function faceWithMargin(face: Box): Box {
  const top = face.height * 0.45;
  const bottom = face.height * 0.2;
  const side = face.width * 0.15;
  return { x: face.x - side, y: face.y - top, width: face.width + side * 2, height: face.height + top + bottom };
}

export function unionBox(boxes: readonly Box[]): Box {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Kadar `size` sa centrom u `(cx, cy)`, pomeren tako da ceo staje u sliku. */
function frameAround(cx: number, cy: number, size: { width: number; height: number }, image: { width: number; height: number }): Box {
  return {
    x: Math.round(clamp(cx - size.width / 2, 0, image.width - size.width)),
    y: Math.round(clamp(cy - size.height / 2, 0, image.height - size.height)),
    width: size.width,
    height: size.height,
  };
}

export type SmartCropInput = {
  image: { width: number; height: number };
  /** Odnos izlaza (širina / visina). */
  aspect: number;
  /** Lica sa detektora, u pikselima slike. */
  faces: readonly Box[];
  /** Predlog `smartcrop`-a (isti odnos), za slike bez lica. */
  suggestion?: Box | null;
};

export type SmartCropResult = {
  crop: Box;
  /** Po čemu je izabran kadar. */
  reason: "faces" | "largest-face" | "subject" | "center";
  facesFound: number;
  /** Koliko lica je CELO u kadru (sa vazduhom). */
  facesInside: number;
};

/** Da li je okvir lica (sa vazduhom) ceo u kadru; dozvoljen je 1 px zaokruživanja. */
export function containsBox(frame: Box, box: Box): boolean {
  return (
    box.x >= frame.x - 1 &&
    box.y >= frame.y - 1 &&
    box.x + box.width <= frame.x + frame.width + 1 &&
    box.y + box.height <= frame.y + frame.height + 1
  );
}

/**
 * Lica (sa vazduhom) se seku sa slikom - lice uz ivicu fotke ne može da dobije
 * vazduh koji fotka nema, pa se traži samo ono što postoji.
 */
function clipToImage(box: Box, image: { width: number; height: number }): Box {
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const right = Math.min(image.width, box.x + box.width);
  const bottom = Math.min(image.height, box.y + box.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/**
 * Kadar za lica: centar vodoravno na sredini lica, a uspravno tako da lica budu
 * u gornjoj trećini (kao na portretu), pa pomeren da ih obuhvati cela.
 */
function frameForFaces(target: Box, size: { width: number; height: number }, image: { width: number; height: number }): Box {
  const cx = target.x + target.width / 2;
  // Oči oko 40 % visine kadra; ako je lice blizu ivice, `frameAround` ga gura nazad.
  const cy = target.y + target.height / 2 + size.height * 0.1;
  const frame = frameAround(cx, cy, size, image);
  // Gornja/donja/leva/desna ivica lica mora da bude unutra - pomeri koliko treba.
  const dx =
    target.x < frame.x ? target.x - frame.x : target.x + target.width > frame.x + frame.width ? target.x + target.width - (frame.x + frame.width) : 0;
  const dy =
    target.y < frame.y ? target.y - frame.y : target.y + target.height > frame.y + frame.height ? target.y + target.height - (frame.y + frame.height) : 0;
  return {
    ...frame,
    x: Math.round(clamp(frame.x + dx, 0, image.width - size.width)),
    y: Math.round(clamp(frame.y + dy, 0, image.height - size.height)),
  };
}

export function smartCropBox({ image, aspect, faces, suggestion }: SmartCropInput): SmartCropResult {
  const size = largestCropForAspect(image.width, image.height, aspect);
  const padded = faces.map((face) => clipToImage(faceWithMargin(face), image)).filter((box) => box.width > 0 && box.height > 0);
  const count = (crop: Box) => padded.filter((box) => containsBox(crop, box)).length;

  if (padded.length > 0) {
    const all = unionBox(padded);
    if (all.width <= size.width && all.height <= size.height) {
      const crop = frameForFaces(all, size, image);
      return { crop, reason: "faces", facesFound: faces.length, facesInside: count(crop) };
    }
    // Sva lica ne staju: najveće lice ima prednost (obično onaj ko je u prvom planu).
    const largest = padded.reduce((best, box) => (box.width * box.height > best.width * best.height ? box : best));
    const crop = frameForFaces(largest, size, image);
    return { crop, reason: "largest-face", facesFound: faces.length, facesInside: count(crop) };
  }

  if (suggestion && suggestion.width > 0 && suggestion.height > 0) {
    const crop = frameAround(suggestion.x + suggestion.width / 2, suggestion.y + suggestion.height / 2, size, image);
    return { crop, reason: "subject", facesFound: 0, facesInside: 0 };
  }

  return { crop: frameAround(image.width / 2, image.height / 2, size, image), reason: "center", facesFound: 0, facesInside: 0 };
}

// ── Lica na širokoj ili visokoj fotki ───────────────────────────────────────

/**
 * BlazeFace (kratki domet) gleda sliku smanjenu na 128 × 128. Na panorami je
 * lice tada par piksela i promakne. Zato se široka/visoka slika pregleda kroz
 * kvadratne prozore (stranica = kraća stranica slike) sa preklapanjem od pola
 * prozora; kvadratnoj slici dovoljan je jedan prozor.
 */
export function detectionTiles(width: number, height: number): Box[] {
  const side = Math.min(width, height);
  const long = Math.max(width, height);
  if (long <= side * 1.25) return [{ x: 0, y: 0, width, height }];
  const step = side / 2;
  const starts: number[] = [];
  for (let start = 0; start + side < long; start += step) starts.push(Math.round(start));
  starts.push(long - side);
  return starts.map((start) =>
    width >= height ? { x: start, y: 0, width: side, height: side } : { x: 0, y: start, width: side, height: side },
  );
}

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / Math.min(a.width * a.height, b.width * b.height);
}

/**
 * Isto lice nađeno u dva prozora koji se preklapaju = jedno lice. Zadržava se
 * sigurniji nalaz; „preklapanje" se meri prema manjem okviru (lice presečeno
 * ivicom prozora je manje od celog).
 */
export function mergeFaces(faces: ReadonlyArray<Box & { score: number }>, minOverlap = 0.5): Box[] {
  const kept: Array<Box & { score: number }> = [];
  for (const face of [...faces].sort((a, b) => b.score - a.score)) {
    if (!kept.some((other) => overlap(other, face) >= minOverlap)) kept.push(face);
  }
  return kept.map(({ x, y, width, height }) => ({ x, y, width, height }));
}
