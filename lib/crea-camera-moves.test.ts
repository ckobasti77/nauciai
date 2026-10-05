import { describe, expect, test } from "vitest";

import { CAMERA_MOVE_GROUPS, CAMERA_MOVES, cameraMoveById, cameraMovesInGroup } from "./crea-camera-moves";
import { cameraMovePhrase } from "./crea-director";

describe("pokreti kamere (V7)", () => {
  test("oko 40 pokreta, jedinstveni id-jevi, svaka grupa ima bar tri", () => {
    expect(CAMERA_MOVES.length).toBeGreaterThanOrEqual(36);
    expect(CAMERA_MOVES.length).toBeLessThanOrEqual(48);
    expect(new Set(CAMERA_MOVES.map((move) => move.id)).size).toBe(CAMERA_MOVES.length);
    for (const group of CAMERA_MOVE_GROUPS) expect(cameraMovesInGroup(group.id).length).toBeGreaterThanOrEqual(3);
    for (const move of CAMERA_MOVES) expect(CAMERA_MOVE_GROUPS.some((group) => group.id === move.group)).toBe(true);
  });

  test("naziv i mini-lekcija na oba jezika, lekcija kratka", () => {
    for (const move of CAMERA_MOVES) {
      expect(move.label.sr && move.label.en).toBeTruthy();
      expect(move.lesson.sr.length).toBeGreaterThan(30);
      expect(move.lesson.en.length).toBeGreaterThan(30);
      expect(move.lesson.sr.length).toBeLessThanOrEqual(220);
      expect(move.lesson.en.length).toBeLessThanOrEqual(220);
    }
  });

  test("rečenica za model: engleski, bez tačke na kraju, kratka", () => {
    for (const move of CAMERA_MOVES) {
      expect(move.phrase).toMatch(/^[a-zA-Z0-9][\x20-\x7e]*[^.\s]$/);
      expect(move.phrase.length).toBeLessThanOrEqual(140);
    }
  });

  test("skica: ključne tačke od 0 do 1, rastuće, u granicama", () => {
    for (const move of CAMERA_MOVES) {
      for (const keys of [move.sketch.scene, move.sketch.subject].filter(Boolean)) {
        const list = keys!;
        expect(list.length).toBeGreaterThanOrEqual(2);
        expect(list[0].t).toBe(0);
        expect(list[list.length - 1].t).toBe(1);
        for (let index = 1; index < list.length; index += 1) expect(list[index].t).toBeGreaterThan(list[index - 1].t);
        for (const key of list) {
          expect(Math.abs(key.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(key.y)).toBeLessThanOrEqual(1);
          expect(key.s).toBeGreaterThanOrEqual(0.5);
          expect(key.s).toBeLessThanOrEqual(3);
          expect(Math.abs(key.r)).toBeLessThanOrEqual(45);
        }
      }
    }
  });

  test("svaki pokret se vidi u skici (mirna kamera pomera lik)", () => {
    for (const move of CAMERA_MOVES) {
      const all = [...move.sketch.scene, ...(move.sketch.subject ?? [])];
      const moves = all.some((key) => key.x !== 0 || key.y !== 0 || key.s !== 1 || key.r !== 0);
      expect(moves || move.sketch.icon !== undefined).toBe(true);
    }
  });

  test("jačina se dopisuje samo pokretima koji je imaju", () => {
    const push = cameraMoveById("priblizavanje")!;
    expect(cameraMovePhrase(push, "jako")).toBe(`${push.phrase}, fast and dramatic`);
    expect(cameraMovePhrase(push, "blago")).toBe(`${push.phrase}, slow and gentle`);
    expect(cameraMovePhrase(push)).toBe(push.phrase);
    const shot = cameraMoveById("preko-ramena")!;
    expect(shot.intensity).toBeUndefined();
    expect(cameraMovePhrase(shot, "jako")).toBe(shot.phrase);
    expect(cameraMoveById("nema")).toBeUndefined();
  });
});
