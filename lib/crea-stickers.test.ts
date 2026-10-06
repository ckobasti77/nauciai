/** Nalepnice (S28, K10): svaki fajl postoji kod nas, čist je SVG i ima naveden izvor i licencu. */
import { existsSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { CREA_STICKER_GROUPS, CREA_STICKER_SOURCE, CREA_STICKERS, stickerById, stickerUrl } from "./crea-stickers";

const DIR = "public/brand/crea/stickers";

describe("nalepnice", () => {
  test("jedinstveni id-jevi, grupa postoji, oba jezika", () => {
    expect(new Set(CREA_STICKERS.map((sticker) => sticker.id)).size).toBe(CREA_STICKERS.length);
    const groups = new Set(CREA_STICKER_GROUPS.map((group) => group.id));
    for (const sticker of CREA_STICKERS) {
      expect(groups.has(sticker.group), sticker.id).toBe(true);
      expect(sticker.label.sr && sticker.label.en, sticker.id).toBeTruthy();
    }
    expect(stickerById("srce")?.label.sr).toBe("Srce");
    expect(stickerUrl("srce")).toBe("/brand/crea/stickers/srce.svg");
  });

  test("svaki fajl je kod nas, bez skripti i spoljnih adresa", () => {
    for (const sticker of CREA_STICKERS) {
      const path = `${DIR}/${sticker.id}.svg`;
      expect(existsSync(path), path).toBe(true);
      const svg = readFileSync(path, "utf8");
      expect(svg.startsWith("<svg"), path).toBe(true);
      expect(svg).toMatch(/viewBox="0 0 32 32"/);
      expect(svg).not.toMatch(/<script|on[a-z]+=|href="http/i);
    }
  });

  test("licenca i izvor su uz fajlove (MIT, zakucan commit)", () => {
    expect(CREA_STICKER_SOURCE.license).toBe("MIT");
    expect(CREA_STICKER_SOURCE.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(readFileSync(`${DIR}/LICENSE`, "utf8")).toMatch(/MIT License/);
    const source = readFileSync(`${DIR}/IZVOR.md`, "utf8");
    expect(source).toContain(CREA_STICKER_SOURCE.commit);
    for (const sticker of CREA_STICKERS) expect(source, sticker.id).toContain(`\`${sticker.id}.svg\``);
  });
});
