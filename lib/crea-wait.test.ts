import { describe, expect, test } from "vitest";

import {
  CREA_DEMO_WAIT_MS,
  CREA_TYPICAL_WAIT_MS,
  CREA_WAIT_STEPS,
  estimateWait,
  formatAbout,
  isWaitingStatus,
  queuePlace,
  remainingText,
  waitState,
  type CreaWaitJob,
} from "./crea-wait";

function job(over: Partial<CreaWaitJob> = {}): CreaWaitJob {
  return { _id: "j", status: "running", kind: "image", modelSlug: "nano-banana-2", createdAt: 1_000, isMock: false, ...over };
}

describe("koraci čekanja", () => {
  test("koraci su tačno U redu → Crta → Boji → Gotovo", () => {
    expect(CREA_WAIT_STEPS).toEqual(["red", "crta", "boji", "gotovo"]);
  });

  test("reserved je u redu, noćna tura je u redu bez procene", () => {
    expect(waitState(job({ status: "reserved" }), 5_000, 20_000)).toMatchObject({ phase: "red", step: 0, progress: 0, night: false });
    expect(waitState(job({ status: "queued" }), 5_000, 20_000)).toMatchObject({ phase: "red", night: true });
  });

  test("running: prva polovina procene crta, druga boji, preko procene je „duže nego obično\"", () => {
    const estimate = 20_000;
    expect(waitState(job(), 1_000 + 4_000, estimate)).toMatchObject({ phase: "crta", step: 1, overdue: false });
    expect(waitState(job(), 1_000 + 12_000, estimate)).toMatchObject({ phase: "boji", step: 2, overdue: false });
    const late = waitState(job(), 1_000 + 30_000, estimate)!;
    expect(late).toMatchObject({ phase: "boji", overdue: true });
    // Skica se ne završava pre rezultata.
    expect(late.progress).toBeLessThan(1);
  });

  test("napredak skice raste sa vremenom i staje ispod 1 dok se radi", () => {
    const values = [0, 5_000, 10_000, 19_000, 60_000].map((ms) => waitState(job(), 1_000 + ms, 20_000)!.progress);
    for (let index = 1; index < values.length; index += 1) expect(values[index]).toBeGreaterThanOrEqual(values[index - 1]!);
    expect(Math.max(...values)).toBeLessThan(1);
  });

  test("done je Gotovo sa punom skicom; neuspeo posao nema ekran čekanja", () => {
    expect(waitState(job({ status: "done" }), 9_000, 20_000)).toMatchObject({ phase: "gotovo", step: 3, progress: 1 });
    expect(waitState(job({ status: "failed" }), 9_000, 20_000)).toBeNull();
    expect(waitState(job({ status: "refunded" }), 9_000, 20_000)).toBeNull();
  });

  test("isWaitingStatus", () => {
    expect(["reserved", "running", "queued"].every(isWaitingStatus)).toBe(true);
    expect(["done", "failed", "refunded"].some(isWaitingStatus)).toBe(false);
  });
});

describe("procena trajanja", () => {
  test("medijana poslednjih radova istog modela", () => {
    const history = [10_000, 30_000, 20_000].map((took, index) =>
      job({ _id: `h${index}`, status: "done", createdAt: 0, completedAt: took }),
    );
    expect(estimateWait(job(), history)).toEqual({ ms: 20_000, basis: "history" });
  });

  test("drugi model, DEMO, nezavršeni i sam posao se ne broje", () => {
    const history = [
      job({ _id: "a", status: "done", modelSlug: "veo-3", createdAt: 0, completedAt: 90_000 }),
      job({ _id: "b", status: "done", isMock: true, createdAt: 0, completedAt: 3_000 }),
      job({ _id: "c", status: "running", createdAt: 0 }),
      job({ _id: "j", status: "done", createdAt: 0, completedAt: 1 }),
      job({ _id: "d", status: "done", createdAt: 0, completedAt: 40_000 }),
    ];
    // Samo jedan pravi uzorak (d) - premalo, pa tipično vreme vrste.
    expect(estimateWait(job(), history)).toEqual({ ms: CREA_TYPICAL_WAIT_MS.image, basis: "typical" });
  });

  test("tipično vreme po vrsti i za DEMO", () => {
    expect(estimateWait(job({ kind: "video" }), []).ms).toBe(CREA_TYPICAL_WAIT_MS.video);
    expect(estimateWait(job({ kind: "audio" }), []).ms).toBe(CREA_TYPICAL_WAIT_MS.audio);
    expect(estimateWait(job({ isMock: true }), []).ms).toBe(CREA_DEMO_WAIT_MS);
  });

  test("najviše 10 uzoraka, od najnovijeg", () => {
    const recent = Array.from({ length: 10 }, (_, index) => job({ _id: `r${index}`, status: "done", createdAt: 0, completedAt: 10_000 }));
    const old = Array.from({ length: 10 }, (_, index) => job({ _id: `o${index}`, status: "done", createdAt: 0, completedAt: 500_000 }));
    expect(estimateWait(job(), [...recent, ...old]).ms).toBe(10_000);
  });
});

describe("mesto u redu", () => {
  test("posao koji čeka predaju je iza starijih koji čekaju; ostali nemaju mesto", () => {
    const jobs = [
      job({ _id: "a", status: "reserved", createdAt: 1 }),
      job({ _id: "b", status: "running", createdAt: 2 }),
      job({ _id: "c", status: "reserved", createdAt: 3 }),
    ];
    expect(queuePlace(jobs[0]!, jobs)).toBe(1);
    expect(queuePlace(jobs[2]!, jobs)).toBe(2);
    expect(queuePlace(jobs[1]!, jobs)).toBeNull();
    expect(queuePlace(job({ status: "queued" }), jobs)).toBeNull();
  });
});

describe("tekst procene", () => {
  test("zaokruživanje bez lažne preciznosti", () => {
    expect(formatAbout(13_000, "sr")).toBe("oko 15 s");
    expect(formatAbout(2_000, "sr")).toBe("oko 5 s");
    expect(formatAbout(61_000, "sr")).toBe("oko 2 min");
    expect(formatAbout(13_000, "en")).toBe("about 15 s");
  });

  test("preostalo vreme i pošteno „duže nego obično\"", () => {
    expect(remainingText(20_000, 7_000, "sr")).toBe("Još oko 15 s");
    expect(remainingText(20_000, 7_000, "en")).toBe("About 15 s left");
    expect(remainingText(20_000, 25_000, "sr")).toMatch(/duže nego obično/);
    expect(remainingText(20_000, 25_000, "en")).toMatch(/longer than usual/);
  });
});
