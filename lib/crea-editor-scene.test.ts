/**
 * Scena editora (S28, K10): JSON tamo-nazad, odbijanje lošeg ulaza, slojevi,
 * kolaž, vodeni žig i tačna veličina izvoza (i granica za telefon).
 */
import { describe, expect, test } from "vitest";

import {
  addNode,
  applyCollage,
  canvasSizeForImage,
  collageCells,
  COLLAGE_LAYOUTS,
  containSize,
  coverCrop,
  CREA_SCENE_COLORS,
  displayText,
  duplicateNode,
  EDITOR_CANVAS_PRESETS,
  emptyScene,
  exportFileName,
  exportPlan,
  findNode,
  MOBILE_EXPORT_MAX_PIXELS,
  moveNode,
  nextNodeId,
  nodeLabel,
  parseScene,
  removeNode,
  SCENE_LIMITS,
  serializeScene,
  updateNode,
  watermarkImage,
  watermarkText,
  type CreaScene,
  type CreaTextNode,
} from "./crea-editor-scene";
import { CANVAS_MAX_PIXELS } from "./crea-image-format";

function textNode(id: string, patch: Partial<CreaTextNode> = {}): CreaTextNode {
  return {
    id,
    kind: "text",
    x: 10,
    y: 20,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    text: "Ćao, Đorđe! Ћао, Ђорђе!",
    font: "nunito",
    weight: 900,
    fontSize: 64,
    fit: false,
    width: 500,
    lineHeight: 1.2,
    align: "left",
    verticalAlign: "top",
    fill: CREA_SCENE_COLORS.mastilo,
    uppercase: false,
    ...patch,
  };
}

function sample(): CreaScene {
  let scene = emptyScene(1080, 1350);
  scene = addNode(scene, {
    id: "slika-1",
    kind: "image",
    x: 0,
    y: 0,
    width: 1080,
    height: 800,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    asset: "a1",
    cornerRadius: 16,
    placeholder: CREA_SCENE_COLORS.krem,
  });
  scene = addNode(scene, textNode("tekst-1", { stroke: { color: "#FFFFFF", width: 6 }, shadow: { color: "#0e3158", x: 8, y: 8 } }));
  scene = addNode(scene, {
    id: "nalepnica-1",
    kind: "sticker",
    sticker: "srce",
    x: 900,
    y: 100,
    width: 120,
    height: 120,
    rotation: 12,
    opacity: 1,
    visible: true,
    locked: false,
  });
  scene = addNode(scene, {
    id: "oblik-1",
    kind: "shape",
    shape: "star",
    x: 100,
    y: 1000,
    width: 200,
    height: 200,
    rotation: 0,
    opacity: 0.8,
    visible: false,
    locked: true,
    fill: CREA_SCENE_COLORS.zuta,
    cornerRadius: 0,
  });
  return scene;
}

