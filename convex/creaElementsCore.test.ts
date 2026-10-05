/**
 * Likovi i elementi (K14): pominjanje (`@maja`), dopunjavanje dok se kuca,
 * mapiranje elementa u ulaze modela (slika i video) i opis za model.
 */

import { describe, expect, test } from "vitest";

import {
  canSwapWith,
  CHARACTER_SHEET_MARKER,
  cleanElementDescription,
  cleanElementName,
  ELEMENT_DESCRIPTION_MAX,
  ELEMENT_HANDLE_MAX,
  ELEMENT_NAME_MAX,
  ELEMENT_REFS_PER_ELEMENT,
  elementInputs,
  findMentions,
  handleBase,
  insertMention,
  isCharacterSheetPrompt,
  isValidPhotoCheck,
  mentionAtCaret,
  mentionedElements,
  photoCheckAllowsLik,
  promptWithElements,
  referenceModeOf,
  removeMention,
  suggestElements,
  swapPrompt,
  swapRefCount,
  uniqueHandle,
  type ElementKind,
} from "./creaElementsCore";
import { STUDIO_MODELS } from "./providers/catalogModels";
import { parseInputModes, parseInputSpec } from "./studioJobCore";

function element(handle: string, name: string, kind: ElementKind = "lik", images = 1, description?: string) {
  return {
    kind,
    name,
    handle,
    ...(description ? { description } : {}),
    images: Array.from({ length: images }, (_, index) => ({ storageId: `${handle}-${index + 1}`, mime: "image/jpeg", size: 100 })),
  };
}

function model(slug: string) {
  const seed = STUDIO_MODELS.find((entry) => entry.slug === slug);
  if (!seed) throw new Error(slug);
  return {
    inputModes: parseInputModes(JSON.stringify(seed.inputModes)),
    inputSpec: parseInputSpec(JSON.stringify(seed.inputSpec)),
  };
}

const maja = element("maja", "Maja", "lik", 4, "crvena jakna");
const kafana = element("kafana_kod_mike", "Kafana kod Mike", "mesto", 2);
const solja = element("solja", "Šolja", "predmet", 1);
const all = [maja, kafana, solja];

describe("ime i pominjanje", () => {
  test("ime se sređuje, a predugačko ili prazno odbija", () => {
    expect(cleanElementName("  Maja   Petrović ")).toBe("Maja Petrović");
    expect(cleanElementName("   ")).toBeNull();
    expect(cleanElementName("x".repeat(ELEMENT_NAME_MAX + 1))).toBeNull();
    expect(cleanElementDescription(undefined)).toBe("");
    expect(cleanElementDescription("  plava kosa  ")).toBe("plava kosa");
    expect(cleanElementDescription("x".repeat(ELEMENT_DESCRIPTION_MAX + 1))).toBeNull();
  });

  test("pominjanje je latinica bez kvačica, i za ćirilicu", () => {
    expect(handleBase("Đorđe Mišić")).toBe("djordje_misic");
    expect(handleBase("Кафана код Мике")).toBe("kafana_kod_mike");
    expect(handleBase("Ćuko & Žuća!")).toBe("cuko_zuca");
    expect(handleBase("Љиља")).toBe("ljilja");
    expect(handleBase("!!!", "mesto")).toBe("mesto");
    expect(handleBase("a".repeat(60)).length).toBeLessThanOrEqual(ELEMENT_HANDLE_MAX);
  });

  test("jedinstveno pominjanje dobija broj, i ostaje u granici dužine", () => {
    expect(uniqueHandle("maja", new Set())).toBe("maja");
    expect(uniqueHandle("maja", new Set(["maja"]))).toBe("maja2");
    expect(uniqueHandle("maja", new Set(["maja", "maja2"]))).toBe("maja3");
    const long = "a".repeat(ELEMENT_HANDLE_MAX);
    const next = uniqueHandle(long, new Set([long]));
    expect(next.length).toBeLessThanOrEqual(ELEMENT_HANDLE_MAX);
    expect(next.endsWith("2")).toBe(true);
  });

  test("pronalazi samo pominjanja postojećih elemenata; mejl i nepoznato nisu pominjanje", () => {
    const text = "@Maja pije kafu u @kafana_kod_mike, piše na ana@maja.rs i @nepoznat.";
    const found = findMentions(text, all);
    expect(found.map((mention) => mention.element.handle)).toEqual(["maja", "kafana_kod_mike"]);
    expect(text.slice(found[0].start, found[0].end)).toBe("@Maja");
    expect(text.slice(found[1].start, found[1].end)).toBe("@kafana_kod_mike");
    // Otkucano sa kvačicama ili ćirilicom se svodi na pominjanje.
    expect(findMentions("(@Šolja)", all).map((mention) => mention.element.handle)).toEqual(["solja"]);
    expect(mentionedElements("@maja i opet @maja sa @solja", all).map((entry) => entry.handle)).toEqual(["maja", "solja"]);
  });

  test("dopunjavanje: kursor iza @reči, i upis pominjanja sa razmakom", () => {
    expect(mentionAtCaret("Napravi @ma", 11)).toEqual({ query: "ma", start: 8 });
    expect(mentionAtCaret("@", 1)).toEqual({ query: "", start: 0 });
    expect(mentionAtCaret("ana@ma", 6)).toBeNull();
    expect(mentionAtCaret("@maja pije", 10)).toBeNull();

    expect(suggestElements(all, "ka").map((entry) => entry.handle)).toEqual(["kafana_kod_mike"]);
    expect(suggestElements(all, "Šo").map((entry) => entry.handle)).toEqual(["solja"]);
    expect(suggestElements(all, "").length).toBe(3);
    expect(suggestElements(all, "mike").map((entry) => entry.handle)).toEqual(["kafana_kod_mike"]);

    expect(insertMention("Napravi @ma", 8, 11, "maja")).toEqual({ text: "Napravi @maja ", caret: 14 });
    expect(insertMention("@ma pije", 0, 3, "maja")).toEqual({ text: "@maja pije", caret: 5 });
  });

  test("brisanje pominjanja (čip ×) ne ostavlja duple razmake", () => {
    expect(removeMention("@maja i @solja na stolu", solja, all)).toBe("@maja i na stolu");
    expect(removeMention("Slika: @maja.", maja, all)).toBe("Slika:.");
  });
});

