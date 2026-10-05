import { CANVAS_MAX_PIXELS } from "./crea-image-format";
import { stickerById } from "./crea-stickers";
import type { Locale, LocalizedText } from "./i18n";

/**
 * Scena editora na platnu (S28/S29, K10) kao čist JSON: šta je na platnu, gde,
 * kojim redom (prvi čvor je najdublji sloj) i kojim stilom. Iz iste scene crta
 * Konva, iz nje rade poništi/ponovi i šabloni, i nju čuva/čita `parseScene`.
 *
 * Slike u sceni su samo id-jevi (`asset`); sam fajl (lokalni `blob:` URL) drži
 * editor u memoriji. Zato JSON scene nikad ne nosi lične fotke, a šablon je
 * scena sa praznim mestima za slike (`slot`).
 *
 * Mere su u pikselima IZLAZA (npr. 1080 × 1350): ekran samo umanjuje prikaz.
 * Boje su prave HEX vrednosti brenda svetle teme - slika mora da izgleda isto
 * bez obzira na to u kojoj temi je napravljena.
 */

export const SCENE_VERSION = 1;

export const SCENE_LIMITS = {
  minSide: 64,
  maxSide: 4096,
  maxNodes: 120,
  maxText: 2000,
  maxCoord: 20_000,
  maxIdLength: 40,
} as const;

/** Paleta brenda (svetla tema) + nekoliko boja za korisnike. */
export const CREA_SCENE_COLORS = {
  mastilo: "#0e3158",
  papir: "#fffdf8",
  krem: "#fdeed8",
  bez: "#f4f0e8",
  zuta: "#f4be30",
  siva: "#536273",
  linija: "#c9d4df",
  plava: "#2e6f9f",
  bela: "#ffffff",
  crvena: "#c8402f",
  zelena: "#2f7d4f",
} as const;

export const CREA_SCENE_FONTS = ["nunito", "rukopis"] as const;
export type CreaFontId = (typeof CREA_SCENE_FONTS)[number];

/** Debljine koje font stvarno ima (Patrick Hand postoji samo u 400). */
export const CREA_FONT_WEIGHTS: Record<CreaFontId, readonly number[]> = {
  nunito: [400, 700, 900],
  rukopis: [400],
};

export type CreaStroke = { color: string; width: number };
/** Tvrda senka brenda: pomeraj bez zamućenja. */
export type CreaShadow = { color: string; x: number; y: number };

/** Polje šablona koje korisnik popunjava (tekst). */
export type CreaTextField = { id: string; label: LocalizedText; maxLength: number; multiline: boolean };
/** Mesto za sliku u šablonu ili kolažu. */
export type CreaImageSlot = { id: string; label: LocalizedText };

type NodeBase = {
  id: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
};

export type CreaTextNode = NodeBase & {
  kind: "text";
  text: string;
  font: CreaFontId;
  weight: number;
  /** Željena veličina; uz `fit` je to najveća. */
  fontSize: number;
  minFontSize?: number;
  /** Smanji slova da tekst stane u `width × height` (polja šablona). */
  fit: boolean;
  width: number;
  height?: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  fill: string;
  uppercase: boolean;
  stroke?: CreaStroke;
  shadow?: CreaShadow;
  role?: "watermark";
  field?: CreaTextField;
};

export type CreaImageNode = NodeBase & {
  kind: "image";
  width: number;
  height: number;
  /** Id slike u editoru; `null` = prazno mesto (šablon, kolaž). */
  asset: string | null;
  cornerRadius: number;
  /** Boja praznog mesta (vidi se i u izvozu ako mesto ostane prazno). */
  placeholder: string;
  stroke?: CreaStroke;
  shadow?: CreaShadow;
  role?: "watermark" | "kolaz";
  slot?: CreaImageSlot;
};

export type CreaStickerNode = NodeBase & {
  kind: "sticker";
  sticker: string;
  width: number;
  height: number;
  shadow?: CreaShadow;
};

