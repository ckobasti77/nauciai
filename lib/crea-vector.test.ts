/**
 * Vektor (S31, K09): priprema slike za `vectortracer` i sklapanje SVG-a.
 */
import { describe, expect, test } from "vitest";

import { assembleSvg, extractPaths, layerOrder, luminanceOf, maskImage, otsuThreshold, stackedMask } from "./crea-vector";

describe("crno-belo", () => {
  test("providan piksel je papir, crn neproviden je mastilo", () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255]);
    expect([...luminanceOf(rgba)]).toEqual([255, 0, 255]);
  });

  test("Otsu nađe granicu između tamne i svetle grupe", () => {
    const gray = new Uint8Array([...Array(50).fill(30), ...Array(50).fill(220)]);
    const t = otsuThreshold(gray);
    expect(t).toBeGreaterThan(30);
    expect(t).toBeLessThanOrEqual(220);
    // Siv logo na sivkastom papiru: prag nije fiksnih 128.
    const pale = new Uint8Array([...Array(30).fill(150), ...Array(70).fill(200)]);
    const tp = otsuThreshold(pale);
    expect(tp).toBeGreaterThan(150);
    expect(tp).toBeLessThanOrEqual(200);
  });

  test("maska: mastilo je crveno 0, papir 255, sve neprovidno", () => {
    const mask = maskImage(3, (i) => i !== 1);
    expect([...mask]).toEqual([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
  });
});

describe("u boji", () => {
  test("slojevi od najzastupljenije boje, prazne boje se preskaču", () => {
    expect(layerOrder([5, 0, 20, 7])).toEqual([2, 3, 0]);
    expect(layerOrder([3, 3])).toEqual([0, 1]);
  });

  test("naslagana maska: sloj obuhvata i manje zastupljene boje", () => {
    const indices = new Uint8Array([2, 3, 0, 2, 0]);
    const order = [2, 3, 0];
    const red = (mask: Uint8ClampedArray) => [...mask].filter((_, i) => i % 4 === 0);
    expect(red(stackedMask(indices, order, 0))).toEqual([0, 0, 0, 0, 0]);
    expect(red(stackedMask(indices, order, 1))).toEqual([255, 0, 0, 255, 0]);
    expect(red(stackedMask(indices, order, 2))).toEqual([255, 255, 0, 255, 0]);
  });
});

describe("SVG", () => {
  const raw = `
    <svg xmlns="http://www.w3.org/2000/svg" style="background:white;">
      <g transform="scale(1)">
        <path
            d="M0 0 L10 0 Z"
            transform="translate(1,2)"
            fill="#000000"
        />
        <path d="M5 5 L6 6 Z" transform="translate(0,0)" fill="#000000" />
      </g>
    </svg>`;

  test("vadi samo putanje", () => {
    const paths = extractPaths(raw);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toBe('<path d="M0 0 L10 0 Z" transform="translate(1,2)" fill="#000000" />');
    expect(extractPaths("<svg></svg>")).toEqual([]);
  });

  test("sklapa SVG sa viewBox-om, pozadinom i bojama slojeva", () => {
    const svg = assembleSvg(100, 50, "#fffdf8", [{ fill: "#0e3158", paths: extractPaths(raw) }]);
    expect(svg).toContain('viewBox="0 0 100 50"');
    expect(svg).toContain('<rect width="100" height="50" fill="#fffdf8"/>');
    expect(svg.match(/fill="#0e3158"/g)).toHaveLength(2);
    expect(svg).not.toContain("style=");
  });

  test("boja koja nije #rrggbb ne ulazi u fajl", () => {
    const svg = assembleSvg(10, 10, 'red"/><script>', [{ fill: "url(javascript:x)", paths: ['<path d="M0 0" fill="#000"/>'] }]);
    expect(svg).not.toContain("script");
    expect(svg).not.toContain("javascript");
    expect(svg).toContain('fill="#000000"');
  });
});
