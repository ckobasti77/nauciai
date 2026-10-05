import { describe, expect, test } from "vitest";

import {
  belgradeOffsetMs,
  buildGeminiBatchLine,
  buildOpenAiBatchLine,
  canAdvanceBatch,
  createLineSplitter,
  geminiBatchUrls,
  groupNightJobs,
  morningPushAt,
  NIGHT_BATCH_STATES,
  NIGHT_CREDIT_FACTOR,
  NIGHT_JOB_DEADLINE_MS,
  NIGHT_ERRORS,
  type NightBatchSpec,
  type NightCandidate,
  nightActualCost,
  nightArrivalsText,
  nightDeadlineAt,
  nightNotificationCopy,
  nightOptionFor,
  nightParams,
  nightProviderStatus,
  nightQuote,
  nightSavingsPercent,
  normalizeProviderState,
  parseGeminiResultLine,
  parseNightBatch,
  parseOpenAiResultLine,
  readGeminiBatchName,
  readGeminiBatchStatus,
  readGeminiFileName,
  readOpenAiBatchStatus,
} from "./creaNightCore";
import { CREA_MARGINS_V2, creditFactorFor, priceCategoryOf, resolveCreditFactor } from "./creaPricingCore";
import { STUDIO_MODELS } from "./providers/catalogModels";
import type { StudioModelSeed } from "./providers/modelSeed";
import { computeCostUsd, computeCredits } from "./studioPricing";

function model(slug: string): StudioModelSeed {
  const row = STUDIO_MODELS.find((entry) => entry.slug === slug);
  if (!row) throw new Error(slug);

  return row;
}

const GOOGLE: NightBatchSpec = { provider: "google", model: "gemini-3.1-flash-image", discount: 0.5 };
const ALL_KEYS = { google: true, openai: true };

describe("ponuda noćne ture", () => {
  test("parseNightBatch čita samo ispravan red kataloga", () => {
    expect(parseNightBatch(model("nano-banana-2").capabilities)).toEqual(GOOGLE);
    expect(parseNightBatch(model("gpt-image-2").capabilities)).toEqual({
      provider: "openai",
      model: "gpt-image-2",
      discount: 0.5,
      tokenRatesUsdPerMillion: { prompt: 2.5, output: 15 },
    });
    expect(parseNightBatch(model("seedream-45").capabilities)).toBeNull();
    expect(parseNightBatch({ batch: { provider: "fal", model: "x", discount: 0.5 } })).toBeNull();
    expect(parseNightBatch({ batch: { provider: "google", model: "", discount: 0.5 } })).toBeNull();
    expect(parseNightBatch({ batch: { provider: "google", model: "m", discount: 1 } })).toBeNull();
    expect(parseNightBatch(null)).toBeNull();
  });

  test("tačno modeli iz plana nude noćnu turu: tri Nano Banane (Google) i GPT Image 2 (OpenAI)", () => {
    const offered = STUDIO_MODELS.filter((row) => parseNightBatch(row.capabilities) !== null).map((row) => row.slug);
    expect(offered.sort()).toEqual(["gpt-image-2", "nano-banana-2", "nano-banana-2-lite", "nano-banana-pro"]);
  });

  test("bez cena v2 nema noćne ture (K06-4)", () => {
    const caps = model("nano-banana-2").capabilities;
    expect(nightOptionFor({ pricingV2: false, capabilities: caps, inputMode: "text", providers: ALL_KEYS })).toBeNull();
    expect(nightOptionFor({ pricingV2: true, capabilities: caps, inputMode: "text", providers: ALL_KEYS })).toEqual(GOOGLE);
  });

  test("bez OPENAI_API_KEY opcija za GPT Image 2 se ne vidi (O7); sa ključem samo iz opisa", () => {
    const caps = model("gpt-image-2").capabilities;
    const noKey = nightProviderStatus({ GOOGLE_AI_API_KEY: "g" });
    expect(noKey).toEqual({ google: true, openai: false });
    expect(nightOptionFor({ pricingV2: true, capabilities: caps, inputMode: "text", providers: noKey })).toBeNull();

    const withKey = nightProviderStatus({ GOOGLE_AI_API_KEY: "g", OPENAI_API_KEY: "sk-test" });
    expect(nightOptionFor({ pricingV2: true, capabilities: caps, inputMode: "text", providers: withKey })?.provider).toBe(
      "openai",
    );
    expect(nightOptionFor({ pricingV2: true, capabilities: caps, inputMode: "image_multi", providers: withKey })).toBeNull();
  });

  test("ključevi: prazan ključ i STUDIO_MOCK=1 gase oba provajdera; bez Google ključa nema ni Nano Banane", () => {
    expect(nightProviderStatus({ OPENAI_API_KEY: "  " })).toEqual({ google: false, openai: false });
    expect(nightProviderStatus({ GOOGLE_AI_API_KEY: "g", OPENAI_API_KEY: "o", STUDIO_MOCK: "1" })).toEqual({
      google: false,
      openai: false,
    });
    const caps = model("nano-banana-2").capabilities;
    expect(
      nightOptionFor({ pricingV2: true, capabilities: caps, inputMode: "text", providers: { google: false } }),
    ).toBeNull();
    // Nano Banana ide u noćnu turu i iz izmene okačenih slika.
    expect(
      nightOptionFor({ pricingV2: true, capabilities: caps, inputMode: "image_multi", providers: ALL_KEYS }),
    ).toEqual(GOOGLE);
  });
});

