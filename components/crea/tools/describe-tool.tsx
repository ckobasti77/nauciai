"use client";

import { useAction } from "convex/react";
import { ImagePlus, ScanText, WandSparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { PromptParts } from "@/components/crea/create/prompt-helper";
import { PromptSegmentsView } from "@/components/crea/prompt-parts";
import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { canvasToBlob, createCanvas, decodeImage, drawScaled } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import type { CreaPaidContext, CreaToolProps } from "@/components/crea/tools/types";
import { api } from "@/convex/_generated/api";
import type { PromptHelperReply } from "@/convex/creaLlm";
import { CREA_LLM_DAILY_LIMIT } from "@/convex/creaLlmCore";
import { fillCopy } from "@/lib/crea-copy";
import { toolAvailability } from "@/lib/crea-device";
import { FLORENCE_IMAGE_SIZE } from "@/lib/crea-florence";
import { CREA_LIBRARY_COPY as L } from "@/lib/crea-library-copy";
import { toLocalAiError } from "@/lib/crea-local-ai/errors";
import { quickActionQuery } from "@/lib/crea-quick-actions";
import { creaPromptQuery } from "@/lib/crea-shell";
import { referenceTarget } from "@/lib/crea-versions";
import type { Locale } from "@/lib/i18n";

/** Slika za opis u oblaku: ~768 px JPEG (dovoljno za opis, mali zahtev). */
const CLOUD_MAX_SIDE = 768;

type Path = "local" | "cloud";
type DescribeExtra = { path: "local"; caption: string } | { path: "cloud"; reply: PromptHelperReply };

/** Florence-2 vidi kvadrat 768 × 768 (procesor ga razvuče, ne seče). */
async function florencePixels(file: File): Promise<Uint8ClampedArray> {
  const bitmap = await decodeImage(file);
  const { canvas, ctx } = createCanvas(FLORENCE_IMAGE_SIZE, FLORENCE_IMAGE_SIZE);
  ctx.drawImage(bitmap, 0, 0, FLORENCE_IMAGE_SIZE, FLORENCE_IMAGE_SIZE);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

async function cloudJpeg(file: File): Promise<ArrayBuffer> {
  const bitmap = await decodeImage(file);
  const { canvas } = drawScaled(bitmap, CLOUD_MAX_SIDE);
  bitmap.close();
  return (await canvasToBlob(canvas, "image/jpeg", 0.85)).arrayBuffer();
}

function promptOf(extra: DescribeExtra): string {
  if (extra.path === "local") return extra.caption;
  return extra.reply.ok ? extra.reply.prompt : "";
}

/**
 * „Kako je ovo napravljeno?" (K16, S45) za sliku bez opisa - okačenu fotku, tuđu
 * sliku ili rad besplatnog alata. Na računaru sa WebGPU-om opisuje je Florence-2
 * NA UREĐAJU (0 kredita, ništa ne napušta računar); svuda drugde (ili kad korisnik
 * izabere) jeftin opis u oblaku, takođe 0 kredita, uz dnevni limit. Iz opisa:
 * „Napravi sličnu" i „Koristi kao referencu".
 */
export default function DescribeTool({ tool, locale, caps, canSave, projectId, source, paid }: CreaToolProps) {
  const image = useImageInput(source);
  const describeImage = useAction(api.creaLlm.describeImage);
  // Lokalni opis samo gde uređaj nosi Florence-2 (računar sa WebGPU-om); drugde je put u oblaku.
  const availability = caps ? toolAvailability(tool, caps) : null;
  const localPossible = availability?.ok === true && availability.variant === "full";
  const [choice, setChoice] = useState<Path | null>(null);
  const path: Path = choice ?? (localPossible ? "local" : "cloud");

  async function run(context: ToolRunContext): Promise<CreaToolOutput<DescribeExtra>> {
    const file = image.picked!.file;
    let extra: DescribeExtra;
    if (path === "local") {
      const { loadFlorence } = await import("@/lib/crea-local-ai/runtime");
      const captioner = await loadFlorence({ signal: context.signal, onProgress: context.reportDownload });
      context.reportRunning();
      try {
        extra = { path: "local", caption: await captioner.describe(await florencePixels(file), context.signal) };
      } catch (error) {
        throw toLocalAiError(error, "INFERENCE_FAILED");
      }
    } else {
      context.reportRunning();
      const bytes = await cloudJpeg(file);
      extra = { path: "cloud", reply: await describeImage({ image: bytes, mimeType: "image/jpeg", locale }) };
    }
    return {
      blob: new Blob([promptOf(extra)], { type: "text/plain;charset=utf-8" }),
      kind: "text",
      fileName: "opis.txt",
      extra,
    };
  }

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      models={path === "local" ? (tool.localModels ?? []) : []}
      canRun={image.picked !== null}
      inputKey={image.picked ? `${image.picked.key}:${path}` : null}
      icon={<ScanText aria-hidden="true" className="size-5" />}
      run={run}
      renderResult={(output) => (
        <DescribeResult
          locale={locale}
          extra={output.extra}
          sourceJobId={source?.jobId ?? null}
          catalog={paid?.catalog ?? null}
        />
      )}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <p className="type-body-sm font-semibold text-muted">{L.describeIntro[locale]}</p>
          <ImageInput locale={locale} input={image} disabled={busy} />
          {localPossible ? (
            <ChoiceChips
              legend={L.describeWhere[locale]}
              name="crea-describe-path"
              options={[
                { id: "local", label: L.describeLocal[locale] },
                { id: "cloud", label: L.describeCloud[locale] },
              ]}
              value={path}
              onChange={setChoice}
              disabled={busy}
            />
          ) : null}
          {path === "cloud" ? (
            <p className="type-caption font-semibold text-muted">
              {fillCopy(L.describeCloudHint[locale], { limit: CREA_LLM_DAILY_LIMIT })}
            </p>
          ) : null}
        </div>
      )}
    </ToolRunner>
  );
}

