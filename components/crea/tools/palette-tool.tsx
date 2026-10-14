"use client";

import { Check, Copy, Palette, Send } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { copyText, decodeImage, drawScaled } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_IMAGE_TOOL_COPY, CREA_PALETTE_COPY } from "@/lib/crea-image-tools-copy";
import { toLocalAiError } from "@/lib/crea-local-ai/errors";
import { colorName, palettePrompt, paletteText, readableOn, tidyPalette, type PaletteColor, type Rgb } from "@/lib/crea-palette";
import { creaPromptQuery } from "@/lib/crea-shell";
import type { Locale } from "@/lib/i18n";

const COUNTS = [4, 6, 8] as const;
type Count = (typeof COUNTS)[number];
/** Boje se vade iz smanjene slike - paleta je ista, a telefonu je lakše. */
const SAMPLE_MAX_SIDE = 400;

type PaletteExtra = { colors: PaletteColor[] };

async function extractPalette(file: File, count: Count, locale: Locale, context: ToolRunContext): Promise<CreaToolOutput<PaletteExtra>> {
  context.reportRunning();
  const bitmap = await decodeImage(file);
  const { canvas } = drawScaled(bitmap, SAMPLE_MAX_SIDE);
  bitmap.close();
  let colors: PaletteColor[];
  try {
    const { getPaletteSync } = await import("colorthief");
    // Traži se par boja više: bliske se posle spajaju u jednu (`tidyPalette`).
    const raw = getPaletteSync(canvas, { colorCount: Math.min(20, count + 3), quality: 2 }) ?? [];
    colors = tidyPalette(
      raw.map((color) => ({ rgb: color.array() as Rgb, share: color.proportion })),
      count,
    );
  } catch (error) {
    throw toLocalAiError(error, "INFERENCE_FAILED");
  }
  const text = paletteText(colors, locale);
  return {
    blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
    kind: "text",
    fileName: "paleta.txt",
    extra: { colors },
  };
}

export default function PaletteTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const image = useImageInput(source);
  const [count, setCount] = useState<Count>(6);

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      canRun={image.picked !== null}
      inputKey={image.picked ? `${image.picked.key}:${count}` : null}
      icon={<Palette aria-hidden="true" className="size-5" />}
      run={(context) => extractPalette(image.picked!.file, count, locale, context)}
      renderResult={(output) => <PaletteResult locale={locale} output={output} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <ImageInput locale={locale} input={image} disabled={busy} />
          <ChoiceChips
            legend={CREA_PALETTE_COPY.count[locale]}
            name="crea-palette-count"
            options={COUNTS.map((n) => ({ id: n, label: String(n) }))}
            value={count}
            onChange={setCount}
            disabled={busy}
          />
        </div>
      )}
    </ToolRunner>
  );
}

function PaletteResult({ locale, output }: { locale: Locale; output: CreaToolOutput<PaletteExtra> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const { colors } = output.extra;

  async function copy(key: string, text: string) {
    const ok = await copyText(text);
    setCopyFailed(!ok);
    setCopied(ok ? key : null);
  }

  return (
    <div className="space-y-4">
      <p className="type-body-sm font-semibold text-muted">{CREA_PALETTE_COPY.hint[locale]}</p>
      {/* Pruga cele palete: odnos boja na slici na prvi pogled. */}
      <div aria-hidden="true" className="surface-inset flex h-10 overflow-hidden">
        {colors.map((color) => (
          <span key={color.hex} style={{ backgroundColor: color.hex, flexGrow: color.share }} />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {colors.map((color) => {
          const done = copied === color.hex;
          return (
            <li key={color.hex}>
              <button
                type="button"
                onClick={() => void copy(color.hex, color.hex)}
                aria-label={fillCopy(CREA_PALETTE_COPY.copyColor[locale], { hex: color.hex })}
                className="igra-press surface-inset group flex w-full flex-col overflow-hidden border border-line bg-paper text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <span
                  className={cn(
                    "flex h-16 items-end justify-end p-2",
                    readableOn(color.rgb) === "dark" ? "text-black" : "text-white",
                  )}
                  style={{ backgroundColor: color.hex }}
                >
                  {done ? <Check aria-hidden="true" className="size-5" /> : <Copy aria-hidden="true" className="size-4 opacity-70" />}
                </span>
                <span className="px-3 py-2">
                  <span className="block font-mono text-sm font-black text-ink">{color.hex}</span>
                  <span className="block text-xs font-bold text-muted">
                    {colorName(color.rgb, locale)} · {fillCopy(CREA_PALETTE_COPY.share[locale], { n: Math.round(color.share * 100) })}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => void copy("all", paletteText(colors, locale))}
          icon={copied === "all" ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
        >
          {copied === "all" ? CREA_IMAGE_TOOL_COPY.copied[locale] : CREA_PALETTE_COPY.copyAll[locale]}
        </Button>
        <Button
          variant="secondary"
          title={CREA_PALETTE_COPY.toPromptHint[locale]}
          onClick={() => router.push(`${pathname}?${creaPromptQuery(palettePrompt(colors, locale), searchParams)}`, { scroll: false })}
          icon={<Send aria-hidden="true" className="size-4" />}
        >
          {CREA_PALETTE_COPY.toPrompt[locale]}
        </Button>
      </div>
      <p aria-live="polite" className="type-body-sm font-bold text-ink">
        {copyFailed ? CREA_IMAGE_TOOL_COPY.copyFailed[locale] : copied && copied !== "all" ? `${CREA_IMAGE_TOOL_COPY.copied[locale]}: ${copied}` : ""}
      </p>
    </div>
  );
}
