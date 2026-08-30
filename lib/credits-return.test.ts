import { expect, test } from "vitest";

import { creditsReturnPath } from "./credits-return";

test("creditsReturnPath: samo 'studio' vodi u samostalni shell, sve ostalo na /app/credits", () => {
  expect(creditsReturnPath("studio")).toBe("/studio/krediti");
  expect(creditsReturnPath("app")).toBe("/app/credits");
  expect(creditsReturnPath(undefined)).toBe("/app/credits");
  expect(creditsReturnPath(null)).toBe("/app/credits");
  // Klijent ne može da podmetne proizvoljan URL - kontekst nije putanja.
  expect(creditsReturnPath("https://zlo.example")).toBe("/app/credits");
  expect(creditsReturnPath("/studio/krediti")).toBe("/app/credits");
  expect(creditsReturnPath({ toString: () => "studio" })).toBe("/app/credits");
});
