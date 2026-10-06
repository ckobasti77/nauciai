/* eslint-disable @next/next/no-img-element -- nalepnice i sprajt su lokalni `blob:` URL-ovi, koje next/image ne obrađuje. */
"use client";

import { CircleCheck, Clapperboard, Download, Package, RefreshCw, Scissors, Sticker } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { CharacterPicker, characterImages } from "@/components/crea/recipes/character-picker";
import { ToolHeader } from "@/components/crea/tool-runner";
import { canvasToBlob, createCanvas } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { loadImageFromUrl, naturalSize, useWatchedJob } from "@/components/crea/tools/job-image";
import { LocalStepStatus, useLocalStep, type LocalStepContext } from "@/components/crea/tools/local-step";
import { providerPhoto } from "@/components/crea/tools/mask-canvas";
import { PaidEditPanel, type PaidEditFiles } from "@/components/crea/tools/paid-edit";
import type { CreaPaidContext, CreaToolProps } from "@/components/crea/tools/types";
import type { MyElement } from "@/components/crea/elements/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import type { Id } from "@/convex/_generated/dataModel";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_PAID_EDIT_COPY } from "@/lib/crea-edit-copy";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { CREA_STICKERS_COPY as T } from "@/lib/crea-recipes-copy";
import { creaShellQuery } from "@/lib/crea-shell";
import {
  borderColor,
  keyOutBackground,
  SPRITE_FRAME_COUNTS,
  SPRITE_FRAME_SIZES,
  SPRITE_MAX_SECONDS,
  spriteFrameTimes,
  spriteLayout,
  spriteMeta,
  STICKER_EXPRESSIONS,
  STICKER_SHEET_PARAMS,
  STICKER_STYLES,
  STICKER_TRAY_SIZE,
  stickerFileName,
  stickersFromSheet,
  stickerSheetPrompt,
  type Rgba,
} from "@/lib/crea-sticker-pack";
import { createZip } from "@/lib/crea-zip";
import type { Locale } from "@/lib/i18n";
import { buildParams, creditsFor, formatCredits, paramValuesForMode } from "@/lib/studio-params";
import { useCreaCreateJob } from "@/components/crea/game/crea-tool-context";

type Mode = "napravi" | "iseci" | "sprajt";
type Subject = "lik" | "foto";
type Cut = { index: number; blob: Blob; url: string };

const STICKER_ROUTE = { modelSlug: "nano-banana-2", inputMode: "image_multi", kind: "photo" } as const;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Slika (URL rada ili `blob:`) kao RGBA pikseli; preko `<img>`, jer DEMO izlaz je SVG. */
async function pixelsOf(url: string, signal: AbortSignal): Promise<Rgba> {
  const { image, release } = await loadImageFromUrl(url, signal);
  try {
    const { width, height } = naturalSize(image);
    const { ctx } = createCanvas(width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return { data: ctx.getImageData(0, 0, width, height).data, width, height };
  } finally {
    release();
  }
}

/** RGBA → WebP (jSquash; platno u Safariju ne ume WebP). */
async function encodeWebp(image: Rgba): Promise<Blob> {
  const { default: encode } = await import("@jsquash/webp/encode");
  const buffer = await encode(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), { quality: 80 });
  return new Blob([buffer], { type: "image/webp" });
}

/** Mreža → 9 nalepnica (WebP 512 × 512, bez pozadine). Isecanje je čista logika (`stickersFromSheet`). */
async function cutStickers(url: string, outline: boolean, context: LocalStepContext): Promise<Cut[]> {
  context.reportRunning();
  const sheet = await pixelsOf(url, context.signal);
  // Pusti ekran da nacrta „Radim…" pre teškog računa.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const stickers = stickersFromSheet(sheet, { outline });
  const cuts: Cut[] = [];
  for (const [index, sticker] of stickers.entries()) {
    if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
    const blob = await encodeWebp(sticker);
    cuts.push({ index, blob, url: URL.createObjectURL(blob) });
  }
  return cuts;
}