describe("cena noćne ture", () => {
  test("faktor je image_batch pod v2 (×2,0 = 173)", () => {
    expect(NIGHT_CREDIT_FACTOR).toBe(creditFactorFor(CREA_MARGINS_V2.image_batch));
    expect(NIGHT_CREDIT_FACTOR).toBe(resolveCreditFactor({ pricingV2: true, category: priceCategoryOf("image", { night: true }) }));
    expect(NIGHT_CREDIT_FACTOR).toBe(173);
  });

  test("primeri iz plana K06 §9.2: NB2 1K 7, 2K 9, NB2 Lite 3, NB Pro 2K 13", () => {
    const quote = (slug: string, params: Record<string, unknown>) =>
      nightQuote(model(slug).priceRule, params, "text", 0.5).credits;
    expect(quote("nano-banana-2", { resolution: "1K" })).toBe(7);
    expect(quote("nano-banana-2", { resolution: "2K" })).toBe(9);
    expect(quote("nano-banana-2-lite", {})).toBe(3);
    expect(quote("nano-banana-pro", { resolution: "2K" })).toBe(13);
  });

  test("noćna cena = pola dnevne nabavne × 173, i uvek jeftinija od dnevne v2 cene", () => {
    for (const row of STUDIO_MODELS) {
      const spec = parseNightBatch(row.capabilities);
      if (!spec) continue;
      const params = nightParams({
        resolution: row.slug === "nano-banana-pro" ? "4K" : "1K",
        quality: "high",
        size: "1024x1024",
        num_images: 3,
      });
      const dayUsd = computeCostUsd(row.priceRule, params, "text");
      const quote = nightQuote(row.priceRule, params, "text", spec.discount);
      expect(quote.costUsd, row.slug).toBeCloseTo(dayUsd * 0.5, 9);
      expect(quote.credits, row.slug).toBe(Math.ceil(Math.round(dayUsd * 0.5 * 173 * 1e6) / 1e6));
      const dayV2 = computeCredits(row.priceRule, params, "text", resolveCreditFactor({ pricingV2: true, category: "image" }));
      expect(quote.credits, row.slug).toBeLessThan(dayV2);
      // Marža nad batch nabavnom cenom nikad ispod ×1,5 (O1).
      expect(quote.credits / 100 / 0.865 / quote.costUsd, row.slug).toBeGreaterThanOrEqual(1.5);
    }
  });

  test("ušteda u procentima ide naniže i nikad ne obećava kad nema uštede", () => {
    expect(nightSavingsPercent(10, 7)).toBe(30);
    expect(nightSavingsPercent(20, 13)).toBe(35);
    expect(nightSavingsPercent(5, 3)).toBe(40);
    expect(nightSavingsPercent(10, 10)).toBe(0);
    expect(nightSavingsPercent(0, 3)).toBe(0);
  });

  test("noćni posao je uvek jedna slika (num_images na 1, ostalo isto)", () => {
    expect(nightParams({ prompt: "x", num_images: 4, quality: "low" })).toEqual({ prompt: "x", num_images: 1, quality: "low" });
    expect(nightParams({ prompt: "x" })).toEqual({ prompt: "x" });
    const original = { num_images: 2 };
    nightParams(original);
    expect(original).toEqual({ num_images: 2 });
  });
});

