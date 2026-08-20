import { expect, test } from "vitest";

import { KLING_LIPSYNC, KLING_TRYON } from "./providers/falToolModels";
import { STUDIO_MODELS } from "./providers/catalogModels";
import {
  countInputImages,
  extraCounts,
  hasVideoInput,
  jobInputStorageIds,
  parseClientInputs,
  parseInputModes,
  parseInputSpec,
  parseQuantitySource,
  promptControlOf,
  promptFromParams,
  resolveMeasuredQuantity,
  sanitizeJobInputs,
} from "./studioJobCore";
import type { PriceRule } from "./studioPricing";

const SPEC = parseInputSpec(
  JSON.stringify({
    reference: { image: { max: 9, accept: ["image/png"] }, video: { max: 3, accept: ["video/mp4"] } },
    text: {},
  }),
);

// ── ulazi sa klijenta ──────────────────────────────────────────────────────

test("parseClientInputs prima samo oblik { slot: [storageId] }, sve ostalo odbija", () => {
  expect(parseClientInputs(undefined)).toEqual({});
  expect(parseClientInputs(JSON.stringify({ image: ["a", "b"], video: [] }))).toEqual({
    image: ["a", "b"],
  });

  // Odbija, ne "očisti tiho": posao sa pokvarenim ulazima naručuje nešto drugo
  // od onoga po čemu je naplaćen.
  expect(parseClientInputs("nije json")).toBeNull();
  expect(parseClientInputs(JSON.stringify(["a"]))).toBeNull();
  expect(parseClientInputs(JSON.stringify({ image: "a" }))).toBeNull();
  expect(parseClientInputs(JSON.stringify({ image: [1] }))).toBeNull();
  expect(parseClientInputs(JSON.stringify({ image: [""] }))).toBeNull();
});

test("sanitizeJobInputs odbija slot kojeg režim nema i slot preko svoje granice", () => {
  expect(sanitizeJobInputs({ image: ["a"] }, SPEC, "reference")).toEqual({
    ok: true,
    inputs: { image: ["a"] },
  });

  expect(sanitizeJobInputs({ audio: ["a"] }, SPEC, "reference")).toEqual({
    ok: false,
    reason: "NEPOZNAT_SLOT:audio",
  });
  expect(sanitizeJobInputs({ image: ["a"] }, SPEC, "text")).toEqual({
    ok: false,
    reason: "NEPOZNAT_SLOT:image",
  });
  expect(sanitizeJobInputs({ video: ["a", "b", "c", "d"] }, SPEC, "reference")).toEqual({
    ok: false,
    reason: "PREVISE_FAJLOVA:video",
  });
});

test("redosled unutar slota se čuva - prompt citira reference po broju", () => {
  const inputs = parseClientInputs(JSON.stringify({ image: ["prva", "druga", "treca"] }));
  expect(jobInputStorageIds(inputs ?? {})).toEqual(["prva", "druga", "treca"]);
});

test("video ulaz i broj ulaznih slika se čitaju iz imena slota", () => {
  expect(hasVideoInput({ image: ["a"] })).toBe(false);
  expect(hasVideoInput({ image: ["a"], video: ["v"] })).toBe(true);

  // `extras` u katalogu su uvek SLIKE, pa se video i zvuk ne broje.
  expect(countInputImages({ image: ["a", "b"], video: ["v"], audio: ["z"] })).toBe(2);
  // Imenovani slotovi (proba odeće) su takođe slike.
  expect(countInputImages({ person: ["a"], garment: ["b"] })).toBe(2);
});

test("extraCounts prijavljuje broj slika pod ključem koji pravilo naplaćuje", () => {
  const rule: PriceRule = {
    unit: "image",
    baseUsd: 0.05,
    extras: [{ param: "input_images", freeCount: 1, usdEach: 0.003 }],
  };

  expect(extraCounts(rule, { image: ["a", "b", "c"] })).toEqual({ input_images: 3 });
  // Pravilo bez `extras` ne dopisuje ništa - inače bi u parametrima stajao
  // ključ koji provajder ne poznaje.
  expect(extraCounts({ unit: "image", baseUsd: 0.05 }, { image: ["a"] })).toEqual({});
});

// ── prompt ─────────────────────────────────────────────────────────────────

test("prompt se čita iz prve vidljive textarea kontrole, kakav god da joj je ključ", () => {
  const tts = STUDIO_MODELS.find((model) => model.slug === "tts");
  expect(tts).toBeDefined();
  expect(promptControlOf(tts?.paramSpec ?? [], "text")?.key).toBe("text");
  expect(promptFromParams(tts?.paramSpec ?? [], { text: "zdravo" }, "text")).toBe("zdravo");

  const nanoBanana = STUDIO_MODELS.find((model) => model.slug === "nano-banana-2");
  expect(promptControlOf(nanoBanana?.paramSpec ?? [], "text")?.key).toBe("prompt");
});

test("model bez textarea kontrole nema prompt - moderacija ga preskače, ne odbija", () => {
  expect(promptControlOf(KLING_TRYON.paramSpec, "image_multi")).toBeNull();
  expect(promptFromParams(KLING_TRYON.paramSpec, {}, "image_multi")).toBeNull();
});

