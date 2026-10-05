/**
 * GIF od slika (S31, K09): platno, raspored sličica, redosled i brzina.
 */
import { describe, expect, test } from "vitest";

import { fitFrame, gifCanvasSize, gifDelayMs, GIF_SPEEDS, loopSeconds, moveItem } from "./crea-gif";

describe("platno", () => {
  test("odnos prve slike, duža stranica = izabrana veličina, parne stranice", () => {
    expect(gifCanvasSize({ width: 4000, height: 3000 }, 480)).toEqual({ width: 480, height: 360 });
    expect(gifCanvasSize({ width: 1080, height: 1920 }, 720)).toEqual({ width: 406, height: 720 });
    expect(gifCanvasSize({ width: 333, height: 101 }, 480)).toEqual({ width: 334, height: 102 });
  });

  test("mala slika se ne uvećava", () => {
    expect(gifCanvasSize({ width: 200, height: 100 }, 720)).toEqual({ width: 200, height: 100 });
  });
});

describe("raspored sličice", () => {
  const canvas = { width: 400, height: 400 };

  test("ceo kadar: cela slika uz trake, centrirana", () => {
    expect(fitFrame({ width: 800, height: 400 }, canvas, "contain")).toEqual({ x: 0, y: 100, width: 400, height: 200 });
  });

  test("popuni: platno je pokriveno, višak se seče podjednako", () => {
    expect(fitFrame({ width: 800, height: 400 }, canvas, "cover")).toEqual({ x: -200, y: 0, width: 800, height: 400 });
  });
});

describe("redosled i brzina", () => {
  test("pomeranje sličice i granice", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 1, 5)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], -1, 0)).toEqual(["a", "b"]);
  });

  test("brzine su od najsporije, trajanje petlje", () => {
    const ms = GIF_SPEEDS.map((speed) => speed.ms);
    expect(ms).toEqual([...ms].sort((a, b) => b - a));
    expect(gifDelayMs("brzo")).toBe(200);
    expect(loopSeconds(6, gifDelayMs("srednje"))).toBe(3);
    expect(loopSeconds(7, 200)).toBe(1.4);
  });
});