describe("grupisanje u batch-eve", () => {
  const candidate = (id: string, slug: string, createdAt: number, inputBytes = 0): NightCandidate => ({
    jobId: id,
    modelSlug: slug,
    spec: GOOGLE,
    inputBytes,
    createdAt,
  });

  test("po modelu, od najstarijeg; rok batch-a je rok najstarijeg posla", () => {
    const groups = groupNightJobs([candidate("c", "nano-banana-2", 30), candidate("a", "nano-banana-2", 10), candidate("b", "nano-banana-pro", 20)]);
    expect(groups.map((group) => [group.modelSlug, group.jobIds])).toEqual([
      ["nano-banana-2", ["a", "c"]],
      ["nano-banana-pro", ["b"]],
    ]);
    expect(groups[0].oldestCreatedAt).toBe(10);
    expect(nightDeadlineAt(10)).toBe(10 + 36 * 60 * 60 * 1000);
  });

  test("najviše 100 zahteva po batch-u", () => {
    const many = Array.from({ length: 250 }, (_, index) => candidate(`j${index}`, "nano-banana-2", index));
    expect(groupNightJobs(many).map((group) => group.jobIds.length)).toEqual([100, 100, 50]);
  });

  test("granica bajtova ulaza; posao koji je sam veći ide sam", () => {
    const groups = groupNightJobs(
      [candidate("a", "m", 1, 6), candidate("b", "m", 2, 6), candidate("huge", "m", 3, 50), candidate("c", "m", 4, 1)],
      { maxRequests: 100, maxInputBytes: 10 },
    );
    expect(groups.map((group) => group.jobIds)).toEqual([["a"], ["b"], ["huge"], ["c"]]);
  });

  test("prazan ulaz daje prazan spisak", () => {
    expect(groupNightJobs([])).toEqual([]);
  });
});