/** Ikonica paketa: prva nalepnica smanjena na 96 × 96 (PNG). */
async function trayIcon(first: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(first);
  const { canvas, ctx } = createCanvas(STICKER_TRAY_SIZE, STICKER_TRAY_SIZE);
  ctx.drawImage(bitmap, 0, 0, STICKER_TRAY_SIZE, STICKER_TRAY_SIZE);
  bitmap.close();
  return canvasToBlob(canvas, "image/png");
}

function useSheetPrice(paid: CreaPaidContext | null) {
  return useMemo(() => {
    const model = paid?.catalog.find((entry) => entry.slug === STICKER_ROUTE.modelSlug);
    if (!model) return null;
    return creditsFor(
      model.priceRule,
      buildParams(model.paramSpec, { ...paramValuesForMode(model.paramSpec, STICKER_ROUTE.inputMode), ...STICKER_SHEET_PARAMS }, STICKER_ROUTE.inputMode),
      STICKER_ROUTE.inputMode,
      model.creditFactor,
    );
  }, [paid]);
}

/**
 * Viber/WhatsApp nalepnice i sprajt (S40, K15). Plaćena je JEDNA slika (mreža
 * 3×3 sa 9 izraza na zelenoj pozadini); isecanje, uklanjanje pozadine, 512 × 512
 * WebP i ZIP paket rade na uređaju. Sprajt za igricu nastaje iz kratkog videa,
 * takođe na uređaju (0 kredita).
 */
export default function StickersTool({ tool, locale, canSave, projectId, source, paid }: CreaToolProps) {
  const [mode, setMode] = useState<Mode>(source ? "iseci" : "napravi");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const charactersHref = `${pathname}?${creaShellQuery({ area: "slika", mode: "likovi", tool: null }, searchParams)}`;

  return (
    <section
      aria-labelledby="crea-tool-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <ToolHeader tool={tool} locale={locale} icon={<Sticker aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <ChoiceChips<Mode>
          legend={T.mode[locale]}
          name="crea-stickers-mode"
          options={(["napravi", "iseci", "sprajt"] as const).map((id) => ({ id, label: T.modes[id][locale] }))}
          value={mode}
          onChange={setMode}
        />
        {mode === "napravi" ? (
          <MakeStickers locale={locale} canSave={canSave} projectId={projectId} paid={paid} charactersHref={charactersHref} />
        ) : mode === "iseci" ? (
          <CutReady locale={locale} source={source} />
        ) : (
          <SpriteFromVideo locale={locale} />
        )}
      </div>
    </section>
  );
}

