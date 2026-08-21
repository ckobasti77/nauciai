/* eslint-disable @next/next/no-img-element -- pregled je lokalni `blob:` URL, koji next/image ne obradjuje. */
"use client";

import { ChevronLeft, ChevronRight, MoveRight, Music, RefreshCw, UploadCloud, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";

import { useSlotUpload } from "@/components/studio/use-slot-upload";
import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { measureFailureMessage, uploadErrorMessage } from "@/lib/studio-messages";
import {
  FRAME_LABELS,
  slotKind,
  slotLabel,
  validateSlotFile,
  type FramePair,
  type ModeSpec,
  type SlotFile,
  type SlotFiles,
  type SlotSpec,
} from "@/lib/studio-slots";

/**
 * Ulazni slotovi iz STUDIO-CATALOG-V4 sekcije 5. Sve četiri komponente dele
 * isti prijem fajla: validacija MIME i veličine PRE uploada, traka napretka,
 * pregled sličice, dugme za uklanjanje - i nijedna ne zna ime nijednog modela,
 * jer sve dolazi iz `inputSpec`-a reda kataloga.
 */

const SURFACE =
  "surface-inset relative flex w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-ink bg-paper p-4 text-center transition duration-200";

const REMOVE =
  "absolute right-1.5 top-1.5 inline-flex size-8 items-center justify-center rounded-full border-2 border-ink bg-white text-ink shadow-[2px_2px_0_0_rgba(14,49,88,0.18)] hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

// Zamena fajla u JEDNOM koraku (nalaz 8): `<label>` vezan za isti, uvek prisutan
// file input otvara birač bez prethodnog "Ukloni". Levo od dugmeta za uklanjanje.
const REPLACE =
  "absolute right-11 top-1.5 inline-flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-ink bg-white text-ink shadow-[2px_2px_0_0_rgba(14,49,88,0.18)] hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const TILE_BUTTON =
  "inline-flex size-7 items-center justify-center rounded-full border-2 border-ink bg-white text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** Ima li u prevlačenju uopšte fajlova - isti oblik provere kao kod avatara. */
function hasFileDrag(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false;
  const items = Array.from(dataTransfer.items ?? []);
  if (items.length > 0) return items.some((item) => item.kind === "file");

  return Array.from(dataTransfer.types ?? []).includes("Files");
}

type Pending = { name: string; progress: number };

/**
 * Prijem fajlova za jedan slot: validacija, upload sa napretkom i poruka
 * greške. Deljeno izmedju svih slot komponenti da bi jedan slot i mreža
 * slotova odbijali isti fajl istom rečenicom.
 */
function useSlotIntake({
  slot,
  spec,
  locale,
  capacity,
  onAccept,
  onUploadingChange,
}: {
  slot: string;
  spec: SlotSpec;
  locale: Locale;
  capacity: number;
  onAccept: (files: SlotFile[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const upload = useSlotUpload();
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onUploadingChange?.(pending !== null);
  }, [pending, onUploadingChange]);

  const intake = useCallback(
    async (incoming: File[]) => {
      setError(null);
      if (incoming.length === 0) return;

      if (capacity <= 0) {
        setError(
          locale === "sr" ? "Slot je pun. Ukloni fajl pa dodaj drugi." : "The slot is full. Remove a file first.",
        );
        return;
      }

      const files = incoming.slice(0, capacity);
      if (incoming.length > capacity) {
        setError(
          locale === "sr"
            ? `Stalo je još ${capacity}. Ostatak nije dodat.`
            : `Only ${capacity} more fit. The rest were not added.`,
        );
      }

      const accepted: SlotFile[] = [];
      for (const file of files) {
        const problem = validateSlotFile(file, spec, locale);
        if (problem) {
          setError(problem);
          break;
        }

        setPending({ name: file.name, progress: 0 });
        try {
          const uploaded = await upload(file, slot, (fraction) =>
            setPending({ name: file.name, progress: fraction }),
          );
          accepted.push(uploaded);
          // Fajl je gore, ali mu se dužina ne čita - a po dužini se naplaćuje.
          // Upload nije neuspeo, pa se fajl zadržava; razlog se kaže odmah, da
          // korisnik ne gleda u zaključano dugme bez objašnjenja (X1).
          if (uploaded.measureFailure !== undefined) {
            setError(measureFailureMessage(uploaded.measureFailure, locale));
          }
        } catch (uploadError) {
          // Prijava bez važeće dozvole (X5) ima svoj sledeći korak - okači
          // ponovo - pa se razlog ne gubi u opštoj rečenici.
          setError(
            uploadErrorMessage(
              uploadError instanceof Error ? uploadError.message : String(uploadError),
              locale,
            ),
          );
          break;
        } finally {
          setPending(null);
        }
      }

      if (accepted.length > 0) onAccept(accepted);
    },
    [capacity, locale, onAccept, slot, spec, upload],
  );

  return { intake, pending, error, setError };
}

function ProgressBar({ pending, locale }: { pending: Pending; locale: Locale }) {
  return (
    <div className="w-full">
      <div className="h-3 w-full overflow-hidden rounded-full border-2 border-ink bg-white">
        <div
          className="h-full rounded-full bg-yellow transition-[width] duration-200"
          style={{ width: `${Math.round(pending.progress * 100)}%` }}
        />
      </div>
      <p className="mt-1 truncate text-xs font-bold text-muted">
        {locale === "sr" ? "Šaljem" : "Uploading"} {pending.name} · {Math.round(pending.progress * 100)}%
      </p>
    </div>
  );
}

function Preview({ file, className }: { file: SlotFile; className?: string }) {
  const url = file.url ?? undefined;

  if (file.mime.startsWith("image/") && url) {
    return <img src={url} alt={file.name} className={cn("size-full object-cover", className)} />;
  }

  if (file.mime.startsWith("video/") && url) {
    // Nikad `<video src>` bez ograničenja: `preload="metadata"` i `#t=0.1`
    // povlače jedan kadar umesto celog fajla.
    return (
      <video
        src={`${url}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        className={cn("size-full object-cover", className)}
      />
    );
  }

  return (
    <div className={cn("flex size-full flex-col items-center justify-center gap-1 bg-paper px-2", className)}>
      <Music className="size-5 text-ink" aria-hidden="true" />
      <span className="line-clamp-2 text-[11px] font-bold text-muted">{file.name}</span>
    </div>
  );
}

/**
 * Prevlačenje preko CELOG ekrana kad model u ovom režimu ima tačno jedan
 * smislen cilj (konvencija iz AGENTS.md). Prekrivač je isti obrazac kao kod
 * avatara: window-level čuvari, jasan prekrivač i tek onda prijem fajla.
 */
function useFullScreenDrop(enabled: boolean, onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  // `useEffectEvent` drži poslednji `onFiles` bez upisa u ref tokom rendera i
  // bez ponovnog vezivanja slušalaca na svaki render.
  const apply = useEffectEvent((files: File[]) => onFiles(files));

  useEffect(() => {
    if (!enabled) return;

    function enter(event: globalThis.DragEvent) {
      if (!hasFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    }

    function over(event: globalThis.DragEvent) {
      if (!hasFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      setDragging(true);
    }

    function leave() {
      if (depth.current === 0) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    }

    function drop(event: globalThis.DragEvent) {
      if (!hasFileDrag(event.dataTransfer) && depth.current === 0) return;
      // Bez ovoga browser napusti stranicu i otvori fajl.
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) apply(files);
    }

    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);

    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [enabled]);

  return dragging;
}

export function FullScreenDropOverlay({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div className="absolute inset-4 rounded-[16px] border-[3px] border-dashed border-yellow bg-ink/45 backdrop-blur-[3px]" />
      <div className="surface-card absolute left-1/2 top-1/2 w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 border-[3px] border-ink bg-yellow p-6 text-center shadow-[10px_10px_0_0_rgba(255,255,255,0.95)]">
        <span className="mx-auto inline-flex size-16 items-center justify-center rounded-full border-[3px] border-ink bg-white text-ink">
          <UploadCloud className="size-8" />
        </span>
        <p className="mt-4 text-2xl font-black leading-tight text-ink">{label}</p>
        <p className="mt-3 text-sm font-bold leading-6 text-ink/80">{hint}</p>
      </div>
    </div>
  );
}

/**
 * Jedan fajl. Cela površina slota prima prevučen fajl, a klik otvara birač.
 * Kad je slot jedini cilj u režimu, `fullScreen` uključuje i prijem preko
 * celog ekrana.
 */
export function DropSlot({
  slot,
  spec,
  file,
  onChange,
  locale,
  label,
  fullScreen = false,
  disabled = false,
  className,
  onUploadingChange,
}: {
  slot: string;
  spec: SlotSpec;
  file: SlotFile | null;
  onChange: (next: SlotFile | null) => void;
  locale: Locale;
  label?: string;
  fullScreen?: boolean;
  disabled?: boolean;
  className?: string;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const inputId = useId();
  const [over, setOver] = useState(false);
  const title = label ?? slotLabel(slot, locale);
  const kind = slotKind(spec.accept);

  const accept = useCallback(
    (files: SlotFile[]) => {
      if (file?.url) URL.revokeObjectURL(file.url);
      onChange(files[0] ?? null);
    },
    [file, onChange],
  );

  const { intake, pending, error } = useSlotIntake({
    slot,
    spec,
    locale,
    capacity: disabled ? 0 : 1,
    onAccept: accept,
    onUploadingChange,
  });

  const dragging = useFullScreenDrop(fullScreen && !disabled && pending === null, (files) => {
    void intake(files);
  });

  function onDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    setOver(false);
    if (disabled) return;
    void intake(Array.from(event.dataTransfer.files ?? []));
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-black uppercase tracking-wide text-muted">{title}</span>
        {file ? (
          <span className="text-xs font-bold text-muted">{file.name}</span>
        ) : (
          <span className="text-xs font-bold text-muted">
            {kind === "video"
              ? locale === "sr"
                ? "video"
                : "video"
              : kind === "audio"
                ? locale === "sr"
                  ? "zvučni zapis"
                  : "audio"
                : locale === "sr"
                  ? "slika"
                  : "image"}
          </span>
        )}
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && hasFileDrag(event.dataTransfer)) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          SURFACE,
          "mt-2 min-h-40",
          // Vidljiv fokus za tastaturu (nalaz 8): sr-only file input je fokusabilan,
          // pa ceo slot dobija prsten kad je bilo šta u njemu fokusirano.
          "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink",
          over && "bg-yellow/40",
          disabled && "opacity-60",
          file && "border-solid p-0",
        )}
      >
        {file ? (
          <>
            <div className="surface-inset size-full min-h-40 overflow-hidden">
              <Preview file={file} />
            </div>
            {!disabled ? (
              <label
                htmlFor={inputId}
                aria-label={locale === "sr" ? `Zameni ${title}` : `Replace ${title}`}
                title={locale === "sr" ? "Zameni fajl" : "Replace file"}
                className={REPLACE}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
              </label>
            ) : null}
            <button
              type="button"
              aria-label={locale === "sr" ? `Ukloni ${title}` : `Remove ${title}`}
              onClick={() => accept([])}
              disabled={disabled}
              className={REMOVE}
            >
              <X className="size-4" />
            </button>
          </>
        ) : pending ? (
          <ProgressBar pending={pending} locale={locale} />
        ) : (
          <>
            <UploadCloud className="size-6 text-ink" aria-hidden="true" />
            <span className="text-sm font-black text-ink underline decoration-2 underline-offset-4">
              {locale === "sr" ? "Prevuci ovde ili izaberi fajl" : "Drop here or choose a file"}
            </span>
            <p className="text-xs font-bold text-muted">
              {spec.accept.map((mime) => mime.split("/")[1].toUpperCase()).join(" · ")}
            </p>
            {/* Klik radi na CELOJ površini slota, ne samo na tekstu. */}
            <label htmlFor={inputId} className="absolute inset-0 cursor-pointer">
              <span className="sr-only">{title}</span>
            </label>
          </>
        )}

        <input
          id={inputId}
          type="file"
          accept={spec.accept.join(",")}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            const chosen = Array.from(event.target.files ?? []);
            event.currentTarget.value = "";
            void intake(chosen);
          }}
        />
      </div>

      {error ? <p className="mt-2 text-sm font-black text-red-700">{error}</p> : null}

      {dragging ? (
        <FullScreenDropOverlay
          label={
            locale === "sr" ? `Pusti fajl bilo gde - ${title.toLowerCase()}` : `Drop anywhere - ${title.toLowerCase()}`
          }
          hint={
            locale === "sr"
              ? "Ceo ekran prima fajl. Čim ga pustiš, kreće slanje."
              : "The whole screen accepts the file. It starts uploading as soon as you release it."
          }
        />
      ) : null}
    </div>
  );
}

/**
 * Više fajlova u jednom slotu, sa promenom redosleda. Redosled je značajan -
 * prompt citira reference po broju ("slika 2") - pa se pločice prevlače, a uz
 * to imaju i strelice, jer prevlačenje nije dostupno sa tastature.
 */
export function DropSlotGrid({
  slot,
  spec,
  files,
  onChange,
  locale,
  label,
  numbered = false,
  fullScreen = false,
  disabled = false,
  className,
  onUploadingChange,
}: {
  slot: string;
  spec: SlotSpec;
  files: SlotFile[];
  onChange: (next: SlotFile[]) => void;
  locale: Locale;
  label?: string;
  numbered?: boolean;
  fullScreen?: boolean;
  disabled?: boolean;
  className?: string;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const inputId = useId();
  const [over, setOver] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const title = label ?? slotLabel(slot, locale);

  const accept = useCallback(
    (incoming: SlotFile[]) => onChange([...files, ...incoming].slice(0, spec.max)),
    [files, onChange, spec.max],
  );

  const { intake, pending, error } = useSlotIntake({
    slot,
    spec,
    locale,
    capacity: disabled ? 0 : spec.max - files.length,
    onAccept: accept,
    onUploadingChange,
  });

  const dragging = useFullScreenDrop(fullScreen && !disabled && pending === null, (dropped) => {
    void intake(dropped);
  });

  function remove(index: number) {
    const file = files[index];
    if (file?.url) URL.revokeObjectURL(file.url);
    onChange(files.filter((_, position) => position !== index));
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= files.length || from === to) return;
    const next = [...files];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-black uppercase tracking-wide text-muted">{title}</span>
        <span className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-xs font-black text-ink">
          {files.length}/{spec.max}
        </span>
      </div>

      <div
        onDragOver={(event) => {
          if (dragIndex.current !== null) return;
          event.preventDefault();
          if (!disabled && hasFileDrag(event.dataTransfer)) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          if (dragIndex.current !== null) return;
          event.preventDefault();
          setOver(false);
          if (disabled) return;
          void intake(Array.from(event.dataTransfer.files ?? []));
        }}
        className={cn(SURFACE, "mt-2 items-stretch", over && "bg-yellow/40", disabled && "opacity-60")}
      >
        {files.length === 0 && pending === null ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <UploadCloud className="size-6 text-ink" aria-hidden="true" />
            <span className="text-sm font-black text-ink underline decoration-2 underline-offset-4">
              {locale === "sr" ? "Prevuci fajlove ili ih izaberi" : "Drop files or choose them"}
            </span>
            <p className="text-xs font-bold text-muted">
              {locale === "sr" ? "najviše" : "up to"} {spec.max} ·{" "}
              {spec.accept.map((mime) => mime.split("/")[1].toUpperCase()).join(" · ")}
            </p>
            <label htmlFor={inputId} className="absolute inset-0 cursor-pointer">
              <span className="sr-only">{title}</span>
            </label>
          </div>
        ) : (
          <div className="grid w-full grid-cols-3 gap-2 sm:grid-cols-4">
            {files.map((file, index) => (
              <div
                key={file.storageId}
                draggable={!disabled}
                onDragStart={() => {
                  dragIndex.current = index;
                }}
                onDragEnd={() => {
                  dragIndex.current = null;
                }}
                onDragOver={(event) => {
                  if (dragIndex.current === null) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (dragIndex.current === null) return;
                  event.preventDefault();
                  event.stopPropagation();
                  move(dragIndex.current, index);
                  dragIndex.current = null;
                }}
                className="surface-media relative aspect-square overflow-hidden border-2 border-ink bg-white"
              >
                <Preview file={file} />
                {numbered ? (
                  <span className="absolute left-1 top-1 inline-flex size-6 items-center justify-center rounded-full border-2 border-ink bg-yellow text-[11px] font-black text-ink">
                    {index + 1}
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={locale === "sr" ? `Ukloni ${index + 1}.` : `Remove ${index + 1}`}
                  onClick={() => remove(index)}
                  disabled={disabled}
                  className={cn(REMOVE, "size-7")}
                >
                  <X className="size-3.5" />
                </button>
                <div className="absolute inset-x-1 bottom-1 flex justify-between">
                  <button
                    type="button"
                    aria-label={locale === "sr" ? "Pomeri levo" : "Move left"}
                    onClick={() => move(index, index - 1)}
                    disabled={disabled || index === 0}
                    className={TILE_BUTTON}
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={locale === "sr" ? "Pomeri desno" : "Move right"}
                    onClick={() => move(index, index + 1)}
                    disabled={disabled || index === files.length - 1}
                    className={TILE_BUTTON}
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {files.length < spec.max && pending === null ? (
              <label
                htmlFor={inputId}
                className="surface-media flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 border-2 border-dashed border-ink bg-paper text-ink hover:-translate-y-0.5"
              >
                <UploadCloud className="size-5" aria-hidden="true" />
                <span className="text-xs font-black">{locale === "sr" ? "Dodaj" : "Add"}</span>
              </label>
            ) : null}
          </div>
        )}

        {pending ? <ProgressBar pending={pending} locale={locale} /> : null}

        <input
          id={inputId}
          type="file"
          multiple
          accept={spec.accept.join(",")}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            const chosen = Array.from(event.target.files ?? []);
            event.currentTarget.value = "";
            void intake(chosen);
          }}
        />
      </div>

      {error ? <p className="mt-2 text-sm font-black text-red-700">{error}</p> : null}

      {dragging ? (
        <FullScreenDropOverlay
          label={locale === "sr" ? `Pusti fajlove bilo gde - ${title.toLowerCase()}` : `Drop anywhere - ${title.toLowerCase()}`}
          hint={
            locale === "sr"
              ? "Ceo ekran prima fajlove. Redosled možeš da promeniš posle."
              : "The whole screen accepts files. You can reorder them afterwards."
          }
        />
      ) : null}
    </div>
  );
}

/**
 * Početni i završni kadar jedan pored drugog, sa strelicom izmedju - oba su
 * obavezna, i to se vidi iz oblika, ne tek iz poruke na dugmetu (katalog 5).
 */
export function FrameSlotPair({
  spec,
  frames,
  onChange,
  locale,
  disabled = false,
  onUploadingChange,
}: {
  spec: SlotSpec;
  frames: FramePair;
  onChange: (next: FramePair) => void;
  locale: Locale;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const single: SlotSpec = { max: 1, accept: spec.accept };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <DropSlot
        slot="image"
        spec={single}
        file={frames.first}
        onChange={(file) => onChange({ ...frames, first: file })}
        locale={locale}
        label={FRAME_LABELS.first[locale]}
        disabled={disabled}
        className="flex-1"
        onUploadingChange={onUploadingChange}
      />
      <MoveRight className="mx-auto size-6 shrink-0 rotate-90 text-ink sm:rotate-0" aria-hidden="true" />
      <DropSlot
        slot="image"
        spec={single}
        file={frames.last}
        onChange={(file) => onChange({ ...frames, last: file })}
        locale={locale}
        label={FRAME_LABELS.last[locale]}
        disabled={disabled}
        className="flex-1"
        onUploadingChange={onUploadingChange}
      />
    </div>
  );
}

/**
 * Reference u tri grupe (slike, video, zvuk), numerisane jer ih prompt citira
 * po broju. Grupe koje režim ne deklariše se ne crtaju - spisak dolazi iz
 * `inputSpec`-a, ne iz koda.
 */
export function ReferenceSlots({
  modeSpec,
  files,
  onChange,
  locale,
  disabled = false,
  onUploadingChange,
}: {
  modeSpec: ModeSpec;
  files: SlotFiles;
  onChange: (next: SlotFiles) => void;
  locale: Locale;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const groups = Object.entries(modeSpec);

  return (
    <div className="space-y-4">
      {groups.map(([slot, spec]) => (
        <DropSlotGrid
          key={slot}
          slot={slot}
          spec={spec}
          files={files[slot] ?? []}
          onChange={(next) => onChange({ ...files, [slot]: next })}
          locale={locale}
          numbered
          fullScreen={false}
          disabled={disabled}
          onUploadingChange={onUploadingChange}
        />
      ))}
    </div>
  );
}
