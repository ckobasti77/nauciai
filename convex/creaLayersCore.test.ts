import { describe, expect, test } from "vitest";

import {
  capExtraOutputUrls,
  isLayerizeJob,
  layerChildParams,
  layerNumberOf,
  MAX_EXTRA_OUTPUTS,
  orderLayers,
} from "./creaLayersCore";

describe("dodatni izlazi", () => {
  test("samo neprazni URL-ovi, najviše 16", () => {
    expect(capExtraOutputUrls(undefined)).toEqual([]);
    expect(capExtraOutputUrls(["a", "", "b"])).toEqual(["a", "b"]);
    expect(capExtraOutputUrls(Array.from({ length: 40 }, (_, i) => `u${i}`))).toHaveLength(MAX_EXTRA_OUTPUTS);
  });
});

describe("redni broj sloja", () => {
  test("dete nosi parametre glavnog posla + broj; glavni je sloj 1", () => {
    const params = layerChildParams(JSON.stringify({ prompt: "x", layers: 4 }), 3);
    expect(JSON.parse(params)).toEqual({ prompt: "x", layers: 4, sloj: 3 });
    expect(layerNumberOf(params)).toBe(3);
    expect(layerNumberOf(JSON.stringify({ prompt: "x" }))).toBe(1);
    expect(layerNumberOf("nije json")).toBe(1);
    expect(layerNumberOf(JSON.stringify({ sloj: 0 }))).toBe(1);
    expect(layerNumberOf(JSON.stringify({ sloj: 2.5 }))).toBe(1);
    expect(JSON.parse(layerChildParams("nije json", 2))).toEqual({ sloj: 2 });
  });

  test("razlaganje se prepoznaje po ulaznom režimu", () => {
    expect(isLayerizeJob({ inputMode: "layerize" })).toBe(true);
    expect(isLayerizeJob({ inputMode: "image_multi" })).toBe(false);
    expect(isLayerizeJob({})).toBe(false);
  });

  test("redosled odozdo nagore: po broju, pa po vremenu", () => {
    const ordered = orderLayers([
      { jobId: "c", number: 3, url: "c", createdAt: 5 },
      { jobId: "a", number: 1, url: "a", createdAt: 9 },
      { jobId: "b2", number: 2, url: "b2", createdAt: 7 },
      { jobId: "b1", number: 2, url: "b1", createdAt: 6 },
    ]);
    expect(ordered.map((layer) => layer.jobId)).toEqual(["a", "b1", "b2", "c"]);
  });
});
