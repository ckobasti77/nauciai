import { expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { parseQuantitySource } from "@/convex/studioJobCore";

import {
  generateBlock,
  inputsPayload,
  measuredFile,
  measuredParams,
  measuredQuantityFrom,
  optionalSlots,
  promptRequired,
} from "./studio-playground";
import { parseStudioModel, type StudioModel } from "./studio-models";
import { paramValuesForMode } from "./studio-params";
import type { SlotFile, SlotFiles } from "./studio-slots";

function modelOf(slug: string): StudioModel {
  const seed = STUDIO_MODELS.find((model) => model.slug === slug);
  if (!seed) throw new Error(`Nema modela ${slug}`);

  const model = parseStudioModel({
    slug: seed.slug,
    provider: seed.provider,
    kind: seed.kind,
    family: seed.family,
    labelSr: seed.labelSr,
    labelEn: seed.labelEn,
    taglineSr: seed.taglineSr,
    taglineEn: seed.taglineEn,
    descriptionSr: seed.descriptionSr,
    descriptionEn: seed.descriptionEn,
    inputModes: JSON.stringify(seed.inputModes),
    inputSpec: JSON.stringify(seed.inputSpec),
    paramSpec: JSON.stringify(seed.paramSpec),
    priceRule: JSON.stringify(seed.priceRule),
    capabilities: JSON.stringify(seed.capabilities),
    sortOrder: seed.sortOrder,
  });
  if (!model) throw new Error(`Model ${slug} se ne parsira`);

  return model;
}

function file(overrides: Partial<SlotFile> = {}): SlotFile {
  return {
    storageId: overrides.storageId ?? "storage-1",
    name: overrides.name ?? "fajl",
    mime: overrides.mime ?? "image/png",
    size: overrides.size ?? 100,
    url: overrides.url ?? "blob:x",
  };
}

// ── prompt ─────────────────────────────────────────────────────────────────

test("prompt je obavezan samo u režimu bez ijednog slota", () => {
  const nanoBanana = modelOf("nano-banana-2");
  expect(promptRequired(nanoBanana.inputSpec, "text")).toBe(true);
  expect(promptRequired(nanoBanana.inputSpec, "image_multi")).toBe(false);

  // Lipsync ima tekstualnu kontrolu, ali i dva slota - tekst nije obavezan.
  expect(promptRequired(modelOf("kling-lipsync").inputSpec, "video_audio")).toBe(false);
  expect(promptRequired(modelOf("tts").inputSpec, "text")).toBe(true);
});

// ── slot koji isključi vrednost kontrole ───────────────────────────────────

test("izvor govora `tekst` isključuje zvučni slot, `zvuk` ga vraća", () => {
  const lipsync = modelOf("kling-lipsync");
  const values = paramValuesForMode(lipsync.paramSpec, "video_audio");

  expect(optionalSlots(lipsync.paramSpec, values, lipsync.inputSpec, "video_audio")).toEqual([]);
  expect(
    optionalSlots(lipsync.paramSpec, { ...values, source: "text" }, lipsync.inputSpec, "video_audio"),
  ).toEqual(["audio"]);
});

test("pravilo je opšte - kontrola čije opcije ne nose ime slota ne isključuje ništa", () => {
  const seedance = modelOf("seedance-20");
  const values = paramValuesForMode(seedance.paramSpec, "image");

  expect(optionalSlots(seedance.paramSpec, values, seedance.inputSpec, "image")).toEqual([]);
});

test("nijedan model iz kataloga ne isključi slot sam od sebe, na podrazumevanom izboru", () => {
  for (const seed of STUDIO_MODELS) {
    const model = modelOf(seed.slug);
    for (const mode of model.inputModes) {
      const values = paramValuesForMode(model.paramSpec, mode);
      const optional = optionalSlots(model.paramSpec, values, model.inputSpec, mode);
      // Jedini takav slučaj u katalogu je lipsync, i to tek kad se izvor
      // prebaci na tekst - podrazumevano je zvuk, pa je spisak prazan.
      expect(optional, `${seed.slug}/${mode}`).toEqual([]);
    }
  }
});

// ── merena količina ────────────────────────────────────────────────────────

test("meri se fajl iz slota koji odgovara izvoru količine", () => {
  const motion = modelOf("kling-motion");
  const source = parseQuantitySource(JSON.stringify(motion.capabilities));
  expect(source).not.toBeNull();
  if (!source) return;

  const files: SlotFiles = {
    video: [file({ storageId: "v", mime: "video/mp4" })],
    image: [file({ storageId: "i" })],
  };
  expect(measuredFile(source, motion.inputSpec, "video_image", files)?.storageId).toBe("v");
  // Bez video fajla nema šta da se meri - cena ostaje nepoznata.
  expect(measuredFile(source, motion.inputSpec, "video_image", { image: files.image })).toBeNull();
});

test("transkripcija prima i zvuk i video, pa meri onaj koji je okačen", () => {
  const stt = modelOf("stt");
  const source = parseQuantitySource(JSON.stringify(stt.capabilities));
  if (!source) throw new Error("stt nema merenu količinu");

  expect(
    measuredFile(source, stt.inputSpec, stt.inputModes[0], {
      audio: [file({ storageId: "z", mime: "audio/mpeg" })],
    })?.storageId,
  ).toBe("z");
});

test("sekunde se prevode u jedinicu pravila, a bez izmerene dužine nema ključa", () => {
  const seconds = { param: "duration", from: "input_video_seconds", min: 1, max: 60 } as const;
  const minutes = { param: "minutes", from: "input_media_minutes", min: 0.1, max: 120 } as const;
  const chars = { param: "char_count", from: "text_length", measuredFrom: "text", min: 1, max: 5000 } as const;

  expect(measuredQuantityFrom(seconds, 90)).toBe(90);
  expect(measuredQuantityFrom(minutes, 90)).toBe(1.5);

  expect(measuredParams(seconds, 12, 0)).toEqual({ duration: 12 });
  expect(measuredParams(minutes, 90, 0)).toEqual({ minutes: 1.5 });
  expect(measuredParams(chars, null, 1000)).toEqual({ char_count: 1000 });
  // Nema fajla, nema teksta - nema ni ključa, pa cena ostaje `null`, ne nula.
  expect(measuredParams(seconds, null, 0)).toEqual({});
  expect(measuredParams(chars, null, 0)).toEqual({});
  expect(measuredParams(null, 12, 100)).toEqual({});
});

// ── zaključavanje dugmeta ──────────────────────────────────────────────────

const OPEN = {
  state: { enabled: true, isEnrolled: true, activeJobs: 0, maxActiveJobs: 3 },
  balance: 1000,
  credits: 20,
  missingInputMessage: null,
  promptMissing: false,
  quantityMissing: false,
};

test("otvoren Studio sa dovoljno kredita ne zaključava dugme", () => {
  expect(generateBlock(OPEN)).toBeNull();
});

test("razlozi idu od najšireg ka najužem, a kredit se proverava poslednji", () => {
  expect(generateBlock({ ...OPEN, state: { ...OPEN.state, enabled: false } })).toEqual({ kind: "paused" });
  expect(generateBlock({ ...OPEN, state: { ...OPEN.state, isEnrolled: false } })).toEqual({
    kind: "not_enrolled",
  });
  expect(generateBlock({ ...OPEN, state: { ...OPEN.state, activeJobs: 3 } })).toEqual({
    kind: "active",
    max: 3,
  });
  expect(generateBlock({ ...OPEN, missingInputMessage: "Dodaj završni kadar" })).toEqual({
    kind: "inputs",
    message: "Dodaj završni kadar",
  });
  expect(generateBlock({ ...OPEN, promptMissing: true })).toEqual({ kind: "prompt" });
  expect(generateBlock({ ...OPEN, quantityMissing: true })).toEqual({ kind: "price" });
  expect(generateBlock({ ...OPEN, credits: null })).toEqual({ kind: "price" });
  expect(generateBlock({ ...OPEN, balance: 5 })).toEqual({ kind: "credits", needed: 20 });
});

test("ugašen Studio ima prednost nad nedostajućim ulazom - poruka mora da bude tačna", () => {
  expect(
    generateBlock({
      ...OPEN,
      state: { ...OPEN.state, enabled: false },
      missingInputMessage: "Dodaj sliku",
      credits: null,
    }),
  ).toEqual({ kind: "paused" });
});

test("balans koji se još učitava ne zaključava dugme unapred", () => {
  expect(generateBlock({ ...OPEN, balance: undefined })).toBeNull();
  // Ni stanje koje se učitava - server i dalje odbija posao ako nešto fali.
  expect(generateBlock({ ...OPEN, state: undefined })).toBeNull();
});

// ── ulazi u zahtevu ────────────────────────────────────────────────────────

test("inputsPayload šalje samo popunjene slotove, u redosledu kojim su okačeni", () => {
  expect(
    inputsPayload({
      image: [file({ storageId: "a" }), file({ storageId: "b" })],
      video: [],
    }),
  ).toEqual({ image: ["a", "b"] });
  expect(inputsPayload({})).toEqual({});
});
