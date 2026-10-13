import { describe, expect, test } from "vitest";

import { sfxById, sfxUrl } from "./crea-sfx-library";
import { IGRA_SFX, IGRA_SFX_VOLUME, igraSfxUrl, isIgraSoundEnabled, type IgraSfx } from "./igra-sound";

describe("zvuk IGRA-e", () => {
  test("svaki zvuk je postojeći fajl iz kataloga (bez novih fajlova) i adresa se poklapa", () => {
    for (const sfx of Object.keys(IGRA_SFX) as IgraSfx[]) {
      const file = sfxById(IGRA_SFX[sfx]);
      expect(file, sfx).toBeDefined();
      expect(igraSfxUrl(sfx)).toBe(sfxUrl(file!));
    }
  });

  test("zvuci su kratki (slavlje traje najviše 2,5 s)", () => {
    for (const id of Object.values(IGRA_SFX)) expect(sfxById(id)!.seconds).toBeLessThanOrEqual(2.5);
  });

  test("glasnoća je tiha", () => {
    expect(IGRA_SFX_VOLUME).toBeGreaterThan(0);
    expect(IGRA_SFX_VOLUME).toBeLessThanOrEqual(0.5);
  });

  test("na serveru je zvuk isključen", () => {
    expect(isIgraSoundEnabled()).toBe(false);
  });
});
