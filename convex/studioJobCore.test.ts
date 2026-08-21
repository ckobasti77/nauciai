import { expect, test } from "vitest";

import { KLING_LIPSYNC, KLING_TRYON } from "./providers/falToolModels";
import { STUDIO_MODELS } from "./providers/catalogModels";
import {
  boundedInputSeconds,
  countInputImages,
  extraCounts,
  hasVideoInput,
  jobInputStorageIds,
  type MeasuredUpload,
  measuredQuantityFromSeconds,
  measuredSlotsFor,
  type QuantitySource,
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

  expect(resolveMeasuredQuantity(source, { text: "zdravo" }, null)).toEqual({
    ok: true,
    quantity: 6,
  });
  // Izmereno trajanje se ignoriše kad je tekst tu - naplaćuje se ono što je ukucano.
  expect(resolveMeasuredQuantity(source, { text: "zdravo" }, 100)).toEqual({
    ok: true,
    quantity: 6,
  });
  expect(resolveMeasuredQuantity(source, { text: "" }, 100)).toEqual({
    ok: false,
    reason: "NEDOSTAJE_KOLICINA:char_count",
  });
});

test("izmerena dužina se zaokružuje NAVIŠE i seče na granice iz kataloga", () => {
  const seconds = { param: "duration", from: "input_video_seconds", min: 1, max: 60 } as const;

  expect(resolveMeasuredQuantity(seconds, {}, 3.2)).toEqual({ ok: true, quantity: 4 });
  expect(resolveMeasuredQuantity(seconds, {}, 0.4)).toEqual({ ok: true, quantity: 1 });
  // Izmeren sat na modelu koji prima minut se seče na minut, ne naplaćuje se sat.
  expect(resolveMeasuredQuantity(seconds, {}, 3600)).toEqual({ ok: true, quantity: 60 });
});

test("minuti se zaokružuju na desetinku naviše, ne na ceo minut", () => {
  const minutes = { param: "minutes", from: "input_media_minutes", min: 0.1, max: 120 } as const;

  expect(resolveMeasuredQuantity(minutes, {}, 1.01)).toEqual({ ok: true, quantity: 1.1 });
  expect(resolveMeasuredQuantity(minutes, {}, 0.01)).toEqual({ ok: true, quantity: 0.1 });
});

test("bez serverskog merenja posao ne prolazi - klijentov broj ne postoji kao ulaz", () => {
  const seconds = { param: "duration", from: "input_video_seconds", min: 1, max: 60 } as const;

  // Kapija je zatečena iz W3 i ostaje kao mreža: ono što server nije izmerio,
  // ne naplaćuje se. Funkcija više NEMA argument za prijavljenu dužinu, pa
  // klijent ovaj ishod ne može da zaobiđe ni sa jednim brojem.
  expect(resolveMeasuredQuantity(seconds, {}, null)).toEqual({
    ok: false,
    reason: "MERENJE_NIJE_DOSTUPNO",
  });
  expect(resolveMeasuredQuantity(seconds, {}, 0)).toEqual({
    ok: false,
    reason: "MERENJE_NIJE_DOSTUPNO",
  });
  expect(resolveMeasuredQuantity(seconds, {}, Number.NaN)).toEqual({
    ok: false,
    reason: "MERENJE_NIJE_DOSTUPNO",
  });

  // Tekst server meri iz parametara, pa za njega merenje fajla ne postoji.
  const chars = { param: "char_count", from: "text_length", measuredFrom: "text", min: 1, max: 5000 } as const;
  expect(resolveMeasuredQuantity(chars, { text: "zdravo" }, null)).toEqual({
    ok: true,
    quantity: 6,
  });
});

