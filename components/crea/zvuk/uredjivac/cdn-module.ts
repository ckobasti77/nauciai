import { fetchModelFile } from "@/lib/crea-local-ai/cache";

/**
 * ES modul sa jsdelivr-a (zakucana verzija) kroz naš keš, uvezen kao `blob:` URL
 * (Crea K24). Za biblioteke koje sopstveni kod pretvaraju u tekst i šalju ga u
 * AudioWorklet (`signalsmith-stretch`) ili koje se pokreću kao procesor worklet-a
 * (`@sapphi-red/web-noise-suppressor`): Turbopack ih pri pakovanju menja, pa u
 * worklet-u stanu (čvor se nikad ne javi „spreman") - provereno u pregledaču.
 * Original sa CDN-a radi; drugi put dolazi iz keša, i bez interneta.
 */
export async function importCdnModule<T>(url: string, options: { bytes: number; signal?: AbortSignal; onProgress?: (loaded: number) => void }): Promise<T> {
  const file = await fetchModelFile(url, { signal: options.signal, expectedBytes: options.bytes, onProgress: (progress) => options.onProgress?.(progress.loaded) });
  const objectUrl = URL.createObjectURL(new Blob([await file.text()], { type: "text/javascript" }));
  try {
    return (await import(/* webpackIgnore: true */ objectUrl)) as T;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
