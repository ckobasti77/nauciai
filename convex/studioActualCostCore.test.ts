import { expect, test } from "vitest";

import {
  ACTUAL_COST_REASON,
  COST_DEVIATION_STREAK,
  EMPTY_MODEL_COST_STATE,
  exceedsCostDeviation,
  MAX_SAMPLE_LENGTH,
  type ModelCostState,
  nextModelCostState,
  parseReasonCounts,
  parseTokenRates,
  previousDayKey,
  readTokenUsage,
  sampleJson,
  shiftReasonCounts,
  sumByRequestId,
  tokenCostOutcome,
  tokenCostUsd,
} from "./studioActualCostCore";

// ── čitanje potrošnje iz odgovora provajdera ───────────────────────────────

test("readTokenUsage čita Google `usageMetadata`, uključujući thinking tokene", () => {
  const usage = readTokenUsage({
    done: true,
    response: { generatedVideos: [{ video: { uri: "https://x/y" } }] },
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 1120, thoughtsTokenCount: 1250 },
  });

  expect(usage).toEqual({ prompt: 12, output: 1120, thinking: 1250 });
});

test("readTokenUsage čita BytePlus `usage` u snake_case zapisu", () => {
  const usage = readTokenUsage({
    id: "task-1",
    status: "succeeded",
    usage: { prompt_tokens: 30, completion_tokens: 4200, total_tokens: 4230 },
  });

  expect(usage).toEqual({ prompt: 30, output: 4200 });
});

test("readTokenUsage vraća null kad odgovor nema potrošnju - nema izmišljene nule", () => {
  expect(readTokenUsage({ id: "task-1", status: "succeeded" })).toBeNull();
  expect(readTokenUsage({ usage: { total_tokens: 0 } })).toBeNull();
  expect(readTokenUsage(null)).toBeNull();
  expect(readTokenUsage("nije objekat")).toBeNull();
});

// ── tarife i preračun ──────────────────────────────────────────────────────

test("parseTokenRates čita tarifu iz `capabilities`, a red bez nje daje null", () => {
  expect(parseTokenRates({ tokenRatesUsdPerMillion: { output: 119.64, thinking: 12 } })).toEqual({
    output: 119.64,
    thinking: 12,
  });
  expect(parseTokenRates({ mode: "sync" })).toBeNull();
  expect(parseTokenRates(null)).toBeNull();
  // Nula i negativan broj nisu tarifa, nego nedostajuća tarifa.
  expect(parseTokenRates({ tokenRatesUsdPerMillion: { output: 0 } })).toBeNull();
});

test("tokenCostUsd sabira tarifirane kategorije - Nano Banana Pro 2K iz kataloga 2.2", () => {
  const usd = tokenCostUsd(
    { output: 1120, thinking: 1250 },
    { output: 119.64, thinking: 12 },
  );

  // 1 120 × 119,64/M = 0,134 $ (slika na 2K) + 1 250 × 12/M = 0,015 $ (thinking).
  expect(usd).toBeCloseTo(0.149, 5);
});

test("tokenCostUsd vraća null kad jedna PRIJAVLJENA kategorija nema tarifu", () => {
  // Ulazni tokeni postoje u odgovoru, a katalog im nema cenu: delimičan zbir bi
  // bio trošak manji od stvarnog, pa se ne upisuje ništa.
  expect(tokenCostUsd({ prompt: 12, output: 1120 }, { output: 119.64 })).toBeNull();
  expect(tokenCostUsd({ output: 1120 }, null)).toBeNull();
  expect(tokenCostUsd({}, { output: 119.64 })).toBeNull();
});

// ── alarm na odstupanje ────────────────────────────────────────────────────

test("exceedsCostDeviation puca tek PREKO 30%, ne na tačno 30%", () => {
  expect(exceedsCostDeviation(0.13, 0.1)).toBe(false);
  expect(exceedsCostDeviation(0.1301, 0.1)).toBe(true);
  expect(exceedsCostDeviation(0.05, 0.1)).toBe(false);
  // Bez osnove nema odstupanja.
  expect(exceedsCostDeviation(5, 0)).toBe(false);
});

