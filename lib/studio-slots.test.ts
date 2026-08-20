/**
 * Testovi za ulazne slotove (`<DropSlot>`, `<DropSlotGrid>`,
 * `<FrameSlotPair>`, `<ReferenceSlots>`, `<ModeSwitcher>`) - sve što one rade
 * sa fajlovima je ovde kao čista funkcija, pa se tvrdi bez renderovanja.
 *
 * Ugovor je iz STUDIO-CATALOG-V4 sekcije 5 i čita se iz `inputSpec`-a redova
 * kataloga, ne iz spiska u kodu.
 */

import { describe, expect, test } from "vitest";

import { studioModelBySlug } from "@/convex/providers/catalogModels";
import {
  framePairFiles,
  measuredExtraCounts,
  MAX_SLOT_BYTES,
  missingInput,
  missingInputMessage,
  modeLabel,
  parseInputModes,
  parseInputSpec,
  pruneFilesForMode,
  singleDropSlot,
  slotKind,
  slotsForMode,
  validateSlotFile,
  type SlotFile,
  type SlotFiles,
} from "@/lib/studio-slots";

function file(overrides: Partial<SlotFile> = {}): SlotFile {
  return {
    storageId: overrides.storageId ?? "kg2abc",
    name: overrides.name ?? "kadar.png",
    mime: overrides.mime ?? "image/png",
    size: overrides.size ?? 1024,
    url: overrides.url ?? null,
  };
}

/** `inputSpec` reda kataloga, onako kako stiže iz baze - kao JSON string. */
function specOf(slug: string) {
  const seed = studioModelBySlug(slug);
  if (!seed) throw new Error(`${slug} nije u katalogu`);

  return parseInputSpec(JSON.stringify(seed.inputSpec));
}

describe("čitanje `inputSpec`-a", () => {
  test("slotovi režima dolaze iz reda kataloga", () => {
    const spec = specOf("kling-omni");
    expect(slotsForMode(spec, "reference")).toEqual([
      { slot: "image", max: 9, accept: ["image/png", "image/jpeg", "image/webp"] },
      { slot: "video", max: 3, accept: ["video/mp4", "video/quicktime", "video/webm"] },
    ]);
    expect(slotsForMode(spec, "text")).toEqual([]);
  });

  test("neispravan JSON ne ruši formu nego daje prazan spisak", () => {
    expect(parseInputSpec("{ nije json")).toEqual({});
    expect(parseInputModes("[1, \"text\", null]")).toEqual(["text"]);
  });

  test("vrsta slota se čita iz MIME liste, ne iz imena", () => {
    expect(slotKind(["image/png"])).toBe("image");
    expect(slotKind(["video/mp4"])).toBe("video");
    expect(slotKind(["audio/mpeg"])).toBe("audio");
    expect(slotKind([])).toBe("file");
  });

  test("režim sa tačno jednim slotom je jedini smislen drop cilj", () => {
    // Jedan slot - cela površina ekrana prima fajl (konvencija iz AGENTS.md).
    expect(singleDropSlot(specOf("kling-3"), "image")?.slot).toBe("image");
    // Dva slota - iz samog fajla se ne vidi u koji ide, pa nema ekranskog cilja.
    expect(singleDropSlot(specOf("kling-lipsync"), "video_audio")).toBeNull();
    expect(singleDropSlot(specOf("kling-3"), "text")).toBeNull();
  });
});

describe("validacija pre uploada", () => {
  const imageSlot = { max: 1, accept: ["image/png", "image/jpeg"] };

  test("pogrešan tip dobija rečenicu sa spiskom onoga što slot prima", () => {
    const message = validateSlotFile({ type: "image/gif", size: 1024 }, imageSlot, "sr");
    expect(message).toContain("PNG, JPEG");
  });

  test("prevelik fajl se odbija pre slanja", () => {
    const size = MAX_SLOT_BYTES.image + 1;
    expect(validateSlotFile({ type: "image/png", size }, imageSlot, "sr")).toContain("10 MB");
    expect(validateSlotFile({ type: "image/png", size }, imageSlot, "en")).toContain("10 MB");
  });

  test("prazan fajl se odbija", () => {
    expect(validateSlotFile({ type: "image/png", size: 0 }, imageSlot, "sr")).toBe("Fajl je prazan.");
  });

  test("ispravan fajl prolazi", () => {
    expect(validateSlotFile({ type: "image/png", size: 2048 }, imageSlot, "sr")).toBeNull();
  });

  test("video ima svoju granicu, veću od slike", () => {
    const videoSlot = { max: 1, accept: ["video/mp4"] };
    expect(MAX_SLOT_BYTES.video).toBeGreaterThan(MAX_SLOT_BYTES.image);
    expect(validateSlotFile({ type: "video/mp4", size: MAX_SLOT_BYTES.image + 1 }, videoSlot, "sr")).toBeNull();
  });
});