describe("JSON scene", () => {
  test("tamo-nazad daje istu scenu (boje se svode na mala slova)", () => {
    const scene = sample();
    const parsed = parseScene(JSON.parse(serializeScene(scene)));
    expect(parsed).not.toBeNull();
    expect(serializeScene(parsed!)).toBe(serializeScene(parseScene(parsed)!));
    expect(parsed!.nodes.map((node) => node.id)).toEqual(["slika-1", "tekst-1", "nalepnica-1", "oblik-1"]);
    const text = parsed!.nodes[1] as CreaTextNode;
    expect(text.text).toBe("Ćao, Đorđe! Ћао, Ђорђе!");
    expect(text.stroke).toEqual({ color: "#ffffff", width: 6 });
    expect(parsed!.nodes[3]).toMatchObject({ visible: false, locked: true, opacity: 0.8 });
  });

  test("odbija pogrešnu verziju, vrstu, boju, font, nalepnicu, dupli id i previše čvorova", () => {
    const good = JSON.parse(serializeScene(sample()));
    expect(parseScene({ ...good, version: 2 })).toBeNull();
    expect(parseScene(null)).toBeNull();
    expect(parseScene("scena")).toBeNull();
    const withNode = (patch: Record<string, unknown>, index = 1) => {
      const copy = structuredClone(good);
      copy.nodes[index] = { ...copy.nodes[index], ...patch };
      return parseScene(copy);
    };
    expect(withNode({ kind: "video" })).toBeNull();
    expect(withNode({ fill: "red" })).toBeNull();
    expect(withNode({ fill: "#12345" })).toBeNull();
    expect(withNode({ font: "Comic Sans" })).toBeNull();
    expect(withNode({ sticker: "nepostojeca" }, 2)).toBeNull();
    expect(withNode({ id: "slika-1" })).toBeNull();
    expect(withNode({ id: "<script>" })).toBeNull();
    expect(withNode({ x: Number.NaN })).toBeNull();
    expect(withNode({ asset: "../../etc" }, 0)).toBeNull();
    const many = { ...good, nodes: Array.from({ length: SCENE_LIMITS.maxNodes + 1 }, (_, i) => ({ ...good.nodes[1], id: `t-${i}` })) };
    expect(parseScene(many)).toBeNull();
  });

  test("brojevi se svode u granice, a nepoznata debljina na postojeću", () => {
    const raw = JSON.parse(serializeScene(sample()));
    raw.width = 99_999;
    raw.nodes[1].opacity = 7;
    raw.nodes[1].weight = 300;
    raw.nodes[1].text = "x".repeat(SCENE_LIMITS.maxText + 50);
    raw.nodes[1].font = "rukopis";
    const parsed = parseScene(raw)!;
    expect(parsed.width).toBe(SCENE_LIMITS.maxSide);
    const text = parsed.nodes[1] as CreaTextNode;
    expect(text.opacity).toBe(1);
    expect(text.weight).toBe(400);
    expect(text.text.length).toBe(SCENE_LIMITS.maxText);
  });

  test("polje šablona seče tekst na svoju dužinu; `fit` bez visine se gasi", () => {
    const scene = addNode(
      emptyScene(500, 500),
      textNode("naslov", { text: "Predugačak naslov", fit: true, field: { id: "naslov", label: { sr: "Naslov", en: "Title" }, maxLength: 5, multiline: false } }),
    );
    const parsed = parseScene(JSON.parse(serializeScene(scene)))!;
    const text = parsed.nodes[0] as CreaTextNode;
    expect(text.text).toBe("Predu");
    expect(text.fit).toBe(false);
  });
});

