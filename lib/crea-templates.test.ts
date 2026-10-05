/**
 * Šabloni (S29, K10): najmanje 6, svaki je ispravna JSON scena u brendu sveske,
 * i - najvažnije - izmena teksta NE kvari raspored: i najduži dozvoljeni tekst
 * staje u svoj okvir, a okviri, fontovi i boje ostaju isti.
 */
import { describe, expect, test } from "vitest";

import { CREA_SCENE_COLORS, EDITOR_CANVAS_PRESETS, parseScene, serializeScene, type CreaTextNode } from "./crea-editor-scene";
import { emptySlots, CREA_TEMPLATES, setFieldText, setSlotAsset, templateById, templateFields } from "./crea-templates";
import { layoutText, type MeasureText } from "./crea-text-fit";

/** Grubo merenje: široka slova (W, Š) su šira, kao u pravom fontu. */
const measure: MeasureText = (text, fontSize) =>
  Array.from(text).reduce((sum, char) => sum + (/[WMŠĐŽČĆШЖЩЮ@]/.test(char) ? 0.9 : /[ il.,!'|]/.test(char) ? 0.3 : 0.58), 0) * fontSize;

const BRAND = new Set<string>(Object.values(CREA_SCENE_COLORS));

describe("katalog šablona", () => {
  test("najmanje 6, jedinstveni id-jevi, oba jezika", () => {
    expect(CREA_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(CREA_TEMPLATES.map((template) => template.id)).size).toBe(CREA_TEMPLATES.length);
    for (const template of CREA_TEMPLATES) {
      expect(template.title.sr && template.title.en && template.summary.sr && template.summary.en, template.id).toBeTruthy();
    }
  });

  test("ima mim, YouTube, Instagram objavu i priču, poster, pozivnicu i jelovnik", () => {
    for (const id of ["mim", "youtube", "instagram-objava", "instagram-prica", "poster-dogadjaj", "pozivnica-slava", "pozivnica-rodjendan", "jelovnik"]) {
      expect(templateById(id), id).toBeDefined();
    }
    expect(templateById("nema")).toBeUndefined();
  });

  test("veličine odgovaraju mrežama (YouTube 1280 × 720, priča 1080 × 1920, A4 za poster i jelovnik)", () => {
    const size = (id: string) => {
      const scene = templateById(id)!.scene;
      return { width: scene.width, height: scene.height };
    };
    const preset = (id: string) => {
      const found = EDITOR_CANVAS_PRESETS.find((entry) => entry.id === id)!;
      return { width: found.width, height: found.height };
    };
    expect(size("youtube")).toEqual(preset("youtube"));
    expect(size("instagram-prica")).toEqual(preset("prica"));
    expect(size("instagram-objava")).toEqual(preset("objava"));
    expect(size("poster-dogadjaj")).toEqual(preset("poster"));
    expect(size("jelovnik")).toEqual(preset("poster"));
    expect(size("mim")).toEqual(preset("kvadrat"));
  });

  test("svaka scena prolazi `parseScene` bez izmene (JSON tamo-nazad)", () => {
    for (const template of CREA_TEMPLATES) {
      const parsed = parseScene(JSON.parse(serializeScene(template.scene)));
      expect(parsed, template.id).not.toBeNull();
      expect(parsed, template.id).toEqual(template.scene);
    }
  });

  test("brend sveske: samo boje palete, samo naši fontovi, tvrde senke, sve u platnu", () => {
    for (const { id, scene } of CREA_TEMPLATES) {
      expect(BRAND.has(scene.background), id).toBe(true);
      for (const node of scene.nodes) {
        const where = `${id}/${node.id}`;
        if ("fill" in node && node.fill) expect(BRAND.has(node.fill), where).toBe(true);
        if ("stroke" in node && node.stroke) expect(BRAND.has(node.stroke.color), where).toBe(true);
        if ("shadow" in node && node.shadow) expect(BRAND.has(node.shadow.color), where).toBe(true);
        if (node.kind === "text") expect(["nunito", "rukopis"]).toContain(node.font);
        // Okvir je u platnu (selotejp i nalepnice smeju da vire do 15 % preko ivice).
        const slack = node.kind === "sticker" || node.kind === "shape" ? 0.15 : 0;
        const height = node.kind === "text" ? node.height! : node.height;
        expect(node.x, where).toBeGreaterThanOrEqual(-scene.width * slack);
        expect(node.y, where).toBeGreaterThanOrEqual(-scene.height * slack);
        expect(node.x + node.width, where).toBeLessThanOrEqual(scene.width * (1 + slack));
        expect(node.y + height, where).toBeLessThanOrEqual(scene.height * (1 + slack));
      }
    }
  });

  test("svako polje ima okvir sa `fit`, najmanju veličinu i ograničenu dužinu; polja su jedinstvena", () => {
    for (const { id, scene } of CREA_TEMPLATES) {
      const fields = templateFields(scene);
      expect(fields.filter((field) => field.kind === "text").length, id).toBeGreaterThan(0);
      const fieldIds = fields.map((field) => (field.kind === "text" ? field.field.id : field.slot.id));
      expect(new Set(fieldIds).size, id).toBe(fieldIds.length);
      for (const node of scene.nodes) {
        if (node.kind !== "text" || !node.field) continue;
        expect(node.fit && node.height !== undefined && node.minFontSize !== undefined, `${id}/${node.id}`).toBe(true);
        expect(node.field.maxLength).toBeGreaterThanOrEqual(node.text.length);
      }
    }
  });
});

describe("izmena teksta ne kvari raspored", () => {
  test("primer teksta staje bez smanjivanja ispod polovine i bez reči prelomljenih po slovima", () => {
    for (const { id, scene } of CREA_TEMPLATES) {
      for (const node of scene.nodes) {
        if (node.kind !== "text") continue;
        const layout = layoutText({ text: node.text, width: node.width, height: node.height, fontSize: node.fontSize, minFontSize: node.minFontSize, lineHeight: node.lineHeight, fit: node.fit }, measure);
        expect(layout.truncated, `${id}/${node.id}`).toBe(false);
        expect(layout.brokenWord, `${id}/${node.id}`).toBe(false);
        expect(layout.fontSize, `${id}/${node.id}`).toBeGreaterThanOrEqual(node.fontSize * 0.5);
      }
    }
  });

  test("najduži dozvoljeni tekst u svakom polju ostaje u svom okviru", () => {
    for (const { id, scene } of CREA_TEMPLATES) {
      for (const field of templateFields(scene)) {
        if (field.kind !== "text") continue;
        const longest = field.field.multiline
          ? Array.from({ length: 40 }, (_, i) => `Šđčćž ${i} WWW ћирилица`).join("\n")
          : "Žućkasti Šumadijski Đurđevdanski ".repeat(30);
        const next = setFieldText(scene, field.field.id, longest);
        const node = next.nodes.find((entry) => entry.id === field.nodeId) as CreaTextNode;
        const before = scene.nodes.find((entry) => entry.id === field.nodeId) as CreaTextNode;
        // Isti okvir, font i boja - menja se samo tekst.
        expect({ ...node, text: before.text }, `${id}/${field.field.id}`).toEqual(before);
        expect(node.text.length).toBeLessThanOrEqual(field.field.maxLength);
        const layout = layoutText({ text: node.text, width: node.width, height: node.height, fontSize: node.fontSize, minFontSize: node.minFontSize, lineHeight: node.lineHeight, fit: true }, measure);
        expect(layout.height, `${id}/${field.field.id}`).toBeLessThanOrEqual(node.height! + 0.001);
        for (const line of layout.lines) expect(measure(line, layout.fontSize)).toBeLessThanOrEqual(node.width + 0.001);
        // Ostali čvorovi su netaknuti.
        expect(next.nodes.filter((entry) => entry.id !== field.nodeId)).toEqual(scene.nodes.filter((entry) => entry.id !== field.nodeId));
      }
    }
  });

  test("polje u jednom redu ne prima nove redove", () => {
    const scene = templateById("mim")!.scene;
    const next = setFieldText(scene, "gore", "prvi\nred");
    expect((next.nodes.find((node) => node.id === "gore") as CreaTextNode).text).toBe("prvi red");
    expect(setFieldText(scene, "nepostojece", "x")).toBe(scene);
  });
});

describe("mesta za slike", () => {
  test("slika ide na svoje mesto, prazna mesta se broje", () => {
    const scene = templateById("instagram-objava")!.scene;
    expect(emptySlots(scene).map((slot) => slot.id)).toEqual(["fotka"]);
    const filled = setSlotAsset(scene, "fotka", "a1");
    expect(emptySlots(filled)).toEqual([]);
    expect(templateFields(filled).find((field) => field.kind === "image")).toMatchObject({ asset: "a1" });
    expect(setSlotAsset(filled, "fotka", "a1")).toBe(filled);
    expect(emptySlots(setSlotAsset(filled, "fotka", null)).length).toBe(1);
  });

  test("polja idu odozgo nadole", () => {
    const fields = templateFields(templateById("poster-dogadjaj")!.scene);
    expect(fields.map((field) => (field.kind === "text" ? field.field.id : field.slot.id))).toEqual([
      "najava",
      "naziv",
      "fotka",
      "mesto",
      "datum",
      "napomena",
    ]);
  });
});
