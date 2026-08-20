import { describe, expect, test } from "vitest";

import { MAX_PROMPT_LENGTH } from "@/convex/creditsCore";
import {
  CREDITS_NO_BALANCE,
  CREDITS_NO_HISTORY,
  CREDITS_NO_PACKS,
  deleteJobErrorMessage,
  GALLERY_NO_GENERATIONS,
  GALLERY_NO_MATCHES,
  PROMPT_MAX_LENGTH,
  STUDIO_NOT_ENROLLED,
  STUDIO_NO_GENERATIONS,
  STUDIO_PAUSED,
  studioErrorMessage,
  type EmptyState,
} from "@/lib/studio-messages";

/** Ovako Convex klijent umota grešku bačenu u mutaciji. */
const wrap = (code: string) =>
  `[CONVEX M(studio:createJob)] [Request ID: abc123] Server Error\nUncaught Error: ${code}\n    at handler (../convex/studio.ts:120:13)`;

describe("granica prompta", () => {
  test("forma i server broje do iste dužine", () => {
    // Vrednost je namerno duplirana (da moderacijski rečnik ne uđe u bundle),
    // pa ovaj test postoji da se ne raziđe.
    expect(PROMPT_MAX_LENGTH).toBe(MAX_PROMPT_LENGTH);
  });
});

describe("studioErrorMessage", () => {
  const codes = [
    "STUDIO_PAUZIRAN",
    "NIJE_UPISAN",
    "ZADATAK_BEZ_LEKCIJE",
    "ZADATAK_NIJE_U_LEKCIJI",
    "NEISPRAVNO_TRAJANJE",
    "NEISPRAVNI_PARAMETRI",
    "NEISPRAVAN_PROMPT:PRAZAN_PROMPT",
    "NEISPRAVAN_PROMPT:PREDUGACAK_PROMPT",
    "NEISPRAVAN_PROMPT:ZABRANJEN_POJAM",
    "MODEL_NEDOSTUPAN",
    "PREVISE_POSLOVA",
    "DNEVNI_LIMIT",
    "DNEVNI_LIMIT_TROSKA",
    "NEDOVOLJNO_KREDITA",
    "TUDJI_FAJL",
  ];

  test("nijedna poruka ne prikazuje sirov kod greške", () => {
    for (const code of codes) {
      for (const locale of ["sr", "en"] as const) {
        const message = studioErrorMessage(wrap(code), locale);
        expect(message).not.toContain("_");
        expect(message).not.toContain("CONVEX");
        expect(message.length).toBeGreaterThan(10);
      }
    }
  });

  test("svaki kod ima svoju poruku, ne zajedničku", () => {
    const messages = codes.map((code) => studioErrorMessage(wrap(code), "sr"));
    expect(new Set(messages).size).toBe(messages.length);
  });

  test("DNEVNI_LIMIT_TROSKA se ne čita kao DNEVNI_LIMIT", () => {
    expect(studioErrorMessage(wrap("DNEVNI_LIMIT_TROSKA"), "sr")).toContain("potrošnje");
    expect(studioErrorMessage(wrap("DNEVNI_LIMIT"), "sr")).not.toContain("potrošnje");
  });

  test("razlozi prompta se razlikuju međusobno i od opšte poruke", () => {
    expect(studioErrorMessage(wrap("NEISPRAVAN_PROMPT:PRAZAN_PROMPT"), "sr")).toContain("Napiši prompt");
    expect(studioErrorMessage(wrap("NEISPRAVAN_PROMPT:PREDUGACAK_PROMPT"), "sr")).toContain("2000");
    expect(studioErrorMessage(wrap("NEISPRAVAN_PROMPT:ZABRANJEN_POJAM"), "sr")).toContain("ne generiše");
    expect(studioErrorMessage(wrap("NEISPRAVAN_PROMPT:NEPOZNATO"), "sr")).toContain("nije prihvaćen");
  });

  test("zadatak bez lekcije i zadatak van lekcije imaju različite poruke", () => {
    expect(studioErrorMessage(wrap("ZADATAK_BEZ_LEKCIJE"), "sr")).not.toBe(
      studioErrorMessage(wrap("ZADATAK_NIJE_U_LEKCIJI"), "sr"),
    );
  });

  test("nepoznata greška daje ljudsku poruku, ne prazan ekran", () => {
    const message = studioErrorMessage("TypeError: fetch failed", "sr");
    expect(message).toContain("Pokušaj ponovo");
    expect(studioErrorMessage("TypeError: fetch failed", "en")).toContain("Try again");
  });

  test("obe lokalizacije postoje i razlikuju se", () => {
    expect(studioErrorMessage(wrap("NEDOVOLJNO_KREDITA"), "sr")).not.toBe(
      studioErrorMessage(wrap("NEDOVOLJNO_KREDITA"), "en"),
    );
  });
});

describe("deleteJobErrorMessage", () => {
  test("prepoznaje oba imenovana koda i pada na opštu poruku", () => {
    expect(deleteJobErrorMessage("Error: POSAO_U_TOKU", "sr")).toMatch(/još u obradi/);
    expect(deleteJobErrorMessage("Error: POSAO_U_TOKU", "en")).toMatch(/still in progress/);
    expect(deleteJobErrorMessage("Error: POSAO_POVEZAN_SA_LEKCIJOM", "sr")).toMatch(/dokaz za zadatak/);
    expect(deleteJobErrorMessage("Error: POSAO_POVEZAN_SA_LEKCIJOM", "en")).toMatch(/evidence for a lesson/);
    expect(deleteJobErrorMessage("Nešto sasvim drugo", "sr")).toBe("Brisanje nije uspelo. Pokušaj ponovo.");
    expect(deleteJobErrorMessage("Nešto sasvim drugo", "en")).toBe("Delete failed. Try again.");
  });
});

describe("prazna stanja", () => {
  const EMPTY_STATES: Array<[string, EmptyState]> = [
    ["STUDIO_PAUSED", STUDIO_PAUSED],
    ["STUDIO_NOT_ENROLLED", STUDIO_NOT_ENROLLED],
    ["STUDIO_NO_GENERATIONS", STUDIO_NO_GENERATIONS],
    ["CREDITS_NO_BALANCE", CREDITS_NO_BALANCE],
    ["CREDITS_NO_PACKS", CREDITS_NO_PACKS],
    ["CREDITS_NO_HISTORY", CREDITS_NO_HISTORY],
    ["GALLERY_NO_GENERATIONS", GALLERY_NO_GENERATIONS],
    ["GALLERY_NO_MATCHES", GALLERY_NO_MATCHES],
  ];

  test("svako prazno stanje ima naslov, rečenicu i sledeći korak na oba jezika", () => {
    for (const [name, state] of EMPTY_STATES) {
      for (const locale of ["sr", "en"] as const) {
        expect(state.title[locale], `${name}.title.${locale}`).toBeTruthy();
        expect(state.body[locale], `${name}.body.${locale}`).toBeTruthy();
        expect(state.cta[locale], `${name}.cta.${locale}`).toBeTruthy();
      }
      expect(state.title.sr).not.toBe(state.title.en);
      expect(state.body.sr).not.toBe(state.body.en);
      expect(state.cta.sr).not.toBe(state.cta.en);
    }
  });
});