describe("slojevi i izmene", () => {
  test("nextNodeId je deterministički", () => {
    const scene = sample();
    expect(nextNodeId(scene, "tekst")).toBe("tekst-2");
    expect(nextNodeId(scene, "zig")).toBe("zig-1");
  });

  test("pomeranje sloja gore, dole, na vrh i na dno", () => {
    const scene = sample();
    const order = (s: CreaScene) => s.nodes.map((node) => node.id);
    expect(order(moveNode(scene, "slika-1", "up"))).toEqual(["tekst-1", "slika-1", "nalepnica-1", "oblik-1"]);
    expect(order(moveNode(scene, "slika-1", "top"))).toEqual(["tekst-1", "nalepnica-1", "oblik-1", "slika-1"]);
    expect(order(moveNode(scene, "oblik-1", "bottom"))).toEqual(["oblik-1", "slika-1", "tekst-1", "nalepnica-1"]);
    expect(moveNode(scene, "slika-1", "down")).toBe(scene);
    expect(moveNode(scene, "nema", "up")).toBe(scene);
  });

  test("izmena prolazi proveru: loša boja se ne upisuje, ostalo da", () => {
    const scene = sample();
    expect(updateNode(scene, "tekst-1", { fill: "plavo" })).toBe(scene);
    const next = updateNode(scene, "tekst-1", { text: "Šta ima?", fontSize: 5000 });
    const text = findNode(next, "tekst-1") as CreaTextNode;
    expect(text.text).toBe("Šta ima?");
    expect(text.fontSize).toBe(1000);
    expect(next.nodes[0]).toBe(scene.nodes[0]);
    // Uklanjanje obruba: `undefined` briše polje.
    expect((findNode(updateNode(scene, "tekst-1", { stroke: undefined }), "tekst-1") as CreaTextNode).stroke).toBeUndefined();
  });

  test("brisanje i kopija (kopija nije polje šablona ni deo kolaža)", () => {
    const scene = sample();
    expect(removeNode(scene, "tekst-1").nodes.length).toBe(3);
    expect(removeNode(scene, "nema")).toBe(scene);
    const copy = duplicateNode(addNode(scene, textNode("polje-1", { field: { id: "f", label: { sr: "a", en: "a" }, maxLength: 10, multiline: false } })), "polje-1");
    const added = copy.nodes[copy.nodes.length - 1] as CreaTextNode;
    expect(added.id).toBe("polje-2");
    expect(added.field).toBeUndefined();
    expect(added.x).toBeGreaterThan(10);
  });

  test("ne dodaje dupli id ni preko granice", () => {
    const scene = sample();
    expect(addNode(scene, textNode("tekst-1"))).toBe(scene);
  });

  test("imena slojeva", () => {
    const scene = sample();
    expect(nodeLabel(scene.nodes[2]!, "sr")).toBe("Srce");
    expect(nodeLabel(scene.nodes[3]!, "en")).toBe("Star");
    expect(nodeLabel(textNode("t", { text: "   " }), "sr")).toBe("Prazan tekst");
    expect(nodeLabel(textNode("t", { text: "a".repeat(40) }), "sr").endsWith("…")).toBe(true);
  });

  test("velika slova na srpskom", () => {
    expect(displayText({ text: "čačak đurđevdan ћирилица", uppercase: true })).toBe("ČAČAK ĐURĐEVDAN ЋИРИЛИЦА");
    expect(displayText({ text: "Isto", uppercase: false })).toBe("Isto");
  });
});

