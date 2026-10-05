"use client";

import { Check, Copy, ScanText } from "lucide-react";
import { useState } from "react";

import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { copyText, decodeImage, drawScaled } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { Button } from "@/components/ui/button";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_IMAGE_TOOL_COPY, CREA_OCR_COPY } from "@/lib/crea-image-tools-copy";
import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import { loadOcrWorker, terminateOcrWorker, type OcrLanguage } from "@/lib/crea-local-ai/runtime";
import {
  cleanOcrText,
  OCR_LOW_CONFIDENCE,
  OCR_SCRIPTS,
  ocrLanguages,
  scriptStats,
  toCyrillic,
  toLatin,
  wordCount,
  type OcrScript,
} from "@/lib/crea-ocr";
import type { Locale } from "@/lib/i18n";

/** Tesseract ne dobija ništa od 48 MP - duža stranica do 3000 px je dovoljno za sitna slova, a brže je. */
const OCR_MAX_SIDE = 3000;

type OcrExtra = { text: string; confidence: number };

async function recognize(file: File, script: OcrScript, context: ToolRunContext): Promise<CreaToolOutput<OcrExtra>> {
  const worker = await loadOcrWorker(ocrLanguages(script) as OcrLanguage[], {
    signal: context.signal,
    onProgress: context.reportDownload,
  });
  context.reportRunning();

  const bitmap = await decodeImage(file);
  const { canvas } = drawScaled(bitmap, OCR_MAX_SIDE);
  bitmap.close();

  // Prepoznavanje se ne može prekinuti iznutra: „Odustani" gasi ceo worker (sledeći put se pravi iznova).
  const stop = () => terminateOcrWorker();
  context.signal.addEventListener("abort", stop, { once: true });
  let raw: { text: string; confidence: number };
  try {
    const { data } = await worker.recognize(canvas);
    raw = { text: data.text, confidence: data.confidence };
  } catch (error) {
    throw toLocalAiError(error, context.signal.aborted ? "ABORTED" : "INFERENCE_FAILED");
  } finally {
    context.signal.removeEventListener("abort", stop);
  }
  if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");

  const text = cleanOcrText(raw.text);
  return {
    blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
    kind: "text",
    fileName: "tekst-sa-slike.txt",
    extra: { text, confidence: Math.round(raw.confidence) },
  };
}

export default function OcrTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const image = useImageInput(source);
  const [script, setScript] = useState<OcrScript>("oba");

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      canRun={image.picked !== null}
      inputKey={image.picked ? `${image.picked.key}:${script}` : null}
      icon={<ScanText aria-hidden="true" className="size-5" />}
      run={(context) => recognize(image.picked!.file, script, context)}
      renderResult={(output) => <OcrResult locale={locale} output={output} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <ImageInput locale={locale} input={image} disabled={busy} />
          <div>
            <ChoiceChips
              legend={CREA_OCR_COPY.script[locale]}
              name="crea-ocr-script"
              options={OCR_SCRIPTS.map((id) => ({ id, label: CREA_OCR_COPY.scripts[id][locale] }))}
              value={script}
              onChange={setScript}
              disabled={busy}
            />
            <p className="mt-2 type-body-sm font-semibold text-muted">{CREA_OCR_COPY.scriptHint[locale]}</p>
          </div>
        </div>
      )}
    </ToolRunner>
  );
}

type View = "original" | "latinica" | "cirilica";

function OcrResult({ locale, output }: { locale: Locale; output: CreaToolOutput<OcrExtra> }) {
  const { text, confidence } = output.extra;
  const [view, setView] = useState<View>("original");
  const [copied, setCopied] = useState<boolean | null>(null);
  const show = (next: View) => {
    setView(next);
    setCopied(null);
  };
  const shown = view === "latinica" ? toLatin(text) : view === "cirilica" ? toCyrillic(text) : text;
  const stats = scriptStats(text);

  if (!text) {
    return <p className="type-body font-bold text-ink">{CREA_OCR_COPY.empty[locale]}</p>;
  }

  return (
    <div className="space-y-3">
      <label htmlFor="crea-ocr-text" className="type-body-sm font-black text-ink">
        {CREA_OCR_COPY.resultLabel[locale]}
      </label>
      <textarea
        id="crea-ocr-text"
        readOnly
        value={shown}
        rows={Math.min(14, Math.max(4, shown.split("\n").length + 1))}
        className="surface-inset block w-full resize-y border border-line bg-paper p-3 font-mono text-sm leading-relaxed text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      />
      <p className="font-mono text-xs font-bold text-muted">
        {fillCopy(CREA_OCR_COPY.stats[locale], { words: wordCount(text), confidence })}
      </p>
      {confidence < OCR_LOW_CONFIDENCE ? (
        <p className="type-body-sm font-bold text-ink">{CREA_OCR_COPY.lowConfidence[locale]}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => void copyText(shown).then(setCopied)}
          icon={copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
          className="shadow-[4px_4px_0_0_var(--ink)]"
        >
          {copied ? CREA_IMAGE_TOOL_COPY.copied[locale] : CREA_OCR_COPY.copyText[locale]}
        </Button>
        {/* Prebacivanje pisma nudi se samo kad tekst nije već u tom pismu. */}
        {view !== "original" ? (
          <Button variant="ghost" onClick={() => show("original")}>
            {CREA_OCR_COPY.original[locale]}
          </Button>
        ) : null}
        {stats.cyrillic > 0 && view !== "latinica" ? (
          <Button variant="secondary" onClick={() => show("latinica")}>
            {CREA_OCR_COPY.toLatin[locale]}
          </Button>
        ) : null}
        {stats.latin > 0 && view !== "cirilica" ? (
          <Button variant="secondary" onClick={() => show("cirilica")}>
            {CREA_OCR_COPY.toCyrillic[locale]}
          </Button>
        ) : null}
      </div>
      {copied === false ? (
        <p role="alert" className="type-body-sm font-black text-ink">
          {CREA_IMAGE_TOOL_COPY.copyFailed[locale]}
        </p>
      ) : null}
    </div>
  );
}