describe("mapiranje u ulaze modela", () => {
  test("slika ide u `image_multi`, video u `reference`, model bez referenci se odbija", () => {
    expect(referenceModeOf(model("nano-banana-2"))).toEqual({ inputMode: "image_multi", max: 10 });
    expect(referenceModeOf(model("seedance-20"))).toEqual({ inputMode: "reference", max: 9 });
    expect(referenceModeOf(model("veo-31-fast"))).toEqual({ inputMode: "reference", max: 3 });
    expect(referenceModeOf(model("z-image-turbo"))).toBeNull();
    expect(elementInputs([maja], model("z-image-turbo"), { currentMode: "text", existingImages: 0 })).toEqual({
      ok: false,
      reason: "BEZ_REFERENCI",
      max: 0,
    });
  });

  test("iz „samo opis\" prelazi u režim sa referencama; slike elementa stoje jedna do druge", () => {
    const mapping = elementInputs([maja, kafana], model("nano-banana-2"), { currentMode: "text", existingImages: 0 });
    if (!mapping.ok) throw new Error(mapping.reason);
    expect(mapping.inputMode).toBe("image_multi");
    expect(mapping.slot).toBe("image");
    // Maja 3 slike (granica po elementu), kafana 2: ukupno 5 od 10 mesta.
    expect(mapping.images.map((image) => image.storageId)).toEqual([
      "maja-1",
      "maja-2",
      "maja-3",
      "kafana_kod_mike-1",
      "kafana_kod_mike-2",
    ]);
    expect(mapping.refs.map((ref) => ref.positions)).toEqual([[1, 2, 3], [4, 5]]);
    expect(Math.max(...mapping.refs.map((ref) => ref.images.length))).toBeLessThanOrEqual(ELEMENT_REFS_PER_ELEMENT);
  });

  test("postojeće slike (fotka koja se menja) ostaju prve; malo mesta = po jedna slika svakom", () => {
    const mapping = elementInputs([maja, kafana, solja], model("veo-31-fast"), { currentMode: "reference", existingImages: 0 });
    if (!mapping.ok) throw new Error(mapping.reason);
    expect(mapping.images.map((image) => image.storageId)).toEqual(["maja-1", "kafana_kod_mike-1", "solja-1"]);

    const withPhoto = elementInputs([maja], model("nano-banana-2"), { currentMode: "image_multi", existingImages: 8 });
    if (!withPhoto.ok) throw new Error(withPhoto.reason);
    expect(withPhoto.refs[0].positions).toEqual([9, 10]);
  });

  test("previše elemenata za slot i režim sa kadrovima se odbijaju sa razlogom", () => {
    expect(
      elementInputs([maja, kafana, solja], model("veo-31-fast"), { currentMode: "reference", existingImages: 1 }),
    ).toEqual({ ok: false, reason: "PREVISE_ELEMENATA", max: 2 });
    expect(elementInputs([maja], model("veo-31-fast"), { currentMode: "first_last", existingImages: 0 })).toMatchObject({
      ok: false,
      reason: "DRUGI_REZIM",
    });
  });

  test("svaki model iz kataloga sa referencama prima bar jedan element", () => {
    for (const seed of STUDIO_MODELS) {
      const spec = model(seed.slug);
      const reference = referenceModeOf(spec);
      if (!reference) continue;
      const mapping = elementInputs([maja], spec, { currentMode: "text", existingImages: 0 });
      expect(mapping.ok, seed.slug).toBe(true);
      if (mapping.ok) expect(mapping.images.length, seed.slug).toBeLessThanOrEqual(reference.max);
    }
  });

  test("opis za model: @maja postaje ime, a na kraju piše koja slika je ko", () => {
    const mapping = elementInputs([maja, kafana], model("nano-banana-2"), { currentMode: "text", existingImages: 1 });
    if (!mapping.ok) throw new Error(mapping.reason);
    const text = promptWithElements("@maja pije kafu u @kafana_kod_mike", all, mapping.refs);
    expect(text.startsWith("Maja pije kafu u Kafana kod Mike")).toBe(true);
    expect(text).not.toContain("@");
    expect(text).toContain("Images 2-4 show Maja, the character (crvena jakna): keep the same face");
    expect(text).toContain("Images 5-6 show Kafana kod Mike, the place: use this place as the setting.");
    expect(promptWithElements("bez likova", all, [])).toBe("bez likova");
  });
});

