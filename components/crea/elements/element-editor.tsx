/* eslint-disable @next/next/no-img-element -- slike su potpisani Convex URL-ovi i lokalni `blob:` pregledi. */
"use client";

import { useMutation } from "convex/react";
import { ArrowLeft, CircleAlert, CircleCheck, CircleX, ImagePlus, Lock, Save, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { FieldMic } from "@/components/crea/create/mic-button";

import { checkFacePhoto } from "@/components/crea/elements/face-check";
import { ConsentCheck, PHOTO_STATUS_TONE, PhotoCheckItems, type MyElement } from "@/components/crea/elements/shared";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { providerPhoto } from "@/components/crea/tools/mask-canvas";
import { FullScreenDropOverlay, useFullScreenDrop } from "@/components/studio/drop-slot";
import { useSlotUpload } from "@/components/studio/use-slot-upload";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ELEMENT_DESCRIPTION_MAX,
  ELEMENT_IMAGES_MAX,
  ELEMENT_KINDS,
  ELEMENT_NAME_MAX,
  cleanElementName,
  handleBase,
  type ElementKind,
} from "@/convex/creaElementsCore";
import { fillCopy, photoCheckItemText } from "@/lib/crea-copy";
import { CREA_ELEMENT_KIND_COPY, CREA_ELEMENTS_COPY as T, elementErrorMessage } from "@/lib/crea-elements-copy";
import { FORMAT_INPUT_MAX_BYTES, looksLikeHeic } from "@/lib/crea-image-format";
import { photoCheckProblem, photoCheckSummary, type PhotoCheckItem, type PhotoCheckResult } from "@/lib/crea-photo-check";
import type { Locale } from "@/lib/i18n";

type Check = { state: "idle" } | { state: "running" } | { state: "done"; result: PhotoCheckResult } | { state: "error" };

type Draft = {
  key: string;
  url: string;
  /** Sačuvana slika elementa, ili nov fajl sa uređaja (`uploadedId` posle prvog slanja). */
  source: { kind: "saved"; storageId: string } | { kind: "new"; file: File; uploadedId?: string };
  check: Check;
};

type Status = { name: "idle" } | { name: "uploading"; index: number; total: number } | { name: "saving" } | { name: "error"; message: string };

let draftSeq = 0;
const nextKey = () => `slika-${(draftSeq += 1)}`;

/**
 * Novi ili postojeći lik/mesto/predmet (K14, S34). Lik od fotki prolazi proveru
 * lica na uređaju (S35) - svaka fotka posebno, pre čuvanja - i traži pristanak
 * (O5). Fotke se šalju tek na „Sačuvaj" (smanjene na ≤ 2048 px, bez EXIF-a), pa
 * napuštena izmena ne puni storage.
 */
