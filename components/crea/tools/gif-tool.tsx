/* eslint-disable @next/next/no-img-element -- sličice i rezultat su lokalni `blob:` URL-ovi, koje next/image ne obrađuje. */
"use client";

import { ArrowDown, ArrowUp, Film, ImagePlus, Pause, Play, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { createCanvas, decodeImage } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { IMAGE_INPUT_ACCEPT } from "@/components/crea/tools/image-input";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { FullScreenDropOverlay, useFullScreenDrop } from "@/components/studio/drop-slot";
import { fillCopy } from "@/lib/crea-copy";
import {
  fitFrame,
  gifCanvasSize,
  gifDelayMs,
  GIF_DEFAULT_SIZE,
  GIF_MAX_FRAMES,
  GIF_MIN_FRAMES,
  GIF_SIZES,
  GIF_SPEEDS,
  loopSeconds,
  moveItem,
  type GifSize,
  type GifSpeedId,
} from "@/lib/crea-gif";
import { CREA_GIF_COPY } from "@/lib/crea-image-tools-copy";
import { FORMAT_INPUT_MAX_BYTES, looksLikeHeic } from "@/lib/crea-image-format";
import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import { formatBytes } from "@/lib/crea-local-ai/progress";
import type { Locale } from "@/lib/i18n";

type Frame = { id: string; file: File; url: string };
type FitMode = "contain" | "cover";
type GifExtra = {
  frames: number;
  seconds: number;
  width: number;
  height: number;
  /** Prva slika - mirna sličica umesto animacije kad korisnik traži manje pokreta. */
  posterUrl: string;
};

/** Svaka sličica dobija svoju paletu od 256 boja - fotke tako ne izgube boje. */
async function makeGif(
  frames: Frame[],
  size: GifSize,
  speed: GifSpeedId,
  fit: FitMode,
  context: ToolRunContext,
): Promise<CreaToolOutput<GifExtra>> {
  context.reportRunning();
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const first = await decodeImage(frames[0].file);
  const canvasSize = gifCanvasSize(first, size);
  first.close();
  const { canvas, ctx } = createCanvas(canvasSize.width, canvasSize.height);
  const delay = gifDelayMs(speed);
  const gif = GIFEncoder();

  try {
    for (const frame of frames) {
      if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
      const bitmap = await decodeImage(frame.file);
      // Papir iza slike: providni delovi i trake oko slike drugog oblika.
      ctx.fillStyle = "#fffdf8";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const box = fitFrame(bitmap, canvas, fit);
      ctx.drawImage(bitmap, box.x, box.y, box.width, box.height);
      bitmap.close();
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const palette = quantize(data, 256);
      gif.writeFrame(applyPalette(data, palette), canvas.width, canvas.height, { palette, delay });
      // Pusti stranicu da diše između sličica (telefon, „Odustani").
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    gif.finish();
  } catch (error) {
    throw toLocalAiError(error, "INFERENCE_FAILED");
  }

  const blob = new Blob([gif.bytes()], { type: "image/gif" });
  const seconds = loopSeconds(frames.length, delay);
  return {
    blob,
    kind: "image",
    fileName: "crea-gif.gif",
    previewUrl: URL.createObjectURL(blob),
    params: { slicica: frames.length, brzina: speed, velicina: size, petljaS: seconds },
    extra: { frames: frames.length, seconds, ...canvasSize, posterUrl: frames[0].url },
  };
}

/**
 * Više slika kao ulaz. Ceo ekran prima prevučene slike dok je alat otvoren
 * (konvencija iz AGENTS.md). HEIC se pretvara u JPG kao u ostalim alatima.
 */
function useFrames() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [notice, setNotice] = useState<"max" | "skipped" | null>(null);
  const [converting, setConverting] = useState(false);
  const framesRef = useRef(frames);
  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);
  useEffect(() => () => framesRef.current.forEach((frame) => URL.revokeObjectURL(frame.url)), []);

  async function add(files: File[]) {
    const room = GIF_MAX_FRAMES - framesRef.current.length;
    const usable = files.filter(
      (file) => (file.type.startsWith("image/") || looksLikeHeic(file.name, file.type)) && file.size <= FORMAT_INPUT_MAX_BYTES,
    );
    let skipped = usable.length < files.length;
    const taken = usable.slice(0, Math.max(0, room));
    const ready: Frame[] = [];
    setConverting(taken.some((file) => looksLikeHeic(file.name, file.type)));
    for (const file of taken) {
      let image = file;
      if (looksLikeHeic(file.name, file.type)) {
        try {
          const { heicToJpeg } = await import("@/components/crea/tools/heic");
          image = await heicToJpeg(file);
        } catch {
          skipped = true;
          continue;
        }
      }
      ready.push({ id: `${file.name}:${file.size}:${file.lastModified}:${Math.random()}`, file: image, url: URL.createObjectURL(image) });
    }
    setConverting(false);
    setNotice(usable.length > room ? "max" : skipped ? "skipped" : null);
    setFrames((current) => [...current, ...ready].slice(0, GIF_MAX_FRAMES));
  }

  function remove(id: string) {
    setFrames((current) => {
      const gone = current.find((frame) => frame.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return current.filter((frame) => frame.id !== id);
    });
  }

  function move(from: number, to: number) {
    setFrames((current) => moveItem(current, from, to));
  }

  return { frames, add, remove, move, notice, converting };
}

function SmallButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-11 place-items-center rounded-full border-2 border-ink bg-paper-strong text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export default function GifTool({ tool, locale, caps, canSave, projectId }: CreaToolProps) {
  const input = useFrames();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [size, setSize] = useState<GifSize>(GIF_DEFAULT_SIZE);
  const [speed, setSpeed] = useState<GifSpeedId>("srednje");
  const [fit, setFit] = useState<FitMode>("contain");
  const { frames } = input;
  const enough = frames.length >= GIF_MIN_FRAMES;

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      canRun={enough && !input.converting}
      inputKey={enough ? `${frames.map((frame) => frame.id).join("|")}:${size}:${speed}:${fit}` : null}
      icon={<Film aria-hidden="true" className="size-5" />}
      run={(context) => makeGif(frames, size, speed, fit, context)}
      renderResult={(output) => <GifResult locale={locale} output={output} />}
    >
      {({ busy }) => (
        <GifInputs
          locale={locale}
          busy={busy || input.converting}
          input={input}
          fileRef={fileRef}
          size={size}
          setSize={setSize}
          speed={speed}
          setSpeed={setSpeed}
          fit={fit}
          setFit={setFit}
        />
      )}
    </ToolRunner>
  );
}