test("izmerene sekunde se sabiraju po mernim slotovima i prevode u jedinicu pravila", () => {
  const seconds = { param: "duration", from: "input_video_seconds", min: 1, max: 60 } as const;
  const audio = { param: "duration", from: "input_audio_seconds", min: 1, max: 60 } as const;
  const minutes = { param: "minutes", from: "input_media_minutes", min: 0.1, max: 120 } as const;

  expect(measuredSlotsFor(seconds)).toEqual(["video"]);
  expect(measuredSlotsFor(audio)).toEqual(["audio"]);
  // `stt` i `dubbing` primaju i video i zvuk pod istim pravilom po minutu.
  expect(measuredSlotsFor(minutes)).toEqual(["video", "audio"]);

  expect(measuredQuantityFromSeconds(seconds, { video: 12.5 })).toBe(12.5);
  expect(measuredQuantityFromSeconds(audio, { audio: 90 })).toBe(90);
  expect(measuredQuantityFromSeconds(minutes, { audio: 90 })).toBe(1.5);

  // Slot koji se ne meri ne ulazi u račun - slika uz video kod prenosa pokreta.
  expect(measuredQuantityFromSeconds(seconds, { video: 8, image: 300 })).toBe(8);
  // Nijedan merni slot, ili merni slot bez izmerenog trajanja -> `null`, a
  // `resolveMeasuredQuantity` na to odbija posao.
  expect(measuredQuantityFromSeconds(seconds, { image: 300 })).toBeNull();
  expect(measuredQuantityFromSeconds(seconds, { video: 0 })).toBeNull();
  expect(measuredQuantityFromSeconds(seconds, {})).toBeNull();
});

// ── granice trajanja iz veličine fajla ─────────────────────────────────────

const MINUTES = { param: "minutes", from: "input_media_minutes", min: 0.1, max: 120 } as const;
const AUDIO_SECONDS = { param: "duration", from: "input_audio_seconds", min: 1, max: 60 } as const;

/** Granice sa suženim tipom: test koji čita `seconds` prvo tvrdi da ishoda ima. */
function bounded(source: QuantitySource, uploads: Record<string, MeasuredUpload[]>) {
  const result = boundedInputSeconds(source, uploads);
  if (!result.ok) throw new Error(`granica je odbila posao: ${result.reason}`);

  return result;
}

/** Naplaćena količina, kroz ceo lanac kojim ide i `createJob`. */
function billed(source: QuantitySource, uploads: Record<string, MeasuredUpload[]>) {
  return resolveMeasuredQuantity(
    source,
    {},
    measuredQuantityFromSeconds(source, bounded(source, uploads).seconds),
  );
}

test("prepravljeno zaglavlje se podiže na donju granicu iz veličine fajla", () => {
  // Nalaz N2 u malom: `mvhd`/Xing tvrdi 6 sekundi, a u fajlu je 288 MB zvuka.
  // Na 320 kbps - najvišoj tarifi koju MP3 poznaje - to je preko dva sata.
  const forged = { audio: [{ seconds: 6, bytes: 288 * 1024 * 1024, mimeType: "audio/mpeg" }] };

  const result = bounded(MINUTES, forged);
  expect(result.durationSource).toBe("lower_bound");
  expect(result.headerSeconds).toBe(6);
  expect(result.billedSeconds).toBeCloseTo(7549.75, 2);
  // 125,8 minuta se seče na kataloških 120 - ne na 0,1 koliko bi zaglavlje dalo.
  expect(billed(MINUTES, forged)).toEqual({ ok: true, quantity: 120 });
});

test("pošten fajl prolazi netaknut - granica je ispod zaglavlja", () => {
  // Trominutni MP3 na 128 kbps: 2,88 MB. Donja granica je 72 s, dakle ispod
  // 180 s koliko zaglavlje tvrdi, pa se ne aktivira.
  const honest = { audio: [{ seconds: 180, bytes: 2_880_000, mimeType: "audio/mpeg" }] };

  const result = bounded(MINUTES, honest);
  expect(result.durationSource).toBe("header");
  expect(result.billedSeconds).toBe(180);
  expect(billed(MINUTES, honest)).toEqual({ ok: true, quantity: 3 });
});

test("WAV je tačan po konstrukciji, pa se granica na njemu nikad ne aktivira", () => {
  // 3 s pri 176,4 kB/s je 529 200 bajtova; donja granica na 3 Mbps je 1,38 s.
  const wav = { audio: [{ seconds: 3, bytes: 529_200, mimeType: "audio/wav" }] };

  expect(bounded(AUDIO_SECONDS, wav).durationSource).toBe("header");
  expect(billed(AUDIO_SECONDS, wav)).toEqual({ ok: true, quantity: 3 });

  // Isto i za dvominutni WAV: PCM je toliko rastrošan da mu je odnos bajtova i
  // sekundi uvek daleko iznad granice.
  const long = { audio: [{ seconds: 120, bytes: 21_168_000, mimeType: "audio/x-wav" }] };
  expect(bounded(AUDIO_SECONDS, long).durationSource).toBe("header");
});

