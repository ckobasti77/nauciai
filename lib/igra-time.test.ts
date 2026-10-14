import { describe, expect, it } from "vitest";

import { belgradeHour, isEarlyBirdHour, isNightOwlHour } from "./igra-time";

const at = (iso: string) => Date.parse(iso);

describe("belgradeHour", () => {
  it("čita sat u Beogradu zimi (UTC+1) i leti (UTC+2)", () => {
    expect(belgradeHour(at("2026-01-15T20:59:00Z"))).toBe(21);
    expect(belgradeHour(at("2026-01-15T21:00:00Z"))).toBe(22);
    expect(belgradeHour(at("2026-07-15T19:59:00Z"))).toBe(21);
    expect(belgradeHour(at("2026-07-15T20:00:00Z"))).toBe(22);
  });

  it("ponoć je 0, ne 24", () => {
    expect(belgradeHour(at("2026-01-15T23:00:00Z"))).toBe(0);
    expect(belgradeHour(at("2026-07-15T22:30:00Z"))).toBe(0);
  });

  it("prelazak na letnje vreme (29. mart 2026): posle 01:59 dolazi 03:00", () => {
    expect(belgradeHour(at("2026-03-29T00:59:00Z"))).toBe(1);
    expect(belgradeHour(at("2026-03-29T01:00:00Z"))).toBe(3);
  });

  it("povratak na zimsko vreme (25. oktobar 2026): sat 02 traje dva puta", () => {
    expect(belgradeHour(at("2026-10-25T00:30:00Z"))).toBe(2);
    expect(belgradeHour(at("2026-10-25T01:30:00Z"))).toBe(2);
    expect(belgradeHour(at("2026-10-25T02:00:00Z"))).toBe(3);
  });
});

describe("pragovi bedževa", () => {
  it("noćna sova: 21:59 ne, 22:00 da, 03:59 da, 04:00 ne", () => {
    expect(isNightOwlHour(belgradeHour(at("2026-01-15T20:59:00Z")))).toBe(false);
    expect(isNightOwlHour(belgradeHour(at("2026-01-15T21:00:00Z")))).toBe(true);
    expect(isNightOwlHour(belgradeHour(at("2026-01-16T02:59:00Z")))).toBe(true);
    expect(isNightOwlHour(belgradeHour(at("2026-01-16T03:00:00Z")))).toBe(false);
  });

  it("rani pevac: 04:59 ne, 05:00 da, 07:59 da, 08:00 ne", () => {
    expect(isEarlyBirdHour(belgradeHour(at("2026-01-15T03:59:00Z")))).toBe(false);
    expect(isEarlyBirdHour(belgradeHour(at("2026-01-15T04:00:00Z")))).toBe(true);
    expect(isEarlyBirdHour(belgradeHour(at("2026-01-15T06:59:00Z")))).toBe(true);
    expect(isEarlyBirdHour(belgradeHour(at("2026-01-15T07:00:00Z")))).toBe(false);
  });

  it("isti UTC trenutak leti i zimi pada na različit sat u Beogradu", () => {
    // 20:30 UTC: zimi 21:30 (nije noćna tura), leti 22:30 (jeste).
    expect(isNightOwlHour(belgradeHour(at("2026-01-15T20:30:00Z")))).toBe(false);
    expect(isNightOwlHour(belgradeHour(at("2026-07-15T20:30:00Z")))).toBe(true);
  });

  it("nijedan sat nije i noćna sova i rani pevac", () => {
    for (let hour = 0; hour < 24; hour += 1) expect(isNightOwlHour(hour) && isEarlyBirdHour(hour), String(hour)).toBe(false);
  });
});
