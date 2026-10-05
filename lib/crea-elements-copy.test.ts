import { describe, expect, test } from "vitest";

import { ELEMENT_KINDS } from "@/convex/creaElementsCore";
import {
  CREA_ELEMENT_KIND_COPY,
  CREA_ELEMENTS_COPY,
  CREA_MENTION_COPY,
  ELEMENT_ERROR_CODES,
  elementErrorMessage,
} from "./crea-elements-copy";

const wrap = (code: string) => `[CONVEX M(creaElements:saveElement)] Uncaught Error: ${code}\n    at handler`;

describe("tekstovi Likova", () => {
  test("svaka greška Likova ima svoju rečenicu na oba jezika, bez sirovog koda", () => {
    const messages = new Set<string>();
    for (const code of ELEMENT_ERROR_CODES) {
      for (const locale of ["sr", "en"] as const) {
        const message = elementErrorMessage(wrap(code), locale);
        expect(message, code).not.toContain("_");
        expect(message.length, code).toBeGreaterThan(10);
      }
      messages.add(elementErrorMessage(wrap(code), "sr"));
    }
    expect(messages.size).toBe(ELEMENT_ERROR_CODES.length);
  });

  test("greške posla (krediti, tuđ fajl) idu kroz postojeće poruke", () => {
    expect(elementErrorMessage(wrap("NEDOVOLJNO_KREDITA"), "sr")).toContain("kredita");
    expect(elementErrorMessage(wrap("TUDJI_FAJL"), "sr")).not.toContain("_");
  });

  test("vrste i problemi mapiranja imaju tekst", () => {
    for (const kind of ELEMENT_KINDS) {
      expect(CREA_ELEMENT_KIND_COPY[kind].one.sr).not.toBe("");
      expect(CREA_ELEMENT_KIND_COPY[kind].add.en).not.toBe("");
    }
    for (const problem of Object.values(CREA_MENTION_COPY.problems)) {
      expect(problem.sr.length).toBeGreaterThan(10);
      expect(problem.en.length).toBeGreaterThan(10);
    }
    expect(CREA_ELEMENTS_COPY.steps).toHaveLength(3);
  });
});
