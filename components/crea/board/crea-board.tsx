"use client";

/* eslint-disable @next/next/no-img-element -- potpisani Convex URL-ovi radova, kao u ostatku radionice. */

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { AudioLines, Expand, ImagePlus, LocateFixed, Minus, Plus, StickyNote, Trash2, Wand2, X } from "lucide-react";
import { useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { IgraState } from "@/components/igra/igra-state";
import { useSaveLocalResult } from "@/components/crea/use-save-local-result";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CREA_BOARD_COPY as T } from "@/lib/crea-fair-copy";
import type { Locale } from "@/lib/i18n";

/** Atribut mete: element koji prima karticu table kao referencu (composer). */
export const BOARD_DROP_ATTR = "data-crea-drop";
const BODY_DRAG_ATTR = "data-crea-board-drag";

/** Dok se rad vuče, `<body>` nosi znak - composer tada pokazuje da prima referencu (globals.css). */
function markBoardDrag(on: boolean) {
  if (on) document.body.setAttribute(BODY_DRAG_ATTR, "");
  else document.body.removeAttribute(BODY_DRAG_ATTR);
}
const ZOOM = { min: 0.3, max: 2, step: 1.25 } as const;

type View = { x: number; y: number; scale: number };
type Drag = { id: string; startX: number; startY: number; originX: number; originY: number; x: number; y: number; moved: boolean };
export type BoardItem = {
  _id: Id<"creaBoardItems">;
  kind: "work" | "note";
  x: number;
  y: number;
  w: number;
  text: string | null;
  jobId: Id<"generationJobs"> | null;
  mediaKind: "image" | "video" | "audio" | null;
  outputUrl: string | null;
};

const clampScale = (value: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, value));

