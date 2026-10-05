"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { FolderOpen, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { deleteDraft, listDrafts, type MontageDraft } from "@/components/crea/montaza/draft-store";
import { formatClock } from "@/components/crea/montaza/format";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fillCopy } from "@/lib/crea-copy";
import { MONTAGE_COPY as T } from "@/lib/crea-montage-copy";
import { timelineDuration } from "@/lib/crea-timeline";
import type { Locale } from "@/lib/i18n";

/**
 * Projekti montaže (K19, plan K17-6): nacrti na ovom uređaju (IndexedDB, sa
 * fajlovima sa uređaja) i projekti sačuvani u Crei (Convex, samo reference na
 * radove iz galerije - nastavlja se na drugom uređaju). Brisanje projekta nikad
 * ne briše radove iz galerije.
 */

function dateOf(timestamp: number, locale: Locale): string {
  return new Date(timestamp).toLocaleString(locale === "sr" ? "sr-Latn-RS" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function ProjectRow({
  title,
  meta,
  current,
  locale,
  onOpen,
  onDelete,
}: {
  title: string;
  meta: ReactNode;
  current: boolean;
  locale: Locale;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate type-body-sm font-black text-ink">
          {title}
          {current ? <span className="ml-2 rounded-full bg-yellow px-2 text-[11px] font-black text-ink">{T.current[locale]}</span> : null}
        </p>
        <p className="font-mono text-xs font-bold text-muted">{meta}</p>
      </div>
      <Button variant="secondary" onClick={onOpen} disabled={current} icon={<FolderOpen aria-hidden="true" className="size-4" />}>
        {T.open[locale]}
      </Button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={fillCopy(T.deleteProject[locale], { name: title })}
        title={fillCopy(T.deleteProject[locale], { name: title })}
        className="grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}

export function ProjectsPanel({
  locale,
  currentDraftId,
  currentConvexId,
  refreshKey,
  onOpenDraft,
  onOpenSaved,
}: {
  locale: Locale;
  currentDraftId: string;
  currentConvexId: string | null;
  refreshKey: number;
  onOpenDraft: (draft: MontageDraft) => void;
  onOpenSaved: (id: Id<"creaMontages">) => void;
}) {
  const [drafts, setDrafts] = useState<MontageDraft[] | null>(null);
  const [reload, setReload] = useState(0);
  const { isAuthenticated } = useConvexAuth();
  const saved = useQuery(api.creaMontages.listMine, isAuthenticated ? {} : "skip");
  const removeSaved = useMutation(api.creaMontages.deleteMontage);

  useEffect(() => {
    let alive = true;
    void listDrafts()
      .catch(() => [])
      .then((list) => {
        if (alive) setDrafts(list);
      });
    return () => {
      alive = false;
    };
  }, [refreshKey, reload]);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h4 className="type-body-sm font-black uppercase tracking-normal text-muted">{T.onDevice[locale]}</h4>
        {drafts && drafts.length > 0 ? (
          <ul className="divide-y divide-line border-y border-line">
            {drafts.map((draft) => (
              <ProjectRow
                key={draft.id}
                locale={locale}
                title={draft.title || T.projectPlaceholder[locale]}
                meta={`${formatClock(timelineDuration(draft.timeline), locale, false)} · ${T.origins[draft.origin][locale]} · ${dateOf(draft.updatedAt, locale)}`}
                current={draft.id === currentDraftId}
                onOpen={() => onOpenDraft(draft)}
                onDelete={() => {
                  if (!window.confirm(T.confirmDelete[locale])) return;
                  void deleteDraft(draft.id).finally(() => setReload((value) => value + 1));
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="type-body-sm font-semibold text-muted">{drafts === null ? T.loading[locale] : T.noDrafts[locale]}</p>
        )}
      </section>
      <section className="space-y-2 border-t border-line pt-4">
        <h4 className="type-body-sm font-black uppercase tracking-normal text-muted">{T.inCrea[locale]}</h4>
        {saved && saved.length > 0 ? (
          <ul className="divide-y divide-line border-y border-line">
            {saved.map((row) => (
              <ProjectRow
                key={row._id}
                locale={locale}
                title={row.title}
                meta={`${formatClock(row.durationS, locale, false)} · ${T.origins[row.origin][locale]} · ${dateOf(row.updatedAt, locale)}`}
                current={row._id === currentConvexId}
                onOpen={() => onOpenSaved(row._id)}
                onDelete={() => {
                  if (!window.confirm(T.confirmDelete[locale])) return;
                  void removeSaved({ id: row._id });
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="type-body-sm font-semibold text-muted">{saved === undefined && isAuthenticated ? T.loading[locale] : T.noSaved[locale]}</p>
        )}
      </section>
    </div>
  );
}