function MakeStickers({
  locale,
  canSave,
  projectId,
  paid,
  charactersHref,
}: {
  locale: Locale;
  canSave: boolean;
  projectId: Id<"studioProjects"> | null;
  paid: CreaPaidContext | null;
  charactersHref: string;
}) {
  const [subject, setSubject] = useState<Subject>("lik");
  const [character, setCharacter] = useState<MyElement | null>(null);
  const photo = useImageInput(null);
  const [styleId, setStyleId] = useState(STICKER_STYLES[0]!.id);
  const [sheetJobId, setSheetJobId] = useState<Id<"generationJobs"> | null>(null);
  const sheetJob = useWatchedJob(sheetJobId);
  const createJob = useCreaCreateJob();
  const price = useSheetPrice(paid);

  const refs = subject === "lik" && character ? characterImages(character) : [];
  const ready = subject === "lik" ? refs.length > 0 : photo.picked !== null;
  const subjectImages = subject === "lik" ? (refs.length > 1 ? `images 1-${refs.length}` : "image 1") : "image 1";
  const sheetUrl = sheetJob?.status === "done" && sheetJob.outputUrl ? sheetJob.outputUrl : null;
  const failed = sheetJob?.status === "failed" || sheetJob?.status === "refunded";

  return (
    <div className="space-y-5">
      <div className="grid gap-4 @min-[760px]:grid-cols-2">
        <section className="surface-inset space-y-2 bg-paper p-4">
          <h3 className="type-body font-black text-ink">{T.howTitle[locale]}</h3>
          <p className="type-body-sm font-semibold text-muted">
            {price !== null ? fillCopy(T.howBody[locale], { price: formatCredits(price, locale) }) : T.howFallback[locale]}
          </p>
        </section>
        <section className="surface-inset bg-paper p-4">
          <h3 className="type-body font-black text-ink">{T.expressions[locale]}</h3>
          <ol className="surface-media mt-2 grid grid-cols-3 gap-px overflow-hidden bg-line">
            {STICKER_EXPRESSIONS.map((expression, index) => (
              <li key={expression.id} className="flex min-h-12 flex-col justify-center bg-paper-strong px-2 py-1 text-center">
                <span className="font-mono text-[11px] font-bold text-muted">{index + 1}</span>
                <span className="text-xs font-black leading-tight text-ink">{expression.label[locale]}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <ChoiceChips<Subject>
        legend={T.source[locale]}
        name="crea-stickers-subject"
        options={(["lik", "foto"] as const).map((id) => ({ id, label: T.sources[id][locale] }))}
        value={subject}
        onChange={setSubject}
        disabled={sheetJobId !== null}
      />
      {subject === "lik" ? (
        <CharacterPicker
          locale={locale}
          legend={T.sources.lik[locale]}
          enabled={canSave}
          value={character?._id ?? null}
          onChange={setCharacter}
          charactersHref={charactersHref}
          disabled={sheetJobId !== null}
        />
      ) : (
        <ImageInput locale={locale} input={photo} disabled={sheetJobId !== null} />
      )}
      <ChoiceChips
        legend={T.style[locale]}
        name="crea-stickers-style"
        options={STICKER_STYLES.map((style) => ({ id: style.id, label: style.label[locale] }))}
        value={styleId}
        onChange={setStyleId}
        disabled={sheetJobId !== null}
      />

      {sheetJobId === null ? (
        <PaidEditPanel
          locale={locale}
          routes={[STICKER_ROUTE]}
          purpose="edit"
          ready={ready}
          notReadyReason={T.needSubject[locale]}
          prepare={async (): Promise<PaidEditFiles> => {
            if (subject === "lik") return { files: {}, width: 1, height: 1 };
            const prepared = await providerPhoto(photo.picked!.file);
            return { files: { image: [prepared.blob] }, width: prepared.width, height: prepared.height };
          }}
          request={(_route, text) => ({ prompt: stickerSheetPrompt(subjectImages, styleId, text), ...STICKER_SHEET_PARAMS })}
          textField={{ label: T.extraLabel[locale], placeholder: T.extraPlaceholder[locale], required: false }}
          label={T.cta[locale]}
          parentJobId={null}
          projectId={projectId}
          canSubmit={canSave}
          paid={paid}
          onSent={setSheetJobId}
          // Lik: slike su već pinovani uploadi ovog korisnika - idu direktno kao reference.
          create={async (job) =>
            createJob({
              modelSlug: job.modelSlug,
              params: job.params,
              inputMode: job.inputMode,
              inputs: JSON.stringify({ image: subject === "lik" ? refs : (job.inputs.image ?? []) }),
              ...(job.projectId ? { projectId: job.projectId } : {}),
            })
          }
          {...(subject === "lik" ? { privacyNote: null } : {})}
        />
      ) : (
        <div className="surface-inset space-y-3 bg-paper p-4" aria-live="polite">
          {failed ? (
            <>
              <p className="type-body-sm font-black text-red-700 dark:text-red-300">{T.failed[locale]}</p>
              <Button variant="secondary" onClick={() => setSheetJobId(null)} icon={<RefreshCw aria-hidden="true" className="size-4" />}>
                {T.another[locale]}
              </Button>
            </>
          ) : sheetUrl ? (
            <>
              <p className="inline-flex items-center gap-2 type-body font-black text-ink">
                <CircleCheck aria-hidden="true" className="size-5" />
                {T.arrived[locale]}
              </p>
              <img src={sheetUrl} alt="" className="surface-media block max-h-64 w-auto max-w-full bg-paper-strong" />
              {sheetJob?.isMock ? <p className="type-body-sm font-semibold text-muted">{T.demoNote[locale]}</p> : null}
              <StickerCutter key={sheetUrl} locale={locale} url={sheetUrl} />
              <Button variant="ghost" onClick={() => setSheetJobId(null)} icon={<RefreshCw aria-hidden="true" className="size-4" />}>
                {T.another[locale]}
              </Button>
            </>
          ) : (
            <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
              <Spinner size="sm" />
              {T.waiting[locale]}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** „Iseci gotovu mrežu": rad iz galerije (`?ulaz=`) ili fajl, besplatno. */
function CutReady({ locale, source }: { locale: Locale; source: CreaToolProps["source"] }) {
  const image = useImageInput(source);
  return (
    <div className="space-y-5">
      <ImageInput locale={locale} input={image} disabled={false} />
      {image.picked ? <StickerCutter key={image.picked.key} locale={locale} url={image.picked.url} /> : null}
      {image.picked === null ? <p className="type-body-sm font-semibold text-muted">{CREA_PAID_EDIT_COPY.needImage[locale]}</p> : null}
    </div>
  );
}

/** Isecanje mreže u 9 nalepnica (na uređaju), pregled na šahovnici, ZIP paket. */
function StickerCutter({ locale, url }: { locale: Locale; url: string }) {
  const step = useLocalStep();
  const [outline, setOutline] = useState(true);
  const [cuts, setCuts] = useState<{ outline: boolean; list: Cut[] } | null>(null);
  const outlineId = useId();

  useEffect(
    () => () => {
      for (const cut of cuts?.list ?? []) URL.revokeObjectURL(cut.url);
    },
    [cuts],
  );

  async function run() {
    const list = await step.run((context) => cutStickers(url, outline, context));
    if (list) setCuts({ outline, list });
  }

  async function downloadPack() {
    if (!cuts) return;
    const entries = await Promise.all(
      cuts.list.map(async (cut) => ({ name: stickerFileName(cut.index), data: new Uint8Array(await cut.blob.arrayBuffer()) })),
    );
    const tray = await trayIcon(cuts.list[0]!.blob);
    entries.push({ name: "crea-nalepnice-ikonica.png", data: new Uint8Array(await tray.arrayBuffer()) });
    download(new Blob([createZip(entries)], { type: "application/zip" }), "crea-nalepnice.zip");
  }

  const fresh = cuts !== null && cuts.outline === outline;

  return (
    <div className="space-y-4">
      <label htmlFor={outlineId} className="flex min-h-11 cursor-pointer items-center gap-3">
        <input id={outlineId} type="checkbox" checked={outline} onChange={(event) => setOutline(event.target.checked)} className="size-5 shrink-0 accent-ink" />
        <span className="type-body-sm font-black text-ink">{T.outline[locale]}</span>
      </label>
      {!fresh ? (
        <Button onClick={() => void run()} loading={step.busy} icon={<Scissors aria-hidden="true" className="size-4" />} className="shadow-[4px_4px_0_0_var(--ink)]">
          {T.cut[locale]}
        </Button>
      ) : null}
      <LocalStepStatus locale={locale} state={step.state} onCancel={step.cancel} />

      {cuts && fresh ? (
        <section className="space-y-4 border-t border-line pt-4">
          <h3 className="type-h4 text-ink">{T.resultTitle[locale]}</h3>
          <ol className="grid max-w-2xl grid-cols-3 gap-2 sm:gap-3">
            {cuts.list.map((cut) => {
              const name = STICKER_EXPRESSIONS[cut.index]?.label[locale] ?? String(cut.index + 1);
              return (
                <li key={cut.index} className="min-w-0">
                  <figure className="space-y-1">
                    <div
                      className="surface-media overflow-hidden bg-paper shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
                      // Šahovnica pokazuje da je pozadina zaista providna.
                      style={{ backgroundImage: "repeating-conic-gradient(var(--line) 0% 25%, transparent 0% 50%)", backgroundSize: "16px 16px" }}
                    >
                      <img src={cut.url} alt={name} className="block aspect-square w-full object-contain" />
                    </div>
                    <figcaption className="flex items-center justify-between gap-1">
                      <span className="min-w-0 truncate text-xs font-black text-ink">{`${cut.index + 1}. ${name}`}</span>
                      <button
                        type="button"
                        onClick={() => download(cut.blob, stickerFileName(cut.index))}
                        aria-label={fillCopy(T.downloadOne[locale], { name })}
                        className="grid size-11 shrink-0 place-items-center rounded-full text-ink hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        <Download aria-hidden="true" className="size-4" />
                      </button>
                    </figcaption>
                  </figure>
                </li>
              );
            })}
          </ol>
          <Button onClick={() => void downloadPack()} icon={<Package aria-hidden="true" className="size-4" />} className="shadow-[4px_4px_0_0_var(--ink)]">
            {T.downloadPack[locale]}
          </Button>
          <p className="type-body-sm font-semibold text-muted">{T.packHint[locale]}</p>
        </section>
      ) : null}
    </div>
  );
}

type Sprite = { blob: Blob; url: string; meta: ReturnType<typeof spriteMeta> };

/** Video → sličice (seek + platno), opciono bez jednobojne pozadine, složene u list. */
async function makeSprite(file: File, count: number, frame: number, removeBg: boolean, context: LocalStepContext): Promise<Sprite> {
  context.reportRunning();
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new CreaLocalAiError("BAD_INPUT"));
    });
    const times = spriteFrameTimes(Number.isFinite(video.duration) ? video.duration : 0, count);
    const layout = spriteLayout(count, frame);
    const { canvas: sheet, ctx: sheetCtx } = createCanvas(layout.width, layout.height);
    const { canvas: cell, ctx: cellCtx } = createCanvas(frame, frame);
    let background: [number, number, number] | null = null;
    for (const [index, time] of times.entries()) {
      if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = time;
      });
      // Ceo kadar staje u kvadrat (bez sečenja), po sredini.
      const scale = Math.min(frame / video.videoWidth, frame / video.videoHeight);
      const w = video.videoWidth * scale;
      const h = video.videoHeight * scale;
      cellCtx.clearRect(0, 0, frame, frame);
      cellCtx.drawImage(video, (frame - w) / 2, (frame - h) / 2, w, h);
      if (removeBg) {
        const pixels = cellCtx.getImageData(0, 0, frame, frame);
        const rgba = { data: pixels.data, width: frame, height: frame };
        // Boja pozadine iz PRVE sličice važi za ceo snimak (kamera stoji, pozadina ista).
        background ??= borderColor(rgba);
        const keyed = keyOutBackground(rgba, background);
        cellCtx.putImageData(new ImageData(new Uint8ClampedArray(keyed.data), frame, frame), 0, 0);
      }
      sheetCtx.drawImage(cell, (index % layout.columns) * frame, Math.floor(index / layout.columns) * frame);
    }
    const blob = await canvasToBlob(sheet, "image/png");
    return { blob, url: URL.createObjectURL(blob), meta: spriteMeta(count, frame, 12, "crea-sprajt.png") };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

function SpriteFromVideo({ locale }: { locale: Locale }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const bgId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState(false);
  const [count, setCount] = useState<(typeof SPRITE_FRAME_COUNTS)[number]>(12);
  const [frame, setFrame] = useState<(typeof SPRITE_FRAME_SIZES)[number]>(128);
  const [removeBg, setRemoveBg] = useState(false);
  const [sprite, setSprite] = useState<Sprite | null>(null);
  const step = useLocalStep();

  useEffect(
    () => () => {
      if (sprite) URL.revokeObjectURL(sprite.url);
    },
    [sprite],
  );

  async function run() {
    if (!file) return;
    const result = await step.run((context) => makeSprite(file, count, frame, removeBg, context));
    if (result) setSprite(result);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="type-body-sm font-black text-ink">{fillCopy(T.video[locale], { max: SPRITE_MAX_SECONDS })}</p>
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept="video/*"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const next = event.target.files?.[0];
            event.currentTarget.value = "";
            if (!next) return;
            const ok = next.type.startsWith("video/");
            setProblem(!ok);
            if (ok) {
              setFile(next);
              setSprite(null);
            }
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="surface-inset mt-2 flex min-h-24 w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-line bg-paper p-4 text-center text-ink transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
        >
          <Clapperboard aria-hidden="true" className="size-6" />
          <span className="type-body font-black">{file ? file.name : T.chooseVideo[locale]}</span>
        </button>
        {problem ? <p role="alert" className="mt-2 type-body-sm font-black text-red-700 dark:text-red-300">{T.notVideo[locale]}</p> : null}
      </div>
      <div className="grid gap-4 @min-[640px]:grid-cols-2">
        <ChoiceChips
          legend={T.frames[locale]}
          name="crea-sprite-count"
          options={SPRITE_FRAME_COUNTS.map((id) => ({ id, label: String(id) }))}
          value={count}
          onChange={setCount}
          disabled={step.busy}
        />
        <ChoiceChips
          legend={T.frameSize[locale]}
          name="crea-sprite-size"
          options={SPRITE_FRAME_SIZES.map((id) => ({ id, label: `${id} px` }))}
          value={frame}
          onChange={setFrame}
          disabled={step.busy}
        />
      </div>
      <label htmlFor={bgId} className="flex min-h-11 cursor-pointer items-start gap-3">
        <input id={bgId} type="checkbox" checked={removeBg} onChange={(event) => setRemoveBg(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-ink" />
        <span>
          <span className="block type-body-sm font-black text-ink">{T.removeBg[locale]}</span>
          <span className="block type-body-sm font-semibold text-muted">{T.removeBgHint[locale]}</span>
        </span>
      </label>
      <Button onClick={() => void run()} disabled={!file} loading={step.busy} icon={<Scissors aria-hidden="true" className="size-4" />} className="shadow-[4px_4px_0_0_var(--ink)]">
        {T.makeSprite[locale]}
      </Button>
      <LocalStepStatus locale={locale} state={step.state} onCancel={step.cancel} />
      {sprite ? (
        <section className="space-y-3 border-t border-line pt-4">
          <h3 className="type-h4 text-ink">{fillCopy(T.spriteTitle[locale], { frames: sprite.meta.frames, columns: sprite.meta.columns })}</h3>
          <div
            className={cn("surface-media overflow-auto bg-paper p-2 shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]")}
            style={{ backgroundImage: "repeating-conic-gradient(var(--line) 0% 25%, transparent 0% 50%)", backgroundSize: "16px 16px" }}
          >
            <img src={sprite.url} alt="" className="block h-auto max-w-full" style={{ imageRendering: "pixelated" }} />
          </div>
          <p className="type-body-sm font-semibold text-muted">{fillCopy(T.spriteHint[locale], { size: sprite.meta.frameWidth })}</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => download(sprite.blob, sprite.meta.image)} icon={<Download aria-hidden="true" className="size-4" />}>
              {T.downloadSprite[locale]}
            </Button>
            <Button
              variant="secondary"
              onClick={() => download(new Blob([JSON.stringify(sprite.meta, null, 2)], { type: "application/json" }), "crea-sprajt.json")}
              icon={<Download aria-hidden="true" className="size-4" />}
            >
              {T.downloadMeta[locale]}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