describe("platno, kolaž i vodeni žig", () => {
  test("preseti platna i platno po meri fotke", () => {
    expect(EDITOR_CANVAS_PRESETS.find((preset) => preset.id === "prica")).toMatchObject({ width: 1080, height: 1920 });
    expect(EDITOR_CANVAS_PRESETS.find((preset) => preset.id === "youtube")).toMatchObject({ width: 1280, height: 720 });
    expect(canvasSizeForImage(4000, 3000)).toEqual({ width: 2048, height: 1536 });
    expect(canvasSizeForImage(800, 600)).toEqual({ width: 800, height: 600 });
    expect(canvasSizeForImage(5000, 20).height).toBe(SCENE_LIMITS.minSide);
  });

  test("cover isečak popunjava okvir istog odnosa i ostaje u slici", () => {
    const wide = coverCrop(4000, 2000, 1000, 1000);
    expect(wide).toEqual({ x: 1000, y: 0, width: 2000, height: 2000 });
    const tall = coverCrop(1000, 3000, 1600, 900);
    expect(tall.width / tall.height).toBeCloseTo(1600 / 900, 5);
    expect(tall.y).toBeGreaterThan(0);
    expect(tall.y + tall.height).toBeLessThanOrEqual(3000);
    expect(containSize(400, 200, 100, 100)).toEqual({ width: 100, height: 50 });
  });

  test("polja kolaža su u platnu, ne preklapaju se i dele razmak", () => {
    for (const layout of COLLAGE_LAYOUTS) {
      const cells = collageCells(layout.id, 1080, 1350, 20, 30);
      expect(cells.length, layout.id).toBe(layout.cells.length);
      for (const cell of cells) {
        expect(cell.x).toBeGreaterThanOrEqual(30 - 0.001);
        expect(cell.y).toBeGreaterThanOrEqual(30 - 0.001);
        expect(cell.x + cell.width).toBeLessThanOrEqual(1050 + 0.001);
        expect(cell.y + cell.height).toBeLessThanOrEqual(1320 + 0.001);
      }
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i]!;
          const b = cells[j]!;
          const apart = a.x + a.width + 19.99 <= b.x || b.x + b.width + 19.99 <= a.x || a.y + a.height + 19.99 <= b.y || b.y + b.height + 19.99 <= a.y;
          expect(apart, `${layout.id} ${i}/${j}`).toBe(true);
        }
      }
    }
    const big = collageCells("tri-velika", 1000, 1000, 0, 0);
    expect(big[0]).toEqual({ x: 0, y: 0, width: 500, height: 1000 });
  });

  test("kolaž ide na dno, popunjava redom i menja prethodni kolaž", () => {
    const base = addNode(emptyScene(1080, 1080), textNode("tekst-1"));
    const first = applyCollage(base, "cetiri", ["a1", "a2", "a3"], { gap: 16, margin: 16, cornerRadius: 8 });
    expect(first.nodes.map((node) => node.id)).toEqual(["kolaz-1", "kolaz-2", "kolaz-3", "kolaz-4", "tekst-1"]);
    expect(first.nodes.slice(0, 4).map((node) => (node.kind === "image" ? node.asset : "?"))).toEqual(["a1", "a2", "a3", null]);
    const second = applyCollage(first, "dve-uporedo", ["b1"], { gap: 0, margin: 0, cornerRadius: 0 });
    expect(second.nodes.map((node) => node.id)).toEqual(["kolaz-1", "kolaz-2", "tekst-1"]);
    expect(parseScene(JSON.parse(serializeScene(second)))).not.toBeNull();
  });

  test("vodeni žig je u donjem desnom uglu, providan i unutar platna", () => {
    const scene = emptyScene(1080, 1350);
    const text = watermarkText(scene, "@moj.nalog");
    expect(text.role).toBe("watermark");
    expect(text.opacity).toBeLessThan(1);
    expect(text.x + text.width).toBe(1080 - 32);
    expect(text.y).toBeGreaterThan(1200);
    expect(text.y + text.fontSize * text.lineHeight).toBeLessThanOrEqual(1350);
    const logo = watermarkImage(scene, "logo", 600, 300);
    expect(logo.width).toBeLessThanOrEqual(1080 * 0.18 + 1);
    expect(logo.x + logo.width).toBe(1080 - 32);
    expect(logo.y + logo.height).toBe(1350 - 32);
    expect(logo.width / logo.height).toBeCloseTo(2, 1);
  });
});

describe("izvoz", () => {
  test("1× je tačno veličina scene, 2× dupla", () => {
    expect(exportPlan({ width: 1080, height: 1350 }, 1, false)).toEqual({ width: 1080, height: 1350, scale: 1, limited: false });
    expect(exportPlan({ width: 1080, height: 1350 }, 2, false)).toEqual({ width: 2160, height: 2700, scale: 2, limited: false });
  });

  test("telefon ima nižu granicu; odnos stranica ostaje", () => {
    const plan = exportPlan({ width: 1240, height: 1754 }, 2, true);
    expect(plan.limited).toBe(true);
    expect(plan.width * plan.height).toBeLessThanOrEqual(MOBILE_EXPORT_MAX_PIXELS);
    expect(plan.width / plan.height).toBeCloseTo(1240 / 1754, 2);
    const desktop = exportPlan({ width: 4096, height: 4096 }, 2, false);
    expect(desktop.width * desktop.height).toBeLessThanOrEqual(CANVAS_MAX_PIXELS);
    // Svaki preset na 1× staje i na telefonu.
    for (const preset of EDITOR_CANVAS_PRESETS) expect(exportPlan(preset, 1, true).limited, preset.id).toBe(false);
  });

  test("ime fajla", () => {
    expect(exportFileName("Pozivnica za slavu!", "jpg", 1080, 1350)).toBe("crea-pozivnica-za-slavu-1080x1350.jpg");
    expect(exportFileName("", "webp", 10, 10)).toBe("crea-slika-10x10.webp");
  });
});
