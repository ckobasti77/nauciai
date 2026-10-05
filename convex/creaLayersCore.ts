/**
 * Slojevi i ostali izlazi istog poziva (Crea K12, S20; plan K01 §6.8). Čista
 * pravila: koliko dodatnih izlaza posao sme da nosi, kako dete pamti svoje
 * mesto u nizu i kako izgleda DEMO razlaganje bez ključa (O3).
 *
 * Seedream 5 Pro „layerize" vraća jedan URL po sloju. Prvi je izlaz posla, a
 * ostali postaju zasebni radovi (dete prvog, `derivation: "sloj"`), jer red u
 * `generationJobs` ima tačno jedan `outputStorageId`.
 */

/** Gornja granica dodatnih izlaza: Seedream daje najviše 17 slojeva (16 posle prvog). */
export const MAX_EXTRA_OUTPUTS = 16;

/** Ulazni režim razlaganja na slojeve (`models.inputModes`). */
export const LAYERIZE_MODE = "layerize";

/** Samo neprazni stringovi, najviše `MAX_EXTRA_OUTPUTS` - provajder ne sme da napravi 500 redova. */
export function capExtraOutputUrls(urls: readonly string[] | undefined): string[] {
  if (!urls) return [];
  return urls.filter((url) => typeof url === "string" && url.length > 0).slice(0, MAX_EXTRA_OUTPUTS);
}

/** Ključ u `params` deteta: redni broj sloja, od 1 (prvi je izlaz glavnog posla). */
export const LAYER_PARAM = "sloj";

/**
 * Više slika jednog poziva (K13, S5; K01-17): `num_images` > 1 vraća N izlaza.
 * Prvi je izlaz posla i nosi cenu; ostali su deca sa `derivation: "varijacija"`
 * i rednim brojem u `params.varijacija` (isti mehanizam kao slojevi).
 */
export const VARIATION_PARAM = "varijacija";

/** Kako se zove dete dodatnog izlaza: sloj razlaganja ili varijacija. */
export function extraOutputKind(job: { inputMode?: string }): { derivation: "sloj" | "varijacija"; param: string } {
  return isLayerizeJob(job) ? { derivation: "sloj", param: LAYER_PARAM } : { derivation: "varijacija", param: VARIATION_PARAM };
}

/** Parametri deteta: parametri glavnog posla + redni broj sloja (2, 3, …). */
export function layerChildParams(parentParams: string, layerNumber: number, param: string = LAYER_PARAM): string {
  let parsed: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(parentParams);
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  return JSON.stringify({ ...parsed, [param]: layerNumber });
}

/** Redni broj sloja (ili varijacije, `param`) iz `params`; glavni posao (bez ključa) je 1. */
export function layerNumberOf(params: string, param: string = LAYER_PARAM): number {
  try {
    const value: unknown = JSON.parse(params);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const number = (value as Record<string, unknown>)[param];
      if (typeof number === "number" && Number.isInteger(number) && number >= 1) return number;
    }
  } catch {
    // neparsiv `params` se ponaša kao glavni posao
  }
  return 1;
}

/** Posao je razlaganje (ili sloj razlaganja) - po ulaznom režimu, koji dete nasleđuje. */
export function isLayerizeJob(job: { inputMode?: string }): boolean {
  return job.inputMode === LAYERIZE_MODE;
}

export type LayerEntry = { jobId: string; number: number; url: string | null; createdAt: number };

/** Redosled slojeva odozdo nagore: po rednom broju, pa po vremenu upisa. */
export function orderLayers<T extends LayerEntry>(layers: readonly T[]): T[] {
  return [...layers].sort((a, b) => a.number - b.number || a.createdAt - b.createdAt);
}

/** Najviše/najmanje slojeva koje model prima (`capabilities.minLayers/maxLayers`). */
export const LAYER_COUNT_RANGE = { min: 2, max: 17 } as const;

function escapeXml(value: string): string {
  return value.replace(/[&<>]/g, (char) => (char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;"));
}

/**
 * DEMO razlaganje (mock bez ključa, O3): sloj 1 je pun „papir" sa natpisom,
 * ostali su providni sa po jednim oblikom - dovoljno da editor slojeva radi
 * pomeranje, sakrivanje, bojenje i spajanje i bez pravog provajdera.
 */
export function mockLayerDataUrls(prompt: string, hash: string, count: number): string[] {
  const total = Math.max(LAYER_COUNT_RANGE.min, Math.min(LAYER_COUNT_RANGE.max, Math.round(count) || LAYER_COUNT_RANGE.min));
  const hue = parseInt(hash.slice(0, 4) || "0", 16) % 360;
  const label = escapeXml((prompt.trim() || "DEMO").slice(0, 60));
  const layers: string[] = [];
  for (let index = 0; index < total; index++) {
    let body: string;
    if (index === 0) {
      body =
        `<rect width="512" height="512" fill="hsl(${hue},40%,88%)"/>` +
        `<text x="24" y="48" fill="hsl(${hue},45%,25%)" font-family="sans-serif" font-size="16" font-weight="700">DEMO · sloj 1</text>` +
        `<text x="24" y="480" fill="hsl(${hue},45%,25%)" font-family="sans-serif" font-size="18">${label}</text>`;
    } else {
      // Oblici se ređaju po krugu da se ne preklapaju potpuno.
      const angle = ((index - 1) / Math.max(1, total - 1)) * Math.PI * 2;
      const cx = Math.round(256 + Math.cos(angle) * 120);
      const cy = Math.round(256 + Math.sin(angle) * 120);
      const color = `hsl(${(hue + index * 47) % 360},65%,48%)`;
      body =
        `<circle cx="${cx}" cy="${cy}" r="70" fill="${color}"/>` +
        `<text x="${cx}" y="${cy + 6}" text-anchor="middle" fill="white" font-family="sans-serif" font-size="18" font-weight="700">sloj ${index + 1}</text>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">${body}</svg>`;
    layers.push(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
  }
  return layers;
}

/**
 * DEMO varijacije (mock bez ključa, O3): N plakata iste vrste, svaki svoje boje,
 * da probni list i varijacije rade i bez pravog provajdera. `poster` je
 * `studioCore.mockOutputDataUrl`, a menja se samo početak heša (boja).
 */
export function mockVariationDataUrls(
  poster: (hash: string) => string,
  hash: string,
  count: number,
): string[] {
  const total = Math.max(1, Math.min(MAX_EXTRA_OUTPUTS + 1, Math.round(count) || 1));
  const base = parseInt(hash.slice(0, 4) || "0", 16) || 0;
  return Array.from({ length: total }, (_, index) =>
    poster(index === 0 ? hash : `${((base + index * 9_973) % 65_536).toString(16).padStart(4, "0")}${hash.slice(4)}`),
  );
}