export function ElementEditor({
  locale,
  element,
  initialKind,
  onDone,
  onCancel,
}: {
  locale: Locale;
  element: MyElement | null;
  initialKind: ElementKind;
  onDone: (handle: string) => void;
  onCancel: () => void;
}) {
  const formId = useId();
  const saveElement = useMutation(api.creaElements.saveElement);
  const deleteElement = useMutation(api.creaElements.deleteElement);
  const upload = useSlotUpload();
  const locked = element?.origin === "kreator";

  const [kind, setKind] = useState<ElementKind>(element?.kind ?? initialKind);
  const [name, setName] = useState(element?.name ?? "");
  const [description, setDescription] = useState(element?.description ?? "");
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    (element?.images ?? []).map((image) => ({
      key: nextKey(),
      url: image.url ?? "",
      source: { kind: "saved", storageId: image.storageId },
      check: { state: "idle" },
    })),
  );
  const [consent, setConsent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [download, setDownload] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>({ name: "idle" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const checkQueue = useRef<Promise<void>>(Promise.resolve());
  const queued = useRef(new Set<string>());

  // Lokalni pregledi se oslobađaju kad editor ode sa ekrana.
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);
  useEffect(
    () => () => {
      for (const draft of draftsRef.current) if (draft.source.kind === "new") URL.revokeObjectURL(draft.url);
    },
    [],
  );

  const savedIds = new Set((element?.images ?? []).map((image) => image.storageId));
  const imagesChanged = (list: readonly Draft[]) =>
    !element || list.length !== savedIds.size || list.some((draft) => draft.source.kind === "new");
  /** Proveru traži Lik od fotki kad su slike nove/promenjene ili Lik tek postaje Lik. */
  const checkNeeded = (list: readonly Draft[], nextKind: ElementKind) =>
    nextKind === "lik" && !locked && (imagesChanged(list) || element?.kind !== "lik");

  function setCheck(key: string, check: Check) {
    setDrafts((list) => list.map((draft) => (draft.key === key ? { ...draft, check } : draft)));
  }

  /** Provera ide redom, jedna po jedna fotka (detektor se učitava jednom). */
  function ensureChecks(list: readonly Draft[], nextKind: ElementKind) {
    if (!checkNeeded(list, nextKind)) return;
    for (const draft of list) {
      if (draft.check.state !== "idle" || queued.current.has(draft.key)) continue;
      queued.current.add(draft.key);
      checkQueue.current = checkQueue.current.then(async () => {
        setCheck(draft.key, { state: "running" });
        try {
          const blob = draft.source.kind === "new" ? draft.source.file : await (await fetch(draft.url)).blob();
          const result = await checkFacePhoto(blob, "lik", {
            onProgress: (progress) => setDownload(progress.percent),
          });
          setCheck(draft.key, { state: "done", result });
        } catch {
          setCheck(draft.key, { state: "error" });
        } finally {
          setDownload(null);
          queued.current.delete(draft.key);
        }
      });
    }
  }

  async function addFiles(files: readonly File[]) {
    setProblem(null);
    const room = ELEMENT_IMAGES_MAX - drafts.length;
    if (room <= 0) {
      setProblem(T.tooManyImages[locale]);
      return;
    }
    const accepted: Draft[] = [];
    for (const raw of files.slice(0, room)) {
      const heic = looksLikeHeic(raw.name, raw.type);
      if (!heic && !raw.type.startsWith("image/")) {
        setProblem(T.notImage[locale]);
        continue;
      }
      if (raw.size > FORMAT_INPUT_MAX_BYTES) {
        setProblem(T.imageTooBig[locale]);
        continue;
      }
      let file = raw;
      if (heic) {
        try {
          file = await import("@/components/crea/tools/heic").then(({ heicToJpeg }) => heicToJpeg(raw));
        } catch {
          setProblem(T.notImage[locale]);
          continue;
        }
      }
      accepted.push({ key: nextKey(), url: URL.createObjectURL(file), source: { kind: "new", file }, check: { state: "idle" } });
    }
    if (files.length > room) setProblem(T.tooManyImages[locale]);
    if (accepted.length === 0) return;
    const next = [...drafts, ...accepted];
    setDrafts(next);
    ensureChecks(next, kind);
  }

  function removeDraft(key: string) {
    const gone = drafts.find((draft) => draft.key === key);
    if (gone?.source.kind === "new") URL.revokeObjectURL(gone.url);
    const next = drafts.filter((draft) => draft.key !== key);
    setDrafts(next);
    ensureChecks(next, kind);
  }

  function changeKind(next: ElementKind) {
    setKind(next);
    ensureChecks(drafts, next);
  }

  const busy = status.name === "uploading" || status.name === "saving";
  const dragging = useFullScreenDrop(!locked && !busy, (files) => void addFiles(files));

  const needCheck = checkNeeded(drafts, kind);
  const checks = drafts.map((draft) => draft.check);
  const checking = needCheck && checks.some((check) => check.state !== "done" && check.state !== "error");
  const failed = needCheck && checks.some((check) => check.state === "error" || (check.state === "done" && check.result.verdict === "fail"));
  const handle = name.trim() ? handleBase(name, kind) : null;

  const blocker = !cleanElementName(name)
    ? T.needName[locale]
    : drafts.length === 0
      ? T.needImage[locale]
      : checking
        ? T.needCheck[locale]
        : failed
          ? T.needGoodPhotos[locale]
          : kind === "lik" && !consent
            ? T.needConsent[locale]
            : null;

  async function save() {
    if (blocker || busy) return;
    try {
      const ids: string[] = [];
      const fresh = drafts.filter((draft) => draft.source.kind === "new" && !draft.source.uploadedId).length;
      let done = 0;
      for (const draft of drafts) {
        if (draft.source.kind === "saved") {
          ids.push(draft.source.storageId);
          continue;
        }
        if (draft.source.uploadedId) {
          ids.push(draft.source.uploadedId);
          continue;
        }
        done += 1;
        setStatus({ name: "uploading", index: done, total: fresh });
        const photo = await providerPhoto(draft.source.file);
        const extension = photo.blob.type === "image/png" ? "png" : "jpg";
        const uploaded = await upload(new File([photo.blob], `lik-${done}.${extension}`, { type: photo.blob.type }), "image", () => undefined);
        if (uploaded.url) URL.revokeObjectURL(uploaded.url);
        const uploadedId = uploaded.storageId;
        ids.push(uploadedId);
        // Ponovljen pokušaj (npr. posle greške) ne šalje istu fotku dvaput.
        setDrafts((list) =>
          list.map((entry) =>
            entry.key === draft.key && entry.source.kind === "new" ? { ...entry, source: { ...entry.source, uploadedId } } : entry,
          ),
        );
      }
      setStatus({ name: "saving" });
      const results = checks.flatMap((check) => (check.state === "done" ? [check.result] : []));
      const saved = await saveElement({
        ...(element ? { elementId: element._id as Id<"creaElements"> } : {}),
        kind,
        name,
        ...(description.trim() ? { description } : {}),
        imageStorageIds: ids as Id<"_storage">[],
        ...(kind === "lik" ? { consent } : {}),
        ...(needCheck && results.length === drafts.length ? { photoCheck: photoCheckSummary(results) } : {}),
      });
      setStatus({ name: "idle" });
      onDone(saved.handle);
    } catch (error) {
      setStatus({ name: "error", message: elementErrorMessage(error instanceof Error ? error.message : String(error), locale) });
    }
  }

  async function remove() {
    if (!element) return;
    setStatus({ name: "saving" });
    try {
      await deleteElement({ elementId: element._id as Id<"creaElements"> });
      onCancel();
    } catch (error) {
      setStatus({ name: "error", message: elementErrorMessage(error instanceof Error ? error.message : String(error), locale) });
    }
  }

  return (
    <div className="space-y-5">
      {dragging ? <FullScreenDropOverlay label={T.dropHere[locale]} hint={T.imagesHintOther[locale]} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy} icon={<ArrowLeft aria-hidden="true" className="size-4" />}>
          {CREA_ELEMENT_KIND_COPY.lik.many[locale]}
        </Button>
        <h3 className="type-h4 text-ink">
          {element ? fillCopy(T.editTitle[locale], { name: element.name }) : CREA_ELEMENT_KIND_COPY[kind].add[locale]}
        </h3>
      </div>

      <ChoiceChips
        legend={T.kind[locale]}
        name={`${formId}-vrsta`}
        options={ELEMENT_KINDS.map((id) => ({ id, label: CREA_ELEMENT_KIND_COPY[id].one[locale] }))}
        value={kind}
        onChange={changeKind}
        disabled={busy || locked}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="type-body-sm font-black text-ink">{T.name[locale]}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={ELEMENT_NAME_MAX}
            disabled={busy}
            placeholder={T.namePlaceholder[locale]}
            autoComplete="off"
            className="surface-inset mt-2 block min-h-11 w-full border-2 border-ink bg-paper px-3 py-2 type-body font-bold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
          />
          <span className="mt-2 block type-body-sm font-semibold text-muted">
            {T.handleHint[locale]}{" "}
            <span className="rounded-full bg-yellow px-2 py-0.5 font-mono text-xs font-black text-ink">@{handle ?? "…"}</span>
          </span>
        </label>
        <label className="block">
          <span className="type-body-sm font-black text-ink">{T.description[locale]}</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={ELEMENT_DESCRIPTION_MAX}
            rows={3}
            disabled={busy}
            placeholder={T.descriptionPlaceholder[locale]}
            className="surface-inset mt-2 block w-full resize-y border-2 border-ink bg-paper px-3 py-2 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
          />
        </label>
        <FieldMic locale={locale} value={description} onChange={setDescription} disabled={busy} maxLength={ELEMENT_DESCRIPTION_MAX} />
      </div>

      <section aria-labelledby={`${formId}-slike`} className="space-y-3 border-t border-line pt-5">
        <div>
          <h4 id={`${formId}-slike`} className="type-body font-black text-ink">
            {T.imagesTitle[locale]} <span className="font-mono text-sm text-muted">({drafts.length}/{ELEMENT_IMAGES_MAX})</span>
          </h4>
          <p className="mt-1 type-body-sm font-semibold text-muted">
            {locked ? T.lockedImages[locale] : kind === "lik" ? T.imagesHintLik[locale] : T.imagesHintOther[locale]}
          </p>
        </div>

        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {drafts.map((draft, index) => (
            <DraftThumb
              key={draft.key}
              draft={draft}
              index={index}
              locale={locale}
              showCheck={needCheck}
              removable={!locked && !busy}
              onRemove={() => removeDraft(draft.key)}
            />
          ))}
          {!locked && drafts.length < ELEMENT_IMAGES_MAX ? (
            <li>
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="surface-media flex aspect-square w-full flex-col items-center justify-center gap-1 border-2 border-dashed border-ink/40 bg-paper text-ink/70 transition hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 motion-reduce:transition-none"
              >
                <ImagePlus aria-hidden="true" className="size-6" />
                <span className="px-1 text-center text-xs font-black">{T.addImages[locale]}</span>
              </button>
            </li>
          ) : null}
        </ul>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length > 0) void addFiles(files);
          }}
        />

        {needCheck && download !== null ? (
          <p className="inline-flex items-center gap-2 type-body-sm font-bold text-ink" aria-live="polite">
            <Spinner size="sm" />
            {fillCopy(T.downloading[locale], { p: Math.round(download) })}
          </p>
        ) : null}
        {needCheck ? <DraftProblems drafts={drafts} locale={locale} /> : null}
        {problem ? (
          <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
            {problem}
          </p>
        ) : null}
      </section>

      {kind === "lik" ? (
        <ConsentCheck
          id={`${formId}-pristanak`}
          checked={consent}
          onChange={setConsent}
          disabled={busy}
          text={locked ? T.consentFictional[locale] : T.consentLik[locale]}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button
          onClick={() => void save()}
          disabled={blocker !== null}
          loading={busy}
          icon={<Save aria-hidden="true" className="size-4" />}
          className="shadow-[4px_4px_0_0_var(--ink)]"
        >
          {element ? T.saveChanges[locale] : T.save[locale]}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {T.cancel[locale]}
        </Button>
        {element ? (
          confirmDelete ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="type-body-sm font-bold text-ink">{fillCopy(T.confirmDelete[locale], { name: element.name })}</span>
              <Button variant="destructive" size="sm" onClick={() => void remove()} disabled={busy}>
                {T.confirmYes[locale]}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)} disabled={busy}>
                {T.confirmNo[locale]}
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              icon={<Trash2 aria-hidden="true" className="size-4" />}
              className="sm:ml-auto"
            >
              {T.delete[locale]}
            </Button>
          )
        ) : null}
      </div>

      <div aria-live="polite" className="space-y-1">
        {blocker && status.name === "idle" ? <p className="type-body-sm font-semibold text-muted">{blocker}</p> : null}
        {status.name === "uploading" ? (
          <p className="type-body-sm font-bold text-ink">{fillCopy(T.uploading[locale], { i: status.index, n: status.total })}</p>
        ) : null}
        {status.name === "saving" ? <p className="type-body-sm font-bold text-ink">{T.saving[locale]}</p> : null}
        {status.name === "error" ? (
          <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
            {status.message}
          </p>
        ) : null}
        <p className="inline-flex items-start gap-2 type-body-sm font-semibold text-muted">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {T.privacy[locale]}
        </p>
      </div>
    </div>
  );
}

