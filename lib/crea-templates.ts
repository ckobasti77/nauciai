import {
  CREA_SCENE_COLORS as C,
  SCENE_VERSION,
  type CreaFontId,
  type CreaImageNode,
  type CreaImageSlot,
  type CreaScene,
  type CreaSceneNode,
  type CreaShadow,
  type CreaShapeNode,
  type CreaStickerNode,
  type CreaStroke,
  type CreaTextField,
  type CreaTextNode,
} from "./crea-editor-scene";
import type { LocalizedText } from "./i18n";

/**
 * Šabloni (S29, K10) kao JSON scene u brendu sveske: papir, mastilo i žuta,
 * Nunito 900 za naslove i rukopis za dopisano, tvrde senke bez zamućenja,
 * selotejp i nalepnice. Korisnik menja samo POLJA (tekst) i MESTA (slike);
 * svaki tekst ima svoj okvir i `fit`, pa duži tekst samo smanji slova, a
 * raspored ostaje isti (`lib/crea-text-fit.ts`).
 *
 * Primer teksta je na srpskom i u engleskom interfejsu - to je sadržaj koji
 * korisnik menja (slava, dinari...), ne natpis interfejsa.
 */

type BoxArgs = { x: number; y: number; w: number; h: number; rotation?: number; opacity?: number };

function common(id: string, box: BoxArgs) {
  return { id, x: box.x, y: box.y, rotation: box.rotation ?? 0, opacity: box.opacity ?? 1, visible: true, locked: true };
}

function field(id: string, sr: string, en: string, maxLength: number, multiline = false): CreaTextField {
  return { id, label: { sr, en }, maxLength, multiline };
}

function text(
  id: string,
  box: BoxArgs,
  content: string,
  style: {
    font?: CreaFontId;
    weight?: number;
    size: number;
    min?: number;
    fill: string;
    align?: CreaTextNode["align"];
    valign?: CreaTextNode["verticalAlign"];
    lineHeight?: number;
    uppercase?: boolean;
    stroke?: CreaStroke;
    shadow?: CreaShadow;
  },
  editable?: CreaTextField,
): CreaTextNode {
  const font = style.font ?? "nunito";
  return {
    ...common(id, box),
    kind: "text",
    text: content,
    font,
    weight: style.weight ?? (font === "rukopis" ? 400 : 900),
    fontSize: style.size,
    minFontSize: style.min ?? Math.max(16, Math.round(style.size * 0.4)),
    fit: true,
    width: box.w,
    height: box.h,
    lineHeight: style.lineHeight ?? 1.1,
    align: style.align ?? "left",
    verticalAlign: style.valign ?? "top",
    fill: style.fill,
    uppercase: style.uppercase ?? false,
    ...(style.stroke ? { stroke: style.stroke } : {}),
    ...(style.shadow ? { shadow: style.shadow } : {}),
    ...(editable ? { field: editable } : {}),
  };
}

function slot(
  id: string,
  box: BoxArgs,
  label: LocalizedText,
  style: { radius?: number; stroke?: CreaStroke; shadow?: CreaShadow; placeholder?: string } = {},
): CreaImageNode {
  const slotDef: CreaImageSlot = { id, label };
  return {
    ...common(id, box),
    kind: "image",
    width: box.w,
    height: box.h,
    asset: null,
    cornerRadius: style.radius ?? 0,
    placeholder: style.placeholder ?? C.krem,
    ...(style.stroke ? { stroke: style.stroke } : {}),
    ...(style.shadow ? { shadow: style.shadow } : {}),
    slot: slotDef,
  };
}

function shape(
  id: string,
  box: BoxArgs,
  style: { shape?: CreaShapeNode["shape"]; fill: string | null; stroke?: CreaStroke; radius?: number; shadow?: CreaShadow },
): CreaShapeNode {
  return {
    ...common(id, box),
    kind: "shape",
    shape: style.shape ?? "rect",
    width: box.w,
    height: box.h,
    fill: style.fill,
    cornerRadius: style.radius ?? 0,
    ...(style.stroke ? { stroke: style.stroke } : {}),
    ...(style.shadow ? { shadow: style.shadow } : {}),
  };
}

