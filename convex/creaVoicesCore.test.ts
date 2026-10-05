import { describe, expect, test } from "vitest";

import { buildPodcastRequest, demoPodcast, parsePodcastResponse, PODCAST_LIMITS, podcastLineCount } from "./creaLlmVoiceCore";
import {
  buildConsentTranscriptRequest,
  consentAudioType,
  libraryVoice,
  presetSettingsJson,
  readFalAudioUrl,
  sampleDecision,
  VOICE_SAMPLE_PENDING_MS,
  VOICE_SAMPLE_RETRY_MS,
} from "./creaVoicesCore";

const reply = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });

describe("glasovi (K22): čista logika", () => {
  test("uzorak: gotov se pusti, u izradi se čeka, neuspeh se ne ponavlja odmah", () => {
    const now = 1_000_000_000;
    expect(sampleDecision(null, now)).toBe("go");
    expect(sampleDecision({ status: "ready", attemptedAt: 0 }, now)).toBe("ready");
    expect(sampleDecision({ status: "pending", attemptedAt: now - 1000 }, now)).toBe("pending");
    expect(sampleDecision({ status: "pending", attemptedAt: now - VOICE_SAMPLE_PENDING_MS }, now)).toBe("go");
    expect(sampleDecision({ status: "failed", attemptedAt: now - 1000 }, now)).toBe("failed");
    expect(sampleDecision({ status: "failed", attemptedAt: now - VOICE_SAMPLE_RETRY_MS }, now)).toBe("go");
  });

  test("glas iz biblioteke, podešavanje, fal odgovor, tip snimka pristanka", () => {
    expect(libraryVoice("gemini", "Kore")?.gender).toBe("zenski");
    expect(libraryVoice("gemini", "Aria")).toBeUndefined();
    expect(libraryVoice("x", "Kore")).toBeUndefined();
    expect(JSON.parse(presetSettingsJson("nije json"))).toEqual({ mood: 0, speed: 1, pitch: 0, describe: "" });
    expect(readFalAudioUrl({ audio: { url: "https://v3.fal.media/files/a.mp3" } })).toBe("https://v3.fal.media/files/a.mp3");
    expect(readFalAudioUrl({ audio: { url: "javascript:alert(1)" } })).toBeNull();
    expect(readFalAudioUrl(null)).toBeNull();
    expect(consentAudioType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(consentAudioType("audio/x-wav")).toBe("audio/wav");
    expect(consentAudioType("video/mp4")).toBeNull();
    const request = buildConsentTranscriptRequest("QUJD", "audio/wav");
    expect(request.contents[0]?.parts[0]).toEqual({ inlineData: { mimeType: "audio/wav", data: "QUJD" } });
    expect(request.generationConfig.temperature).toBe(0);
  });
});

describe("podkast iz lekcije (A6): LLM šablon i čitanje", () => {
  test("dužina → broj replika, zahtev nosi jezik, imena i tekst", () => {
    expect(podcastLineCount(1)).toBe(9);
    expect(podcastLineCount(3)).toBe(27);
    expect(podcastLineCount(10)).toBe(PODCAST_LIMITS.linesMax);
    const request = buildPodcastRequest({ text: "Lekcija o AI.", minutes: 2, hosts: ["Ana", "Marko"], locale: "sr" });
    const user = request.contents[0]!.parts[0]!.text;
    expect(user).toContain("Serbian (Latin script)");
    expect(user).toContain("Host 1 is called Ana, host 2 is called Marko");
    expect(user).toContain("about 18 lines");
    expect(user).toContain("Lekcija o AI.");
    expect(request.generationConfig.responseMimeType).toBe("application/json");
  });

  test("odgovor: voditelj 1/2 → 0/1, prazne replike ispadaju, premalo replika = null", () => {
    const lines = [
      { host: 1, text: "Zdravo!" },
      { host: "2", text: "  Ćao,   Ana. " },
      { host: 1, text: "" },
      { host: 3, text: "Treći?" },
      { host: 2, text: "Kraj." },
    ];
    expect(parsePodcastResponse(reply(`\`\`\`json\n${JSON.stringify({ title: "Epizoda", lines })}\n\`\`\``))).toEqual({
      title: "Epizoda",
      lines: [
        { host: 0, text: "Zdravo!" },
        { host: 1, text: "Ćao, Ana." },
        { host: 0, text: "Treći?" },
        { host: 1, text: "Kraj." },
      ],
    });
    expect(parsePodcastResponse(reply(JSON.stringify({ lines: lines.slice(0, 2) })))).toBeNull();
    expect(parsePodcastResponse(reply("nije json"))).toBeNull();
    const long = Array.from({ length: 60 }, (_, index) => ({ host: (index % 2) + 1, text: "x".repeat(900) }));
    const parsed = parsePodcastResponse(reply(JSON.stringify({ lines: long })));
    expect(parsed?.lines).toHaveLength(PODCAST_LIMITS.linesMax);
    expect(parsed?.lines[0]?.text).toHaveLength(PODCAST_LIMITS.lineChars);
  });

  test("DEMO: uvod, rečenice lekcije naizmenično, odjava; uvek bar 4 replike", () => {
    const demo = demoPodcast({ text: "Prva rečenica. Druga rečenica! Treća?", minutes: 1, hosts: ["Ana", "Marko"], locale: "sr" });
    expect(demo.lines[0]?.text).toContain("Ana");
    expect(demo.lines.map((line) => line.text)).toContain("Druga rečenica!");
    expect(demo.lines.at(-1)?.host).toBe(1);
    expect(demoPodcast({ text: "Jedna.", minutes: 1, hosts: ["A", "B"], locale: "en" }).lines.length).toBeGreaterThanOrEqual(4);
  });
});