describe("mašina stanja", () => {
  test("prelazi idu samo napred, kraj je kraj", () => {
    expect(canAdvanceBatch("preparing", "submitted")).toBe(true);
    expect(canAdvanceBatch("preparing", "failed")).toBe(true);
    expect(canAdvanceBatch("submitted", "succeeded")).toBe(true);
    expect(canAdvanceBatch("submitted", "expired")).toBe(true);
    expect(canAdvanceBatch("succeeded", "ingested")).toBe(true);

    expect(canAdvanceBatch("submitted", "preparing")).toBe(false);
    expect(canAdvanceBatch("succeeded", "failed")).toBe(false);
    expect(canAdvanceBatch("preparing", "ingested")).toBe(false);
    for (const terminal of ["ingested", "failed", "expired"] as const) {
      for (const next of NIGHT_BATCH_STATES) expect(canAdvanceBatch(terminal, next), `${terminal}→${next}`).toBe(false);
    }
  });

  test("stanja provajdera: oba Gemini zapisa i OpenAI rečnik", () => {
    expect(normalizeProviderState("JOB_STATE_SUCCEEDED")).toBe("succeeded");
    expect(normalizeProviderState("BATCH_STATE_RUNNING")).toBe("running");
    expect(normalizeProviderState("JOB_STATE_EXPIRED")).toBe("expired");
    expect(normalizeProviderState("BATCH_STATE_CANCELLED")).toBe("cancelled");
    expect(normalizeProviderState("validating")).toBe("pending");
    expect(normalizeProviderState("finalizing")).toBe("running");
    expect(normalizeProviderState("completed")).toBe("succeeded");
    expect(normalizeProviderState("cancelling")).toBe("running");
    expect(normalizeProviderState("BATCH_STATE_UNSPECIFIED")).toBeNull();
    expect(normalizeProviderState("constructor")).toBeNull();
    expect(normalizeProviderState(undefined)).toBeNull();
  });

  test("Gemini status: stanje i fajl sa svakog dokumentovanog mesta", () => {
    expect(
      readGeminiBatchStatus({
        name: "batches/b1",
        metadata: { state: "JOB_STATE_SUCCEEDED" },
        response: { responsesFile: "files/out-1" },
      }),
    ).toEqual({ state: "succeeded", resultFiles: ["files/out-1"], error: null });
    expect(readGeminiBatchStatus({ state: "BATCH_STATE_SUCCEEDED", output: { responsesFile: "files/out-2" } })).toEqual({
      state: "succeeded",
      resultFiles: ["files/out-2"],
      error: null,
    });
    expect(readGeminiBatchStatus({ state: "JOB_STATE_SUCCEEDED", dest: { fileName: "files/out-3" } }).resultFiles).toEqual([
      "files/out-3",
    ]);
    expect(readGeminiBatchStatus({ metadata: { state: "JOB_STATE_FAILED" }, error: { message: "kvota" } })).toEqual({
      state: "failed",
      resultFiles: [],
      error: "kvota",
    });
    expect(readGeminiBatchStatus(null)).toEqual({ state: null, resultFiles: [], error: null });
  });

  test("imena batch-a i fajla se prihvataju samo u očekivanom obliku", () => {
    expect(readGeminiBatchName({ name: "batches/abc_12-z" })).toBe("batches/abc_12-z");
    expect(readGeminiBatchName({ metadata: { name: "batches/x1" } })).toBe("batches/x1");
    expect(readGeminiBatchName({ name: "batches/../files" })).toBeNull();
    expect(readGeminiFileName({ file: { name: "files/f-1" } })).toBe("files/f-1");
    expect(readGeminiFileName({ file: { name: "https://evil" } })).toBeNull();
  });

  test("OpenAI status: izlaz i fajl grešaka, prva greška", () => {
    expect(readOpenAiBatchStatus({ status: "completed", output_file_id: "file-o", error_file_id: "file-e" })).toEqual({
      state: "succeeded",
      resultFiles: ["file-o", "file-e"],
      error: null,
    });
    expect(readOpenAiBatchStatus({ status: "failed", errors: { data: [{ message: "loš fajl" }] } })).toEqual({
      state: "failed",
      resultFiles: [],
      error: "loš fajl",
    });
  });

  test("adrese Gemini Batch-a iz istog baseUrl-a", () => {
    const urls = geminiBatchUrls("https://generativelanguage.googleapis.com/v1beta");
    expect(urls.upload).toBe("https://generativelanguage.googleapis.com/upload/v1beta/files");
    expect(urls.download("files/out")).toBe(
      "https://generativelanguage.googleapis.com/download/v1beta/files/out:download?alt=media",
    );
    expect(urls.create("gemini-3.1-flash-image")).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:batchGenerateContent",
    );
    expect(urls.status("batches/b1")).toBe("https://generativelanguage.googleapis.com/v1beta/batches/b1");
    expect(urls.cancel("batches/b1")).toBe("https://generativelanguage.googleapis.com/v1beta/batches/b1:cancel");
  });
});

