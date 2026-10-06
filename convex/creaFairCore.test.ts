import { describe, expect, test } from "vitest";

import {
  cancelRouteOf,
  exceedsPersonalLimit,
  fairUnlimitedBlock,
  falQueueStatus,
  falRequestUrl,
  FREE_REDO_LIMITS,
  freeRedoBlock,
  isUnpaidJob,
  normalizeDailyLimit,
} from "./creaFairCore";

describe("lični dnevni limit", () => {
  test("granice, zaokruživanje i brisanje", () => {
    expect(normalizeDailyLimit(null)).toBeNull();
    expect(normalizeDailyLimit(150.4)).toBe(150);
    expect(() => normalizeDailyLimit(9)).toThrow("NEISPRAVAN_LIMIT");
    expect(() => normalizeDailyLimit(Number.NaN)).toThrow("NEISPRAVAN_LIMIT");
    expect(() => normalizeDailyLimit(100_001)).toThrow("NEISPRAVAN_LIMIT");
  });

  test("meri se današnje + ovaj posao; besplatan posao nikad ne prelazi", () => {
    expect(exceedsPersonalLimit(10, 10, 20)).toBe(false);
    expect(exceedsPersonalLimit(10, 11, 20)).toBe(true);
    expect(exceedsPersonalLimit(500, 0, 20)).toBe(false);
    expect(exceedsPersonalLimit(500, 50, null)).toBe(false);
  });
});

describe("besplatno ponavljanje", () => {
  const now = 1_000_000_000;
  const base = {
    job: { status: "done", provider: "fal", creditCost: 16, createdAt: now - 1000 },
    reason: "prazno",
    now,
    alreadyRedone: false,
    usedToday: 0,
    used30Days: 0,
  };

  test("dozvoljeno za svež plaćen rad", () => {
    expect(freeRedoBlock(base)).toBeNull();
  });

  test("svako pravilo ima svoj razlog", () => {
    expect(freeRedoBlock({ ...base, reason: "x" })).toBe("NEPOZNAT_RAZLOG");
    expect(freeRedoBlock({ ...base, job: { ...base.job, status: "running" } })).toBe("NIJE_GOTOV");
    expect(freeRedoBlock({ ...base, job: { ...base.job, provider: "local" } })).toBe("BESPLATAN_RAD");
    expect(freeRedoBlock({ ...base, job: { ...base.job, freeTryLessonId: "l" } })).toBe("BESPLATAN_RAD");
    expect(freeRedoBlock({ ...base, job: { ...base.job, createdAt: now - FREE_REDO_LIMITS.maxAgeMs - 1 } })).toBe("PRESTARO");
    expect(freeRedoBlock({ ...base, alreadyRedone: true })).toBe("VEC_PONOVLJENO");
    expect(freeRedoBlock({ ...base, job: { ...base.job, creditCost: FREE_REDO_LIMITS.maxCredits + 1 } })).toBe("PRESKUPO_ZA_PONAVLJANJE");
    expect(freeRedoBlock({ ...base, usedToday: FREE_REDO_LIMITS.perDay })).toBe("DNEVNI_LIMIT_PONAVLJANJA");
    expect(freeRedoBlock({ ...base, used30Days: FREE_REDO_LIMITS.per30Days })).toBe("MESECNI_LIMIT_PONAVLJANJA");
  });

  test("besplatni poslovi", () => {
    expect(isUnpaidJob({})).toBe(false);
    expect(isUnpaidJob({ fairUnlimited: true })).toBe(true);
    expect(isUnpaidJob({ freeRedoOfJobId: "j" })).toBe(true);
  });
});

describe("otkazivanje", () => {
  test("put po stanju i provajderu", () => {
    expect(cancelRouteOf({ status: "queued", provider: "google" })).toBe("local");
    expect(cancelRouteOf({ status: "queued", provider: "google", batchId: "b" })).toBeNull();
    expect(cancelRouteOf({ status: "reserved", provider: "fal" })).toBeNull();
    expect(cancelRouteOf({ status: "reserved", provider: "google", fairUnlimited: true })).toBe("local");
    expect(cancelRouteOf({ status: "running", provider: "google", falRequestId: "mock-1" })).toBe("local");
    expect(cancelRouteOf({ status: "running", provider: "fal", falRequestId: "r" })).toBe("fal");
    expect(cancelRouteOf({ status: "running", falRequestId: "r" })).toBe("fal");
    expect(cancelRouteOf({ status: "running", provider: "byteplus", falRequestId: "r" })).toBeNull();
    expect(cancelRouteOf({ status: "done", provider: "fal", falRequestId: "r" })).toBeNull();
  });

  test("fal adrese i stanje", () => {
    expect(falRequestUrl("fal-ai/flux/dev", "a b", "cancel")).toBe("https://queue.fal.run/fal-ai/flux/dev/requests/a%20b/cancel");
    expect(falQueueStatus({ status: "IN_QUEUE" })).toBe("IN_QUEUE");
    expect(falQueueStatus("x")).toBeNull();
  });
});

describe("pošteno neograničeno", () => {
  const base = {
    flagOn: true,
    premium: true,
    modelSlug: "nano-banana-2-lite",
    estimatedCostUsd: 0.0336,
    numImages: 1,
    otherDiscount: false,
    inFlight: 0,
    used: 0,
  };
  test("redom: fleg, plan, model i cena, jedna slika, jedan posao, mesec", () => {
    expect(fairUnlimitedBlock(base)).toBeNull();
    expect(fairUnlimitedBlock({ ...base, flagOn: false })).toBe("NEOGRANICENO_ISKLJUCENO");
    expect(fairUnlimitedBlock({ ...base, premium: false })).toBe("NEOGRANICENO_SAMO_PREMIUM");
    expect(fairUnlimitedBlock({ ...base, modelSlug: "nano-banana-pro" })).toBe("NEOGRANICENO_MODEL");
    expect(fairUnlimitedBlock({ ...base, estimatedCostUsd: 0.2 })).toBe("NEOGRANICENO_MODEL");
    expect(fairUnlimitedBlock({ ...base, otherDiscount: true })).toBe("NEOGRANICENO_MODEL");
    expect(fairUnlimitedBlock({ ...base, numImages: 4 })).toBe("NEOGRANICENO_JEDNA_SLIKA");
    expect(fairUnlimitedBlock({ ...base, inFlight: 1 })).toBe("NEOGRANICENO_JEDAN_POSAO");
    expect(fairUnlimitedBlock({ ...base, used: 200 })).toBe("NEOGRANICENO_MESECNI_LIMIT");
  });
});