function GifInputs({
  locale,
  busy,
  input,
  fileRef,
  size,
  setSize,
  speed,
  setSpeed,
  fit,
  setFit,
}: {
  locale: Locale;
  busy: boolean;
  input: ReturnType<typeof useFrames>;
  fileRef: RefObject<HTMLInputElement | null>;
  size: GifSize;
  setSize: (size: GifSize) => void;
  speed: GifSpeedId;
  setSpeed: (speed: GifSpeedId) => void;
  fit: FitMode;
  setFit: (fit: FitMode) => void;
}) {
  const { frames } = input;
  const dragging = useFullScreenDrop(!busy, (files) => void input.add(files));
  const full = frames.length >= GIF_MAX_FRAMES;

  return (
    <div className="space-y-5">
      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_INPUT_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          void input.add(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
      />

      {frames.length === 0 ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="surface-inset flex min-h-36 w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-line bg-paper p-5 text-center text-ink transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
        >
          <span className="grid size-12 place-items-center rounded-full border-2 border-ink bg-paper-strong">
            <ImagePlus aria-hidden="true" className="size-6" />
          </span>
          <span className="type-body font-black">{CREA_GIF_COPY.choose[locale]}</span>
          <span className="type-body-sm font-semibold text-muted">{CREA_GIF_COPY.dropBody[locale]}</span>
        </button>
      ) : (
        <div>
          <p className="type-body-sm font-black text-ink">{fillCopy(CREA_GIF_COPY.frames[locale], { n: frames.length })}</p>
          <ol className="mt-2 divide-y divide-line">
            {frames.map((frame, index) => (
              <li key={frame.id} className="flex items-center gap-3 py-2">
                <span className="w-6 shrink-0 text-right font-mono text-sm font-black text-muted">{index + 1}</span>
                <img src={frame.url} alt="" className="surface-media size-14 shrink-0 bg-paper object-cover" />
                <span className="min-w-0 flex-1 truncate type-body-sm font-bold text-ink">{frame.file.name}</span>
                <div className="flex shrink-0 gap-1">
                  <SmallButton
                    label={fillCopy(CREA_GIF_COPY.moveUp[locale], { n: index + 1 })}
                    disabled={busy || index === 0}
                    onClick={() => input.move(index, index - 1)}
                  >
                    <ArrowUp aria-hidden="true" className="size-4" />
                  </SmallButton>
                  <SmallButton
                    label={fillCopy(CREA_GIF_COPY.moveDown[locale], { n: index + 1 })}
                    disabled={busy || index === frames.length - 1}
                    onClick={() => input.move(index, index + 1)}
                  >
                    <ArrowDown aria-hidden="true" className="size-4" />
                  </SmallButton>
                  <SmallButton label={fillCopy(CREA_GIF_COPY.remove[locale], { n: index + 1 })} disabled={busy} onClick={() => input.remove(frame.id)}>
                    <X aria-hidden="true" className="size-4" />
                  </SmallButton>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            disabled={busy || full}
            onClick={() => fileRef.current?.click()}
            className="igra-press mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus aria-hidden="true" className="size-4" />
            {CREA_GIF_COPY.addMore[locale]}
          </button>
        </div>
      )}

      <div aria-live="polite" className="space-y-1">
        {frames.length === 1 ? (
          <p className="type-body-sm font-bold text-ink">{fillCopy(CREA_GIF_COPY.minFrames[locale], { n: GIF_MIN_FRAMES })}</p>
        ) : null}
        {input.notice === "max" ? (
          <p className="type-body-sm font-bold text-ink">{fillCopy(CREA_GIF_COPY.maxFrames[locale], { n: GIF_MAX_FRAMES })}</p>
        ) : null}
        {input.notice === "skipped" ? <p className="type-body-sm font-bold text-ink">{CREA_GIF_COPY.skipped[locale]}</p> : null}
      </div>

      <ChoiceChips
        legend={CREA_GIF_COPY.speed[locale]}
        name="crea-gif-speed"
        options={GIF_SPEEDS.map((entry) => ({ id: entry.id, label: entry.label[locale] }))}
        value={speed}
        onChange={setSpeed}
        disabled={busy}
      />
      <ChoiceChips
        legend={CREA_GIF_COPY.size[locale]}
        name="crea-gif-size"
        options={GIF_SIZES.map((n) => ({ id: n, label: fillCopy(CREA_GIF_COPY.sizeValue[locale], { n }) }))}
        value={size}
        onChange={setSize}
        disabled={busy}
      />
      <ChoiceChips
        legend={CREA_GIF_COPY.fit[locale]}
        name="crea-gif-fit"
        options={(["contain", "cover"] as const).map((id) => ({ id, label: CREA_GIF_COPY.fits[id][locale] }))}
        value={fit}
        onChange={setFit}
        disabled={busy}
      />

      {dragging ? <FullScreenDropOverlay label={CREA_GIF_COPY.dropLabel[locale]} hint={CREA_GIF_COPY.dropBody[locale]} /> : null}
    </div>
  );
}

function GifResult({ locale, output }: { locale: Locale; output: CreaToolOutput<GifExtra> }) {
  const { extra } = output;
  // GIF se ne može pauzirati: uz „smanji pokrete" prikazuje se prva slika, a animacija tek na klik.
  const reduceMotion = useReducedMotion();
  const [play, setPlay] = useState<boolean | null>(null);
  const playing = play ?? !reduceMotion;
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
      {output.previewUrl ? (
        <div className="space-y-2">
          <img
            src={playing ? output.previewUrl : extra.posterUrl}
            alt={output.fileName}
            className="surface-media max-h-80 w-full bg-paper object-contain shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
          />
          <button
            type="button"
            onClick={() => setPlay(!playing)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {playing ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
            {CREA_GIF_COPY[playing ? "pause" : "play"][locale]}
          </button>
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-mono text-sm font-black text-ink">
          {extra.width} × {extra.height} px · {formatBytes(output.blob.size, locale)}
        </p>
        <p className="type-body-sm font-semibold text-muted">
          {fillCopy(CREA_GIF_COPY.loop[locale], { n: extra.frames, s: extra.seconds })}
        </p>
      </div>
    </div>
  );
}
