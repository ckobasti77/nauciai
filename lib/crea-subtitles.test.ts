import { describe, expect, it } from "vitest";

import {
  CAPTION_STYLE_LABELS,
  CAPTION_STYLES,
  cueIndexAt,
  cueLines,
  cueOptionsFor,
  cuesFromText,
  cuesFromWords,
  cueText,
  isWeakWord,
  karaokeAt,
  regroupCues,
  replaceCueText,
  syllableCount,
  toSrt,
  toVtt,
  transliterateCues,
  transliterateText,
  wordsFromText,
  wordsInRange,
  type CaptionWord,
} from "./crea-subtitles";

/** Reči jednog za drugim, svaka `step` s, bez pauza. */
function spoken(text: string, step = 0.4, start = 0): CaptionWord[] {
  return text.split(" ").map((w, index) => ({ w, s: start + index * step, e: start + (index + 1) * step - 0.02 }));
}

describe("titlovi iz reči", () => {
  it("lomi na 42 znaka i najviše 2 reda", () => {
    const words = spoken(
      "Danas učimo kako da napravimo kratak video za društvene mreže i kako da ga ozvučimo bez skupih programa na računaru ili telefonu",
      0.3,
    );
    const cues = cuesFromWords(words);
    expect(cues.length).toBeGreaterThan(1);
    for (const cue of cues) {
      const lines = cueLines(cue.words, 42, 2);
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const line of lines) expect(line.map((word) => word.w).join(" ").length).toBeLessThanOrEqual(42);
      expect(cueText(cue).length).toBeLessThanOrEqual(84);
    }
    // Ništa se ne gubi i redosled ostaje.
    expect(cues.flatMap((cue) => cue.words.map((word) => word.w)).join(" ")).toBe(words.map((word) => word.w).join(" "));
  });

  it("ne ostavlja „i/u/na/da/za/sa/je” na kraju titla ni prvog reda", () => {
    const words = spoken("Ovo je jako dugačka rečenica koja ide dalje i dalje bez prestanka sa mnogo reči u sebi da bi se prelomila na", 0.25);
    const cues = cuesFromWords(words);
    for (const cue of cues.slice(0, -1)) expect(isWeakWord(cue.words[cue.words.length - 1]!.w)).toBe(false);
    for (const cue of cues) {
      const lines = cueLines(cue.words, 42, 2);
      if (lines.length === 2) expect(isWeakWord(lines[0]![lines[0]!.length - 1]!.w)).toBe(false);
    }
    expect(["i", "u", "na", "da", "za", "sa", "je"].every((word) => isWeakWord(word))).toBe(true);
  });

  it("nov titl posle pauze, kraja rečenice, promene govornika i posle najdužeg trajanja", () => {
    const pause = cuesFromWords([
      { w: "Zdravo", s: 0, e: 0.4 },
      { w: "svima", s: 0.45, e: 0.8 },
      { w: "evo", s: 2, e: 2.3 },
    ]);
    expect(pause.map(cueText)).toEqual(["Zdravo svima", "evo"]);

    const sentence = cuesFromWords(spoken("Kraj. Novi početak"));
    expect(sentence.map(cueText)).toEqual(["Kraj.", "Novi početak"]);

    const speakers = cuesFromWords([
      { w: "Pitanje?", s: 0, e: 0.4, speaker: "a" },
      { w: "Odgovor", s: 0.45, e: 0.8, speaker: "b" },
    ]);
    expect(speakers).toHaveLength(2);

    const slow = cuesFromWords(spoken("jedan dva tri četiri pet šest sedam osam devet deset", 0.9));
    for (const cue of slow) expect(cue.words[cue.words.length - 1]!.e - cue.words[0]!.s).toBeLessThanOrEqual(6 + 1e-9);
  });

  it("titl traje bar 1 s, ali ne preko početka sledećeg", () => {
    const cues = cuesFromWords([
      { w: "Da.", s: 0, e: 0.2 },
      { w: "Ne.", s: 0.6, e: 0.8 },
      { w: "Možda.", s: 3, e: 3.2 },
    ]);
    expect(cues[0]!.end).toBeCloseTo(0.6);
    expect(cues[1]!.end).toBeCloseTo(1.6);
    expect(cues[2]!.end).toBeCloseTo(4);
  });

  it("„veliki” stil ima kratke titlove od jednog reda", () => {
    const words = spoken("ovo je stil za kratke klipove gde se vide samo dve ili tri reči odjednom");
    const big = cuesFromWords(words, cueOptionsFor("veliki"));
    for (const cue of big) expect(cueText(cue).length).toBeLessThanOrEqual(16);
    expect(regroupCues(cuesFromWords(words), "veliki").length).toBe(big.length);
  });
});

describe("SRT i VTT", () => {
  const cues = cuesFromWords([
    { w: "Zdravo,", s: 1, e: 1.5 },
    { w: "Beograde!", s: 1.5, e: 2.25 },
    { w: "Kako", s: 3661.2, e: 3661.5 },
    { w: "si?", s: 3661.5, e: 3662.0 },
  ]);

  it("SRT: redni broj, zarez u milisekundama, prazan red između", () => {
    expect(toSrt(cues)).toBe("1\n00:00:01,000 --> 00:00:02,250\nZdravo, Beograde!\n\n2\n01:01:01,200 --> 01:01:02,200\nKako si?\n");
  });

  it("VTT: zaglavlje i tačka u milisekundama", () => {
    expect(toVtt(cues)).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.250\nZdravo, Beograde!\n\n01:01:01.200 --> 01:01:02.200\nKako si?\n");
  });

  it("dugačak titl ide u dva reda", () => {
    const long = cuesFromWords(spoken("Ovo je titl koji je predugačak za jedan red pa mora u dva"));
    const srt = toSrt(long);
    expect(srt.split("\n")[2]!.length).toBeLessThanOrEqual(42);
    expect(srt.split("\n")[3]!.length).toBeGreaterThan(0);
  });
});

