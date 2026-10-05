import { describe, expect, test } from "vitest";

import { studioModelBySlug } from "@/convex/providers/catalogModels";

import {
  concatSpeech,
  DIALOGUE_LIMITS,
  dialogueCost,
  emptyDialogue,
  lineFingerprint,
  lineJob,
  linesToMake,
  lineStatus,
  mergeOrder,
  newSpeaker,
  nextId,
  parseScript,
  sanitizeDialogueDoc,
  sanitizeTakes,
  type DialogueDoc,
  type LineTake,
} from "./crea-dialogue";
import { jobCredits } from "./crea-job-price";
import { speechChars } from "./crea-voice-tags";

const catalog = ["gemini-tts", "tts"].map((slug) => studioModelBySlug(slug)!);

function podcast(): DialogueDoc {
  return {
    v: 1,
    title: "Epizoda 1",
    speakers: [
      { id: "g1", name: "Ana", engine: "gemini", voiceId: "Kore", mood: 1 },
      { id: "g2", name: "Marko", engine: "eleven", voiceId: "George", mood: 0 },
    ],
    lines: [
      { id: "r1", speakerId: "g1", text: "Dobro došli u naš podkast! ".repeat(20) },
      { id: "r2", speakerId: "g2", text: "Hvala, Ana. Danas pričamo o veštačkoj inteligenciji. [smeje se]" },
      { id: "r3", speakerId: "g1", text: "Krenimo od najjednostavnijeg primera." },
    ],
  };
}

/** Sve replike već imaju gotov snimak (kao posle prvog „Napravi"). */
function allMade(doc: DialogueDoc): Record<string, LineTake> {
  const takes: Record<string, LineTake> = {};
  for (const entry of linesToMake(doc, {})) takes[entry.line.id] = { jobId: `job-${entry.line.id}`, fingerprint: entry.fingerprint };
  return takes;
}

describe("plaća se samo izmenjena replika (A5)", () => {
  test("izmena JEDNE replike: pravi se i naplaćuje samo ona, ostale ostaju gotove", () => {
    const doc = podcast();
    const first = dialogueCost(doc, {}, catalog);
    expect(first.lines).toBe(3);

    const takes = allMade(doc);
    expect(linesToMake(doc, takes)).toEqual([]);
    expect(dialogueCost(doc, takes, catalog)).toEqual({ credits: 0, lines: 0, chars: 0 });

    const edited: DialogueDoc = { ...doc, lines: doc.lines.map((line) => (line.id === "r2" ? { ...line, text: "Hvala, Ana. Danas pričamo o glasu." } : line)) };
    const todo = linesToMake(edited, takes);
    expect(todo.map((entry) => entry.line.id)).toEqual(["r2"]);
    expect(lineStatus(edited, edited.lines[0]!, takes)).toBe("gotova");
    expect(lineStatus(edited, edited.lines[1]!, takes)).toBe("izmenjena");
    expect(lineStatus(edited, edited.lines[2]!, takes)).toBe("gotova");

    // Cena izmene = cena te jedne replike, ne celog dijaloga.
    const job = lineJob(edited, edited.lines[1]!)!;
    const single = jobCredits({ ...job, measured: { char_count: speechChars(job) } }, catalog);
    const cost = dialogueCost(edited, takes, catalog);
    expect(cost).toEqual({ credits: single, lines: 1, chars: speechChars(job) });
    expect(cost.credits!).toBeLessThan(first.credits!);
  });

  test("promena glasa govornika pravi ponovo samo NJEGOVE replike; ista replika vraćena = gotova", () => {
    const doc = podcast();
    const takes = allMade(doc);
    const otherVoice: DialogueDoc = { ...doc, speakers: doc.speakers.map((speaker) => (speaker.id === "g1" ? { ...speaker, voiceId: "Leda" } : speaker)) };
    expect(linesToMake(otherVoice, takes).map((entry) => entry.line.id)).toEqual(["r1", "r3"]);
    // Raspoloženje je deo glasa: menja otisak.
    const calmer: DialogueDoc = { ...doc, speakers: doc.speakers.map((speaker) => (speaker.id === "g2" ? { ...speaker, mood: -1 } : speaker)) };
    expect(linesToMake(calmer, takes).map((entry) => entry.line.id)).toEqual(["r2"]);
    // Razmaci na krajevima ne menjaju posao.
    const spaced: DialogueDoc = { ...doc, lines: doc.lines.map((line) => ({ ...line, text: `  ${line.text}  ` })) };
    expect(linesToMake(spaced, takes)).toEqual([]);
  });

  test("nova replika je „nova\", prazna se ne pravi i ne plaća", () => {
    const doc = podcast();
    const takes = allMade(doc);
    const grown: DialogueDoc = {
      ...doc,
      lines: [...doc.lines, { id: "r4", speakerId: "g2", text: "Tako je." }, { id: "r5", speakerId: "g1", text: "   " }],
    };
    expect(lineStatus(grown, grown.lines[3]!, takes)).toBe("nova");
    expect(lineStatus(grown, grown.lines[4]!, takes)).toBe("prazna");
    expect(linesToMake(grown, takes).map((entry) => entry.line.id)).toEqual(["r4"]);
  });

  test("otisak je posao koji ide serveru (motor, model, glas, tekst)", () => {
    const doc = podcast();
    const gemini = lineJob(doc, doc.lines[2]!)!;
    const eleven = lineJob(doc, doc.lines[1]!)!;
    expect(gemini.modelSlug).toBe("gemini-tts");
    expect(eleven.modelSlug).toBe("tts");
    expect(eleven.params.text).toContain("[laughs]");
    expect(lineFingerprint(gemini)).not.toBe(lineFingerprint(eleven));
    expect(lineFingerprint({ ...gemini, params: { voice: gemini.params.voice!, text: gemini.params.text!, style: gemini.params.style! } })).toBe(lineFingerprint(gemini));
  });
});

