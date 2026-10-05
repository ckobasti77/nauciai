/**
 * Prekroji kadar videa (Crea K20, V15; plan K17 §5): isti video u 9:16, 1:1,
 * 16:9 ili 4:5, a lice ostaje u kadru. Uređaj nađe lica na ~5 kadrova u sekundi
 * (MediaPipe BlazeFace), a ovde je sva odluka gde stoji isečak:
 *
 * 1. glavni lik kroz vreme (`trackSubject`) - lice najbliže prethodnom, inače najveće;
 * 2. željeni centar isečka (lice malo iznad sredine, „vazduh iznad glave");
 * 3. kamera prati glatko: mrtva zona (sitni pokreti glave se ne prate),
 *    kritično prigušena opruga i najveća brzina pomeranja;
 * 4. lice ostaje celo u isečku - kad bi izašlo, isečak se pomeri tačno toliko
 *    koliko mora (to je jedini slučaj kad sme brže od najveće brzine);
 * 5. isečak je uvek unutar kadra; između uzoraka linearno (`cropAt`).
 *
 * Čiste funkcije, bez browser API-ja - testira ih `crea-video-reframe.test.ts`.
 */

export const VIDEO_REFRAME_TARGETS = ["9:16", "1:1", "16:9", "4:5"] as const;
export type VideoReframeTarget = (typeof VIDEO_REFRAME_TARGETS)[number];

export function targetAspect(target: VideoReframeTarget): number {
  const [w, h] = target.split(":").map(Number);
  return w! / h!;
}

/** Lice u kadru izvora, normalizovano na 0..1 (levi gornji ugao, širina, visina). */
export type FaceBox = { x: number; y: number; w: number; h: number; score: number };
export type FaceSample = { t: number; faces: readonly FaceBox[] };

/** Koliko kadrova u sekundi detektor gleda (plan K17 §5: „~5 kadrova/s"). */
export const REFRAME_SAMPLE_FPS = 5;
/** Najviše uzoraka po videu (2 min na 5/s) - duži video gleda ređe. */
export const REFRAME_MAX_SAMPLES = 600;
/** Detektor pod ovom sigurnošću ne vidi lice nego senku. */
export const FACE_MIN_SCORE = 0.5;

/** Trenuci u kojima detektor gleda kadar (sredina prvog intervala, pa ravnomerno). */
export function reframeSampleTimes(durationS: number, fps = REFRAME_SAMPLE_FPS, maxSamples = REFRAME_MAX_SAMPLES): number[] {
  if (!Number.isFinite(durationS) || durationS <= 0) return [];
  const count = Math.max(1, Math.min(maxSamples, Math.round(durationS * fps)));
  const step = durationS / count;
  return Array.from({ length: count }, (_, index) => Math.round((index + 0.5) * step * 1000) / 1000);
}