function ToolButton({ label, onClick, children, disabled = false }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="igra-press inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Izbor rada iz galerije: poslednji gotovi radovi korisnika. */
function WorkPicker({ locale, onPick, onClose }: { locale: Locale; onPick: (jobId: Id<"generationJobs">) => void; onClose: () => void }) {
  const { results, status } = usePaginatedQuery(api.studio.listMyJobs, {}, { initialNumItems: 24 });
  const done = results.filter((job) => job.status === "done" && job.outputUrl);
  return (
    <div
      role="dialog"
      aria-label={T.pickTitle[locale]}
      className="surface-card absolute left-2 top-14 z-30 w-[min(320px,calc(100%-1rem))] border-2 border-ink bg-paper-strong p-3 shadow-[4px_4px_0_0_var(--shadow-hard)]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-ink">{T.pickTitle[locale]}</p>
        <ToolButton label={T.close[locale]} onClick={onClose}>
          <X aria-hidden="true" className="size-4" />
        </ToolButton>
      </div>
      {status === "LoadingFirstPage" ? (
        <div className="grid min-h-24 place-items-center">
          <Spinner size="md" className="text-muted" />
        </div>
      ) : done.length === 0 ? (
        <IgraState compact variant="prazno" art="prazno.radovi" locale={locale} title={T.pickEmpty[locale]} />
      ) : (
        <ul className="mt-2 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto">
          {done.map((job) => (
            <li key={job._id}>
              <button
                type="button"
                onClick={() => onPick(job._id as Id<"generationJobs">)}
                className="surface-media grid aspect-square w-full place-items-center overflow-hidden bg-paper shadow-[inset_0_0_0_1px_var(--shadow-hard-14)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {job.kind === "image" ? (
                  <img src={job.outputUrl!} alt="" className="size-full object-cover" />
                ) : job.kind === "video" ? (
                  <video src={job.outputUrl!} muted preload="metadata" className="size-full object-cover" />
                ) : (
                  <AudioLines aria-hidden="true" className="size-6 text-ink" />
                )}
                <span className="sr-only">{job.modelSlug}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Tabla Cree (K28, U13): beskonačna tabla za reference, radove i beleške. Prazno
 * mesto se vuče (pomeranje), točkić i dugmad zumiraju, kartice se pomeraju
 * vučenjem i raspored se čuva po korisniku (`creaBoard.moveItem`). Kartica rada
 * pušta se na composer (`data-crea-drop="reference"`) i postaje referenca; isto
 * radi dugme „Kao referenca" (dodir, tastatura).
 */
type BoardProps = {
  locale: Locale;
  size: "column" | "full";
  onUseAsReference?: (jobId: Id<"generationJobs">) => void;
  onExpand?: () => void;
  onClose?: () => void;
};

/** Upisi table (Convex mutacije u radionici, lažni u prikazu za proveru). */
export type BoardActions = {
  addWork: (args: { jobId: Id<"generationJobs">; x: number; y: number }) => Promise<unknown>;
  addNote: (args: { text: string; x: number; y: number }) => Promise<unknown>;
  moveItem: (args: { itemId: Id<"creaBoardItems">; x: number; y: number }) => Promise<unknown>;
  updateNote: (args: { itemId: Id<"creaBoardItems">; text: string }) => Promise<unknown>;
  removeItem: (args: { itemId: Id<"creaBoardItems"> }) => Promise<unknown>;
  /** Okači sliku kao lokalni rad (0 kr) i vrati njegov posao. */
  upload: (file: File) => Promise<Id<"generationJobs">>;
};

export function CreaBoard(props: BoardProps) {
  const items = useQuery(api.creaBoard.listBoard, {}) as BoardItem[] | undefined;
  const addWork = useMutation(api.creaBoard.addWork);
  const addNote = useMutation(api.creaBoard.addNote);
  const moveItem = useMutation(api.creaBoard.moveItem);
  const updateNote = useMutation(api.creaBoard.updateNote);
  const removeItem = useMutation(api.creaBoard.removeItem);
  const saveLocal = useSaveLocalResult();
  const actions: BoardActions = {
    addWork,
    addNote,
    moveItem,
    updateNote,
    removeItem,
    upload: async (file) => {
      const saved = await saveLocal({ toolId: "slika.tabla", kind: "image", blob: file, projectId: null });
      if (!saved.ok) throw new Error(saved.reason);
      return saved.jobId;
    },
  };
  return (
    <BoardCanvas
      {...props}
      items={items}
      actions={actions}
      Picker={WorkPicker}
    />
  );
}

/** Prikaz table bez Convex-a: stavke i upisi stižu spolja (radionica ili prikaz za proveru). */
export function BoardCanvas({
  locale,
  size,
  onUseAsReference,
  onExpand,
  onClose,
  items,
  actions,
  Picker,
}: BoardProps & {
  items: BoardItem[] | undefined;
  actions: BoardActions;
  /** Izbor rada iz galerije (u prikazu za proveru - lažni). */
  Picker: ComponentType<{ locale: Locale; onPick: (jobId: Id<"generationJobs">) => void; onClose: () => void }>;
}) {
  const { addWork, addNote, moveItem, updateNote, removeItem } = actions;

  const [view, setView] = useState<View>({ x: 24, y: 24, scale: 1 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pan, setPan] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Tačka table u sredini vidljivog dela - tamo stiže nova stavka. */
  function centerPoint() {
    const rect = viewportRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 400;
    const height = rect?.height ?? 300;
    return { x: (width / 2 - view.x) / view.scale - 110, y: (height / 2 - view.y) / view.scale - 80 };
  }

  function fail(thrown: unknown) {
    const text = thrown instanceof Error ? thrown.message : String(thrown);
    setError(text.includes("TABLA_PUNA") ? T.full[locale] : T.failed[locale]);
  }

  function handlePick(jobId: Id<"generationJobs">) {
    setPicking(false);
    const point = centerPoint();
    void addWork({ jobId, x: point.x, y: point.y }).catch(fail);
  }

  function zoomBy(factor: number, anchor?: { x: number; y: number }) {
    setView((current) => {
      const scale = clampScale(current.scale * factor);
      const rect = viewportRef.current?.getBoundingClientRect();
      const ax = anchor?.x ?? (rect ? rect.width / 2 : 0);
      const ay = anchor?.y ?? (rect ? rect.height / 2 : 0);
      // Tačka ispod sidra ostaje na mestu.
      return { scale, x: ax - ((ax - current.x) * scale) / current.scale, y: ay - ((ay - current.y) * scale) / current.scale };
    });
  }

  function onBackgroundDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPan({ startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y });
  }

  function onBackgroundMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pan) return;
    setView((current) => ({ ...current, x: pan.originX + event.clientX - pan.startX, y: pan.originY + event.clientY - pan.startY }));
  }

  function onCardDown(event: ReactPointerEvent<HTMLElement>, item: BoardItem) {
    if ((event.target as HTMLElement).closest("button, textarea, a")) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id: item._id, startX: event.clientX, startY: event.clientY, originX: item.x, originY: item.y, x: item.x, y: item.y, moved: false });
    if (item.kind === "work") markBoardDrag(true);
  }

  function onCardMove(event: ReactPointerEvent<HTMLElement>) {
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / view.scale;
    const dy = (event.clientY - drag.startY) / view.scale;
    setDrag({ ...drag, x: drag.originX + dx, y: drag.originY + dy, moved: drag.moved || Math.abs(dx) + Math.abs(dy) > 3 });
  }

  function onCardUp(event: ReactPointerEvent<HTMLElement>, item: BoardItem) {
    markBoardDrag(false);
    const current = drag;
    setDrag(null);
    if (!current || !current.moved) return;
    // Pušteno na composer (van table): referenca, kartica ostaje gde je bila.
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(`[${BOARD_DROP_ATTR}="reference"]`);
    if (target && item.kind === "work" && item.jobId && item.outputUrl && onUseAsReference) {
      onUseAsReference(item.jobId);
      return;
    }
    void moveItem({ itemId: item._id, x: current.x, y: current.y }).catch(fail);
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const jobId = await actions.upload(file);
      const point = centerPoint();
      await addWork({ jobId, x: point.x, y: point.y });
    } catch (thrown) {
      fail(thrown);
    } finally {
      setUploading(false);
    }
  }

  const empty = items !== undefined && items.length === 0;

  return (
    <div
      className={cn(
        "surface-card relative flex min-w-0 flex-col overflow-hidden border-2 border-ink bg-paper-strong",
        size === "full" ? "h-[min(78dvh,760px)]" : "h-[440px]",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line p-2">
        <button
          type="button"
          onClick={() => setPicking((value) => !value)}
          aria-expanded={picking}
          title={T.addWorkTitle[locale]}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink bg-yellow px-3 text-xs font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <Plus aria-hidden="true" className="size-3.5" />
          {T.addWork[locale]}
        </button>
        <button
          type="button"
          onClick={() => {
            const point = centerPoint();
            void addNote({ text: "", x: point.x, y: point.y }).catch(fail);
          }}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3 text-xs font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <StickyNote aria-hidden="true" className="size-3.5" />
          {T.addNote[locale]}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title={T.addImageTitle[locale]}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3 text-xs font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          {uploading ? <Spinner size="xs" /> : <ImagePlus aria-hidden="true" className="size-3.5" />}
          {uploading ? T.uploading[locale] : T.addImage[locale]}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleUpload(file);
          }}
        />
        <span className="flex-1" />
        <ToolButton label={T.zoomOut[locale]} onClick={() => zoomBy(1 / ZOOM.step)}>
          <Minus aria-hidden="true" className="size-4" />
        </ToolButton>
        <ToolButton label={T.zoomIn[locale]} onClick={() => zoomBy(ZOOM.step)}>
          <Plus aria-hidden="true" className="size-4" />
        </ToolButton>
        <ToolButton label={T.fit[locale]} onClick={() => setView({ x: 24, y: 24, scale: 1 })}>
          <LocateFixed aria-hidden="true" className="size-4" />
        </ToolButton>
        {onExpand ? (
          <ToolButton label={T.expand[locale]} onClick={onExpand}>
            <Expand aria-hidden="true" className="size-4" />
          </ToolButton>
        ) : null}
        {onClose ? (
          <ToolButton label={T.close[locale]} onClick={onClose}>
            <X aria-hidden="true" className="size-4" />
          </ToolButton>
        ) : null}
      </div>

      {picking ? <Picker locale={locale} onPick={handlePick} onClose={() => setPicking(false)} /> : null}

      <div
        ref={viewportRef}
        role="application"
        aria-label={T.title[locale]}
        aria-describedby="crea-board-hint"
        onPointerDown={onBackgroundDown}
        onPointerMove={onBackgroundMove}
        onPointerUp={() => setPan(null)}
        onPointerCancel={() => setPan(null)}
        onWheel={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1, { x: event.clientX - rect.left, y: event.clientY - rect.top });
        }}
        className={cn(
          "relative min-h-0 flex-1 touch-none overflow-hidden bg-paper",
          "bg-[radial-gradient(circle,var(--color-line)_1px,transparent_1.5px)] [background-size:24px_24px]",
          pan ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ backgroundPosition: `${view.x}px ${view.y}px` }}
      >
        <p id="crea-board-hint" className="sr-only">
          {T.moveHint[locale]}
        </p>
        {items === undefined ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Spinner size="md" className="text-muted" />
          </div>
        ) : null}
        {empty ? (
          <p className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 text-center type-body-sm font-bold text-muted">
            {T.empty[locale]}
          </p>
        ) : null}
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          {(items ?? []).map((item) => {
            const dragging = drag?.id === item._id;
            const x = dragging ? drag.x : item.x;
            const y = dragging ? drag.y : item.y;
            return (
              <article
                key={item._id}
                onPointerDown={(event) => onCardDown(event, item)}
                onPointerMove={onCardMove}
                onPointerUp={(event) => onCardUp(event, item)}
                onPointerCancel={() => {
                  markBoardDrag(false);
                  setDrag(null);
                }}
                className={cn(
                  // Jedan okvir po grupi: tabla nosi `border-2 border-ink`, kartice samo tanku liniju i senku.
                  "surface-card group pointer-events-auto absolute cursor-move border border-line p-2 text-ink shadow-[3px_3px_0_0_var(--shadow-hard)]",
                  item.kind === "note" ? "bg-yellow" : "bg-paper-strong",
                  dragging && "z-20 shadow-[6px_6px_0_0_var(--shadow-hard)]",
                )}
                style={{ left: x, top: y, width: item.w }}
              >
                {item.kind === "note" ? (
                  <textarea
                    defaultValue={item.text ?? ""}
                    placeholder={T.notePlaceholder[locale]}
                    aria-label={T.addNote[locale]}
                    maxLength={400}
                    rows={4}
                    onBlur={(event) => {
                      if (event.target.value !== (item.text ?? "")) void updateNote({ itemId: item._id, text: event.target.value }).catch(fail);
                    }}
                    className="paper-island surface-inset block w-full resize-none bg-transparent p-1 text-sm font-bold leading-snug text-ink placeholder:text-ink/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                  />
                ) : item.outputUrl && item.mediaKind === "image" ? (
                  <img src={item.outputUrl} alt="" draggable={false} className="surface-media block w-full select-none shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" />
                ) : item.outputUrl && item.mediaKind === "video" ? (
                  <video src={item.outputUrl} muted loop playsInline preload="metadata" className="surface-media block w-full" />
                ) : item.outputUrl && item.mediaKind === "audio" ? (
                  <audio src={item.outputUrl} controls preload="none" className="w-full" />
                ) : (
                  <p className="surface-media grid aspect-video place-items-center bg-paper p-2 text-center text-xs font-bold text-muted">{T.missing[locale]}</p>
                )}
                <div className="mt-1.5 flex items-center justify-end gap-1">
                  {item.kind === "work" && item.jobId && item.outputUrl && onUseAsReference ? (
                    <button
                      type="button"
                      onClick={() => onUseAsReference(item.jobId!)}
                      className="mr-auto inline-flex min-h-11 items-center gap-1 rounded-full border-2 border-ink bg-paper-strong px-2.5 text-xs font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      <Wand2 aria-hidden="true" className="size-3.5" />
                      {T.useAsReference[locale]}
                    </button>
                  ) : null}
                  <ToolButton label={T.remove[locale]} onClick={() => void removeItem({ itemId: item._id }).catch(fail)}>
                    <Trash2 aria-hidden="true" className="size-4" />
                  </ToolButton>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {error ? (
        <p role="alert" className="border-t border-line px-3 py-2 text-xs font-black text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : (
        <p className="border-t border-line px-3 py-2 text-xs font-bold text-muted">{T.hint[locale]}</p>
      )}
    </div>
  );
}