function sticker(id: string, name: string, box: BoxArgs): CreaStickerNode {
  return { ...common(id, box), kind: "sticker", sticker: name, width: box.w, height: box.h };
}

function scene(width: number, height: number, background: string, nodes: CreaSceneNode[]): CreaScene {
  return { version: SCENE_VERSION, width, height, background, nodes };
}

const PHOTO: LocalizedText = { sr: "Fotka", en: "Photo" };
const ink = (width: number): CreaStroke => ({ color: C.mastilo, width });
const hard = (offset: number, color: string = C.mastilo): CreaShadow => ({ color, x: offset, y: offset });

export type CreaTemplateId =
  | "mim"
  | "youtube"
  | "instagram-objava"
  | "instagram-prica"
  | "poster-dogadjaj"
  | "pozivnica-slava"
  | "pozivnica-rodjendan"
  | "jelovnik";

export type CreaTemplate = {
  id: CreaTemplateId;
  title: LocalizedText;
  summary: LocalizedText;
  scene: CreaScene;
};

export const CREA_TEMPLATES: readonly CreaTemplate[] = [
  {
    id: "mim",
    title: { sr: "Mim", en: "Meme" },
    summary: { sr: "Fotka i tekst gore i dole.", en: "A photo with text on top and bottom." },
    scene: scene(1080, 1080, C.mastilo, [
      slot("fotka", { x: 0, y: 0, w: 1080, h: 1080 }, PHOTO),
      text(
        "gore",
        { x: 40, y: 30, w: 1000, h: 250 },
        "Kad kažeš da ćeš gledati samo jednu epizodu",
        { size: 104, min: 40, fill: C.bela, align: "center", uppercase: true, lineHeight: 1.05, stroke: ink(10) },
        field("gore", "Tekst gore", "Top text", 90),
      ),
      text(
        "dole",
        { x: 40, y: 800, w: 1000, h: 250 },
        "A sad je tri ujutru",
        { size: 104, min: 40, fill: C.bela, align: "center", valign: "bottom", uppercase: true, lineHeight: 1.05, stroke: ink(10) },
        field("dole", "Tekst dole", "Bottom text", 90),
      ),
    ]),
  },
  {
    id: "youtube",
    title: { sr: "YouTube sličica", en: "YouTube thumbnail" },
    summary: { sr: "Krupan naslov i fotka u okviru, 1280 × 720.", en: "A big title and a framed photo, 1280 × 720." },
    scene: scene(1280, 720, C.zuta, [
      slot("fotka", { x: 670, y: 70, w: 540, h: 560, rotation: 2 }, PHOTO, { radius: 16, stroke: ink(8), shadow: hard(16) }),
      text(
        "najava",
        { x: 60, y: 60, w: 560, h: 80 },
        "Probao sam 7 dana…",
        { font: "rukopis", size: 60, min: 30, fill: C.mastilo },
        field("najava", "Najava", "Teaser", 40),
      ),
      text(
        "naslov",
        { x: 60, y: 150, w: 580, h: 400 },
        "AI za početnike",
        { size: 130, min: 48, fill: C.mastilo, uppercase: true, lineHeight: 1 },
        field("naslov", "Naslov", "Title", 50),
      ),
      shape("oznaka-podloga", { x: 60, y: 590, w: 300, h: 80 }, { fill: C.mastilo, radius: 40 }),
      text(
        "oznaka",
        { x: 80, y: 600, w: 260, h: 60 },
        "Novo!",
        { size: 44, min: 22, fill: C.zuta, align: "center", valign: "middle", uppercase: true },
        field("oznaka", "Oznaka", "Badge", 14),
      ),
      sticker("vatra", "vatra", { x: 1130, y: 20, w: 130, h: 130, rotation: 12 }),
    ]),
  },
  {
    id: "instagram-objava",
    title: { sr: "Instagram objava", en: "Instagram post" },
    summary: { sr: "Fotka u okviru sa selotejpom i tekst ispod, 1080 × 1350.", en: "A taped, framed photo with text below, 1080 × 1350." },
    scene: scene(1080, 1350, C.papir, [
      slot("fotka", { x: 90, y: 110, w: 900, h: 760 }, PHOTO, { radius: 16, stroke: ink(8), shadow: hard(18) }),
      shape("selotejp", { x: 420, y: 72, w: 240, h: 72, rotation: -4, opacity: 0.85 }, { fill: C.zuta }),
      sticker("srce", "srce", { x: 900, y: 820, w: 130, h: 130, rotation: 10 }),
      text(
        "naslov",
        { x: 90, y: 920, w: 820, h: 180 },
        "Nedelja na Adi",
        { size: 92, min: 40, fill: C.mastilo, lineHeight: 1.05 },
        field("naslov", "Naslov", "Title", 60),
      ),
      text(
        "tekst",
        { x: 90, y: 1110, w: 900, h: 130 },
        "Sunce, bicikl i najbolji sendvič u gradu. Ko je bio sa nama?",
        { weight: 700, size: 44, min: 24, fill: C.siva, lineHeight: 1.3 },
        field("tekst", "Tekst", "Text", 160, true),
      ),
      text(
        "nalog",
        { x: 90, y: 1255, w: 900, h: 60 },
        "@tvoj.nalog",
        { font: "rukopis", size: 46, min: 24, fill: C.plava },
        field("nalog", "Nalog", "Handle", 30),
      ),
    ]),
  },
  {
    id: "instagram-prica",
    title: { sr: "Instagram priča", en: "Instagram story" },
    summary: { sr: "Fotka preko celog ekrana i kartica sa porukom, 1080 × 1920.", en: "A full-screen photo with a message card, 1080 × 1920." },
    scene: scene(1080, 1920, C.mastilo, [
      slot("fotka", { x: 0, y: 0, w: 1080, h: 1920 }, PHOTO),
      shape("kartica", { x: 60, y: 1240, w: 960, h: 580 }, { fill: C.papir, stroke: ink(6), radius: 32, shadow: hard(16) }),
      sticker("iskre", "iskre", { x: 890, y: 1160, w: 150, h: 150, rotation: 8 }),
      text(
        "najava",
        { x: 110, y: 1285, w: 760, h: 80 },
        "Danas u Crei",
        { font: "rukopis", size: 64, min: 30, fill: C.plava },
        field("najava", "Najava", "Teaser", 40),
      ),
      text(
        "naslov",
        { x: 110, y: 1375, w: 860, h: 250 },
        "Napravio sam svoju prvu sliku",
        { size: 100, min: 44, fill: C.mastilo, lineHeight: 1.05 },
        field("naslov", "Naslov", "Title", 70),
      ),
      shape("dugme-podloga", { x: 110, y: 1655, w: 560, h: 110 }, { fill: C.zuta, stroke: ink(6), radius: 55, shadow: hard(10) }),
      text(
        "dugme",
        { x: 140, y: 1672, w: 500, h: 76 },
        "Pogledaj profil",
        { size: 52, min: 26, fill: C.mastilo, align: "center", valign: "middle" },
        field("dugme", "Dugme", "Button", 24),
      ),
    ]),
  },
  {
    id: "poster-dogadjaj",
    title: { sr: "Poster za događaj", en: "Event poster" },
    summary: { sr: "Naziv, datum, mesto i fotka, A4.", en: "Name, date, place and a photo, A4." },
    scene: scene(1240, 1754, C.papir, [
      shape("traka", { x: 0, y: 0, w: 1240, h: 620 }, { fill: C.zuta }),
      text(
        "najava",
        { x: 90, y: 80, w: 1060, h: 90 },
        "Pozivamo vas na",
        { font: "rukopis", size: 72, min: 32, fill: C.mastilo },
        field("najava", "Najava", "Teaser", 40),
      ),
      text(
        "naziv",
        { x: 90, y: 175, w: 1060, h: 400 },
        "Veče kvizova",
        { size: 180, min: 60, fill: C.mastilo, uppercase: true, lineHeight: 0.95 },
        field("naziv", "Naziv događaja", "Event name", 50),
      ),
      slot("fotka", { x: 90, y: 680, w: 1060, h: 560 }, PHOTO, { radius: 16, stroke: ink(8), shadow: hard(20) }),
      sticker("cioda", "cioda", { x: 1070, y: 630, w: 120, h: 120, rotation: 10 }),
      shape("datum-podloga", { x: 90, y: 1320, w: 500, h: 320 }, { fill: C.mastilo, radius: 16, shadow: hard(14, C.zuta) }),
      text(
        "datum",
        { x: 125, y: 1345, w: 430, h: 270 },
        "Petak 17. 10.\n20:00",
        { size: 88, min: 34, fill: C.papir, valign: "middle", lineHeight: 1.1 },
        field("datum", "Datum i vreme", "Date and time", 40, true),
      ),
      text(
        "mesto",
        { x: 650, y: 1320, w: 500, h: 180 },
        "Kafe Sveska, Dorćol",
        { size: 66, min: 30, fill: C.mastilo, lineHeight: 1.05 },
        field("mesto", "Mesto", "Place", 60),
      ),
      text(
        "napomena",
        { x: 650, y: 1510, w: 500, h: 130 },
        "Ulaz slobodan, povedi društvo!",
        { font: "rukopis", size: 52, min: 26, fill: C.siva },
        field("napomena", "Napomena", "Note", 80),
      ),
    ]),
  },
  {
    id: "pozivnica-slava",
    title: { sr: "Pozivnica za slavu", en: "Slava invitation" },
    summary: { sr: "Slava, datum, domaćini i adresa.", en: "Patron saint day, date, hosts and address." },
    scene: scene(1080, 1350, C.krem, [
      shape("okvir", { x: 50, y: 50, w: 980, h: 1250 }, { fill: null, stroke: ink(6), radius: 24 }),
      shape("okvir-unutra", { x: 76, y: 76, w: 928, h: 1198 }, { fill: null, stroke: { color: C.zuta, width: 6 }, radius: 16 }),
      sticker("hleb", "hleb", { x: 120, y: 120, w: 140, h: 140, rotation: -10 }),
      sticker("svica", "svica", { x: 450, y: 110, w: 180, h: 180 }),
      sticker("vino", "vino", { x: 820, y: 120, w: 140, h: 140, rotation: 10 }),
      text(
        "poziv",
        { x: 110, y: 320, w: 860, h: 80 },
        "Pozivamo vas na slavu",
        { font: "rukopis", size: 64, min: 30, fill: C.plava, align: "center" },
        field("poziv", "Poziv", "Invitation line", 40),
      ),
      text(
        "slava",
        { x: 110, y: 410, w: 860, h: 220 },
        "Sveti Nikola",
        { size: 124, min: 50, fill: C.mastilo, align: "center", valign: "middle", lineHeight: 1 },
        field("slava", "Slava", "Patron saint", 40),
      ),
      shape("crta", { x: 390, y: 655, w: 300, h: 10 }, { fill: C.zuta, radius: 5 }),
      text(
        "datum",
        { x: 110, y: 700, w: 860, h: 300 },
        "Nedelja, 19. decembar\nod 13 časova",
        { weight: 700, size: 58, min: 28, fill: C.mastilo, align: "center", valign: "middle", lineHeight: 1.3 },
        field("datum", "Datum i vreme", "Date and time", 80, true),
      ),
      text(
        "domacini",
        { x: 110, y: 1020, w: 860, h: 110 },
        "Porodica Petrović",
        { font: "rukopis", size: 64, min: 30, fill: C.plava, align: "center", valign: "middle" },
        field("domacini", "Domaćini", "Hosts", 40),
      ),
      text(
        "adresa",
        { x: 110, y: 1140, w: 860, h: 100 },
        "Njegoševa 12, Kragujevac",
        { weight: 700, size: 42, min: 22, fill: C.siva, align: "center", valign: "middle" },
        field("adresa", "Adresa", "Address", 60),
      ),
    ]),
  },
  {
    id: "pozivnica-rodjendan",
    title: { sr: "Pozivnica za rođendan", en: "Birthday invitation" },
    summary: { sr: "Ime slavljenika, fotka, kada i gde.", en: "Who is celebrating, a photo, when and where." },
    scene: scene(1080, 1350, C.zuta, [
      shape("kartica", { x: 70, y: 70, w: 940, h: 1210 }, { fill: C.papir, stroke: ink(6), radius: 32, shadow: hard(18) }),
      slot("fotka", { x: 340, y: 130, w: 400, h: 400 }, { sr: "Fotka slavljenika", en: "Photo of the birthday person" }, { radius: 200, stroke: ink(6) }),
      sticker("balon", "balon", { x: 130, y: 110, w: 170, h: 170, rotation: -12 }),
      sticker("konfete", "konfete", { x: 790, y: 120, w: 170, h: 170, rotation: 8 }),
      text(
        "poziv",
        { x: 120, y: 565, w: 840, h: 85 },
        "Dođi na rođendan!",
        { font: "rukopis", size: 66, min: 30, fill: C.plava, align: "center" },
        field("poziv", "Poziv", "Invitation line", 40),
      ),
      text(
        "ime",
        { x: 120, y: 655, w: 840, h: 200 },
        "Mila puni 7",
        { size: 132, min: 50, fill: C.mastilo, align: "center", valign: "middle", lineHeight: 1 },
        field("ime", "Ime i godine", "Name and age", 40),
      ),
      text(
        "detalji",
        { x: 120, y: 875, w: 840, h: 210 },
        "Subota, 25. oktobar u 17h\nIgraonica Zvrk, Novi Sad",
        { weight: 700, size: 54, min: 26, fill: C.mastilo, align: "center", valign: "middle", lineHeight: 1.3 },
        field("detalji", "Kada i gde", "When and where", 100, true),
      ),
      text(
        "potvrda",
        { x: 120, y: 1100, w: 660, h: 120 },
        "Javi mami do četvrtka: 064 381 2947",
        { font: "rukopis", size: 48, min: 24, fill: C.siva, align: "center", valign: "middle" },
        field("potvrda", "Potvrda dolaska", "RSVP", 60),
      ),
      sticker("torta", "torta", { x: 800, y: 1080, w: 170, h: 170, rotation: 6 }),
    ]),
  },
  {
    id: "jelovnik",
    title: { sr: "Jelovnik", en: "Menu" },
    summary: { sr: "Za kafić ili lokal: stavke sa cenama, A4.", en: "For a café or shop: items with prices, A4." },
    scene: scene(1240, 1754, C.papir, [
      shape("margina", { x: 150, y: 0, w: 4, h: 1754, opacity: 0.5 }, { fill: C.crvena }),
      sticker("kafa", "kafa", { x: 1040, y: 80, w: 150, h: 150, rotation: 8 }),
      text(
        "naziv",
        { x: 200, y: 90, w: 820, h: 200 },
        "Kafe Sveska",
        { size: 140, min: 56, fill: C.mastilo, lineHeight: 1 },
        field("naziv", "Naziv lokala", "Place name", 40),
      ),
      text(
        "podnaslov",
        { x: 200, y: 295, w: 950, h: 80 },
        "Jelovnik",
        { font: "rukopis", size: 66, min: 30, fill: C.plava },
        field("podnaslov", "Podnaslov", "Subtitle", 40),
      ),
      shape("podvlaka", { x: 200, y: 385, w: 300, h: 12 }, { fill: C.zuta, radius: 6 }),
      text(
        "stavke",
        { x: 200, y: 440, w: 950, h: 880 },
        "Espreso — 180 din\nKapućino — 240 din\nDomaća limunada — 290 din\nPalačinke sa eurokremom — 350 din\nTost sa šunkom i sirom — 390 din\nČaj od nane — 160 din",
        { weight: 700, size: 60, min: 28, fill: C.mastilo, lineHeight: 1.6 },
        field("stavke", "Stavke (jedna po redu)", "Items (one per line)", 600, true),
      ),
      slot("fotka", { x: 200, y: 1380, w: 560, h: 300 }, PHOTO, { radius: 16, stroke: ink(6), shadow: hard(14) }),
      text(
        "napomena",
        { x: 800, y: 1380, w: 350, h: 300 },
        "Radimo svaki dan od 8 do 22h",
        { font: "rukopis", size: 54, min: 26, fill: C.siva, valign: "middle", lineHeight: 1.2 },
        field("napomena", "Napomena", "Note", 80),
      ),
    ]),
  },
];

