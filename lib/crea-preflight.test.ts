/**
 * „Proveri pre objave" (K19, V30): svaka stavka - dužina (platforma i uređaj),
 * odnos, rezolucija, kuka u prve 2 s, natpisi i titlovi, sigurna zona, zvuk
 * (bez zvuka, tišina na početku, vrh) i veličina fajla - sa srpskom rečenicom
 * i popravkom gde postoji.
 */
import { describe, expect, test } from "vitest";

import { EXPORT_PRESETS } from "./crea-export-presets";
import { cuesFromText } from "./crea-subtitles";
import { canExport, formatSeconds, runPreflight, type PreflightAudio, type PreflightInput } from "./crea-preflight";
import { addMainClips, addTitle, emptyTimeline, type CreaTimelineV1, type NewMainClip } from "./crea-timeline";

const clip = (length: number): NewMainClip => ({
  src: { jobId: "a" },
  media: "video",
  in: 0,
  out: length,
  speed: 1,
  volumeDb: 0,
  muted: false,
  fit: "cover",
});

const GOOD_AUDIO: PreflightAudio = { audible: true, peakDb: -3, leadingSilenceS: 0, hasVoice: false };

function input(timeline: CreaTimelineV1, patch: Partial<PreflightInput> = {}): PreflightInput {
  return {
    timeline,
    preset: EXPORT_PRESETS.reels,
    output: { width: 1080, height: 1920 },
    deviceMaxS: 240,
    estimatedBytes: 10_000_000,
    audio: GOOD_AUDIO,
    ...patch,
  };
}

function find(items: ReturnType<typeof runPreflight>, id: string) {
  return items.find((item) => item.id === id);
}

const titled = (timeline: CreaTimelineV1) => addTitle(timeline, { text: "Pogledaj!", start: 0, end: 2, style: "naslov" }).timeline;