const CHECK_ICON = { ok: CircleCheck, warn: CircleAlert, fail: CircleX } as const;

function DraftThumb({
  draft,
  index,
  locale,
  showCheck,
  removable,
  onRemove,
}: {
  draft: Draft;
  index: number;
  locale: Locale;
  showCheck: boolean;
  removable: boolean;
  onRemove: () => void;
}) {
  const verdict = draft.check.state === "done" ? draft.check.result.verdict : draft.check.state === "error" ? "fail" : null;
  const Icon = verdict ? CHECK_ICON[verdict] : null;
  return (
    <li className="relative">
      <img
        src={draft.url}
        alt=""
        className={cn(
          "surface-media aspect-square w-full bg-paper object-cover shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]",
          showCheck && verdict === "fail" && "opacity-60",
        )}
      />
      {index === 0 ? (
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-ink px-2 py-0.5 text-[11px] font-black text-paper-strong">
          {T.cover[locale]}
        </span>
      ) : null}
      {showCheck ? (
        <span className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-paper-strong shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
          {Icon && verdict ? (
            <>
              <Icon aria-hidden="true" className={cn("size-4", PHOTO_STATUS_TONE[verdict])} />
              <span className="sr-only">{verdict === "fail" ? T.needGoodPhotos[locale] : T.checkOk[locale]}</span>
            </>
          ) : (
            <Spinner size="xs" className="text-muted" />
          )}
        </span>
      ) : null}
      {removable ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={fillCopy(T.removeImage[locale], { n: index + 1 })}
          className="absolute -left-1.5 -top-1.5 inline-flex size-11 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
        >
          <span className="grid size-7 place-items-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[1px_1px_0_0_var(--shadow-hard)]">
            <X aria-hidden="true" className="size-3.5" />
          </span>
        </button>
      ) : null}
    </li>
  );
}