describe("zameni lik i provera", () => {
  test("samo Lik sa pristankom", () => {
    expect(canSwapWith({ kind: "lik", consentAt: 5 })).toBe(true);
    expect(canSwapWith({ kind: "lik" })).toBe(false);
    expect(canSwapWith({ kind: "lik", consentAt: null })).toBe(false);
    expect(canSwapWith({ kind: "mesto", consentAt: 5 })).toBe(false);
  });

  test("opis zamene: slika 1 je fotka, ostale lik; broj slika lika po slotu", () => {
    expect(swapRefCount(8, 10)).toBe(ELEMENT_REFS_PER_ELEMENT);
    expect(swapRefCount(1, 10)).toBe(1);
    expect(swapRefCount(4, 2)).toBe(1);
    expect(swapRefCount(4, 1)).toBe(0);
    const text = swapPrompt({ name: "Maja", description: "kratka kosa" }, 3);
    expect(text).toContain("Image 1 is the photo to change. Images 2-4 show Maja (kratka kosa).");
    expect(text).toContain("Keep everything else from image 1 exactly the same");
    expect(swapPrompt({ name: "Luka" }, 1)).toContain("Image 2 shows Luka.");
  });

  test("list iz kreatora se prepoznaje po početku opisa", () => {
    expect(isCharacterSheetPrompt(`${CHARACTER_SHEET_MARKER} of one original character`)).toBe(true);
    expect(isCharacterSheetPrompt("A portrait of a character turnaround sheet")).toBe(false);
  });

  test("Lik od fotki traži prošlu proveru sa jednim licem", () => {
    expect(photoCheckAllowsLik({ faces: 1, faceRatio: 0.3, sharpness: 140, ok: true })).toBe(true);
    expect(photoCheckAllowsLik({ faces: 2, faceRatio: 0.3, sharpness: 140, ok: true })).toBe(false);
    expect(photoCheckAllowsLik({ faces: 1, faceRatio: 0.3, sharpness: 140, ok: false })).toBe(false);
    expect(photoCheckAllowsLik(undefined)).toBe(false);
    expect(isValidPhotoCheck({ faces: 1, faceRatio: 1.5, sharpness: 10, ok: true })).toBe(false);
    expect(isValidPhotoCheck({ faces: 0.5, faceRatio: 0.2, sharpness: 10, ok: true })).toBe(false);
    expect(isValidPhotoCheck({ faces: 1, faceRatio: 0.2, sharpness: Number.NaN, ok: true })).toBe(false);
  });
});