export const CREA_SHAPES = ["rect", "ellipse", "star", "arrow"] as const;
export type CreaShapeKind = (typeof CREA_SHAPES)[number];

export type CreaShapeNode = NodeBase & {
  kind: "shape";
  shape: CreaShapeKind;
  width: number;
  height: number;
  fill: string | null;
  stroke?: CreaStroke;
  cornerRadius: number;
  shadow?: CreaShadow;
};

export type CreaSceneNode = CreaTextNode | CreaImageNode | CreaStickerNode | CreaShapeNode;
export type CreaNodeKind = CreaSceneNode["kind"];

export type CreaScene = {
  version: typeof SCENE_VERSION;
  width: number;
  height: number;
  background: string;
  nodes: CreaSceneNode[];
};

// ── Provera i čišćenje (JSON spolja, šabloni, poništi/ponovi) ───────────────

const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9][a-z0-9-]*$/i;

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

function color(value: unknown): string | null {
  return typeof value === "string" && HEX.test(value) ? value.toLowerCase() : null;
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function localized(value: unknown): LocalizedText | null {
  if (!isRecord(value)) return null;
  const sr = text(value.sr, 80);
  const en = text(value.en, 80);
  return sr && en ? { sr, en } : null;
}

function id(value: unknown): string | null {
  return typeof value === "string" && value.length <= SCENE_LIMITS.maxIdLength && ID.test(value) ? value : null;
}

function stroke(value: unknown): CreaStroke | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const c = color(value.color);
  const width = num(value.width, 0, 200);
  return c && width !== null ? { color: c, width } : null;
}

function shadow(value: unknown): CreaShadow | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const c = color(value.color);
  const x = num(value.x, -200, 200);
  const y = num(value.y, -200, 200);
  return c && x !== null && y !== null ? { color: c, x, y } : null;
}

function base(raw: Raw): NodeBase | null {
  const nodeId = id(raw.id);
  const limit = SCENE_LIMITS.maxCoord;
  const x = num(raw.x, -limit, limit);
  const y = num(raw.y, -limit, limit);
  const rotation = num(raw.rotation ?? 0, -360, 360);
  const opacity = num(raw.opacity ?? 1, 0, 1);
  if (!nodeId || x === null || y === null || rotation === null || opacity === null) return null;
  return {
    id: nodeId,
    x,
    y,
    rotation,
    opacity,
    visible: raw.visible !== false,
    locked: raw.locked === true,
  };
}

