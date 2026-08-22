import { describe, expect, it } from "vitest";

import {
  THEME_ATTRIBUTE,
  THEME_COLORS,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  themeColorFor,
} from "./theme";

describe("parseThemePreference", () => {
  it("accepts only the two explicit choices and falls back to system", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("auto")).toBe("system");
    expect(parseThemePreference("")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference(undefined)).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("follows prefers-color-scheme only while the preference is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("themeColorFor", () => {
  it("maps each resolved theme to its page background", () => {
    expect(themeColorFor("light")).toBe("#fffdf8");
    expect(themeColorFor("dark")).toBe("#0e1a2b");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("is a self-contained script that reads the same key and writes the same attribute as the provider", () => {
    expect(() => new Function(THEME_INIT_SCRIPT)).not.toThrow();
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_ATTRIBUTE));
    expect(THEME_INIT_SCRIPT).toContain("prefers-color-scheme: dark");
    expect(THEME_INIT_SCRIPT).toContain(THEME_COLORS.dark);
    expect(THEME_INIT_SCRIPT).toContain(THEME_COLORS.light);
  });

  it("resolves the stored preference before first paint the same way resolveTheme does", () => {
    const run = (stored: string | null, systemDark: boolean) => {
      const attributes = new Map<string, string>();
      const metaContent: string[] = [];
      const fakeWindow = {
        localStorage: { getItem: () => stored },
        matchMedia: () => ({ matches: systemDark }),
      };
      const fakeDocument = {
        documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) },
        querySelectorAll: () => [{ setAttribute: (_name: string, value: string) => metaContent.push(value) }],
      };
      new Function("window", "document", THEME_INIT_SCRIPT)(fakeWindow, fakeDocument);
      return { theme: attributes.get(THEME_ATTRIBUTE), metaContent };
    };

    expect(run(null, true)).toEqual({ theme: "dark", metaContent: [THEME_COLORS.dark] });
    expect(run(null, false)).toEqual({ theme: "light", metaContent: [THEME_COLORS.light] });
    expect(run("light", true).theme).toBe("light");
    expect(run("dark", false).theme).toBe("dark");
    expect(run("garbage", true).theme).toBe("dark");
  });

  it("leaves the document untouched when storage throws", () => {
    const attributes = new Map<string, string>();
    const fakeWindow = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
      matchMedia: () => ({ matches: true }),
    };
    const fakeDocument = {
      documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) },
      querySelectorAll: () => [],
    };
    expect(() => new Function("window", "document", THEME_INIT_SCRIPT)(fakeWindow, fakeDocument)).not.toThrow();
    expect(attributes.size).toBe(0);
  });
});
