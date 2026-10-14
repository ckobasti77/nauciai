import { describe, expect, it } from "vitest";

import { igraArtOrNull } from "./igra-art";
import { IGRA_DAYPARTS, dashboardGreeting, dashboardRobiLine, dashboardSceneArt, igraDaypart, igraDaypartAt } from "./igra-daypart";
import type { Locale } from "./i18n";

const LOCALES: Locale[] = ["sr", "en"];
/** Reči pretnje i žurbe kojih u tekstovima table ne sme da bude (O9). */
const FEAR = /izgubi|propusti|požuri|kazn|ističe|lose|hurry|miss|penalt|expire/i;

describe("igraDaypart", () => {
  it("granice: jutro 05-11, dan 11-17, veče 17-22, noć 22-05", () => {
    expect([4, 5, 10, 11, 16, 17, 21, 22, 23, 0].map(igraDaypart)).toEqual(["noc", "jutro", "jutro", "dan", "dan", "vece", "vece", "noc", "noc", "noc"]);
  });

  it("loš ulaz ne ruši tablu", () => {
    expect(igraDaypart(Number.NaN)).toBe("dan");
    expect(igraDaypart(29)).toBe("jutro");
    expect(igraDaypart(-1)).toBe("noc");
  });
});

describe("igraDaypartAt (sat u Beogradu)", () => {
  it("zimi je Beograd UTC+1", () => {
    expect(igraDaypartAt(Date.UTC(2026, 0, 15, 3, 59))).toBe("noc"); // 04:59
    expect(igraDaypartAt(Date.UTC(2026, 0, 15, 4, 0))).toBe("jutro"); // 05:00
    expect(igraDaypartAt(Date.UTC(2026, 0, 15, 9, 59))).toBe("jutro"); // 10:59
    expect(igraDaypartAt(Date.UTC(2026, 0, 15, 10, 0))).toBe("dan"); // 11:00
    expect(igraDaypartAt(Date.UTC(2026, 0, 15, 15, 59))).toBe("dan"); // 16:59
    expect(igraDaypartAt(Date.UTC(2026, 0, 15, 16, 0))).toBe("vece"); // 17:00
    expect(igraDaypartAt(Date.UTC(2026, 0, 15, 20, 59))).toBe("vece"); // 21:59
    expect(igraDaypartAt(Date.UTC(2026, 0, 15, 21, 0))).toBe("noc"); // 22:00
  });

  it("leti je Beograd UTC+2, pa se granica pomera sa njim", () => {
    expect(igraDaypartAt(Date.UTC(2026, 6, 15, 2, 59))).toBe("noc"); // 04:59
    expect(igraDaypartAt(Date.UTC(2026, 6, 15, 3, 0))).toBe("jutro"); // 05:00
    expect(igraDaypartAt(Date.UTC(2026, 6, 15, 19, 59))).toBe("vece"); // 21:59
    expect(igraDaypartAt(Date.UTC(2026, 6, 15, 20, 0))).toBe("noc"); // 22:00
  });
});

describe("heroj table", () => {
  it("svako doba dana ima svoju scenu u manifestu", () => {
    const scenes = IGRA_DAYPARTS.map(dashboardSceneArt);
    expect(new Set(scenes).size).toBe(IGRA_DAYPARTS.length);
    for (const id of scenes) expect(igraArtOrNull(id)?.kind, id).toBe("scena");
  });

  it("pozdrav nosi ime; bez imena ostaje sam pozdrav", () => {
    expect(dashboardGreeting("jutro", "Mila", "sr")).toBe("Dobro jutro, Mila");
    expect(dashboardGreeting("vece", "Mila", "en")).toBe("Good evening, Mila");
    expect(dashboardGreeting("dan", "  ", "sr")).toBe("Dobar dan");
    expect(dashboardGreeting("noc", null, "en")).toBe("Hi");
  });

  it("Robi ima rečenicu za svako doba dana, na oba jezika, bez pretnje (O9)", () => {
    for (const locale of LOCALES) {
      const lines = IGRA_DAYPARTS.map((daypart) => dashboardRobiLine(daypart, locale));
      expect(new Set(lines).size, locale).toBe(IGRA_DAYPARTS.length);
      for (const line of lines) {
        expect(line.length, line).toBeGreaterThan(10);
        expect(line).not.toMatch(FEAR);
      }
    }
  });
});
