"use client";

import type Konva from "konva";
import { Brush, Download, Eraser, MousePointerClick, Trash2, Undo2 } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Circle, Image as KonvaImage, Layer, Shape, Stage } from "react-konva";

import { createCanvas } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fillCopy } from "@/lib/crea-copy";
import { needsDownloadConfirm, type CreaDeviceCaps } from "@/lib/crea-device";
import { CREA_MASK_COPY as T } from "@/lib/crea-edit-copy";
import { modelsCached } from "@/lib/crea-local-ai/cache";
import { downloadBytes } from "@/lib/crea-local-ai/models";
import { formatBytes } from "@/lib/crea-local-ai/progress";
import { loadClickSegmenter } from "@/lib/crea-local-ai/runtime";
import { maskFromConfidence, maskStats, MASK_UNDO_STEPS, strokeOutline, type MaskStats, type StrokePoint } from "@/lib/crea-mask";
import type { Locale } from "@/lib/i18n";

export type MaskTool = "cetkica" | "gumica" | "klik";

export type MaskEditorHandle = {
  /** Platno maske u radnoj veličini; alfa = označeno. */
  maskCanvas: () => HTMLCanvasElement | null;
};

/** Boja oznake na ekranu (žuta brenda; u fajl ide samo alfa, ne boja). */
const MARK_RGB: readonly [number, number, number] = [244, 190, 48];
const MARK_FILL = `rgb(${MARK_RGB.join(",")})`;
const MARK_OPACITY = 0.55;

const TOOL_ICONS = { cetkica: Brush, gumica: Eraser, klik: MousePointerClick } as const;

type ClickState = "idle" | "confirm" | "loading" | "ready" | "working" | "failed";

/**
 * Editor maske (K11, S11-S13): fotka u pozadini, žuta oznaka preko nje.
 * Četkica i gumica crtaju obris poteza (`perfect-freehand`), klik pita
 * MediaPipe MagicTouch koji predmet je pod prstom. Konva daje pozornicu,
 * slojeve i isti put za miš i prst; maska je jedno platno u radnoj veličini
 * slike (≤ 1536 px), a „Poništi" pamti samo njen alfa kanal.
 *
 * Roditelj ga montira sa `key` slike - nova slika = nova, prazna maska.
 */
export const MaskEditor = forwardRef<
  MaskEditorHandle,
  {
    locale: Locale;
    image: HTMLCanvasElement;
    tools: readonly MaskTool[];
    initialTool?: MaskTool;
    disabled: boolean;
    caps: CreaDeviceCaps | null;
    onStats: (stats: MaskStats) => void;
  }