describe("zahtevi i rezultati", () => {
  test("Gemini red: opis, slike, odnos i veličina; key je jobId", () => {
    const line = JSON.parse(
      buildGeminiBatchLine({
        key: "job1",
        params: { prompt: "mačka", resolution: "0.5K", aspect_ratio: "16:9" },
        inputMode: "image_multi",
        images: [{ mimeType: "image/png", base64: "AAA" }],
      }),
    );
    expect(line.key).toBe("job1");
    expect(line.request.contents[0].parts).toEqual([{ text: "mačka" }, { inlineData: { mimeType: "image/png", data: "AAA" } }]);
    expect(line.request.generationConfig).toEqual({
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: "16:9", imageSize: "512px" },
    });

    // NB2 Lite nema rezoluciju - nema ni `imageSize`; iz opisa se slike ne šalju.
    const lite = JSON.parse(
      buildGeminiBatchLine({ key: "j", params: { prompt: "x", aspect_ratio: "1:1" }, inputMode: "text", images: [] }),
    );
    expect(lite.request.generationConfig.imageConfig).toEqual({ aspectRatio: "1:1" });
    expect(lite.request.contents[0].parts).toHaveLength(1);
  });

  test("Gemini red: izmena bez slike i nepoznata rezolucija se odbijaju pre slanja", () => {
    expect(() => buildGeminiBatchLine({ key: "j", params: {}, inputMode: "image_multi", images: [] })).toThrow(
      "NEPOTPUN_ULAZ",
    );
    expect(() =>
      buildGeminiBatchLine({ key: "j", params: { resolution: "8K" }, inputMode: "text", images: [] }),
    ).toThrow("NEPOZNATA_REZOLUCIJA");
  });

  test("OpenAI red: uvek jedna slika, veličina i kvalitet iz forme", () => {
    expect(
      JSON.parse(
        buildOpenAiBatchLine({ key: "j9", model: "gpt-image-2", params: { prompt: "p", size: "1024x1024", quality: "low", num_images: 4 } }),
      ),
    ).toEqual({
      custom_id: "j9",
      method: "POST",
      url: "/v1/images/generations",
      body: { model: "gpt-image-2", prompt: "p", n: 1, size: "1024x1024", quality: "low" },
    });
  });

  test("Gemini rezultat: slika sa potrošnjom, greška, odgovor bez slike, smeće", () => {
    const ok = parseGeminiResultLine(
      JSON.stringify({
        key: "job1",
        response: {
          candidates: [{ content: { parts: [{ text: "evo" }, { inlineData: { mimeType: "image/png", data: "QUJD" } }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1120 },
        },
      }),
    );
    expect(ok).toEqual({ key: "job1", ok: true, mimeType: "image/png", data: "QUJD", usage: { prompt: 10, output: 1120 } });

    expect(parseGeminiResultLine(JSON.stringify({ key: "job2", error: { code: 400, message: "loš zahtev" } }))).toEqual({
      key: "job2",
      ok: false,
      error: "Google je odbio sliku: loš zahtev",
    });
    const blocked = parseGeminiResultLine(
      JSON.stringify({ key: "job3", response: { candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] } }),
    );
    expect(blocked).toMatchObject({ key: "job3", ok: false });
    expect(blocked && !blocked.ok ? blocked.error : "").toContain("SAFETY");

    expect(parseGeminiResultLine("{nije json")).toBeNull();
    expect(parseGeminiResultLine(JSON.stringify({ response: {} }))).toBeNull();
  });

  test("OpenAI rezultat: slika, greška reda, HTTP greška u telu", () => {
    expect(
      parseOpenAiResultLine(
        JSON.stringify({
          custom_id: "j1",
          response: { status_code: 200, body: { data: [{ b64_json: "UE5H" }], usage: { input_tokens: 20, output_tokens: 4000 } } },
          error: null,
        }),
      ),
    ).toEqual({ key: "j1", ok: true, mimeType: "image/png", data: "UE5H", usage: { prompt: 20, output: 4000 } });
    expect(parseOpenAiResultLine(JSON.stringify({ custom_id: "j2", response: null, error: { message: "isteklo" } }))).toEqual({
      key: "j2",
      ok: false,
      error: "OpenAI je odbio sliku: isteklo",
    });
    expect(
      parseOpenAiResultLine(
        JSON.stringify({ custom_id: "j3", response: { status_code: 400, body: { error: { message: "moderacija" } } } }),
      ),
    ).toEqual({ key: "j3", ok: false, error: "OpenAI je odbio sliku: moderacija" });
  });

  test("stvaran trošak: Google tarifa reda × popust, OpenAI batch tarifa kakva jeste", () => {
    const nb2 = model("nano-banana-2").capabilities;
    const rates = { output: 60, prompt: 0.5 };
    const outcome = nightActualCost({ prompt: 10, output: 1120 }, GOOGLE, rates);
    expect(outcome.ok && outcome.usd).toBeCloseTo(((10 * 0.5 + 1120 * 60) / 1e6) * 0.5, 12);
    expect(nb2.tokenRatesUsdPerMillion).toEqual(rates);

    const openai = parseNightBatch(model("gpt-image-2").capabilities) as NightBatchSpec;
    const openaiOutcome = nightActualCost({ prompt: 20, output: 4000 }, openai, null);
    expect(openaiOutcome.ok && openaiOutcome.usd).toBeCloseTo((20 * 2.5 + 4000 * 15) / 1e6, 12);

    expect(nightActualCost(null, GOOGLE, rates).ok).toBe(false);
  });

  test("rezultat se čita red po red i kad je red presečen između delova", () => {
    const splitter = createLineSplitter();
    expect(splitter.push('{"key":"a"}\n{"ke')).toEqual(['{"key":"a"}']);
    expect(splitter.push('y":"b"}\r\n\n{"key"')).toEqual(['{"key":"b"}']);
    expect(splitter.push(':"c"}')).toEqual([]);
    expect(splitter.flush()).toEqual(['{"key":"c"}']);
    expect(splitter.flush()).toEqual([]);
  });

  test("greške noćne ture nose kod na početku", () => {
    for (const message of Object.values(NIGHT_ERRORS)) expect(message).toMatch(/^NOCNA_TURA_[A-Z_]+: /);
    expect(NIGHT_JOB_DEADLINE_MS).toBe(36 * 60 * 60 * 1000);
  });
});

describe("jutarnje iznenađenje", () => {
  const at = (iso: string) => Date.parse(iso);

  test("Beograd: +2 h leti, +1 h zimi, prelaz poslednje nedelje marta i oktobra u 01:00 UTC", () => {
    expect(belgradeOffsetMs(at("2026-07-01T12:00:00Z"))).toBe(2 * 3600_000);
    expect(belgradeOffsetMs(at("2026-12-01T12:00:00Z"))).toBe(3600_000);
    expect(belgradeOffsetMs(at("2026-03-29T00:59:00Z"))).toBe(3600_000);
    expect(belgradeOffsetMs(at("2026-03-29T01:00:00Z"))).toBe(2 * 3600_000);
    expect(belgradeOffsetMs(at("2026-10-25T00:59:00Z"))).toBe(2 * 3600_000);
    expect(belgradeOffsetMs(at("2026-10-25T01:00:00Z"))).toBe(3600_000);
  });

  test("push između 23 h i 8 h čeka 08:00 po Beogradu; danju ide odmah", () => {
    // 00:30 po Beogradu (leto) → isti dan u 08:00 = 06:00 UTC.
    expect(morningPushAt(at("2026-10-04T22:30:00Z"))).toBe(at("2026-10-05T06:00:00Z"));
    // 23:30 po Beogradu → sutra u 08:00.
    expect(morningPushAt(at("2026-10-05T21:30:00Z"))).toBe(at("2026-10-06T06:00:00Z"));
    // 07:59 → za minut; 08:00 i podne → odmah.
    expect(morningPushAt(at("2026-10-05T05:59:00Z"))).toBe(at("2026-10-05T06:00:00Z"));
    expect(morningPushAt(at("2026-10-05T06:00:00Z"))).toBeNull();
    expect(morningPushAt(at("2026-10-05T10:00:00Z"))).toBeNull();
    // 22:59 po Beogradu je još dan.
    expect(morningPushAt(at("2026-10-05T20:59:00Z"))).toBeNull();
    // Zima: ponoć po Beogradu = 23:00 UTC prethodnog dana → 07:00 UTC.
    expect(morningPushAt(at("2026-11-30T23:00:00Z"))).toBe(at("2026-12-01T07:00:00Z"));
    // Noć prelaska na zimsko vreme: 08:00 po Beogradu je već CET.
    expect(morningPushAt(at("2026-10-24T22:00:00Z"))).toBe(at("2026-10-25T07:00:00Z"));
  });

  test("„Stiglo je N radova“ sa srpskom množinom", () => {
    expect(nightArrivalsText(1, "sr")).toBe("Stigao je 1 rad");
    expect(nightArrivalsText(3, "sr")).toBe("Stigla su 3 rada");
    expect(nightArrivalsText(5, "sr")).toBe("Stiglo je 5 radova");
    expect(nightArrivalsText(11, "sr")).toBe("Stiglo je 11 radova");
    expect(nightArrivalsText(12, "sr")).toBe("Stiglo je 12 radova");
    expect(nightArrivalsText(21, "sr")).toBe("Stigao je 21 rad");
    expect(nightArrivalsText(22, "sr")).toBe("Stigla su 22 rada");
    expect(nightArrivalsText(1, "en")).toBe("1 new piece arrived");
    expect(nightArrivalsText(4, "en")).toBe("4 new pieces arrived");
    expect(nightNotificationCopy(3, "sr")).toEqual({
      title: "Noćna tura je gotova",
      body: "Stigla su 3 rada. Otvori Creu i pogledaj.",
    });
  });
});
