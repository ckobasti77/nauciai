import { describe, expect, test } from "vitest";

import { CreaLocalAiError, LOCAL_AI_ERROR_CODES, localAiErrorMessage, toLocalAiError } from "./errors";
import { aggregateProgress, estimateSecondsLeft, formatBytes } from "./progress";

const MB = 1024 * 1024;

describe("napredak preuzimanja", () => {
  test("zbir fajlova i procenat", () => {
    expect(
      aggregateProgress([
        { loaded: 6 * MB, total: 12 * MB },
        { loaded: 0, total: 0.25 * MB },
      ]),
    ).toEqual({ loaded: 6 * MB, total: 12.25 * MB, percent: 48 });
  });

  test("nepoznata veličina ne izmišlja procenat; raspakovano ne prelazi 100 %", () => {
    expect(aggregateProgress([{ loaded: 3 * MB, total: null }])).toEqual({ loaded: 3 * MB, total: null, percent: null });
    expect(aggregateProgress([{ loaded: 12 * MB, total: 3 * MB }]).percent).toBe(100);
    expect(aggregateProgress([]).percent).toBeNull();
  });

  test("bajtovi na srpskom i engleskom", () => {
    expect(formatBytes(11.75 * MB, "sr")).toBe("11,8 MB");
    expect(formatBytes(11.75 * MB, "en")).toBe("11.8 MB");
    expect(formatBytes(229_746, "sr")).toBe("224 KB");
    expect(formatBytes(30_000, "sr")).toBe("29,3 KB");
    expect(formatBytes(512, "en")).toBe("512 B");
    expect(formatBytes(150 * MB, "en")).toBe("150 MB");
  });

  test("procena preostalog vremena", () => {
    expect(estimateSecondsLeft({ loaded: 4 * MB, total: 12 * MB, percent: 33 }, 2000)).toBe(4);
    expect(estimateSecondsLeft({ loaded: 4 * MB, total: null, percent: null }, 2000)).toBeNull();
    expect(estimateSecondsLeft({ loaded: 0, total: 12 * MB, percent: 0 }, 2000)).toBeNull();
    expect(estimateSecondsLeft({ loaded: 1, total: 12 * MB, percent: 0 }, 100)).toBeNull();
  });
});

describe("greške lokalnog AI-ja", () => {
  test("odustajanje, mreža i pun disk se prepoznaju", () => {
    expect(toLocalAiError(new DOMException("x", "AbortError"), "NETWORK").code).toBe("ABORTED");
    expect(toLocalAiError(new DOMException("x", "QuotaExceededError"), "NETWORK").code).toBe("QUOTA");
    expect(toLocalAiError(new TypeError("Failed to fetch"), "MODEL_LOAD_FAILED").code).toBe("NETWORK");
    expect(toLocalAiError(new Error("wasm trap"), "INFERENCE_FAILED").code).toBe("INFERENCE_FAILED");
    const own = new CreaLocalAiError("TOO_HEAVY");
    expect(toLocalAiError(own, "NETWORK")).toBe(own);
  });

  test("svaki kod ima rečenicu na oba jezika, bez tehničkih reči", () => {
    for (const code of LOCAL_AI_ERROR_CODES) {
      expect(localAiErrorMessage(code, "sr").trim(), code).not.toBe("");
      expect(localAiErrorMessage(code, "en").trim(), code).not.toBe("");
      expect(localAiErrorMessage(code, "sr"), code).not.toMatch(/WASM|exception|undefined/i);
    }
  });
});