describe("karaoke", () => {
  const cues = cuesFromWords(spoken("prva druga treća", 0.5).concat({ w: "posle", s: 5, e: 5.4 }));

  it("nalazi titl i reč koja se upravo izgovara", () => {
    expect(karaokeAt(cues, 0.1)).toEqual({ cueIndex: 0, wordIndex: 0 });
    expect(karaokeAt(cues, 0.75)).toEqual({ cueIndex: 0, wordIndex: 1 });
    expect(karaokeAt(cues, 1.2)).toEqual({ cueIndex: 0, wordIndex: 2 });
    expect(karaokeAt(cues, 5.1)).toEqual({ cueIndex: 1, wordIndex: 0 });
    expect(karaokeAt(cues, 3)).toBeNull();
    expect(cueIndexAt(cues, 99)).toBe(-1);
  });
});

describe("latinica ↔ ćirilica", () => {
  it("dvoslovna slova Lj, Nj, Dž u oba smera, i velika slova", () => {
    expect(transliterateText("Ljubav, njiva i džep. NJEGOŠ i LJILJANA. Džo", "cyr")).toBe("Љубав, њива и џеп. ЊЕГОШ и ЉИЉАНА. Џо");
    expect(transliterateText("Љубав, њива и џеп. ЊЕГОШ и ЉИЉАНА. Џо", "lat")).toBe("Ljubav, njiva i džep. NJEGOŠ i LJILJANA. Džo");
  });

  it("č ć š ž đ i tamo-nazad bez gubitka", () => {
    const text = "Čačak, Ćuprija, Šabac, Žabalj i Đurđevdan";
    const cyr = transliterateText(text, "cyr");
    expect(cyr).toBe("Чачак, Ћуприја, Шабац, Жабаљ и Ђурђевдан");
    expect(transliterateText(cyr, "lat")).toBe(text);
  });

  it("strane reči, adrese i oznake ostaju latinicom", () => {
    expect(transliterateText("Uključi Wi-Fi i prati @crea na www.nauciai.com", "cyr")).toBe("Укључи Wi-Fi и прати @crea на www.nauciai.com");
  });

  it("pismo titlova menja tekst, a ne vremena", () => {
    const cues = cuesFromWords(spoken("Zdravo đaci"));
    const cyr = transliterateCues(cues, "cyr");
    expect(cyr.map(cueText)).toEqual(["Здраво ђаци"]);
    expect(cyr[0]!.words.map((word) => [word.s, word.e])).toEqual(cues[0]!.words.map((word) => [word.s, word.e]));
  });
});

describe("tekst bez vremena", () => {
  it("slogovi, i slogotvorno r", () => {
    expect(syllableCount("Beograd")).toBe(3);
    expect(syllableCount("prst")).toBe(1);
    expect(syllableCount("Србија")).toBe(3);
    expect(syllableCount("i")).toBe(1);
  });

  it("reči pokrivaju ceo opseg, duže reči traju duže, pauza posle tačke", () => {
    const words = wordsFromText("Ja učim. Programiranje je zabavno", 2, 12);
    expect(words[0]!.s).toBe(2);
    expect(words[words.length - 1]!.e).toBeCloseTo(12, 2);
    const ja = words[0]!;
    const programiranje = words.find((word) => word.w === "Programiranje")!;
    expect(programiranje.e - programiranje.s).toBeGreaterThan(ja.e - ja.s);
    const ucim = words[1]!;
    expect(programiranje.s - ucim.e).toBeGreaterThan(0.1);
    for (let index = 1; index < words.length; index++) expect(words[index]!.s).toBeGreaterThanOrEqual(words[index - 1]!.e - 1e-9);
  });

  it("cuesFromText traje koliko i video", () => {
    const cues = cuesFromText("Prva rečenica. Druga rečenica je malo duža od prve.", 8);
    expect(cues[0]!.start).toBe(0);
    expect(cues[cues.length - 1]!.end).toBeCloseTo(8, 1);
    expect(cuesFromText("   ", 8)).toEqual([]);
  });

  it("izmena teksta titla zadržava vreme, a prazan tekst briše titl", () => {
    const cues = cuesFromWords(spoken("jedan dva. tri četiri"));
    const edited = replaceCueText(cues, 0, "Jedan, dva, tri");
    expect(edited[0]!.start).toBe(cues[0]!.start);
    expect(edited[0]!.end).toBe(cues[0]!.end);
    expect(cueText(edited[0]!)).toBe("Jedan, dva, tri");
    expect(replaceCueText(cues, 0, "  ")).toHaveLength(cues.length - 1);
  });

  it("reči iz dela dugog videa počinju od nule", () => {
    const words = spoken("a b c d e f", 1);
    expect(wordsInRange(words, 2, 4).map((word) => [word.w, word.s])).toEqual([
      ["c", 0],
      ["d", 1],
    ]);
  });

  it("svaki stil ima naziv i objašnjenje na oba jezika", () => {
    for (const style of CAPTION_STYLES) {
      expect(CAPTION_STYLE_LABELS[style].label.sr.length).toBeGreaterThan(0);
      expect(CAPTION_STYLE_LABELS[style].hint.en.length).toBeGreaterThan(0);
    }
  });
});
