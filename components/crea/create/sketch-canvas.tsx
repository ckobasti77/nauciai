"use client";

import { Eraser, Pencil, Trash2, Undo2 } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import { cn } from "@/components/ui/primitives";
import { CREA_MAKE_TOOLS_COPY as T } from "@/lib/crea-create-copy";
import type { Locale } from "@/lib/i18n";

/** Veličina platna u pikselima (kvadrat; ekran ga samo smanjuje). */
export const SKETCH_SIZE = 768;
const UNDO_MAX = 20;
const SIZES = [4, 10, 22] as const;
/** Boje olovke su sadržaj crteža (kao paleta u editoru), ne boje teme. */
const INKS = ["#1b1b1b", "#d62828", "#1d4ed8", "#15803d", "#f4be30", "#8b5a2b"] as const;
const PAPER = "#ffffff";

export type SketchCanvasHandle = {
  toBlob: () => Promise<Blob>;
  isEmpty: () => boolean;
};

/**
 * Platno za crtanje (K13: crtaj i gledaj S9, skica u sliku S10). Obično 2D platno sa
 * pokazivačkim događajima - radi mišem, prstom i olovkom (`touch-action: none`).
 * Posle svakog poteza javlja `onChange(revizija)`; izvoz je PNG na beloj pozadini.
 */
export const SketchCanvas = forwardRef<SketchCanvasHandle, { locale: Locale; onChange?: (revision: number) => void; disabled?: boolean }>(
  function SketchCanvas({ locale, onChange, disabled }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const history = useRef<ImageData[]>([]);
    const drawing = useRef<{ x: number; y: number } | null>(null);
    const strokes = useRef(0);
    const [tool, setTool] = useState<"pen" | "eraser">("pen");
    const [size, setSize] = useState<(typeof SIZES)[number]>(SIZES[1]);
    const [ink, setInk] = useState<string>(INKS[0]);
    const [canUndo, setCanUndo] = useState(false);

    const context = useCallback(() => canvasRef.current?.getContext("2d", { willReadFrequently: true }) ?? null, []);

    useEffect(() => {
      const ctx = context();
      if (!ctx) return;
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, SKETCH_SIZE, SKETCH_SIZE);
    }, [context]);

    useImperativeHandle(
      ref,
      () => ({
        toBlob: () =>
          new Promise<Blob>((resolve, reject) => {
            const canvas = canvasRef.current;
            if (!canvas) return reject(new Error("BEZ_PLATNA"));
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("BEZ_SLIKE"))), "image/png");
          }),
        isEmpty: () => strokes.current === 0,
      }),
      [],
    );

    function point(event: React.PointerEvent<HTMLCanvasElement>) {
      const rect = event.currentTarget.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * SKETCH_SIZE,
        y: ((event.clientY - rect.top) / rect.height) * SKETCH_SIZE,
      };
    }

    function line(from: { x: number; y: number }, to: { x: number; y: number }) {
      const ctx = context();
      if (!ctx) return;
      ctx.strokeStyle = tool === "eraser" ? PAPER : ink;
      ctx.lineWidth = tool === "eraser" ? size * 2.5 : size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    function snapshot() {
      const ctx = context();
      if (!ctx) return;
      history.current.push(ctx.getImageData(0, 0, SKETCH_SIZE, SKETCH_SIZE));
      if (history.current.length > UNDO_MAX) history.current.shift();
      setCanUndo(true);
    }

    function changed() {
      strokes.current += 1;
      onChange?.(strokes.current);
    }

    function undo() {
      const ctx = context();
      const previous = history.current.pop();
      if (!ctx || !previous) return;
      ctx.putImageData(previous, 0, 0);
      setCanUndo(history.current.length > 0);
      changed();
    }

    function clear() {
      const ctx = context();
      if (!ctx) return;
      snapshot();
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, SKETCH_SIZE, SKETCH_SIZE);
      changed();
    }

    const toolButton = (active: boolean) =>
      cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-black transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 motion-reduce:transition-none",
        active ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper text-ink hover:border-ink",
      );

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={T.canvasLabel[locale]}>
          <button type="button" disabled={disabled} aria-pressed={tool === "pen"} onClick={() => setTool("pen")} className={toolButton(tool === "pen")}>
            <Pencil aria-hidden="true" className="size-4" />
            {T.pen[locale]}
          </button>
          <button type="button" disabled={disabled} aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} className={toolButton(tool === "eraser")}>
            <Eraser aria-hidden="true" className="size-4" />
            {T.eraser[locale]}
          </button>
          <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
          <span className="sr-only">{T.size[locale]}</span>
          {SIZES.map((value) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              aria-pressed={size === value}
              aria-label={`${T.size[locale]} ${value}`}
              onClick={() => setSize(value)}
              className={cn(toolButton(size === value), "size-11 justify-center px-0")}
            >
              <span className="rounded-full bg-current" style={{ width: Math.min(20, value), height: Math.min(20, value) }} />
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
          {INKS.map((color) => (
            <button
              key={color}
              type="button"
              disabled={disabled}
              aria-pressed={ink === color && tool === "pen"}
              aria-label={`${T.color[locale]} ${color}`}
              onClick={() => {
                setInk(color);
                setTool("pen");
              }}
              className={cn(
                "inline-flex size-11 items-center justify-center rounded-full border-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40",
                ink === color && tool === "pen" ? "border-ink" : "border-transparent",
              )}
            >
              <span className="size-7 rounded-full border border-ink/30" style={{ backgroundColor: color }} />
            </button>
          ))}
          <span className="flex-1" />
          <button type="button" disabled={disabled || !canUndo} onClick={undo} className={toolButton(false)}>
            <Undo2 aria-hidden="true" className="size-4" />
            {T.undo[locale]}
          </button>
          <button type="button" disabled={disabled} onClick={clear} className={toolButton(false)}>
            <Trash2 aria-hidden="true" className="size-4" />
            {T.clear[locale]}
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={SKETCH_SIZE}
          height={SKETCH_SIZE}
          role="img"
          aria-label={`${T.canvasLabel[locale]} - ${T.canvasHint[locale]}`}
          className={cn(
            "surface-media block aspect-square w-full max-w-[560px] touch-none bg-paper-strong shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]",
            disabled ? "cursor-not-allowed opacity-70" : tool === "eraser" ? "cursor-cell" : "cursor-crosshair",
          )}
          onPointerDown={(event) => {
            if (disabled) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            snapshot();
            const start = point(event);
            drawing.current = start;
            line(start, { x: start.x + 0.1, y: start.y + 0.1 });
          }}
          onPointerMove={(event) => {
            if (!drawing.current) return;
            const next = point(event);
            line(drawing.current, next);
            drawing.current = next;
          }}
          onPointerUp={() => {
            if (!drawing.current) return;
            drawing.current = null;
            changed();
          }}
          onPointerCancel={() => {
            if (!drawing.current) return;
            drawing.current = null;
            changed();
          }}
        />
        <p className="type-body-sm font-semibold text-muted">{T.canvasHint[locale]}</p>
      </div>
    );
  },
);
