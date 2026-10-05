import { CreaLocalAiError, toLocalAiError } from "./errors";
import { CREA_LOCAL_RUNTIMES, modelFileUrls, modelRuntime, type CreaLocalModelId, type CreaRuntimeOptions } from "./models";
import type { FileProgress } from "./progress";

/**
 * Keš modela u Cache Storage-u (K04). Model od 12 MB se preuzima jednom; posle
 * toga alat radi i bez interneta. Fajl se upisuje u keš tek kad stigne CEO -
 * prekinuto preuzimanje ne ostavlja polovinu koja bi sledeći put pukla.
 *
 * Bez Cache Storage-a (stari browser, privatni režim u nekim browserima) sve
 * radi isto, samo se preuzima svaki put.
 */
const CACHE_NAME = "crea-models-v1";

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === "undefined" ? null : await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

export async function fetchModelFile(
  url: string,
  options: { signal?: AbortSignal; expectedBytes?: number; onProgress?: (progress: FileProgress) => void } = {},
): Promise<Blob> {
  const { signal, expectedBytes, onProgress } = options;
  const cache = await openCache();
  const hit = cache ? await cache.match(url).catch(() => undefined) : undefined;
  if (hit) {
    const blob = await hit.blob();
    onProgress?.({ loaded: blob.size, total: blob.size });
    return blob;
  }

  let response: Response;
  try {
    response = await fetch(url, { signal, mode: "cors", credentials: "omit" });
  } catch (error) {
    throw toLocalAiError(error, "NETWORK");
  }
  if (!response.ok || !response.body) throw new CreaLocalAiError("NETWORK");

  // CDN šalje brotli: `Content-Length` je tada veličina kompresovanog fajla, a
  // `response.body` daje raspakovane bajtove. Poznata veličina iz registra ima prednost.
  const declared = Number(response.headers.get("content-length"));
  const encoded = Boolean(response.headers.get("content-encoding"));
  const total = expectedBytes ?? (!encoded && declared > 0 ? declared : null);

  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  onProgress?.({ loaded, total });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as Uint8Array<ArrayBuffer>);
      loaded += value.byteLength;
      onProgress?.({ loaded, total });
    }
  } catch (error) {
    throw toLocalAiError(error, "NETWORK");
  }
  if (signal?.aborted) throw new CreaLocalAiError("ABORTED");

  const type = response.headers.get("content-type") ?? "application/octet-stream";
  const blob = new Blob(chunks, { type });
  if (cache) {
    // Pun disk nije razlog da alat ne radi: rezultat se koristi, samo se ne pamti.
    await cache
      .put(url, new Response(blob, { headers: { "content-type": type, "content-length": String(blob.size) } }))
      .catch(() => undefined);
  }
  return blob;
}

/** Da li je SVE što alat preuzima već na uređaju (potvrda pre preuzimanja tada ne treba). */
export async function modelsCached(ids: readonly CreaLocalModelId[], options: CreaRuntimeOptions = {}): Promise<boolean> {
  if (ids.length === 0) return true;
  const cache = await openCache();
  if (!cache) return false;
  const has = async (url: string) => Boolean(await cache.match(url).catch(() => undefined));

  for (const id of ids) {
    const urls = modelFileUrls(id);
    if (urls.length === 0) return false;
    for (const url of urls) if (!(await has(url))) return false;
  }
  for (const runtime of new Set(ids.map((id) => modelRuntime(id, options)))) {
    const files = Object.keys(CREA_LOCAL_RUNTIMES[runtime].files ?? {});
    if (files.length === 0) return false;
    let any = false;
    for (const url of files) any ||= await has(url);
    if (!any) return false;
  }
  return true;
}