describe("provera pre objave", () => {
  test("dobra montaža prolazi i svaka poruka ima oba jezika", () => {
    const items = runPreflight(input(titled(addMainClips(emptyTimeline(), [clip(2), clip(3)]))));
    expect(canExport(items)).toBe(true);
    expect(items.filter((item) => item.level !== "ok")).toEqual([]);
    for (const item of items) expect(item.message.sr && item.message.en, item.id).toBeTruthy();
  });

  test("predugo za platformu: blokira i nudi „Skrati\"; uređaj ima svoju granicu", () => {
    const long = addMainClips(emptyTimeline(), [clip(100), clip(100)]);
    const platform = find(runPreflight(input(long)), "duzina");
    expect(platform).toMatchObject({ level: "block", fix: { kind: "skrati", seconds: 180 } });
    expect(platform?.message.sr).toContain("Instagram Reels");
    const device = find(runPreflight(input(addMainClips(emptyTimeline(), [clip(70)]), { deviceMaxS: 60 })), "duzina");
    expect(device).toMatchObject({ level: "block", fix: { kind: "skrati", seconds: 60 } });
    expect(device?.message.sr).toContain("na ovom uređaju");
    expect(find(runPreflight(input(addMainClips(emptyTimeline(), [clip(0.5)]))), "prekratko")?.level).toBe("block");
  });

  test("pogrešan odnos i mala rezolucija", () => {
    const timeline = titled(addMainClips(emptyTimeline("16:9"), [clip(2), clip(2)]));
    const items = runPreflight(input(timeline, { output: { width: 854, height: 480 } }));
    expect(find(items, "odnos")).toMatchObject({ level: "warn", fix: { kind: "odnos" } });
    expect(find(items, "rezolucija")?.level).toBe("tip");
  });

  test("kuka: bez natpisa i reza u prve 2 s je upozorenje sa popravkom", () => {
    const slow = addMainClips(emptyTimeline(), [clip(6), clip(3)]);
    expect(find(runPreflight(input(slow)), "kuka")).toMatchObject({ level: "warn", fix: { kind: "naslov-na-pocetak" } });
    const fastCut = addMainClips(emptyTimeline(), [clip(1.5), clip(3)]);
    expect(find(runPreflight(input(fastCut)), "kuka")?.level).toBe("ok");
    expect(find(runPreflight(input(titled(slow))), "kuka")?.level).toBe("ok");
  });

  test("natpisi: govor bez titla je upozorenje, bez ijednog natpisa savet", () => {
    const timeline = addMainClips(emptyTimeline(), [clip(1), clip(1)]);
    expect(find(runPreflight(input(timeline, { audio: { ...GOOD_AUDIO, hasVoice: true } })), "natpisi")?.level).toBe("warn");
    expect(find(runPreflight(input(timeline)), "natpisi")?.level).toBe("tip");
    const subtitled = addTitle(timeline, { text: "Zdravo svima", start: 0, end: 2, style: "titl" }).timeline;
    expect(find(runPreflight(input(subtitled, { audio: { ...GOOD_AUDIO, hasVoice: true } })), "natpisi")?.level).toBe("ok");
    // K21: utisnuti titlovi (`captions`) su titl i udica u prve 2 s.
    const slow = addMainClips(emptyTimeline(), [clip(6), clip(3)]);
    const captioned: CreaTimelineV1 = { ...slow, captions: { cues: cuesFromText("Zdravo svima, danas učimo montažu.", 4), style: "karaoke", script: "lat" } };
    expect(find(runPreflight(input(captioned, { audio: { ...GOOD_AUDIO, hasVoice: true } })), "natpisi")?.level).toBe("ok");
    expect(find(runPreflight(input(captioned)), "kuka")?.level).toBe("ok");
  });

  test("sigurna zona: natpis pod dugmadima je upozorenje sa popravkom", () => {
    const low = addTitle(addMainClips(emptyTimeline(), [clip(3)]), {
      text: "Dole",
      start: 0,
      end: 2,
      style: "titl",
      rect: { x: 0.1, y: 0.9, w: 0.8, h: 0.08 },
    }).timeline;
    expect(find(runPreflight(input(low)), "sigurna-zona")).toMatchObject({ level: "warn", fix: { kind: "sigurna-zona" } });
    expect(find(runPreflight(input(low, { preset: EXPORT_PRESETS.youtube, output: { width: 1920, height: 1080 } })), "sigurna-zona")?.level).toBe("warn");
  });

  test("zvuk: bez zvuka, tišina na početku i preglasno", () => {
    const timeline = titled(addMainClips(emptyTimeline(), [clip(2), clip(2)]));
    expect(find(runPreflight(input(timeline, { audio: { ...GOOD_AUDIO, audible: false } })), "bez-zvuka")?.level).toBe("tip");
    expect(find(runPreflight(input(timeline, { audio: { ...GOOD_AUDIO, leadingSilenceS: 1.6 } })), "tisina-na-pocetku")?.message.sr).toContain("1,6 s");
    expect(find(runPreflight(input(timeline, { audio: { ...GOOD_AUDIO, peakDb: -0.2 } })), "zvuk-vrh")).toMatchObject({
      level: "warn",
      fix: { kind: "utisaj" },
    });
    // GIF nema zvuk ni proveru zvuka.
    const gif = runPreflight(input(timeline, { preset: EXPORT_PRESETS.gif, output: { width: 270, height: 480 }, audio: null }));
    expect(gif.some((item) => item.id === "bez-zvuka" || item.id === "zvuk-vrh" || item.id === "rezolucija")).toBe(false);
  });

  test("prevelik fajl blokira i nudi manju rezoluciju", () => {
    const items = runPreflight(input(titled(addMainClips(emptyTimeline(), [clip(2), clip(2)])), { estimatedBytes: 300 * 1024 * 1024 }));
    expect(find(items, "velicina")).toMatchObject({ level: "block", fix: { kind: "manja-rezolucija" } });
    expect(canExport(items)).toBe(false);
  });

  test("trajanje u poruci", () => {
    expect(formatSeconds(12.46, "sr")).toBe("12,5 s");
    expect(formatSeconds(12.46, "en")).toBe("12.5 s");
    expect(formatSeconds(65, "sr")).toBe("1 min 5 s");
    expect(formatSeconds(180, "en")).toBe("3 min");
  });
});
