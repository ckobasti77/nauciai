import { describe, expect, test } from "vitest";

import {
  canMergeDown,
  initialLayers,
  layerName,
  layersChanged,
  mergeDown,
  mergePair,
  moveLayer,
  nudgeLayer,
  reorderLayer,
  setLayerTint,
  tintPixel,
  tintPixels,
  toggleLayer,
  visibleLayers,
} from "./crea-layers";

function start() {
  return initialLayers(1000, 800, [
    { asset: "a", number: 1 },
    { asset: "b", number: 2 },
    { asset: "c", number: 3 },
  ]);
}

describe("stanje slojeva", () => {
  test("početak: odozdo nagore, bez pomeraja i boje, svi vidljivi, jedinstveni id-jevi", () => {
    const state = start();
    expect(state.layers.map((layer) => layer.number)).toEqual([1, 2, 3]);
    expect(new Set(state.layers.map((layer) => layer.id)).size).toBe(3);
    expect(state.layers.every((layer) => layer.x === 0 && layer.y === 0 && layer.visible && layer.tint === null && layer.merged === 1)).toBe(true);
  });

  test("pomeri: u granicama platna (sloj ne može da ode skroz), strelice dodaju pomeraj", () => {
    const state = start();
    const id = state.layers[1]!.id;
    expect(moveLayer(state, id, 120.4, -30.6).layers[1]).toMatchObject({ x: 120, y: -31 });
    expect(moveLayer(state, id, 99999, -99999).layers[1]).toMatchObject({ x: 1000, y: -800 });
    expect(moveLayer(state, id, Number.NaN, 5).layers[1]).toMatchObject({ x: 0, y: 5 });
    const nudged = nudgeLayer(nudgeLayer(state, id, 10, 0), id, 0, -1);
    expect(nudged.layers[1]).toMatchObject({ x: 10, y: -1 });
    // Ostali slojevi se ne diraju; nepoznat sloj ne menja ništa.
    expect(nudged.layers[0]).toBe(state.layers[0]);
    expect(moveLayer(state, "nema", 5, 5)).toBe(state);
  });

  test("sakrij i prikaži; sakriven sloj se ne crta", () => {
    const state = start();
    const hidden = toggleLayer(state, state.layers[2]!.id);
    expect(visibleLayers(hidden).map((layer) => layer.number)).toEqual([1, 2]);
    expect(visibleLayers(toggleLayer(hidden, state.layers[2]!.id))).toHaveLength(3);
  });

  test("prefarbaj: boja i jačina 0..1, jačina 0 skida bojenje, loša boja se ignoriše", () => {
    const state = start();
    const id = state.layers[1]!.id;
    expect(setLayerTint(state, id, { color: "#C8402F", amount: 1.7 }).layers[1]!.tint).toEqual({ color: "#c8402f", amount: 1 });
    expect(setLayerTint(state, id, { color: "#c8402f", amount: 0 }).layers[1]!.tint).toBeNull();
    expect(setLayerTint(state, id, { color: "crvena", amount: 0.5 })).toBe(state);
    expect(setLayerTint(setLayerTint(state, id, { color: "#2e6f9f", amount: 0.5 }), id, null).layers[1]!.tint).toBeNull();
  });

  test("redosled: gore/dole, na vrhu i dnu nema pomeranja", () => {
    const state = start();
    const [bottom, middle, top] = state.layers;
    expect(reorderLayer(state, middle!.id, "up").layers.map((layer) => layer.number)).toEqual([1, 3, 2]);
    expect(reorderLayer(state, middle!.id, "down").layers.map((layer) => layer.number)).toEqual([2, 1, 3]);
    expect(reorderLayer(state, top!.id, "up")).toBe(state);
    expect(reorderLayer(state, bottom!.id, "down")).toBe(state);
  });

  test("spoji sa donjim: dva sloja postaju jedan na istom mestu u nizu, sa novom slikom", () => {
    const state = start();
    const top = state.layers[2]!;
    expect(canMergeDown(state, state.layers[0]!.id)).toBe(false);
    expect(canMergeDown(state, top.id)).toBe(true);
    expect(mergePair(state, top.id)?.map((layer) => layer.number)).toEqual([2, 3]);

    const moved = moveLayer(setLayerTint(state, top.id, { color: "#2e6f9f", amount: 0.5 }), top.id, 40, 40);
    const merged = mergeDown(moved, top.id, "spojeno-1");
    expect(merged.layers).toHaveLength(2);
    expect(merged.layers[0]).toBe(moved.layers[0]);
    // Crtač je već složio pomeraj i boju u novu sliku - spojen sloj ih nema.
    expect(merged.layers[1]).toMatchObject({ number: 2, asset: "spojeno-1", x: 0, y: 0, visible: true, tint: null, merged: 2 });
    // Spojen sloj se spaja dalje i broji sve.
    const all = mergeDown(merged, merged.layers[1]!.id, "spojeno-2");
    expect(all.layers).toHaveLength(1);
    expect(all.layers[0]).toMatchObject({ number: 1, merged: 3 });
  });

  test("sakriven sloj se ne spaja (crtač ga ne bi video)", () => {
    const state = start();
    const hidden = toggleLayer(state, state.layers[1]!.id);
    expect(mergeDown(hidden, state.layers[2]!.id, "x")).toBe(hidden);
    expect(mergeDown(hidden, state.layers[1]!.id, "x")).toBe(hidden);
  });

  test("da li je nešto promenjeno (za „Vrati sve“)", () => {
    const state = start();
    expect(layersChanged(state, state)).toBe(false);
    expect(layersChanged(state, nudgeLayer(state, state.layers[0]!.id, 1, 0))).toBe(true);
    expect(layersChanged(state, toggleLayer(state, state.layers[0]!.id))).toBe(true);
    expect(layersChanged(state, setLayerTint(state, state.layers[0]!.id, { color: "#ffffff", amount: 0.2 }))).toBe(true);
    expect(layersChanged(state, reorderLayer(state, state.layers[0]!.id, "up"))).toBe(true);
    expect(layersChanged(state, mergeDown(state, state.layers[1]!.id, "m"))).toBe(true);
  });

  test("imena slojeva na oba jezika", () => {
    expect(layerName({ number: 1, merged: 1 }, "sr")).toBe("Sloj 1 · pozadina");
    expect(layerName({ number: 4, merged: 1 }, "en")).toBe("Layer 4");
    expect(layerName({ number: 2, merged: 3 }, "sr")).toBe("Spojeno (3 sloja)");
  });
});

