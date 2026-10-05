"use client";

import { CopyCheck, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { StudioTileJob } from "@/components/app/studio-media-tile";
import { Spinner } from "@/components/ui/spinner";
import { fillCopy } from "@/lib/crea-copy";
import { BLOCKHASH_SIZE, blockhash, duplicateGroups } from "@/lib/crea-duplicates";
import { CREA_LIBRARY_COPY as L } from "@/lib/crea-library-copy";
import type { Locale } from "@/lib/i18n";

const CONCURRENCY = 4;

/** Otisak jedne slike: preuzmi, smanji na 64 × 64 na platnu, blockhash. `null` kad slika ne može da se pročita. */
async function hashImage(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const blob = await (await fetch(url, { signal })).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = BLOCKHASH_SIZE;
    canvas.height = BLOCKHASH_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, BLOCKHASH_SIZE, BLOCKHASH_SIZE);
    bitmap.close();
    return blockhash(context.getImageData(0, 0, BLOCKHASH_SIZE, BLOCKHASH_SIZE).data);
  } catch {
    return null;
  }
}

type DuplicateState =
  | { name: "working"; done: number; total: number }
  | { name: "done"; total: number; groups: StudioTileJob[][] };

/**
 * Duplikati među učitanim slikama (K16, S43): otisci se računaju na uređaju
 * (0 kredita), grupe sličnih slika se pokažu, a „Izaberi duplikate" stavlja u
 * izbor sve osim prve (najnovije) u grupi - pa ih masovno brisanje skloni.
 */
export function LibraryDuplicates({
  locale,
  jobs,
  onSelect,
  onClose,
}: {
  locale: Locale;
  jobs: readonly StudioTileJob[];
  onSelect: (jobs: StudioTileJob[]) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<DuplicateState>({ name: "working", done: 0, total: 0 });

  useEffect(() => {
    const controller = new AbortController();
    const images = jobs.filter((job) => job.kind === "image" && job.status === "done" && job.outputUrl && !job.isMock);
    const hashes: Array<{ id: string; hash: string; job: StudioTileJob }> = [];
    let next = 0;
    let done = 0;
    void (async () => {
      setState({ name: "working", done: 0, total: images.length });
      async function worker() {
        while (next < images.length && !controller.signal.aborted) {
          const job = images[next++];
          const hash = await hashImage(job.outputUrl as string, controller.signal);
          if (hash) hashes.push({ id: job._id, hash, job });
          done += 1;
          if (!controller.signal.aborted) setState({ name: "working", done, total: images.length });
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      if (controller.signal.aborted) return;
      // Isti redosled kao u mreži (najnoviji prvi), pa prvi u grupi ostaje.
      const order = new Map(images.map((job, index) => [job._id, index]));
      hashes.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      setState({ name: "done", total: images.length, groups: duplicateGroups(hashes).map((group) => group.map((entry) => entry.job)) });
    })();
    return () => controller.abort();
  }, [jobs]);

  return (
    <section aria-live="polite" className="surface-inset border border-line bg-paper-strong p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-black text-ink">
          <CopyCheck aria-hidden="true" className="size-4" />
          {state.name === "working"
            ? fillCopy(L.duplicatesWorking[locale], { done: state.done, total: state.total })
            : state.groups.length === 0
              ? fillCopy(L.duplicatesNone[locale], { n: state.total })
              : fillCopy(L.duplicatesFound[locale], { n: state.groups.length })}
          {state.name === "working" ? <Spinner size="xs" /> : null}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={L.duplicatesClose[locale]}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-ink studio-focus-ink"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      {state.name === "done" && state.groups.length > 0 ? (
        <>
          <ul className="mt-2 divide-y divide-line">
            {state.groups.map((group) => (
              <li key={group[0]._id} className="flex gap-2 overflow-x-auto py-2">
                {group.map((job, index) => (
                  <figure key={job._id} className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={job.outputUrl as string}
                      alt=""
                      className="surface-media size-20 object-cover shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
                    />
                    <figcaption className="mt-1 text-center text-[11px] font-black text-muted">
                      {index === 0 ? L.duplicatesKeep[locale] : `#${index + 1}`}
                    </figcaption>
                  </figure>
                ))}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onSelect(state.groups.flatMap((group) => group.slice(1)))}
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--ink)] transition hover:-translate-y-0.5 studio-focus-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            {L.duplicatesSelect[locale]}
          </button>
        </>
      ) : null}
    </section>
  );
}
