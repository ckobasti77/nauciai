import { describe, expect, test } from "vitest";

import {
  CAMERA_APERTURES,
  CAMERA_BODIES,
  CAMERA_LENSES,
  cameraExplain,
  cameraFragment,
  DEFAULT_CAMERA,
  focalExplain,
  normalizeCamera,
} from "./crea-camera";

describe("virtuelna kamera (S8)", () => {
  test("svaka opcija ima naziv, objašnjenje i dodatak opisu", () => {
    for (const option of [...CAMERA_BODIES, ...CAMERA_LENSES, ...CAMERA_APERTURES]) {
      expect(option.label.sr && option.label.en && option.explain.sr && option.explain.en).toBeTruthy();
      expect(option.fragment.length).toBeGreaterThan(3);
    }
    for (const lens of CAMERA_LENSES) expect(lens.focals.length).toBeGreaterThan(0);
  });

  test("podrazumevana kamera je ispravna i ostaje ista kroz `normalizeCamera`", () => {
    expect(normalizeCamera(DEFAULT_CAMERA)).toEqual(DEFAULT_CAMERA);
  });

  test("žižna daljina ide na najbližu koju objektiv ima; nepoznato pada na podrazumevano", () => {
    expect(normalizeCamera({ body: "film35", lens: "fiksni", focal: 80, aperture: "f/2" }).focal).toBe(85);
    expect(normalizeCamera({ lens: "riblje-oko", focal: 200 }).focal).toBe(12);
    expect(normalizeCamera({ lens: "tele", focal: 10 }).focal).toBe(135);
    expect(normalizeCamera({ body: "nema", lens: "nema", focal: Number.NaN, aperture: "f/99" })).toEqual(DEFAULT_CAMERA);
  });

  test("dodatak opisu nosi telo, žižnu, objektiv i blendu", () => {
    expect(cameraFragment({ body: "film35", lens: "fiksni", focal: 85, aperture: "f/1.4" })).toBe(
      "shot on a 35mm film camera, 85mm prime lens, f/1.4, very shallow depth of field, creamy bokeh",
    );
    // Neispravna žižna se ne pojavljuje u opisu.
    expect(cameraFragment({ body: "dslr", lens: "makro", focal: 50, aperture: "f/8" })).toContain("60mm macro lens");
  });

  test("objašnjenje za početnika, na oba jezika", () => {
    expect(focalExplain(85, "sr")).toBe("portret, lepo lice");
    expect(focalExplain(14, "en")).toBe("wide, the whole space");
    const sr = cameraExplain({ body: "polaroid", lens: "zum", focal: 35, aperture: "f/8" }, "sr");
    expect(sr).toContain("35 mm");
    expect(sr).toContain("sve oštro");
    expect(cameraExplain(DEFAULT_CAMERA, "en")).toContain("50 mm");
  });
});
