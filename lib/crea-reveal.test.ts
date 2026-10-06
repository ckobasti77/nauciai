import { describe, expect, test } from "vitest";

import { confettiShots, momentMessage, revealStyleFor } from "./crea-reveal";

describe("otkrivanje rada", () => {
  test("slika = polaroid, video = filmska traka, zvuk = kaseta", () => {
    expect(revealStyleFor("image")).toBe("polaroid");
    expect(revealStyleFor("video")).toBe("film");
    expect(revealStyleFor("audio")).toBe("kaseta");
  });

  test("konfete su žuta i mastilo i uvek poštuju smanjen pokret", () => {
    const shots = confettiShots({ x: 0.5, y: 0.6 }, { yellow: "#f4be30", ink: "#0e3158" }, true);
    expect(shots).toHaveLength(2);
    for (const shot of shots) {
      expect(shot.disableForReducedMotion).toBe(true);
      expect(new Set(shot.colors)).toEqual(new Set(["#f4be30", "#0e3158"]));
      expect(shot.origin.x).toBeGreaterThanOrEqual(0);
      expect(shot.origin.x).toBeLessThanOrEqual(1);
    }
    // Rafali idu ka sredini: levi udesno-gore, desni ulevo-gore.
    expect(shots[0]!.angle).toBeLessThan(90);
    expect(shots[1]!.angle).toBeGreaterThan(90);
  });

  test("ivica ekrana ne izbacuje poreklo van [0, 1]; mali rafal je manji", () => {
    const edge = confettiShots({ x: 0.02, y: 1.2 }, { yellow: "y", ink: "i" }, false);
    for (const shot of edge) {
      expect(shot.origin.x).toBeGreaterThanOrEqual(0);
      expect(shot.origin.y).toBeLessThanOrEqual(1);
    }
    expect(edge[0]!.particleCount).toBeLessThan(confettiShots({ x: 0.5, y: 0.5 }, { yellow: "y", ink: "i" }, true)[0]!.particleCount);
  });

  test("poruke posebnih trenutaka", () => {
    expect(momentMessage({ id: "prvi-rad" }, "sr")).toBe("Tvoj prvi rad u Crei!");
    expect(momentMessage({ id: "prvi-od-vrste", kind: "video" }, "sr")).toBe("Tvoj prvi video!");
    expect(momentMessage({ id: "prvi-od-vrste", kind: "audio" }, "en")).toBe("Your first sound!");
    expect(momentMessage({ id: "jubilej", count: 25 }, "sr")).toContain("25.");
    expect(momentMessage(null, "sr")).toBeNull();
  });
});