export function templateById(id: string | null | undefined): CreaTemplate | undefined {
  return id ? CREA_TEMPLATES.find((template) => template.id === id) : undefined;
}

export type TemplateField =
  | { kind: "text"; nodeId: string; field: CreaTextField; value: string }
  | { kind: "image"; nodeId: string; slot: CreaImageSlot; asset: string | null };

/** Polja koja korisnik popunjava, odozgo nadole (kako se čitaju na slici). */
export function templateFields(scene: CreaScene): TemplateField[] {
  const fields: Array<{ order: number; field: TemplateField }> = [];
  for (const node of scene.nodes) {
    const order = node.y * 10_000 + node.x;
    if (node.kind === "text" && node.field) {
      fields.push({ order, field: { kind: "text", nodeId: node.id, field: node.field, value: node.text } });
    }
    if (node.kind === "image" && node.slot && node.role !== "kolaz") {
      fields.push({ order, field: { kind: "image", nodeId: node.id, slot: node.slot, asset: node.asset } });
    }
  }
  return fields.sort((a, b) => a.order - b.order).map((entry) => entry.field);
}

/** Nov tekst polja; duži od dozvoljenog se seče. Okvir, font i boja ostaju. */
export function setFieldText(scene: CreaScene, fieldId: string, value: string): CreaScene {
  let changed = false;
  const nodes = scene.nodes.map((node) => {
    if (node.kind !== "text" || node.field?.id !== fieldId) return node;
    const next = value.slice(0, node.field.maxLength);
    const cleaned = node.field.multiline ? next : next.replace(/\s*\n\s*/g, " ");
    if (cleaned === node.text) return node;
    changed = true;
    return { ...node, text: cleaned };
  });
  return changed ? { ...scene, nodes } : scene;
}

/** Slika na mesto (ili `null` da se mesto isprazni). */
export function setSlotAsset(scene: CreaScene, slotId: string, asset: string | null): CreaScene {
  let changed = false;
  const nodes = scene.nodes.map((node) => {
    if (node.kind !== "image" || node.slot?.id !== slotId || node.asset === asset) return node;
    changed = true;
    return { ...node, asset };
  });
  return changed ? { ...scene, nodes } : scene;
}

/** Mesta za sliku koja su još prazna (izvoz je dozvoljen, ali korisnik dobija napomenu). */
export function emptySlots(scene: CreaScene): CreaImageSlot[] {
  return scene.nodes.flatMap((node) => (node.kind === "image" && node.slot && node.asset === null ? [node.slot] : []));
}