describe("prefarbaj piksel", () => {
  test("jačina 0 ne menja ništa", () => {
    expect(tintPixel(10, 200, 30, [200, 40, 30], 0)).toEqual([10, 200, 30]);
  });

  test("jačina 1: nijansa iz izabrane boje, svetlina iz piksela (senke ostaju senke)", () => {
    const red: [number, number, number] = [200, 40, 30];
    const dark = tintPixel(0, 0, 80, red, 1);
    const light = tintPixel(150, 150, 255, red, 1);
    // Oba su crvenkasta…
    expect(dark[0]).toBeGreaterThan(dark[2]);
    expect(light[0]).toBeGreaterThan(light[2]);
    // …a tamni piksel je ostao tamniji od svetlog.
    expect(dark[0] + dark[1] + dark[2]).toBeLessThan(light[0] + light[1] + light[2]);
    // Belo ostaje belo (svetlina 1), crno ostaje crno.
    expect(tintPixel(255, 255, 255, red, 1)).toEqual([255, 255, 255]);
    expect(tintPixel(0, 0, 0, red, 1)).toEqual([0, 0, 0]);
  });

  test("pola jačine je između originala i pune boje", () => {
    const red: [number, number, number] = [200, 40, 30];
    const full = tintPixel(40, 120, 200, red, 1);
    const half = tintPixel(40, 120, 200, red, 0.5);
    for (let channel = 0; channel < 3; channel++) {
      const low = Math.min([40, 120, 200][channel]!, full[channel]!);
      const high = Math.max([40, 120, 200][channel]!, full[channel]!);
      expect(half[channel]).toBeGreaterThanOrEqual(low);
      expect(half[channel]).toBeLessThanOrEqual(high);
    }
  });

  test("ceo bafer: providni pikseli i alfa se ne diraju", () => {
    const rgba = new Uint8ClampedArray([40, 120, 200, 255, 40, 120, 200, 0, 40, 120, 200, 128]);
    tintPixels(rgba, { color: "#c8402f", amount: 1 });
    expect([...rgba.slice(4, 8)]).toEqual([40, 120, 200, 0]);
    expect(rgba[3]).toBe(255);
    expect(rgba[11]).toBe(128);
    expect(rgba[0]).toBeGreaterThan(rgba[2]!);
    const untouched = new Uint8ClampedArray([1, 2, 3, 255]);
    tintPixels(untouched, { color: "nije-boja", amount: 1 });
    expect([...untouched]).toEqual([1, 2, 3, 255]);
  });
});
