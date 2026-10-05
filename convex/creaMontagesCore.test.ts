/** Projekti montaže (K19): ime projekta, vrste radova po upotrebi i čitanje dokumenta. */
import { describe, expect, test } from "vitest";

import { addAudio, addMainClips, addOverlay, emptyTimeline, serializeTimeline } from "../lib/crea-timeline";
import { cleanMontageTitle, jobKindNeeds, jobUsableInMontage, MONTAGE_LIMITS, parseMontageDoc } from "./creaMontagesCore";

const video = (jobId: string) => ({
  src: { jobId },
  media: "video" as const,
  in: 0,
  out: 3,
  speed: 1,
  volumeDb: 0,
  muted: false,
  fit: "cover" as const,
});

describe("projekti montaže - čista pravila", () => {
  test("ime: jedan red, bez viška razmaka, najviše 80 znakova, prazno = „Montaža\"", () => {
    expect(cleanMontageTitle("  Leto   na\nmoru  ")).toBe("Leto na moru");
    expect(cleanMontageTitle("   ")).toBe("Montaža");
    expect(Array.from(cleanMontageTitle("Ђ".repeat(100)))).toHaveLength(MONTAGE_LIMITS.titleChars);
  });

  test("vrste radova: klip je video ili slika, zvuk je zvuk ili video, isti rad mora oba", () => {
    let timeline = addMainClips(emptyTimeline(), [video("v1"), { ...video("s1"), media: "image" as const }]);
    timeline = addAudio(timeline, { src: { jobId: "a1" }, in: 0, out: 3, start: 0, volumeDb: 0, role: "music", fadeIn: 0, fadeOut: 0 }).timeline;
    timeline = addAudio(timeline, { src: { jobId: "v1" }, in: 0, out: 3, start: 0, volumeDb: 0, role: "voice", fadeIn: 0, fadeOut: 0 }).timeline;
    timeline = addOverlay(timeline, {
      src: { jobId: "s1" },
      media: "image",
      in: 0,
      out: 2,
      start: 0,
      rect: { x: 0.5, y: 0.5, w: 0.3, h: 0.3 },
      volumeDb: 0,
      muted: false,
    }).timeline;
    const needs = jobKindNeeds(timeline);
    expect([...needs.get("v1")!]).toEqual(["video"]);
    expect([...needs.get("s1")!]).toEqual(["image"]);
    expect([...needs.get("a1")!].sort()).toEqual(["audio", "video"]);
    const conflict = addAudio(timeline, { src: { jobId: "s1" }, in: 0, out: 3, start: 0, volumeDb: 0, role: "sfx", fadeIn: 0, fadeOut: 0 }).timeline;
    expect(jobKindNeeds(conflict).get("s1")?.size).toBe(0);
  });

  test("rad sme u montažu samo ako je moj, gotov, nije DEMO i prave je vrste", () => {
    const kinds = new Set(["video" as const]);
    const job = { userId: "u1", status: "done", kind: "video" as const, isMock: false };
    expect(jobUsableInMontage(job, "u1", kinds)).toBe(true);
    expect(jobUsableInMontage(job, "u2", kinds)).toBe(false);
    expect(jobUsableInMontage({ ...job, status: "running" }, "u1", kinds)).toBe(false);
    expect(jobUsableInMontage({ ...job, isMock: true }, "u1", kinds)).toBe(false);
    expect(jobUsableInMontage({ ...job, kind: "audio" }, "u1", kinds)).toBe(false);
    expect(jobUsableInMontage(null, "u1", kinds)).toBe(false);
  });

  test("dokument: loš JSON i previše radova se odbijaju, trajanje se računa", () => {
    expect(parseMontageDoc("{")).toEqual({ ok: false, reason: "NEISPRAVAN_DOKUMENT" });
    const parsed = parseMontageDoc(serializeTimeline(addMainClips(emptyTimeline(), [video("v1"), video("v2")])));
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.montage.durationS).toBe(6);
    expect(parsed.montage.jobIds).toEqual(["v1", "v2"]);
    const many = addMainClips(emptyTimeline(), Array.from({ length: 60 }, (_, index) => ({ ...video(`v${index}`), out: 1 })));
    const withAudio = Array.from({ length: 10 }, (_, index) => index).reduce(
      (timeline, index) => addAudio(timeline, { src: { jobId: `a${index}` }, in: 0, out: 1, start: 0, volumeDb: 0, role: "sfx", fadeIn: 0, fadeOut: 0 }).timeline,
      many,
    );
    const withOverlay = Array.from({ length: 20 }, (_, index) => index).reduce(
      (timeline, index) =>
        addOverlay(timeline, {
          src: { jobId: `p${index}` },
          media: "video",
          in: 0,
          out: 1,
          start: 0,
          rect: { x: 0.5, y: 0.5, w: 0.3, h: 0.3 },
          volumeDb: 0,
          muted: false,
        }).timeline,
      withAudio,
    );
    expect(parseMontageDoc(serializeTimeline(withOverlay))).toEqual({ ok: false, reason: "PREVISE_RADOVA" });
  });
});