describe("promena režima", () => {
  test("slot kojeg u novom režimu nema ispada i prijavljuje se", () => {
    const spec = specOf("kling-omni");
    const files: SlotFiles = {
      image: [file({ storageId: "a" }), file({ storageId: "b" })],
      video: [file({ storageId: "c", mime: "video/mp4", name: "klip.mp4" })],
    };

    // `video` režim prima samo video - slike ispadaju.
    const pruned = pruneFilesForMode(files, spec, "video");
    expect(pruned.removed).toEqual(["image"]);
    expect(Object.keys(pruned.files)).toEqual(["video"]);

    // `text` nema nijedan slot - ispada sve.
    expect(pruneFilesForMode(files, spec, "text").removed).toEqual(["image", "video"]);
  });

  test("slot koji prima manje fajlova se skraćuje, ne prazni", () => {
    const spec = specOf("seedream-5-pro");
    const files: SlotFiles = {
      image: [file({ storageId: "a" }), file({ storageId: "b" }), file({ storageId: "c" })],
    };

    // `layerize` prima jednu sliku, `image_multi` deset.
    const pruned = pruneFilesForMode(files, spec, "layerize");
    expect(pruned.files.image).toHaveLength(1);
    expect(pruned.files.image[0].storageId).toBe("a");
    expect(pruned.removed).toEqual(["image"]);

    expect(pruneFilesForMode(files, spec, "image_multi").removed).toEqual([]);
  });

  test("nazivi režima su ljudski, a nepoznat režim ostaje kakav jeste", () => {
    expect(modeLabel("first_last", "sr")).toBe("Prvi i poslednji kadar");
    expect(modeLabel("first_last", "en")).toBe("First and last frame");
    expect(modeLabel("nepoznato", "sr")).toBe("nepoznato");
  });
});

describe("šta fali pre nego što dugme proradi", () => {
  test("`first_last` traži oba kadra i kaže koji fali", () => {
    const spec = specOf("kling-3-turbo");
    const first = file({ storageId: "prvi" });
    const last = file({ storageId: "zadnji" });

    expect(missingInput(spec, "first_last", {}, [], { first: null, last: null })).toEqual({
      kind: "frame",
      frame: "first",
    });
    expect(missingInput(spec, "first_last", {}, [], { first, last: null })).toEqual({
      kind: "frame",
      frame: "last",
    });
    // I kad je popunjen samo završni kadar, poruka imenuje POČETNI - par se
    // drži imenovano baš zbog toga.
    expect(missingInput(spec, "first_last", {}, [], { first: null, last })).toEqual({
      kind: "frame",
      frame: "first",
    });
    expect(missingInput(spec, "first_last", {}, [], { first, last })).toBeNull();

    expect(
      missingInputMessage({ kind: "frame", frame: "last" }, "sr"),
    ).toBe("Dodaj završni kadar");
    expect(missingInputMessage({ kind: "frame", frame: "last" }, "en")).toBe("Add the last frame");
  });

  test("redosled para je početni pa završni kadar", () => {
    const first = file({ storageId: "prvi" });
    const last = file({ storageId: "zadnji" });
    expect(framePairFiles({ first, last }).map((entry) => entry.storageId)).toEqual(["prvi", "zadnji"]);
    expect(framePairFiles({ first: null, last })).toEqual([last]);
  });

  test("`reference` traži bar jednu referencu bilo koje vrste", () => {
    const spec = specOf("kling-omni");
    expect(missingInput(spec, "reference", {})).toEqual({ kind: "any" });
    expect(missingInput(spec, "reference", { video: [file({ mime: "video/mp4" })] })).toBeNull();
    expect(missingInputMessage({ kind: "any" }, "sr")).toBe("Dodaj bar jednu referencu");
  });

  test("režim sa dva imenovana slota traži oba", () => {
    const spec = specOf("kling-motion");
    expect(missingInput(spec, "video_image", {})).toEqual({ kind: "slot", slot: "video" });
    expect(missingInput(spec, "video_image", { video: [file({ mime: "video/mp4" })] })).toEqual({
      kind: "slot",
      slot: "image",
    });
    expect(
      missingInput(spec, "video_image", { video: [file({ mime: "video/mp4" })], image: [file()] }),
    ).toBeNull();
    expect(missingInputMessage({ kind: "slot", slot: "image" }, "sr")).toBe("Dodaj slika");
  });

  test("slot koji je parametar isključio ne blokira dugme", () => {
    const spec = specOf("kling-lipsync");
    const video = [file({ mime: "video/mp4" })];

    // Izvor govora "zvuk": traži se i zvučni zapis.
    expect(missingInput(spec, "video_audio", { video })).toEqual({ kind: "slot", slot: "audio" });
    // Izvor govora "tekst": pozivalac isključi slot, i to po vrednosti
    // kontrole, ne po imenu modela.
    expect(missingInput(spec, "video_audio", { video }, ["audio"])).toBeNull();
  });

  test("režim bez slotova ne traži ništa", () => {
    expect(missingInput(specOf("kling-3"), "text", {})).toBeNull();
    expect(missingInputMessage(null, "sr")).toBeNull();
  });
});

describe("količine koje se broje iz slotova", () => {
  test("ulazne slike preko besplatne kvote se broje za cenu", () => {
    const minimax = studioModelBySlug("minimax-h3");
    if (!minimax) throw new Error("minimax-h3 nije u katalogu");

    const files: SlotFiles = {
      image: [file({ storageId: "1" }), file({ storageId: "2" })],
      video: [file({ storageId: "3", mime: "video/mp4" })],
    };

    // Broje se SLIKE - `extras` kataloga su uvek ulazne slike, a video u
    // referencama se naplaćuje kroz `modeMultipliers`, ne ovde.
    expect(measuredExtraCounts(minimax.priceRule, files)).toEqual({ reference_images: 2 });
  });

  test("pravilo bez `extras` ne broji ništa", () => {
    const kling = studioModelBySlug("kling-3");
    if (!kling) throw new Error("kling-3 nije u katalogu");

    expect(measuredExtraCounts(kling.priceRule, { image: [file()] })).toEqual({});
  });
});