/** Pet uzastopnih poslova koji svaki premašuje procenu za 50%. */
function runDeviatingJobs(count: number): { state: ModelCostState; alarms: number } {
  let state: ModelCostState = EMPTY_MODEL_COST_STATE;
  let alarms = 0;

  for (let index = 0; index < count; index += 1) {
    const update = nextModelCostState(state, {
      actualCostUsd: 0.15,
      estimatedCostUsd: 0.1,
      creditCost: 22,
    });
    state = update.state;
    if (update.alarm) alarms += 1;
  }

  return { state, alarms };
}

test("alarm ne puca posle četiri uzastopna odstupanja", () => {
  const { state, alarms } = runDeviatingJobs(COST_DEVIATION_STREAK - 1);

  expect(alarms).toBe(0);
  expect(state.deviationStreak).toBe(4);
  expect(state.alarmSent).toBe(false);
});

test("alarm puca tačno jednom, na petom uzastopnom odstupanju", () => {
  const { state, alarms } = runDeviatingJobs(COST_DEVIATION_STREAK);

  expect(alarms).toBe(1);
  expect(state.deviationStreak).toBe(COST_DEVIATION_STREAK);
  expect(state.alarmSent).toBe(true);

  // Šesti i sedmi posao u istom nizu ne šalju drugi mejl.
  const sixth = nextModelCostState(state, {
    actualCostUsd: 0.15,
    estimatedCostUsd: 0.1,
    creditCost: 22,
  });
  expect(sixth.alarm).toBe(false);
  expect(sixth.state.deviationStreak).toBe(6);
});

test("posao u granicama prekida niz i oslobađa alarm za sledeći niz", () => {
  const { state } = runDeviatingJobs(COST_DEVIATION_STREAK);

  const calm = nextModelCostState(state, {
    actualCostUsd: 0.1,
    estimatedCostUsd: 0.1,
    creditCost: 22,
  });
  expect(calm.state.deviationStreak).toBe(0);
  expect(calm.state.alarmSent).toBe(false);

  let next = calm.state;
  let alarms = 0;
  for (let index = 0; index < COST_DEVIATION_STREAK; index += 1) {
    const update = nextModelCostState(next, {
      actualCostUsd: 0.15,
      estimatedCostUsd: 0.1,
      creditCost: 22,
    });
    next = update.state;
    if (update.alarm) alarms += 1;
  }
  expect(alarms).toBe(1);
});

test("posao bez procene ulazi u zbir, ali ne dira niz", () => {
  const { state } = runDeviatingJobs(COST_DEVIATION_STREAK - 1);

  const legacy = nextModelCostState(state, { actualCostUsd: 9, creditCost: 22 });
  expect(legacy.alarm).toBe(false);
  expect(legacy.state.deviationStreak).toBe(4);
  expect(legacy.state.measuredJobs).toBe(5);
  expect(legacy.state.actualCostUsd).toBeCloseTo(0.15 * 4 + 9, 6);
  expect(legacy.state.estimatedCostUsd).toBeCloseTo(0.1 * 4, 6);
});

test("zbirovi rastu po poslu - stvarna marža se računa nad istim uzorkom", () => {
  const { state } = runDeviatingJobs(3);

  expect(state.measuredJobs).toBe(3);
  expect(state.actualCostUsd).toBeCloseTo(0.45, 6);
  expect(state.estimatedCostUsd).toBeCloseTo(0.3, 6);
  expect(state.creditCost).toBe(66);
});

// ── noćna rekonsilijacija ──────────────────────────────────────────────────

test("previousDayKey daje PRETHODNI UTC dan", () => {
  expect(previousDayKey(Date.parse("2026-08-20T04:30:00.000Z"))).toBe("2026-08-19");
  expect(previousDayKey(Date.parse("2026-01-01T00:10:00.000Z"))).toBe("2025-12-31");
});

test("sumByRequestId sabira više događaja istog zahteva i odbacuje neispravne", () => {
  const totals = sumByRequestId([
    { requestId: "a", usd: 0.01 },
    { requestId: "b", usd: 0.5 },
    { requestId: "a", usd: 0.02 },
    { requestId: "", usd: 1 },
    { requestId: "c", usd: 0 },
    { requestId: "d", usd: Number.NaN },
  ]);

  expect(totals).toHaveLength(2);
  expect(totals.find((row) => row.requestId === "a")?.usd).toBeCloseTo(0.03, 6);
  expect(totals.find((row) => row.requestId === "b")?.usd).toBeCloseTo(0.5, 6);
});