/** Uz koju fotku šta ne valja - prvi razlog po fotki, pa ceo spisak za fotke koje padaju. */
function DraftProblems({ drafts, locale }: { drafts: readonly Draft[]; locale: Locale }) {
  type Line = { key: string; index: number; text: string; items: readonly PhotoCheckItem[] | null };
  const lines = drafts.flatMap((draft, index): Line[] => {
    if (draft.check.state === "error") return [{ key: draft.key, index, text: T.checkFailed[locale], items: null }];
    if (draft.check.state !== "done") return [];
    const first = photoCheckProblem(draft.check.result);
    if (!first) return [];
    return [{ key: draft.key, index, text: photoCheckItemText(first, locale), items: draft.check.result.items }];
  });
  if (lines.length === 0) return null;
  return (
    <ul className="surface-inset divide-y divide-line border border-line bg-paper px-3">
      {lines.map((line) => (
        <li key={line.key} className="py-2">
          <details>
            <summary className="cursor-pointer type-body-sm font-bold text-ink">
              {fillCopy(T.photoN[locale], { n: line.index + 1 })}: {line.text}
            </summary>
            {line.items ? <PhotoCheckItems items={line.items} locale={locale} className="mt-1" /> : null}
          </details>
        </li>
      ))}
    </ul>
  );
}
