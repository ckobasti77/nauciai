import type { MontageOrigin } from "@/convex/creaMontagesCore";
import { reversedKey, type CreaTimelineV1 } from "@/lib/crea-timeline";

/**
 * Nacrti montaže na uređaju (Crea K19; plan K17-6): IndexedDB `crea-montaza-v1`,
 * sirov API bez paketa. `drafts` čuva vremensku liniju (autosave posle 1 s
 * mirovanja), `files` čuva fajlove sa uređaja (`localFileId` → Blob) i pomoćne
 * obrnute snimke (`rev:<ključ>`). Ništa od ovoga ne ide na server.
 *
 * Pregledač sme da isprazni IndexedDB (privatan prozor, malo mesta), pa sve
 * greške ovde znače samo „nacrt se ne čuva" - montaža radi i bez toga.
 */

const DB_NAME = "crea-montaza-v1";
const DRAFTS = "drafts";
const FILES = "files";
/** Posle prvog fajla većeg od ovoga traži se trajno čuvanje (`navigator.storage.persist`). */
const PERSIST_ABOVE_BYTES = 50 * 1024 * 1024;
const MAX_DRAFTS = 20;

export type MontageDraft = {
  id: string;
  title: string;
  timeline: CreaTimelineV1;
  origin: MontageOrigin;
  /** Sačuvan i u Crei (`creaMontages`). */
  convexId?: string;
  updatedAt: number;
};

export type StoredFile = { id: string; blob: Blob; name: string; type: string; size: number; addedAt: number };

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("NEMA_INDEXEDDB"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("INDEXEDDB"));
  });
  opening.catch(() => {
    opening = null;
  });
  return opening;
}

function run<T>(store: string, mode: IDBTransactionMode, action: (objects: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = action(transaction.objectStore(store));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error ?? new Error("INDEXEDDB"));
        transaction.onabort = () => reject(transaction.error ?? new Error("INDEXEDDB"));
      }),
  );
}

export function newDraftId(): string {
  return `nacrt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newFileId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `fajl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function listDrafts(): Promise<MontageDraft[]> {
  const drafts = await run<MontageDraft[]>(DRAFTS, "readonly", (store) => store.getAll() as IDBRequest<MontageDraft[]>);
  return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveDraft(draft: MontageDraft): Promise<void> {
  await run(DRAFTS, "readwrite", (store) => store.put(draft));
  const drafts = await listDrafts();
  // Najstariji nacrti preko granice odlaze (sa svojim fajlovima koje niko drugi ne koristi).
  for (const old of drafts.slice(MAX_DRAFTS)) await deleteDraft(old.id);
}

export async function deleteDraft(id: string): Promise<void> {
  const drafts = await listDrafts();
  const gone = drafts.find((draft) => draft.id === id);
  await run(DRAFTS, "readwrite", (store) => store.delete(id));
  if (!gone) return;
  const stillUsed = new Set(drafts.filter((draft) => draft.id !== id).flatMap((draft) => localIdsOf(draft.timeline)));
  for (const fileId of localIdsOf(gone.timeline)) if (!stillUsed.has(fileId)) await deleteFile(fileId);
}

/** Fajlovi na uređaju koje nacrt koristi: fajlovi sa uređaja i obrnuti snimci njegovih klipova. */
function localIdsOf(timeline: CreaTimelineV1): string[] {
  const files = [...timeline.main, ...timeline.overlay, ...timeline.audio].flatMap((item) => ("localFileId" in item.src ? [item.src.localFileId] : []));
  const reversed = timeline.main.filter((clip) => clip.reverse || clip.boomerang).map((clip) => reversedFileId(reversedKey(clip.src, clip)));
  return [...files, ...reversed];
}

export async function putFile(id: string, blob: Blob, name: string): Promise<void> {
  const record: StoredFile = { id, blob, name, type: blob.type, size: blob.size, addedAt: Date.now() };
  await run(FILES, "readwrite", (store) => store.put(record));
  if (blob.size > PERSIST_ABOVE_BYTES) await navigator.storage?.persist?.().catch(() => false);
}

export async function getFile(id: string): Promise<StoredFile | null> {
  const record = await run<StoredFile | undefined>(FILES, "readonly", (store) => store.get(id) as IDBRequest<StoredFile | undefined>);
  return record ?? null;
}

export async function deleteFile(id: string): Promise<void> {
  await run(FILES, "readwrite", (store) => store.delete(id));
}

/** Pomoćni obrnut snimak (K17-9) ima isti ključ kao u `reversedKey`. */
export function reversedFileId(key: string): string {
  return `rev:${key}`;
}