function even(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

/** Najveći prozor ciljnog odnosa unutar kadra, u pikselima izvora (parne stranice). */
export function reframeWindow(srcWidth: number, srcHeight: number, aspect: number): { width: number; height: number } {
  if (srcWidth / srcHeight > aspect) return { width: even(Math.min(srcWidth, srcHeight * aspect)), height: even(srcHeight) };
  return { width: even(srcWidth), height: even(Math.min(srcHeight, srcWidth / aspect)) };
}

/** Veličina izvezenog videa: isečak smanjen tako da duža stranica ne pređe `maxLong` (parne stranice). */
export function reframeOutputSize(window: { width: number; height: number }, maxLong: number): { width: number; height: number } {
  const scale = Math.min(1, maxLong / Math.max(window.width, window.height));
  return { width: even(window.width * scale), height: even(window.height * scale) };
}

/**
 * BlazeFace (kratak domet) gleda kadar kao 128 × 128, pa lice koje zauzima malo
 * širokog kadra ne vidi. Kad u celom kadru nema lica, detektor gleda i kvadratne
 * isečke duž duže stranice (preklapaju se), u pikselima kadra.
 */
export function detectionTiles(width: number, height: number): Array<{ x: number; y: number; size: number }> {
  const size = Math.min(width, height);
  const long = Math.max(width, height);
  if (long - size < 2) return [];
  const count = Math.ceil(long / size) + 1;
  const step = (long - size) / (count - 1);
  return Array.from({ length: count }, (_, index) => {
    const offset = Math.round(index * step);
    return width >= height ? { x: offset, y: 0, size } : { x: 0, y: offset, size };
  });
}

function overlap(a: FaceBox, b: FaceBox): number {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = w * h;
  return inter / Math.max(1e-9, a.w * a.h + b.w * b.h - inter);
}

/** Ista lica iz susednih isečaka se spajaju: od preklopljenih ostaje najsigurnije. */
export function mergeFaces(faces: readonly FaceBox[]): FaceBox[] {
  const sorted = [...faces].sort((a, b) => b.score - a.score);
  const kept: FaceBox[] = [];
  for (const face of sorted) if (!kept.some((other) => overlap(face, other) > 0.3)) kept.push(face);
  return kept;
}

function center(face: FaceBox): { x: number; y: number } {
  return { x: face.x + face.w / 2, y: face.y + face.h / 2 };
}

/**
 * Glavni lik kroz vreme. Pouzdana lica (≥ `FACE_MIN_SCORE`); kad je lik već
 * izabran, uzima se najbliže lice (veće lice dobija malu prednost), inače najveće.
 * Uzorak bez lica daje `null`.
 */
export function trackSubject(samples: readonly FaceSample[]): Array<{ t: number; face: FaceBox | null }> {
  let previous: FaceBox | null = null;
  return samples.map((sample) => {
    const faces = sample.faces.filter((face) => face.score >= FACE_MIN_SCORE && face.w > 0 && face.h > 0);
    if (faces.length === 0) return { t: sample.t, face: null };
    let best = faces[0]!;
    if (previous) {
      const from = center(previous);
      const cost = (face: FaceBox) => {
        const at = center(face);
        return Math.hypot(at.x - from.x, at.y - from.y) - 0.5 * Math.sqrt(face.w * face.h);
      };
      for (const face of faces) if (cost(face) < cost(best)) best = face;
    } else {
      for (const face of faces) if (face.w * face.h > best.w * best.h) best = face;
    }
    previous = best;
    return { t: sample.t, face: best };
  });
}

export type ReframeOptions = {
  /** Mrtva zona: deo širine/visine isečka u kojem se pokret glave ne prati. */
  deadZone: number;
  /** Najveća brzina kamere: deo kadra izvora u sekundi. */
  maxSpeed: number;
  /** Vreme smirivanja opruge (s) - veće je mekše. */
  smoothTime: number;
  /** Lice stoji ovoliko (deo visine isečka) iznad sredine. */
  headroom: number;
  /** Najmanji razmak lica od ivice isečka (deo isečka). */
  margin: number;
};

export const REFRAME_DEFAULTS: ReframeOptions = { deadZone: 0.08, maxSpeed: 0.35, smoothTime: 0.5, headroom: 0.08, margin: 0.03 };

/** Ključ putanje: levi gornji ugao isečka u pikselima izvora, u trenutku `t`. */
export type CropKey = { t: number; x: number; y: number };
export type ReframePath = { width: number; height: number; srcWidth: number; srcHeight: number; keys: CropKey[] };

type Axis = { position: number; velocity: number };

/** Kritično prigušena opruga (Unity `SmoothDamp`), uz tvrdu granicu brzine po koraku. */
function smoothStep(axis: Axis, target: number, dt: number, smoothTime: number, maxSpeed: number): Axis {
  if (dt <= 0) return axis;
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = axis.position - target;
  const temp = (axis.velocity + omega * change) * dt;
  let velocity = (axis.velocity - omega * temp) * decay;
  let position = target + (change + temp) * decay;
  // Bez preletanja cilja.
  if (target - axis.position > 0 === position > target) {
    position = target;
    velocity = 0;
  }
  const limit = maxSpeed * dt;
  if (Math.abs(position - axis.position) > limit) {
    position = axis.position + Math.sign(position - axis.position) * limit;
    velocity = Math.sign(velocity) * Math.min(Math.abs(velocity), maxSpeed);
  }
  return { position, velocity };
}

/** Pokret van mrtve zone: kamera prati samo deo pomeraja koji izlazi iz nje. */
function followTarget(current: number, desired: number, zone: number): number {
  const error = desired - current;
  if (Math.abs(error) <= zone) return current;
  return current + Math.sign(error) * (Math.abs(error) - zone);
}

/** Najmanje pomeranje početka isečka da lice [lo, hi] stane unutra sa razmakom. */
function containStart(start: number, size: number, lo: number, hi: number, margin: number): number {
  if (hi - lo + 2 * margin > size) return (lo + hi) / 2 - size / 2;
  if (lo - margin < start) return lo - margin;
  if (hi + margin > start + size) return hi + margin - size;
  return start;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Putanja isečka iz uzoraka lica. Uzorak bez lica drži poslednji položaj; uzorci
 * pre prvog lica stoje tamo gde će lice biti; video bez ijednog lica ostaje u sredini.
 */
export function reframePath(
  samples: readonly FaceSample[],
  source: { width: number; height: number },
  aspect: number,
  options: ReframeOptions = REFRAME_DEFAULTS,
): ReframePath {
  const window = reframeWindow(source.width, source.height, aspect);
  const maxX = source.width - window.width;
  const maxY = source.height - window.height;
  const base = { width: window.width, height: window.height, srcWidth: source.width, srcHeight: source.height };
  const centered = { x: Math.round(maxX / 2), y: Math.round(maxY / 2) };
  const tracked = trackSubject(samples);
  const firstFace = tracked.find((entry) => entry.face !== null)?.face ?? null;
  if (tracked.length === 0 || !firstFace) {
    return { ...base, keys: [{ t: 0, ...centered }] };
  }

  const desiredStart = (face: FaceBox) => {
    const at = center(face);
    return {
      x: at.x * source.width - window.width / 2,
      y: at.y * source.height + options.headroom * window.height - window.height / 2,
    };
  };

  const start = desiredStart(firstFace);
  let ax: Axis = { position: clamp(start.x, 0, maxX), velocity: 0 };
  let ay: Axis = { position: clamp(start.y, 0, maxY), velocity: 0 };
  let lastFace: FaceBox = firstFace;
  let lastT = tracked[0]!.t;
  const keys: CropKey[] = [];

  for (const entry of tracked) {
    const face = entry.face ?? lastFace;
    lastFace = face;
    const dt = Math.max(0, entry.t - lastT);
    lastT = entry.t;
    const desired = desiredStart(face);

    if (dt > 0) {
      const targetX = followTarget(ax.position, clamp(desired.x, 0, maxX), options.deadZone * window.width);
      const targetY = followTarget(ay.position, clamp(desired.y, 0, maxY), options.deadZone * window.height);
      ax = smoothStep(ax, targetX, dt, options.smoothTime, options.maxSpeed * source.width);
      ay = smoothStep(ay, targetY, dt, options.smoothTime, options.maxSpeed * source.height);
    }

    // Lice ostaje celo u isečku: pomeri tačno koliko mora (i ovde sme brže).
    const marginX = options.margin * window.width;
    const marginY = options.margin * window.height;
    const fx = clamp(containStart(ax.position, window.width, face.x * source.width, (face.x + face.w) * source.width, marginX), 0, maxX);
    const fy = clamp(containStart(ay.position, window.height, face.y * source.height, (face.y + face.h) * source.height, marginY), 0, maxY);
    if (fx !== ax.position) ax = { position: fx, velocity: 0 };
    if (fy !== ay.position) ay = { position: fy, velocity: 0 };

    keys.push({ t: entry.t, x: Math.round(clamp(ax.position, 0, maxX)), y: Math.round(clamp(ay.position, 0, maxY)) });
  }

  return { ...base, keys };
}

/** Isečak u trenutku `t` (linearno između ključeva), uvek unutar kadra. */
export function cropAt(path: ReframePath, t: number): { x: number; y: number; width: number; height: number } {
  const keys = path.keys;
  const maxX = path.srcWidth - path.width;
  const maxY = path.srcHeight - path.height;
  let x = keys[0]?.x ?? 0;
  let y = keys[0]?.y ?? 0;
  if (keys.length > 1 && t > keys[0]!.t) {
    const last = keys[keys.length - 1]!;
    if (t >= last.t) {
      x = last.x;
      y = last.y;
    } else {
      let index = 1;
      while (index < keys.length - 1 && keys[index]!.t < t) index += 1;
      const a = keys[index - 1]!;
      const b = keys[index]!;
      const span = b.t - a.t;
      const p = span > 0 ? (t - a.t) / span : 1;
      x = a.x + (b.x - a.x) * p;
      y = a.y + (b.y - a.y) * p;
    }
  }
  return {
    x: Math.round(clamp(x, 0, maxX)),
    y: Math.round(clamp(y, 0, maxY)),
    width: path.width,
    height: path.height,
  };
}

/** Koliko uzoraka ima lice (0..1) - za poruku „lice nije nađeno, isečak je u sredini". */
export function faceCoverage(samples: readonly FaceSample[]): number {
  if (samples.length === 0) return 0;
  return trackSubject(samples).filter((entry) => entry.face !== null).length / samples.length;
}