/** Izostavi `undefined` polja (JSON i poređenje u testovima ih ionako ne vide). */
function compact<T extends Raw>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function parseNode(raw: unknown): CreaSceneNode | null {
  if (!isRecord(raw)) return null;
  const common = base(raw);
  if (!common) return null;
  const limit = SCENE_LIMITS.maxCoord;
  const width = num(raw.width, 1, limit);
  const s = stroke(raw.stroke);
  const sh = shadow(raw.shadow);
  if (width === null || s === null || sh === null) return null;

  switch (raw.kind) {
    case "text": {
      const content = text(raw.text, SCENE_LIMITS.maxText);
      const font = CREA_SCENE_FONTS.find((entry) => entry === raw.font);
      const fontSize = num(raw.fontSize, 8, 1000);
      const fill = color(raw.fill);
      const lineHeight = num(raw.lineHeight ?? 1.15, 0.8, 3);
      const height = raw.height === undefined ? undefined : num(raw.height, 1, limit);
      const minFontSize = raw.minFontSize === undefined ? undefined : num(raw.minFontSize, 8, 1000);
      const align = (["left", "center", "right"] as const).find((entry) => entry === raw.align) ?? "left";
      const verticalAlign = (["top", "middle", "bottom"] as const).find((entry) => entry === raw.verticalAlign) ?? "top";
      if (content === null || !font || fontSize === null || !fill || lineHeight === null) return null;
      if (height === null || minFontSize === null) return null;
      const weights = CREA_FONT_WEIGHTS[font];
      const weight = weights.includes(Number(raw.weight)) ? Number(raw.weight) : weights[weights.length - 1]!;
      let field: CreaTextField | undefined;
      if (raw.field !== undefined) {
        if (!isRecord(raw.field)) return null;
        const fieldId = id(raw.field.id);
        const label = localized(raw.field.label);
        const maxLength = num(raw.field.maxLength, 1, SCENE_LIMITS.maxText);
        if (!fieldId || !label || maxLength === null) return null;
        field = { id: fieldId, label, maxLength: Math.round(maxLength), multiline: raw.field.multiline === true };
      }
      return compact({
        ...common,
        kind: "text",
        text: field ? content.slice(0, field.maxLength) : content,
        font,
        weight,
        fontSize,
        minFontSize: minFontSize ?? undefined,
        fit: raw.fit === true && height !== undefined,
        width,
        height: height ?? undefined,
        lineHeight,
        align,
        verticalAlign,
        fill,
        uppercase: raw.uppercase === true,
        stroke: s,
        shadow: sh,
        role: raw.role === "watermark" ? "watermark" : undefined,
        field,
      }) as CreaTextNode;
    }
    case "image": {
      const height = num(raw.height, 1, limit);
      const asset = raw.asset === null || raw.asset === undefined ? null : id(raw.asset);
      const cornerRadius = num(raw.cornerRadius ?? 0, 0, 2000);
      const placeholder = color(raw.placeholder ?? CREA_SCENE_COLORS.krem);
      if (height === null || cornerRadius === null || !placeholder) return null;
      if (raw.asset !== null && raw.asset !== undefined && asset === null) return null;
      let slot: CreaImageSlot | undefined;
      if (raw.slot !== undefined) {
        if (!isRecord(raw.slot)) return null;
        const slotId = id(raw.slot.id);
        const label = localized(raw.slot.label);
        if (!slotId || !label) return null;
        slot = { id: slotId, label };
      }
      const role = raw.role === "watermark" || raw.role === "kolaz" ? raw.role : undefined;
      return compact({ ...common, kind: "image", width, height, asset, cornerRadius, placeholder, stroke: s, shadow: sh, role, slot }) as CreaImageNode;
    }
    case "sticker": {
      const height = num(raw.height, 1, limit);
      const sticker = typeof raw.sticker === "string" && stickerById(raw.sticker) ? raw.sticker : null;
      if (height === null || !sticker) return null;
      return compact({ ...common, kind: "sticker", sticker, width, height, shadow: sh }) as CreaStickerNode;
    }
    case "shape": {
      const height = num(raw.height, 1, limit);
      const shape = CREA_SHAPES.find((entry) => entry === raw.shape);
      const fill = raw.fill === null ? null : color(raw.fill);
      const cornerRadius = num(raw.cornerRadius ?? 0, 0, 2000);
      if (height === null || !shape || (raw.fill !== null && fill === null) || cornerRadius === null) return null;
      return compact({ ...common, kind: "shape", shape, width, height, fill, stroke: s, cornerRadius, shadow: sh }) as CreaShapeNode;
    }
    default:
      return null;
  }
}

/**
 * Scena iz nepoznatog JSON-a (šablon, nacrt, poništi/ponovi). Sve što nije po
 * pravilima - pogrešna vrsta, boja koja nije HEX, nepoznat font ili nalepnica,
 * dupli id, previše čvorova - vraća `null`, a brojevi se svode u granice.
 */
export function parseScene(raw: unknown): CreaScene | null {
  if (!isRecord(raw) || raw.version !== SCENE_VERSION) return null;
  const width = num(raw.width, SCENE_LIMITS.minSide, SCENE_LIMITS.maxSide);
  const height = num(raw.height, SCENE_LIMITS.minSide, SCENE_LIMITS.maxSide);
  const background = color(raw.background);
  if (width === null || height === null || !background || !Array.isArray(raw.nodes)) return null;
  if (raw.nodes.length > SCENE_LIMITS.maxNodes) return null;
  const nodes: CreaSceneNode[] = [];
  const seen = new Set<string>();
  for (const entry of raw.nodes) {
    const node = parseNode(entry);
    if (!node || seen.has(node.id)) return null;
    seen.add(node.id);
    nodes.push(node);
  }
  return { version: SCENE_VERSION, width: Math.round(width), height: Math.round(height), background, nodes };
}

