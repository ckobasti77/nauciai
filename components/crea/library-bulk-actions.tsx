"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { Columns2, FolderInput, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_LIBRARY_COPY as L } from "@/lib/crea-library-copy";
import type { Locale } from "@/lib/i18n";

/** Isto kao `DELETE_BATCH_MAX` u `convex/creaLibrary.ts`. */
const DELETE_BATCH = 20;
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;

const ACTION_BUTTON =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 pointer-coarse:min-h-11 studio-focus-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/**
 * Masovne akcije nad izabranim radovima (K16, S43): premesti u projekat, obriši
 * (uz potvrdu, u paketima) i uporedi 2-4 rada. Preuzimanje ostaje u traci mreže.
 */
export function LibraryBulkActions({
  locale,
  selectedIds,
  busy,
  onDone,
  onCompare,
}: {
  locale: Locale;
  selectedIds: readonly string[];
  /** Druga akcija (preuzimanje) je u toku. */
  busy: boolean;
  /** Posle akcije: koji radovi više ne postoje (brisanje) i poruka za korisnika. */
  onDone: (result: { removedIds: string[]; message: string; error?: boolean }) => void;
  onCompare: () => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const projects = useQuery(api.studioProjects.listMyProjects, isAuthenticated ? {} : "skip");
  const moveJobs = useMutation(api.creaLibrary.moveJobs);
  const deleteJobs = useMutation(api.creaLibrary.deleteJobs);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState<{ kind: "move" | "delete"; done: number; total: number } | null>(null);
  const moveId = useId();
  const count = selectedIds.length;
  const disabled = busy || working !== null;
  const canCompare = count >= COMPARE_MIN && count <= COMPARE_MAX;

  async function handleMove(value: string) {
    if (!value) return;
    setWorking({ kind: "move", done: 0, total: count });
    try {
      const result = await moveJobs({
        jobIds: selectedIds as Id<"generationJobs">[],
        projectId: value === "none" ? null : (value as Id<"studioProjects">),
      });
      onDone({ removedIds: [], message: fillCopy(L.moved[locale], { n: result.moved }) });
    } catch {
      onDone({ removedIds: [], message: L.actionFailed[locale], error: true });
    } finally {
      setWorking(null);
    }
  }

  async function handleDelete() {
    setConfirming(false);
    const ids = [...selectedIds];
    const removed: string[] = [];
    let skipped = 0;
    setWorking({ kind: "delete", done: 0, total: ids.length });
    try {
      for (let i = 0; i < ids.length; i += DELETE_BATCH) {
        const batch = ids.slice(i, i + DELETE_BATCH);
        const result = await deleteJobs({ jobIds: batch as Id<"generationJobs">[] });
        const skippedIds = new Set(result.skipped.map((entry) => entry.jobId as string));
        removed.push(...batch.filter((id) => !skippedIds.has(id)));
        skipped += result.skipped.length;
        setWorking({ kind: "delete", done: Math.min(ids.length, i + batch.length), total: ids.length });
      }
      const parts = [fillCopy(L.deleted[locale], { n: removed.length })];
      if (skipped > 0) parts.push(fillCopy(L.deleteSkipped[locale], { n: skipped }));
      onDone({ removedIds: removed, message: parts.join(" "), error: skipped > 0 });
    } catch {
      onDone({ removedIds: removed, message: L.actionFailed[locale], error: true });
    } finally {
      setWorking(null);
    }
  }

  if (confirming) {
    return (
      <div role="alertdialog" aria-label={L.delete[locale]} className="flex w-full flex-wrap items-center gap-2 border-t border-line pt-3">
        <p className="min-w-0 flex-1 basis-56 type-caption font-extrabold text-ink">{fillCopy(L.deleteConfirm[locale], { n: count })}</p>
        <button type="button" onClick={() => void handleDelete()} className={cn(ACTION_BUTTON, "border-red-700 bg-red-700 text-white")}>
          <Trash2 aria-hidden="true" className="size-3.5" />
          {L.deleteYes[locale]}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={ACTION_BUTTON}>
          {L.cancel[locale]}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {working ? (
        <span className="inline-flex items-center gap-2 type-caption font-extrabold text-ink" role="status">
          <Spinner size="xs" />
          {working.kind === "move" ? L.moving[locale] : fillCopy(L.deleting[locale], { done: working.done, total: working.total })}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onCompare}
        disabled={disabled || !canCompare}
        title={canCompare ? L.compare[locale] : L.compareHint[locale]}
        className={ACTION_BUTTON}
      >
        <Columns2 aria-hidden="true" className="size-3.5" />
        {L.compare[locale]}
      </button>
      <label htmlFor={moveId} className="sr-only">
        {L.moveTo[locale]}
      </label>
      <span className="relative inline-flex">
        <FolderInput aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink" />
        <select
          id={moveId}
          value=""
          disabled={disabled}
          onChange={(event) => void handleMove(event.target.value)}
          className={cn(ACTION_BUTTON, "cursor-pointer appearance-none pl-8 pr-4")}
        >
          <option value="">{L.moveTo[locale]}</option>
          <option value="none">{L.noProject[locale]}</option>
          {(projects ?? [])
            .filter((project) => project.archivedAt === undefined)
            .map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
        </select>
      </span>
      <button type="button" onClick={() => setConfirming(true)} disabled={disabled} className={ACTION_BUTTON}>
        <Trash2 aria-hidden="true" className="size-3.5" />
        {L.delete[locale]}
      </button>
    </div>
  );
}