// ── X3: razlog umesto tihog praznog polja ──────────────────────────────────

test("tokenCostOutcome imenuje TAČNU kategoriju kojoj fali tarifa", () => {
  // `nano-banana-pro` danas: output i thinking imaju cenu, prompt nema - a
  // Google `promptTokenCount` javi uz svaki posao.
  const outcome = tokenCostOutcome(
    { prompt: 2000, output: 1120, thinking: 1250 },
    { output: 119.64, thinking: 12 },
  );

  expect(outcome).toEqual({ ok: false, reason: "nema tarife za kategoriju prompt" });
});

test("tokenCostOutcome razlikuje `nema tarife uopšte` od `nema prijavljene potrošnje`", () => {
  expect(tokenCostOutcome({ output: 1120 }, null)).toEqual({
    ok: false,
    reason: ACTUAL_COST_REASON.notTokenBilled,
  });
  expect(tokenCostOutcome(null, { output: 119.64 })).toEqual({
    ok: false,
    reason: ACTUAL_COST_REASON.noUsage,
  });
  // Objekat potrošnje bez ijedne kategorije je isto što i "nije prijavljeno".
  expect(tokenCostOutcome({}, { output: 119.64 })).toEqual({
    ok: false,
    reason: ACTUAL_COST_REASON.noUsage,
  });
});

test("tokenCostOutcome sa svim tarifama daje broj", () => {
  const outcome = tokenCostOutcome(
    { prompt: 2000, output: 1120, thinking: 1250 },
    { prompt: 0.5, output: 119.64, thinking: 12 },
  );

  expect(outcome.ok).toBe(true);
  expect(outcome.ok ? outcome.usd : 0).toBeCloseTo(0.15, 5);
});

test("shiftReasonCounts skida sa starog razloga i dodaje na novi", () => {
  const first = shiftReasonCounts(undefined, undefined, "a");
  expect(JSON.parse(first)).toEqual({ a: 1 });

  const second = shiftReasonCounts(first, undefined, "a");
  expect(JSON.parse(second)).toEqual({ a: 2 });

  const moved = shiftReasonCounts(second, "a", "b");
  expect(JSON.parse(moved)).toEqual({ a: 1, b: 1 });

  // Razlog koji je pao na nulu nestaje, a ne stoji kao `0` - inače bi admin
  // ekran prikazivao razloge kojih više nema.
  const cleared = shiftReasonCounts(moved, "a", undefined);
  expect(JSON.parse(cleared)).toEqual({ b: 1 });
});

test("parseReasonCounts odbija sve što nije pozitivan broj", () => {
  expect(parseReasonCounts(undefined)).toEqual({});
  expect(parseReasonCounts("nije json")).toEqual({});
  expect(parseReasonCounts('["a"]')).toEqual({});
  expect(parseReasonCounts('{"a":2,"b":0,"c":-1,"d":"x"}')).toEqual({ a: 2 });
});

test("sampleJson seče dugačak odgovor i preživljava ciklus", () => {
  const long = sampleJson({ text: "x".repeat(9000) });
  expect(long.length).toBeLessThanOrEqual(MAX_SAMPLE_LENGTH + 20);
  expect(long.endsWith("[odseceno]")).toBe(true);

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  // `JSON.stringify` na ciklusu baca - uzorak ne sme da obori upis razloga.
  expect(typeof sampleJson(cyclic)).toBe("string");
});

test("odstupanje se meri po PORAVNATOM trošku kad on postoji (X3, tačka 5)", () => {
  // Procena je izvedena iz zaglavlja koje je korisnik okačio: 0,06 $. Provajder
  // je javio 0,05 $, ali je poravnanje po stvarnom trajanju ispalo 72 $.
  const update = nextModelCostState(null, {
    actualCostUsd: 0.05,
    estimatedCostUsd: 0.06,
    settledCostUsd: 72,
    creditCost: 650,
  });

  expect(update.deviationCostUsd).toBe(72);
  expect(update.state.deviationStreak).toBe(1);
  // Zbir i dalje sabira ono što je provajder naplatio.
  expect(update.state.actualCostUsd).toBeCloseTo(0.05, 6);
});