test("zaglavlje duže nego što fajl te veličine može da traje obara posao", () => {
  // Suprotan napad: megabajt sa zaglavljem od deset sati, kojim bi se punio
  // tuđi dnevni plafon i `studioUsageDaily`. Na 8 kbps megabajt je 17,5 minuta.
  const impossible = { audio: [{ seconds: 36_000, bytes: 1024 * 1024, mimeType: "audio/mpeg" }] };

  expect(boundedInputSeconds(MINUTES, impossible)).toEqual({
    ok: false,
    reason: "ZAGLAVLJE_NEMOGUCE",
  });

  // Isti fajl sa zaglavljem unutar granice prolazi - granica odbija samo ono
  // što je nemoguće, ne sve što je dugačko.
  const possible = { audio: [{ seconds: 900, bytes: 1024 * 1024, mimeType: "audio/mpeg" }] };
  expect(bounded(MINUTES, possible).durationSource).toBe("header");
});

test("nepoznat MIME nema granicu i ostaje na zatečenom putu", () => {
  // Isti fajl koji bi kao `audio/mpeg` bio podignut na dva sata: bez poznatog
  // bitrate-a nema šta da se dokaže, pa se naplaćuje zaglavlje.
  const unknown = { audio: [{ seconds: 6, bytes: 288 * 1024 * 1024, mimeType: "application/zip" }] };
  expect(bounded(MINUTES, unknown).durationSource).toBe("header");
  expect(billed(MINUTES, unknown)).toEqual({ ok: true, quantity: 0.1 });

  // Red bez `mimeType`-a (upload pre W4, ili storage bez `contentType`-a) ide
  // istim putem, bez granice u oba smera.
  const noMime = { audio: [{ seconds: 36_000, bytes: 1024 }] };
  expect(bounded(MINUTES, noMime).durationSource).toBe("header");
});

test("granica se primenjuje po fajlu, a sabira po mernim slotovima", () => {
  // `stt` i `dubbing` mere i video i zvuk pod istim pravilom po minutu.
  const mixed = {
    video: [{ seconds: 60, bytes: 750_000_000, mimeType: "video/mp4" }],
    audio: [{ seconds: 120, bytes: 1_920_000, mimeType: "audio/mpeg" }],
    // Slika nije merni slot i ne ulazi ni u zbir ni u granicu.
    image: [{ seconds: 999, bytes: 10, mimeType: "image/png" }],
  };

  const result = bounded(MINUTES, mixed);
  // Video: 750 MB na 50 Mbps je 120 s, dakle duplo od zaglavlja - podiže se.
  // Zvuk: 1,92 MB na 320 kbps je 48 s, ispod zaglavlja - ostaje 120 s.
  expect(result.seconds).toEqual({ video: 120, audio: 120 });
  expect(result.headerSeconds).toBe(180);
  expect(result.billedSeconds).toBe(240);
  expect(result.durationSource).toBe("lower_bound");
  expect(billed(MINUTES, mixed)).toEqual({ ok: true, quantity: 4 });
});

test("granica podiže izmereno trajanje, ali ga ne izmišlja", () => {
  // Fajl bez pročitanog zaglavlja nema svoje sekunde, pa nema ni šta da se
  // podigne: kapija `MERENJE_NIJE_DOSTUPNO` iz W3 ostaje netaknuta i posle X1.
  const unmeasured = { audio: [{ seconds: 0, bytes: 288 * 1024 * 1024, mimeType: "audio/mpeg" }] };

  expect(bounded(MINUTES, unmeasured).seconds).toEqual({});
  expect(billed(MINUTES, unmeasured)).toEqual({ ok: false, reason: "MERENJE_NIJE_DOSTUPNO" });

  // Model koji se meri iz teksta nema merne slotove, pa ni izvor trajanja.
  const chars = { param: "char_count", from: "text_length", measuredFrom: "text", min: 1, max: 5000 } as const;
  expect(bounded(chars, unmeasured).headerSeconds).toBe(0);
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