test("lipsync ima textarea, ali prazan tekst nije prazan prompt kad je izvor zvuk", () => {
  // Kontrola postoji, vrednost je prazna - odluku šta sa tim radi donosi
  // `createJob` po tome ima li režim ijedan slot (ovaj ima video i zvuk).
  expect(promptControlOf(KLING_LIPSYNC.paramSpec, "video_audio")?.key).toBe("text");
  expect(promptFromParams(KLING_LIPSYNC.paramSpec, { text: "" }, "video_audio")).toBe("");
});

// ── merena količina ────────────────────────────────────────────────────────

test("parseQuantitySource čita `capabilities.quantity`, a nepotpun oblik je null", () => {
  const source = parseQuantitySource(
    JSON.stringify({ quantity: { param: "duration", from: "input_video_seconds", min: 1, max: 60 } }),
  );
  expect(source).toEqual({ param: "duration", from: "input_video_seconds", min: 1, max: 60 });

  expect(parseQuantitySource("{}")).toBeNull();
  expect(parseQuantitySource("nije json")).toBeNull();
  expect(
    parseQuantitySource(JSON.stringify({ quantity: { param: "duration", from: "izmisljeno", min: 1, max: 2 } })),
  ).toBeNull();
});

test("tekst meri server sam, iz parametara - klijent tu nema šta da prijavi", () => {
  const source = {
    param: "char_count",
    from: "text_length",
    measuredFrom: "text",
    min: 1,
    max: 5000,
  } as const;

  expect(resolveMeasuredQuantity(source, { text: "zdravo" }, undefined)).toEqual({
    ok: true,
    quantity: 6,
  });
  // Prijavljena količina se ignoriše kad je tekst tu - naplaćuje se ono što je ukucano.
  expect(resolveMeasuredQuantity(source, { text: "zdravo" }, 1)).toEqual({ ok: true, quantity: 6 });
  expect(resolveMeasuredQuantity(source, { text: "" }, 100)).toEqual({
    ok: false,
    reason: "NEDOSTAJE_KOLICINA:char_count",
  });
});

test("dužina fajla se zaokružuje NAVIŠE i seče na granice iz kataloga", () => {
  const seconds = { param: "duration", from: "input_video_seconds", min: 1, max: 60 } as const;

  expect(resolveMeasuredQuantity(seconds, {}, 3.2)).toEqual({ ok: true, quantity: 4 });
  expect(resolveMeasuredQuantity(seconds, {}, 0.4)).toEqual({ ok: true, quantity: 1 });
  // Prijavljen sat na modelu koji prima minut se seče na minut, ne naplaćuje se sat.
  expect(resolveMeasuredQuantity(seconds, {}, 3600)).toEqual({ ok: true, quantity: 60 });

  expect(resolveMeasuredQuantity(seconds, {}, undefined)).toEqual({
    ok: false,
    reason: "NEDOSTAJE_KOLICINA:duration",
  });
  expect(resolveMeasuredQuantity(seconds, {}, 0)).toEqual({
    ok: false,
    reason: "NEDOSTAJE_KOLICINA:duration",
  });
  expect(resolveMeasuredQuantity(seconds, {}, Number.NaN)).toEqual({
    ok: false,
    reason: "NEDOSTAJE_KOLICINA:duration",
  });
});

test("minuti se zaokružuju na desetinku naviše, ne na ceo minut", () => {
  const minutes = { param: "minutes", from: "input_media_minutes", min: 0.1, max: 120 } as const;

  expect(resolveMeasuredQuantity(minutes, {}, 1.01)).toEqual({ ok: true, quantity: 1.1 });
  expect(resolveMeasuredQuantity(minutes, {}, 0.01)).toEqual({ ok: true, quantity: 0.1 });
});

// ── parseri polja reda ─────────────────────────────────────────────────────

test("parseInputSpec i parseInputModes preživljavaju pokvaren JSON praznim skupom", () => {
  expect(parseInputSpec("nije json")).toEqual({});
  // Režim koji nije objekat se preskače u celosti; režim BEZ slotova (samo
  // prompt) ostaje prazan objekat, i po tome se razlikuje od nepostojećeg.
  expect(parseInputSpec(JSON.stringify({ text: "ne objekat" }))).toEqual({});
  expect(parseInputSpec(JSON.stringify({ text: {} }))).toEqual({ text: {} });
  expect(parseInputModes("nije json")).toEqual([]);
  expect(parseInputModes(JSON.stringify(["text", 7]))).toEqual(["text"]);
});

test("svaki red kataloga prolazi kroz parsere reda bez gubitka režima", () => {
  for (const seed of STUDIO_MODELS) {
    const modes = parseInputModes(JSON.stringify(seed.inputModes));
    const spec = parseInputSpec(JSON.stringify(seed.inputSpec));
    expect(modes, seed.slug).toEqual(seed.inputModes);
    expect(Object.keys(spec).sort(), seed.slug).toEqual(Object.keys(seed.inputSpec).sort());
  }
});
