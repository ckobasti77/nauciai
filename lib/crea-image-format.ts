/**
 * „Promeni format i smanji" (S27, K04) - sve što se može reći bez browsera:
 * formati, kvalitet, ime izlaznog fajla, granica piksela, ušteda i koji su se
 * skriveni podaci nalazili u slici. Sama konverzija (canvas, jSquash) živi u
 * `components/crea/tools/format-tool.tsx`.
 *
 * Skriveni podaci (EXIF/GPS) se brišu SAMIM ponovnim kodiranjem: canvas i
 * jSquash pišu samo piksele. `exifr` služi da korisniku pokažemo šta je bilo u
 * fajlu - i da posle proverimo da novog fajla nema.
 */

export const CREA_IMAGE_FORMATS = {
  webp: { mime: "image/webp", ext: "webp", lossy: true },
  jpeg: { mime: "image/jpeg", ext: "jpg", lossy: true },
  png: { mime: "image/png", ext: "png", lossy: false },
  avif: { mime: "image/avif", ext: "avif", lossy: true },
} as const;
export type CreaImageFormat = keyof typeof CREA_IMAGE_FORMATS;
export const CREA_IMAGE_FORMAT_IDS = Object.keys(CREA_IMAGE_FORMATS) as CreaImageFormat[];

/** Kvalitet u procentima; 80 je dobar odnos veličine i izgleda za fotke. */
export const QUALITY_DEFAULT = 80;
export const QUALITY_MIN = 40;
export const QUALITY_MAX = 100;

/** Ulaz veći od ovoga se ni ne otvara - dekodiranje bi pojelo memoriju telefona. */
export const FORMAT_INPUT_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Najveća površina platna koja radi i u Safariju na iPhone-u (4096 × 4096).
 * Veća slika (npr. 48 MP sa novog telefona) se srazmerno smanjuje i korisniku
 * se to kaže - inače bi iPhone vratio praznu sliku bez greške.
 */
export const CANVAS_MAX_PIXELS = 16_777_216;

/**
 * AVIF kodira jSquash (WASM, jedna nit) - 16 MP na telefonu traje minutima.
 * 4 MP (npr. 2560 × 1600) je i dalje oštro za web, a gotovo je za nekoliko sekundi.
 */
export const AVIF_MAX_PIXELS = 4_194_304;

export function maxPixelsFor(format: CreaImageFormat): number {
  return format === "avif" ? AVIF_MAX_PIXELS : CANVAS_MAX_PIXELS;
}

export function clampQuality(value: number): number {
  if (!Number.isFinite(value)) return QUALITY_DEFAULT;
  return Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, Math.round(value)));
}

/** Kvalitet za `canvas.toBlob` (0-1); PNG ga nema. */
export function encoderQuality(format: CreaImageFormat, quality: number): number | undefined {
  return CREA_IMAGE_FORMATS[format].lossy ? clampQuality(quality) / 100 : undefined;
}

export function fitPixels(
  width: number,
  height: number,
  maxPixels = CANVAS_MAX_PIXELS,
): { width: number; height: number; scaled: boolean } {
  if (width * height <= maxPixels) return { width, height, scaled: false };
  const factor = Math.sqrt(maxPixels / (width * height));
  return {
    width: Math.max(1, Math.floor(width * factor)),
    height: Math.max(1, Math.floor(height * factor)),
    scaled: true,
  };
}

/**
 * Safari ume da vrati PNG kad se traži WebP (`toBlob` tiho padne na podrazumevani
 * format), a AVIF kroz platno ne ume skoro nijedan browser. Tada kodira jSquash.
 */
export function needsWasmEncoder(format: CreaImageFormat, producedType: string | undefined): boolean {
  return producedType !== CREA_IMAGE_FORMATS[format].mime;
}

/** „odmor-na-moru.HEIC" → „odmor-na-moru.webp". Bez putanje, kontrolnih znakova i predugih imena. */
export function outputFileName(inputName: string, format: CreaImageFormat): string {
  const base = inputName
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[^.]*$/, "")
    .replace(/[\u0000-\u001f<>:"|?*]+/g, "")
    .trim()
    .slice(0, 80);
  return `${base || "slika"}.${CREA_IMAGE_FORMATS[format].ext}`;
}

/**
 * HEIC/HEIF (fotke sa iPhone-a). Windows i Android često ne znaju MIME, pa
 * `file.type` bude prazan - zato i po nastavku imena.
 */
export function looksLikeHeic(name: string, type: string): boolean {
  return /^image\/hei[cf](-sequence)?$/i.test(type) || /\.(heic|heif)$/i.test(name.trim());
}

/** Promena veličine fajla u procentima, zaokružena; negativno = manji fajl. */
export function sizeChangePercent(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round(((after - before) / before) * 100);
}

export const METADATA_KINDS = ["gps", "device", "date", "author"] as const;
export type MetadataKind = (typeof METADATA_KINDS)[number];

const METADATA_KEYS: Record<MetadataKind, readonly string[]> = {
  gps: ["latitude", "longitude", "GPSLatitude", "GPSLongitude"],
  device: ["Make", "Model", "LensModel", "SerialNumber", "BodySerialNumber"],
  date: ["DateTimeOriginal", "CreateDate", "ModifyDate", "DateTime"],
  author: ["Artist", "Copyright", "OwnerName", "CameraOwnerName", "XPAuthor", "Creator"],
};

/** Koje vrste ličnih podataka su bile u fajlu (izlaz `exifr.parse`), stalnim redosledom. */
export function sensitiveMetadata(meta: unknown): MetadataKind[] {
  if (!meta || typeof meta !== "object") return [];
  const record = meta as Record<string, unknown>;
  return METADATA_KINDS.filter((kind) =>
    METADATA_KEYS[kind].some((key) => record[key] !== undefined && record[key] !== null && record[key] !== ""),
  );
}