describe("spajanje na uređaju (0 kr)", () => {
  test("redom scenarija, samo gotove replike", () => {
    const doc = podcast();
    const takes = allMade(doc);
    const edited: DialogueDoc = { ...doc, lines: doc.lines.map((line) => (line.id === "r1" ? { ...line, text: "Nova uvodna replika." } : line)) };
    expect(mergeOrder(edited, takes)).toEqual([
      { lineId: "r2", jobId: "job-r2" },
      { lineId: "r3", jobId: "job-r3" },
    ]);
  });

  test("tišina između replika, dužina tačna", () => {
    const merged = concatSpeech([new Float32Array([1, 1]), new Float32Array([0.5]), new Float32Array([0.25, 0.25, 0.25])], 10, 0.2);
    expect(Array.from(merged)).toEqual([1, 1, 0, 0, 0.5, 0, 0, 0.25, 0.25, 0.25]);
    expect(concatSpeech([], 24000)).toHaveLength(0);
  });
});

describe("scenario, govornici, nepouzdan unos", () => {
  test("„Ime: replika\" pravi govornike; red bez imena nastavlja prethodnog", () => {
    const doc = parseScript("Ana: Zdravo svima!\nMarko: Zdravo, Ana.\nKako ste danas?\n\nAna: Odlično.");
    expect(doc.speakers.map((speaker) => speaker.name)).toEqual(["Ana", "Marko"]);
    expect(doc.lines.map((line) => [line.speakerId, line.text])).toEqual([
      ["g1", "Zdravo svima!"],
      ["g2", "Zdravo, Ana."],
      ["g2", "Kako ste danas?"],
      ["g1", "Odlično."],
    ]);
  });

  test("najviše 10 govornika i 40 replika; novi govornici smenjuju glasove", () => {
    const script = Array.from({ length: 50 }, (_, index) => `Osoba${index % 12}: replika ${index}`).join("\n");
    const doc = parseScript(script);
    expect(doc.speakers).toHaveLength(DIALOGUE_LIMITS.speakers);
    expect(doc.lines).toHaveLength(DIALOGUE_LIMITS.lines);
    expect(new Set(doc.speakers.map((speaker) => speaker.voiceId)).size).toBe(10);
    expect(newSpeaker(0).voiceId).not.toBe(newSpeaker(1).voiceId);
    expect(nextId("g", doc.speakers)).toBe("g11");
    expect(nextId("r", [])).toBe("r1");
  });

  test("nacrt iz localStorage-a: loš oblik se odbija, nepoznat glas se ispravlja, tuđi snimci ispadaju", () => {
    expect(sanitizeDialogueDoc(null)).toBeNull();
    expect(sanitizeDialogueDoc({ v: 2, speakers: [], lines: [] })).toBeNull();
    const doc = sanitizeDialogueDoc({
      v: 1,
      title: "T",
      speakers: [{ id: "g1", name: "Ana", engine: "gemini", voiceId: "Nepostojeci", mood: 9 }, { id: "x", engine: "openai" }],
      lines: [{ id: "r1", speakerId: "g1", text: "Zdravo" }, { id: "r2", speakerId: "g9", text: "tuđ govornik" }, { id: "bad", speakerId: "g1", text: "x" }],
    });
    expect(doc).toEqual({ v: 1, title: "T", speakers: [{ id: "g1", name: "Ana", engine: "gemini", voiceId: "Sulafat", mood: 2 }], lines: [{ id: "r1", speakerId: "g1", text: "Zdravo" }] });
    expect(sanitizeTakes({ r1: { jobId: "j1", fingerprint: "f" }, r7: { jobId: "j7", fingerprint: "f" }, r2: "x" }, doc!)).toEqual({ r1: { jobId: "j1", fingerprint: "f" } });
    expect(emptyDialogue().speakers).toHaveLength(2);
  });
});