function DescribeResult({
  locale,
  extra,
  sourceJobId,
  catalog,
}: {
  locale: Locale;
  extra: DescribeExtra;
  sourceJobId: string | null;
  catalog: CreaPaidContext["catalog"] | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prompt = promptOf(extra);
  const reference = sourceJobId && catalog ? referenceTarget(catalog) : null;

  if (extra.path === "cloud" && !extra.reply.ok) {
    return (
      <p role="alert" className="type-body-sm font-bold text-ink">
        {extra.reply.reason === "LIMIT"
          ? fillCopy(L.describeLimit[locale], { limit: CREA_LLM_DAILY_LIMIT })
          : L.describeFailed[locale]}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {extra.path === "cloud" && extra.reply.ok ? (
        <PromptParts locale={locale} result={extra.reply} demo={extra.reply.demo} />
      ) : (
        <div className="surface-inset border border-line bg-paper p-3">
          <PromptSegmentsView locale={locale} prompt={prompt} legendLabel={L.howLegend[locale]} />
        </div>
      )}
      <p className="type-caption font-semibold text-muted">
        {(extra.path === "local" ? L.describeEnglishLocal : L.describeEnglish)[locale]}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`${pathname}?${creaPromptQuery(prompt, searchParams)}`}
          scroll={false}
          className="igra-press igra-shadow-ink inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <WandSparkles aria-hidden="true" className="size-4" />
          {L.describeMakeSimilar[locale]}
        </Link>
        {reference && sourceJobId ? (
          <Link
            href={`${pathname}?${quickActionQuery(
              { area: reference.area, mode: reference.mode, model: reference.modelSlug, input: sourceJobId },
              searchParams,
            )}`}
            scroll={false}
            className="igra-press igra-shadow igra-depth-2 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <ImagePlus aria-hidden="true" className="size-4" />
            {L.describeAsReference[locale]}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