export function serializeScene(scene: CreaScene): string {
  return JSON.stringify(scene);
}

// ── Izmene (sve vraćaju novu scenu) ─────────────────────────────────────────

/** Sledeći slobodan id za vrstu čvora (`tekst-3`), deterministički. */
export function nextNodeId(scene: CreaScene, prefix: string): string {
  let max = 0;
  for (const node of scene.nodes) {
    const match = node.id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${max + 1}`;
}

export function findNode(scene: CreaScene, nodeId: string | null): CreaSceneNode | undefined {
  return nodeId ? scene.nodes.find((node) => node.id === nodeId) : undefined;
}

/** Nov čvor ide na vrh (poslednji u nizu = najbliži gledaocu). */
export function addNode(scene: CreaScene, node: CreaSceneNode): CreaScene {
  if (scene.nodes.length >= SCENE_LIMITS.maxNodes || findNode(scene, node.id)) return scene;
  return { ...scene, nodes: [...scene.nodes, node] };
}

export type CreaNodePatch =
  | Partial<CreaTextNode>
  | Partial<CreaImageNode>
  | Partial<CreaStickerNode>
  | Partial<CreaShapeNode>;

/** Izmena jednog čvora; posle izmene čvor prolazi istu proveru kao JSON spolja. */
export function updateNode(scene: CreaScene, nodeId: string, patch: CreaNodePatch): CreaScene {
  let changed = false;
  const nodes = scene.nodes.map((node) => {
    if (node.id !== nodeId) return node;
    const next = parseNode({ ...node, ...patch, id: node.id, kind: node.kind });
    if (!next) return node;
    changed = true;
    return next;
  });
  return changed ? { ...scene, nodes } : scene;
}

export function removeNode(scene: CreaScene, nodeId: string): CreaScene {
  const nodes = scene.nodes.filter((node) => node.id !== nodeId);
  return nodes.length === scene.nodes.length ? scene : { ...scene, nodes };
}

export type LayerMove = "up" | "down" | "top" | "bottom";

export function moveNode(scene: CreaScene, nodeId: string, move: LayerMove): CreaScene {
  const from = scene.nodes.findIndex((node) => node.id === nodeId);
  if (from < 0) return scene;
  const last = scene.nodes.length - 1;
  const to = move === "up" ? Math.min(last, from + 1) : move === "down" ? Math.max(0, from - 1) : move === "top" ? last : 0;
  if (to === from) return scene;
  const nodes = [...scene.nodes];
  const [node] = nodes.splice(from, 1);
  nodes.splice(to, 0, node!);
  return { ...scene, nodes };
}

export function duplicateNode(scene: CreaScene, nodeId: string): CreaScene {
  const node = findNode(scene, nodeId);
  if (!node) return scene;
  const offset = Math.round(Math.min(scene.width, scene.height) * 0.03);
  const prefix = node.id.replace(/-\d+$/, "");
  // Kopija polja šablona nije polje (inače bi dva čvora delila jedan unos), a kopija iz kolaža nije deo mreže.
  const copy = parseNode({
    ...node,
    id: nextNodeId(scene, prefix),
    x: node.x + offset,
    y: node.y + offset,
    locked: false,
    field: undefined,
    slot: undefined,
    role: node.kind === "image" && node.role === "kolaz" ? undefined : (node as { role?: string }).role,
  });
  return copy ? addNode(scene, copy) : scene;
}

// ── Platno, kolaž, vodeni žig, izvoz ────────────────────────────────────────

export type CanvasPresetId = "kvadrat" | "objava" | "prica" | "youtube" | "poster" | "siroko";

export const EDITOR_CANVAS_PRESETS: ReadonlyArray<{ id: CanvasPresetId; width: number; height: number; label: LocalizedText }> = [
  { id: "objava", width: 1080, height: 1350, label: { sr: "Instagram objava", en: "Instagram post" } },
  { id: "kvadrat", width: 1080, height: 1080, label: { sr: "Kvadrat", en: "Square" } },
  { id: "prica", width: 1080, height: 1920, label: { sr: "Priča · TikTok", en: "Story · TikTok" } },
  { id: "youtube", width: 1280, height: 720, label: { sr: "YouTube sličica", en: "YouTube thumbnail" } },
  { id: "siroko", width: 1920, height: 1080, label: { sr: "Široko 16:9", en: "Wide 16:9" } },
  { id: "poster", width: 1240, height: 1754, label: { sr: "Poster A4", en: "A4 poster" } },
];

/** Platno po meri fotke: duža stranica najviše 2048 px, nikad manje od 64. */
export const IMAGE_CANVAS_MAX_SIDE = 2048;

export function canvasSizeForImage(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, IMAGE_CANVAS_MAX_SIDE / Math.max(width, height));
  return {
    width: Math.max(SCENE_LIMITS.minSide, Math.round(width * scale)),
    height: Math.max(SCENE_LIMITS.minSide, Math.round(height * scale)),
  };
}

export function emptyScene(width: number, height: number, background: string = CREA_SCENE_COLORS.papir): CreaScene {
  return { version: SCENE_VERSION, width, height, background, nodes: [] };
}

/** Isečak slike koji popunjava okvir bez izobličenja (CSS `object-fit: cover`). */
export function coverCrop(imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number) {
  const imageAspect = imageWidth / imageHeight;
  const boxAspect = boxWidth / boxHeight;
  if (imageAspect > boxAspect) {
    const width = imageHeight * boxAspect;
    return { x: (imageWidth - width) / 2, y: 0, width, height: imageHeight };
  }
  const height = imageWidth / boxAspect;
  return { x: 0, y: (imageHeight - height) / 2, width: imageWidth, height };
}

/** Okvir veličine slike koji staje u `maxWidth × maxHeight` (bez uvećanja preko originala). */
export function containSize(imageWidth: number, imageHeight: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
  return { width: Math.max(1, Math.round(imageWidth * scale)), height: Math.max(1, Math.round(imageHeight * scale)) };
}

export type CollageLayoutId = "dve-uporedo" | "dve-jedna-iznad" | "tri-velika" | "tri-u-redu" | "cetiri" | "sest" | "devet";

/** Mreža kolaža: kolone, redovi i polja `[kolona, red, širina, visina]` u poljima mreže. */
export const COLLAGE_LAYOUTS: ReadonlyArray<{
  id: CollageLayoutId;
  cols: number;
  rows: number;
  cells: ReadonlyArray<readonly [number, number, number, number]>;
  label: LocalizedText;
}> = [
  { id: "dve-uporedo", cols: 2, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 1, 1]], label: { sr: "Dve uporedo", en: "Two side by side" } },
  { id: "dve-jedna-iznad", cols: 1, rows: 2, cells: [[0, 0, 1, 1], [0, 1, 1, 1]], label: { sr: "Dve jedna iznad druge", en: "Two stacked" } },
  {
    id: "tri-velika",
    cols: 2,
    rows: 2,
    cells: [[0, 0, 1, 2], [1, 0, 1, 1], [1, 1, 1, 1]],
    label: { sr: "Jedna velika i dve male", en: "One big, two small" },
  },
  { id: "tri-u-redu", cols: 3, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1]], label: { sr: "Tri u redu", en: "Three in a row" } },
  {
    id: "cetiri",
    cols: 2,
    rows: 2,
    cells: [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1]],
    label: { sr: "Četiri", en: "Four" },
  },
  {
    id: "sest",
    cols: 3,
    rows: 2,
    cells: [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1], [2, 1, 1, 1]],
    label: { sr: "Šest", en: "Six" },
  },
  {
    id: "devet",
    cols: 3,
    rows: 3,
    cells: [
      [0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1],
      [0, 1, 1, 1], [1, 1, 1, 1], [2, 1, 1, 1],
      [0, 2, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1],
    ],
    label: { sr: "Devet", en: "Nine" },
  },
];

export type Box = { x: number; y: number; width: number; height: number };

export function collageCells(layoutId: CollageLayoutId, width: number, height: number, gap: number, margin: number): Box[] {
  const layout = COLLAGE_LAYOUTS.find((entry) => entry.id === layoutId) ?? COLLAGE_LAYOUTS[0]!;
  const cellWidth = (width - 2 * margin - (layout.cols - 1) * gap) / layout.cols;
  const cellHeight = (height - 2 * margin - (layout.rows - 1) * gap) / layout.rows;
  return layout.cells.map(([col, row, spanCols, spanRows]) => ({
    x: margin + col * (cellWidth + gap),
    y: margin + row * (cellHeight + gap),
    width: spanCols * cellWidth + (spanCols - 1) * gap,
    height: spanRows * cellHeight + (spanRows - 1) * gap,
  }));
}

/**
 * Kolaž: polja mreže postaju mesta za slike na DNU scene (tekst i nalepnice
 * ostaju iznad). Prethodni kolaž se zamenjuje; slike se raspoređuju redom, a
 * polje bez slike ostaje prazno mesto koje korisnik popuni kasnije.
 */
export function applyCollage(
  scene: CreaScene,
  layoutId: CollageLayoutId,
  assets: readonly string[],
  options: { gap: number; margin: number; cornerRadius: number },
): CreaScene {
  const kept = scene.nodes.filter((node) => !(node.kind === "image" && node.role === "kolaz"));
  const cells = collageCells(layoutId, scene.width, scene.height, options.gap, options.margin);
  const cellNodes: CreaImageNode[] = cells.map((cell, index) => ({
    id: `kolaz-${index + 1}`,
    kind: "image",
    x: Math.round(cell.x),
    y: Math.round(cell.y),
    width: Math.round(cell.width),
    height: Math.round(cell.height),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: true,
    asset: assets[index] ?? null,
    cornerRadius: options.cornerRadius,
    placeholder: CREA_SCENE_COLORS.krem,
    role: "kolaz",
    slot: { id: `kolaz-${index + 1}`, label: { sr: `Slika ${index + 1}`, en: `Image ${index + 1}` } },
  }));
  const withoutClashes = kept.filter((node) => !cellNodes.some((cell) => cell.id === node.id));
  return { ...scene, nodes: [...cellNodes, ...withoutClashes].slice(0, SCENE_LIMITS.maxNodes) };
}

/** Margina vodenog žiga od ivice: 3 % kraće stranice. */
export function watermarkMargin(scene: Pick<CreaScene, "width" | "height">): number {
  return Math.round(Math.min(scene.width, scene.height) * 0.03);
}

/** Tekstualni vodeni žig u donjem desnom uglu, providan, sa tvrdom senkom da se čita na svakoj fotki. */
export function watermarkText(scene: CreaScene, content: string): CreaTextNode {
  const margin = watermarkMargin(scene);
  const fontSize = Math.max(14, Math.round(Math.min(scene.width, scene.height) * 0.035));
  const width = Math.round(scene.width * 0.6);
  return {
    id: nextNodeId(scene, "zig"),
    kind: "text",
    x: scene.width - margin - width,
    y: scene.height - margin - Math.round(fontSize * 1.2),
    rotation: 0,
    opacity: 0.75,
    visible: true,
    locked: false,
    text: content.slice(0, 80),
    font: "nunito",
    weight: 900,
    fontSize,
    fit: false,
    width,
    lineHeight: 1.2,
    align: "right",
    verticalAlign: "top",
    fill: CREA_SCENE_COLORS.bela,
    uppercase: false,
    shadow: { color: CREA_SCENE_COLORS.mastilo, x: Math.max(1, Math.round(fontSize / 12)), y: Math.max(1, Math.round(fontSize / 12)) },
    role: "watermark",
  };
}

/** Logo kao vodeni žig: 18 % širine scene, donji desni ugao. */
export function watermarkImage(scene: CreaScene, asset: string, imageWidth: number, imageHeight: number): CreaImageNode {
  const margin = watermarkMargin(scene);
  const size = containSize(imageWidth, imageHeight, scene.width * 0.18, scene.height * 0.18);
  return {
    id: nextNodeId(scene, "zig"),
    kind: "image",
    x: scene.width - margin - size.width,
    y: scene.height - margin - size.height,
    width: size.width,
    height: size.height,
    rotation: 0,
    opacity: 0.8,
    visible: true,
    locked: false,
    asset,
    cornerRadius: 0,
    placeholder: CREA_SCENE_COLORS.krem,
    role: "watermark",
  };
}

export const EXPORT_FORMATS = {
  png: { type: "image/png", extension: "png", label: "PNG" },
  jpg: { type: "image/jpeg", extension: "jpg", label: "JPG" },
  webp: { type: "image/webp", extension: "webp", label: "WebP" },
} as const;
export type ExportFormat = keyof typeof EXPORT_FORMATS;

/** Telefon: najviše ~8 MP po izvozu (iOS Safari ruši veća platna i štedi memoriju). */
export const MOBILE_EXPORT_MAX_PIXELS = 8_388_608;

/**
 * Tačna veličina izvoza: scena × izabrana razmera, ali u granici platna za
 * uređaj (16,7 MP na računaru, ~8 MP na telefonu). Odnos stranica se čuva.
 */
export function exportPlan(scene: Pick<CreaScene, "width" | "height">, scale: 1 | 2, mobile: boolean) {
  const maxPixels = mobile ? MOBILE_EXPORT_MAX_PIXELS : CANVAS_MAX_PIXELS;
  const width = scene.width * scale;
  const height = scene.height * scale;
  if (width * height <= maxPixels) return { width, height, scale: scale as number, limited: false };
  const factor = Math.sqrt(maxPixels / (width * height));
  const outWidth = Math.max(1, Math.floor(width * factor));
  return { width: outWidth, height: Math.max(1, Math.floor(height * factor)), scale: outWidth / scene.width, limited: true };
}

export function exportFileName(base: string, format: ExportFormat, width: number, height: number): string {
  const clean = base.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "slika";
  return `crea-${clean}-${width}x${height}.${EXPORT_FORMATS[format].extension}`;
}

// ── Prikaz ──────────────────────────────────────────────────────────────────

const SHAPE_LABELS: Record<CreaShapeKind, LocalizedText> = {
  rect: { sr: "Pravougaonik", en: "Rectangle" },
  ellipse: { sr: "Krug", en: "Circle" },
  star: { sr: "Zvezda", en: "Star" },
  arrow: { sr: "Strelica", en: "Arrow" },
};

/** Ime sloja u spisku slojeva. */
export function nodeLabel(node: CreaSceneNode, locale: Locale): string {
  switch (node.kind) {
    case "text": {
      const content = node.text.replace(/\s+/g, " ").trim();
      const prefix = node.role === "watermark" ? (locale === "sr" ? "Vodeni žig: " : "Watermark: ") : "";
      if (!content) return prefix + (locale === "sr" ? "Prazan tekst" : "Empty text");
      return prefix + (content.length > 28 ? `${content.slice(0, 27)}…` : content);
    }
    case "image":
      if (node.role === "watermark") return locale === "sr" ? "Vodeni žig (logo)" : "Watermark (logo)";
      return node.slot ? node.slot.label[locale] : locale === "sr" ? "Slika" : "Image";
    case "sticker":
      return stickerById(node.sticker)?.label[locale] ?? node.sticker;
    case "shape":
      return SHAPE_LABELS[node.shape][locale];
  }
}

/** Slova koja se crtaju (uz `uppercase` i za srpski: „đ" → „Đ" radi i u `toLocaleUpperCase`). */
export function displayText(node: Pick<CreaTextNode, "text" | "uppercase">): string {
  return node.uppercase ? node.text.toLocaleUpperCase("sr") : node.text;
}
