import { describe, expect, it } from "vitest";

import { isValidLocalizedPair } from "./localized-copy";

describe("localized inline copy", () => {
  it("requires both locales or neither", () => {
    expect(isValidLocalizedPair("", "")).toBe(true);
    expect(isValidLocalizedPair("Naslov", "Title")).toBe(true);
    expect(isValidLocalizedPair("Naslov", "")).toBe(false);
    expect(isValidLocalizedPair("", "Title")).toBe(false);
  });
});