>(function MaskEditor({ locale, image, tools, initialTool, disabled, caps, onStats }, ref) {
  const width = image.width;
  const height = image.height;
  const [tool, setTool] = useState<MaskTool>(initialTool ?? tools[0]);
  const [brush, setBrush] = useState(caps?.mobile ? 28 : 36);
  const [stats, setStats] = useState<MaskStats>({ coverage: 0, box: null });
  const [undoCount, setUndoCount] = useState(0);
  const [clickState, setClickState] = useState<ClickState>("idle");
  const [clickNote, setClickNote] = useState<"missed" | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const mask = useMemo(() => createCanvas(width, height), [width, height]);
  const undo = useRef<Uint8ClampedArray[]>([]);
  const stroke = useRef<StrokePoint[] | null>(null);
  const maskNode = useRef<Konva.Image | null>(null);
  const strokeNode = useRef<Konva.Shape | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => ({ maskCanvas: () => mask.canvas }), [mask]);

  // Nov editor (nova slika) počinje prazan - roditelj ne sme da zadrži oznaku prethodne slike.
  useEffect(() => {
    onStats({ coverage: 0, box: null });
  }, [onStats]);

  // Širina pozornice prati kolonu; visina ide po odnosu stranica slike, najviše ~65 % ekrana.
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const maxHeight = typeof window === "undefined" ? 640 : Math.max(240, Math.min(720, window.innerHeight * 0.65));
  const scale = boxWidth > 0 ? Math.min(boxWidth / width, maxHeight / height) : 0;
  const stageWidth = Math.round(width * scale);
  const stageHeight = Math.round(height * scale);
  const brushInImage = scale > 0 ? brush / scale : brush;

  const redraw = useCallback(() => {
    maskNode.current?.getLayer()?.batchDraw();
  }, []);

  const report = useCallback(() => {
    const data = mask.ctx.getImageData(0, 0, width, height).data;
    const alpha = new Uint8ClampedArray(width * height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    const next = maskStats(alpha, width, height);
    setStats(next);
    onStats(next);
  }, [mask, width, height, onStats]);

  const snapshot = useCallback(() => {
    const data = mask.ctx.getImageData(0, 0, width, height).data;
    const alpha = new Uint8ClampedArray(width * height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    undo.current.push(alpha);
    if (undo.current.length > MASK_UNDO_STEPS) undo.current.shift();
    setUndoCount(undo.current.length);
  }, [mask, width, height]);

  function restore(alpha: Uint8ClampedArray) {
    const imageData = mask.ctx.createImageData(width, height);
    for (let i = 0; i < alpha.length; i++) {
      imageData.data[i * 4] = MARK_RGB[0];
      imageData.data[i * 4 + 1] = MARK_RGB[1];
      imageData.data[i * 4 + 2] = MARK_RGB[2];
      imageData.data[i * 4 + 3] = alpha[i];
    }
    mask.ctx.putImageData(imageData, 0, 0);
  }

  function undoLast() {
    const previous = undo.current.pop();
    if (!previous) return;
    restore(previous);
    setUndoCount(undo.current.length);
    redraw();
    report();
  }

  function clearAll() {
    if (stats.box === null) return;
    snapshot();
    mask.ctx.clearRect(0, 0, width, height);
    redraw();
    report();
  }

  function commitStroke(points: StrokePoint[], erase: boolean) {
    const outline = strokeOutline(points, brushInImage);
    if (outline.length < 3) return;
    snapshot();
    const ctx = mask.ctx;
    ctx.save();
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.fillStyle = MARK_FILL;
    ctx.beginPath();
    ctx.moveTo(outline[0][0], outline[0][1]);
    for (const [x, y] of outline.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    redraw();
    report();
  }

  // ── Klik (MagicTouch) ──────────────────────────────────────────────────────
  const clickBytes = downloadBytes(["mp-interactive-segmenter"]);
  const prepareClick = useCallback(async () => {
    setClickState("loading");
    try {
      const segmenter = await loadClickSegmenter();
      // Teški deo (enkoder) ide jednom po slici; klik posle toga traje delić sekunde.
      segmenter.setImage(image);
      setClickState("ready");
    } catch {
      setClickState("failed");
    }
  }, [image]);

  useEffect(() => {
    if (tool !== "klik" || clickState !== "idle" || !caps) return;
    let alive = true;
    void (async () => {
      const cached = await modelsCached(["mp-interactive-segmenter"]);
      if (!alive) return;
      if (!cached && needsDownloadConfirm(clickBytes, caps)) setClickState("confirm");
      else void prepareClick();
    })();
    return () => {
      alive = false;
    };
  }, [tool, clickState, caps, clickBytes, prepareClick]);

  async function clickAt(x: number, y: number) {
    if (clickState !== "ready") return;
    setClickState("working");
    setClickNote(null);
    try {
      const segmenter = await loadClickSegmenter();
      const result = segmenter.segmentAt(x / width, y / height);
      const picked = maskFromConfidence(result.confidence);
      const pickedWidth = result.width;
      const pickedHeight = result.height;
      const pickedStats = maskStats(picked, pickedWidth, pickedHeight);
      if (pickedStats.box === null || pickedStats.coverage > 0.97) {
        setClickNote("missed");
      } else {
        const { canvas, ctx } = createCanvas(pickedWidth, pickedHeight);
        const pixels = ctx.createImageData(pickedWidth, pickedHeight);
        for (let i = 0; i < picked.length; i++) {
          pixels.data[i * 4] = MARK_RGB[0];
          pixels.data[i * 4 + 1] = MARK_RGB[1];
          pixels.data[i * 4 + 2] = MARK_RGB[2];
          pixels.data[i * 4 + 3] = picked[i];
        }
        ctx.putImageData(pixels, 0, 0);
        snapshot();
        mask.ctx.drawImage(canvas, 0, 0, width, height);
        redraw();
        report();
      }
      setClickState("ready");
    } catch {
      setClickState("failed");
    }
  }

  // ── Pokazivač ──────────────────────────────────────────────────────────────
  function pointerInImage(event: Konva.KonvaEventObject<PointerEvent>): { x: number; y: number } | null {
    const position = event.target.getStage()?.getPointerPosition();
    if (!position || scale <= 0) return null;
    return { x: position.x / scale, y: position.y / scale };
  }

  function onPointerDown(event: Konva.KonvaEventObject<PointerEvent>) {
    if (disabled) return;
    const point = pointerInImage(event);
    if (!point) return;
    if (tool === "klik") {
      void clickAt(point.x, point.y);
      return;
    }
    stroke.current = [[point.x, point.y]];
    strokeNode.current?.getLayer()?.batchDraw();
  }

  function onPointerMove(event: Konva.KonvaEventObject<PointerEvent>) {
    const point = pointerInImage(event);
    if (!point) return;
    setCursor(event.evt.pointerType === "mouse" && tool !== "klik" ? point : null);
    if (!stroke.current) return;
    stroke.current.push([point.x, point.y]);
    strokeNode.current?.getLayer()?.batchDraw();
  }

  function onPointerUp() {
    const points = stroke.current;
    stroke.current = null;
    strokeNode.current?.getLayer()?.batchDraw();
    if (points && points.length > 0) commitStroke(points, tool === "gumica");
  }

  const percent = stats.coverage > 0 ? Math.max(1, Math.round(stats.coverage * 100)) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <ChoiceChips
          legend={T.legend[locale]}
          name="crea-mask-tool"
          options={tools.map((id) => {
            const Icon = TOOL_ICONS[id];
            return {
              id,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Icon aria-hidden="true" className="size-4" />
                  {T.tools[id][locale]}
                </span>
              ),
            };
          })}
          value={tool}
          onChange={(next) => {
            setTool(next);
            setClickNote(null);
          }}
          disabled={disabled}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={undoLast}
            disabled={disabled || undoCount === 0}
            icon={<Undo2 aria-hidden="true" className="size-4" />}
          >
            {T.undo[locale]}
          </Button>
          <Button
            variant="ghost"
            onClick={clearAll}
            disabled={disabled || stats.box === null}
            icon={<Trash2 aria-hidden="true" className="size-4" />}
          >
            {T.clear[locale]}
          </Button>
        </div>
      </div>

      {tool !== "klik" ? (
        <label className="flex min-h-11 max-w-sm items-center gap-3 type-body-sm font-black text-ink">
          <span className="shrink-0">{T.size[locale]}</span>
          <input
            type="range"
            min={8}
            max={120}
            step={2}
            value={brush}
            disabled={disabled}
            onChange={(event) => setBrush(Number(event.target.value))}
            className="h-11 w-full cursor-pointer accent-ink disabled:cursor-not-allowed"
          />
          <span className="w-12 shrink-0 text-right font-mono text-xs text-muted">{brush} px</span>
        </label>
      ) : null}

      <p className="type-body-sm font-semibold text-muted">{T.hints[tool][locale]}</p>

      {tool === "klik" ? (
        <div aria-live="polite" className="type-body-sm font-bold text-ink">
          {clickState === "confirm" ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-muted">{fillCopy(T.clickDownload[locale], { size: formatBytes(clickBytes, locale) })}</span>
              <Button variant="secondary" onClick={() => void prepareClick()} icon={<Download aria-hidden="true" className="size-4" />}>
                {T.clickDownloadCta[locale]}
              </Button>
            </div>
          ) : clickState === "loading" || clickState === "working" ? (
            <span className="inline-flex items-center gap-2">
              <Spinner size="xs" />
              {clickState === "loading" ? T.clickLoading[locale] : T.clickWorking[locale]}
            </span>
          ) : clickState === "failed" ? (
            <span className="text-red-700 dark:text-red-300">{T.clickFailed[locale]}</span>
          ) : clickNote === "missed" ? (
            <span className="text-muted">{T.clickMissed[locale]}</span>
          ) : null}
        </div>
      ) : null}

      <div ref={wrapRef} className="w-full">
        {scale > 0 ? (
          <div
            aria-label={T.canvasLabel[locale]}
            role="img"
            className="surface-media mx-auto w-fit overflow-hidden bg-paper shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
            style={{ touchAction: "none", cursor: tool === "klik" ? "pointer" : "none" }}
            onPointerLeave={() => setCursor(null)}
          >
            <Stage
              width={stageWidth}
              height={stageHeight}
              scaleX={scale}
              scaleY={scale}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              <Layer listening={false}>
                <KonvaImage image={image} width={width} height={height} />
                <KonvaImage ref={maskNode} image={mask.canvas} width={width} height={height} opacity={MARK_OPACITY} />
                <Shape
                  ref={strokeNode}
                  opacity={tool === "gumica" ? 0.35 : MARK_OPACITY}
                  fill={tool === "gumica" ? "#0e3158" : MARK_FILL}
                  sceneFunc={(context, shape) => {
                    const points = stroke.current;
                    if (!points) return;
                    const outline = strokeOutline(points, brushInImage, false);
                    if (outline.length < 3) return;
                    context.beginPath();
                    context.moveTo(outline[0][0], outline[0][1]);
                    for (const [x, y] of outline.slice(1)) context.lineTo(x, y);
                    context.closePath();
                    context.fillShape(shape);
                  }}
                />
                {cursor ? (
                  <Circle
                    x={cursor.x}
                    y={cursor.y}
                    radius={brushInImage / 2}
                    stroke="#0e3158"
                    strokeWidth={2}
                    strokeScaleEnabled={false}
                    dash={[6, 4]}
                  />
                ) : null}
              </Layer>
            </Stage>
          </div>
        ) : null}
      </div>

      <p role="status" className="font-mono text-xs font-bold text-muted">
        {percent > 0 ? fillCopy(T.marked[locale], { n: percent }) : T.empty[locale]}
      </p>
    </div>
  );
});
