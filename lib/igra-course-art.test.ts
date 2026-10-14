import { describe, expect, it } from "vitest";

import { courses } from "./content";
import { igraArtOrNull, igraLikArt, IGRA_LIKOVI } from "./igra-art";
import { courseCardState, courseLik } from "./igra-course-art";

const course = (slug: string, sr = "", en = "", trackSlug?: string) => ({ slug, trackSlug, title: { sr, en } });

describe("courseLik", () => {
  it("bira lik po temi kursa, na oba jezika", () => {
    expect(courseLik(course("ai-video", "AI video od nule", "AI video from scratch"))).toBe("kadar");
    expect(courseLik(course("k1", "Montaža za početnike", "Editing for beginners"))).toBe("kadar");
    expect(courseLik(course("k2", "Glas i muzika uz AI", "Voice and music with AI"))).toBe("eho");
    expect(courseLik(course("k3", "Prvi podkast", "Your first podcast"))).toBe("eho");
    expect(courseLik(course("k4", "AI slike za početnike", "AI images for beginners"))).toBe("piksi");
    expect(courseLik(course("k5", "Dizajn plakata", "Poster design"))).toBe("piksi");
    expect(courseLik(course("k6", "Sajt bez koda", "A site without code"))).toBe("bajt");
    expect(courseLik(course("k7", "Automatizacije", "Automations"))).toBe("bajt");
    expect(courseLik(course("vibe-coding", "Prvi projekat", "First project"))).toBe("bajt");
  });

  it("bez pogotka kurs pripada Sovi", () => {
    expect(courseLik(course("promptovi-koji-rade", "Promptovi koji rade", "Prompts that work"))).toBe("sova");
    expect(courseLik(course("", "", ""))).toBe("sova");
  });

  it("pravila idu redom: video pobeđuje audio, zvuk pobeđuje sliku", () => {
    expect(courseLik(course("video-audio-ai", "Kurs za video i audio", "Video and audio course"))).toBe("kadar");
    expect(courseLik(course("k", "Zvuk i slika", "Sound and image"))).toBe("eho");
    expect(courseLik(course("k", "Foto za sajt", "Photos for a site"))).toBe("piksi");
  });

  it("ključna reč mora da počinje reč", () => {
    expect(courseLik(course("freelance", "Freelance uz AI", "Freelancing with AI"))).toBe("sova");
    expect(courseLik(course("k", "Robot i ja", "The robot and me"))).toBe("sova");
    expect(courseLik(course("k", "Oglasi koji prodaju", "Ads that sell"))).toBe("sova");
    expect(courseLik(course("k", "Terapija pisanjem", "Therapy through writing"))).toBe("sova");
  });

  it("smer se pita tek kad kurs sam ne kaže ništa", () => {
    expect(courseLik(course("uvod", "Uvod", "Intro", "video-audio"))).toBe("kadar");
    expect(courseLik(course("uvod", "Uvod", "Intro", "websites"))).toBe("bajt");
    expect(courseLik(course("k", "Glas i muzika uz AI", "Voice and music with AI", "video-audio"))).toBe("eho");
    expect(courseLik(course("k", "AI slike za početnike", "AI images for beginners", "video-audio"))).toBe("piksi");
  });

  it("ne mari za kvačice i velika slova", () => {
    expect(courseLik(course("k", "MONTAŽA", ""))).toBe("kadar");
    expect(courseLik(course("k", "Dođi na Sajt", ""))).toBe("bajt");
  });

  it("kursevi iz kataloga dobijaju svoj lik, a svaki lik ima sliku", () => {
    expect(courses.map((item) => [item.slug, courseLik(item)])).toEqual([
      ["video-audio-ai", "kadar"],
      ["vibe-coding", "bajt"],
    ]);
    for (const lik of IGRA_LIKOVI) expect(igraArtOrNull(igraLikArt(lik, "mase")), lik).not.toBeNull();
  });
});

describe("courseCardState", () => {
  it("nije počet, u toku, završen", () => {
    expect(courseCardState({ completedLessons: 0, totalLessons: 9 })).toBe("new");
    expect(courseCardState({ completedLessons: 3, totalLessons: 9 })).toBe("progress");
    expect(courseCardState({ completedLessons: 9, totalLessons: 9 })).toBe("done");
    expect(courseCardState({ completedLessons: 12, totalLessons: 9 })).toBe("done");
  });

  it("kurs bez lekcija nije završen", () => {
    expect(courseCardState({ completedLessons: 0, totalLessons: 0 })).toBe("new");
  });
});
