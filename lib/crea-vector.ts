/**
 * Slika u vektor (S31, K09). `vectortracer` (MIT, WASM vezivanje za
 * visioncortex VTracer) ume samo crno-belo: piksel je „crn" kad mu je crvena
 * komponenta < 128. Zato se slika ovde pripremi:
 *
 * - crno-belo: prag po Otsu metodi (sam nađe granicu između mastila i papira);
 * - u boji: slika se svede na nekoliko boja, pa se svaka boja crta kao svoj sloj.
 *   Slojevi su „naslagani" (kao u VTracer-u): sloj boje obuhvata i sve manje
 *   zastupljene boje ispod sebe, pa između oblika nema belih procepa.
 *
 * Paket `svgit4me` (plan K01) NIJE uzet: povlači `potrace-wasm` (GPL, §6).
 */

/** Veća slika se smanjuje pre crtanja - vektor ionako ne zavisi od rezolucije, a WASM je jednonitni. */
export const VECTOR_MAX_SIDE = 1024;
export const VECTOR_COLOR_COUNTS = [2, 4, 6, 8] as const;
export const VECTOR_DEFAULT_COLORS = 6;

/** Osvetljenost piksela (0-255); providan piksel je papir (bela). */
export function luminanceOf(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i += 1) {
    const a = rgba[i * 4 + 3] / 255;
    const y = 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2];
    out[i] = Math.round(y * a + 255 * (1 - a));
  }
  return out;
}

/** Otsu: prag koji najbolje deli histogram na dve grupe (mastilo i papir). */
export function otsuThreshold(gray: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0);
  for (const value of gray) histogram[value] += 1;
  const total = gray.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i += 1) sumAll += i * histogram[i];

  let sumBack = 0;
  let weightBack = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t += 1) {
    weightBack += histogram[t];
    if (weightBack === 0) continue;
    const weightFore = total - weightBack;
    if (weightFore === 0) break;
    sumBack += t * histogram[t];
    const meanBack = sumBack / weightBack;
    const meanFore = (sumAll - sumBack) / weightFore;
    const between = weightBack * weightFore * (meanBack - meanFore) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  // Piksel ≤ prag je tamna grupa; +1 jer `vectortracer` pita „< 128".
  return threshold + 1;
}

/** RGBA maska za `vectortracer`: crno gde je `ink(i)`, inače belo (neprovidno). */
export function maskImage(pixelCount: number, ink: (index: number) => boolean): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i += 1) {
    const value = ink(i) ? 0 : 255;
    out[i * 4] = value;
    out[i * 4 + 1] = value;
    out[i * 4 + 2] = value;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * Redosled slojeva u boji: najzastupljenija boja je pozadina (crta se kao
 * pravougaonik), ostale idu od veće ka manjoj. Vraća indekse palete.
 */
export function layerOrder(counts: readonly number[]): number[] {
  return counts
    .map((count, index) => ({ count, index }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map((entry) => entry.index);
}

/**
 * Maska sloja `layer` (pozicija u `order`) za naslagan crtež: piksel ulazi u
 * sloj ako je njegova boja ovaj sloj ILI bilo koji kasniji (manje zastupljen).
 */
export function stackedMask(indices: Uint8Array, order: readonly number[], layer: number): Uint8ClampedArray<ArrayBuffer> {
  const rank = new Map(order.map((paletteIndex, position) => [paletteIndex, position]));
  return maskImage(indices.length, (i) => (rank.get(indices[i]) ?? -1) >= layer);
}

/** `<path .../>` elementi iz SVG-a koji vrati `vectortracer` (bez njegove pozadine i omotača). */
export function extractPaths(svg: string): string[] {
  return svg.match(/<path\b[^>]*\/>/g)?.map((path) => path.replace(/\s+/g, " ")) ?? [];
}

/** Zameni boju ispune putanje (WASM uvek crta crno). */
export function withFill(path: string, fill: string): string {
  return path.replace(/fill="[^"]*"/, `fill="${fill}"`);
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Konačan SVG: `viewBox` u pikselima radne slike, pozadina kao pravougaonik
 * (ne `style` - neki programi ga ignorišu), pa slojevi redom. Boje su samo
 * `#rrggbb`, a putanje samo iz našeg WASM-a, pa u fajlu nema skripti.
 */
export function assembleSvg(
  width: number,
  height: number,
  background: string | null,
  layers: ReadonlyArray<{ fill: string; paths: readonly string[] }>,
): string {
  const safe = (color: string) => (HEX.test(color) ? color : "#000000");
  const body = layers.flatMap((layer) => layer.paths.map((path) => withFill(path, safe(layer.fill)))).join("\n");
  const backdrop = background ? `<rect width="${width}" height="${height}" fill="${safe(background)}"/>\n` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n${backdrop}${body}\n</svg>\n`;
}
