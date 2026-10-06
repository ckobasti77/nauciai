/* eslint-disable @next/next/no-img-element -- logo je potpisan URL iz Convex storage-a ili lokalni `blob:` SVG. */
"use client";

import { useMutation } from "convex/react";
import { CircleCheck, Download, Palette, PenTool, RefreshCw, Shapes } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { colorsFromLogo, logoPng } from "@/components/crea/brand-kit/logo-colors";
import { useBrandKit } from "@/components/crea/brand-kit/use-brand-kit";
import type { CreaToolOutput } from "@/components/crea/tool-runner";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { canvasToBlob, createCanvas } from "@/components/crea/tools/canvas";
import { loadImageFromUrl, naturalSize, useWatchedJob } from "@/components/crea/tools/job-image";
import { LocalStepStatus, useLocalStep } from "@/components/crea/tools/local-step";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { vectorize } from "@/components/crea/tools/vector-tool";
import { useSlotUpload } from "@/components/studio/use-slot-upload";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_BRAND_FONTS } from "@/lib/crea-brand-kit";
import { fillCopy } from "@/lib/crea-copy";
import {
  LOGO_ABOUT_MAX,
  LOGO_KINDS,
  LOGO_NAME_MAX,
  LOGO_ROUTES,
  LOGO_STYLES,
  logoFileName,
  logoMissing,
  logoParams,
  logoPrompt,
  VECTOR_OUTPUT_MODELS,
  type LogoKind,
} from "@/lib/crea-logo";
import { CREA_LOGO_COPY as T, CREA_RECIPE_COPY } from "@/lib/crea-recipes-copy";
import type { Locale } from "@/lib/i18n";

const FIELD =
  "surface-inset mt-2 block min-h-11 w-full border-2 border-ink bg-paper px-3 text-base font-bold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * Izlaz rada kao PNG fajl. Ide preko `<img>` (`loadImageFromUrl`), jer DEMO izlaz
 * je SVG, koji `createImageBitmap` u Chrome-u ne dekodira.
 */
async function outputAsPng(url: string, signal?: AbortSignal): Promise<File> {
  const { image, release } = await loadImageFromUrl(url, signal);
  try {
    const { width, height } = naturalSize(image);
    const { canvas, ctx } = createCanvas(width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return new File([await canvasToBlob(canvas, "image/png")], "crea-logo.png", { type: "image/png" });
  } finally {
    release();
  }
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Logo i ikone (S41, K15): plaćeni deo crta znak (Recraft V4.1, ili Nano Banana
 * 2), a SVG nastaje na uređaju istim VTracer-om kao alat „Vektor" (0 kredita).
 * Kad se u katalogu upali Recraft vektor, on je prvi izbor i odmah vraća SVG.
 * Boje iz brend kita idu u opis; gotov znak može da postane logo kita.
 */
export default function LogoTool({ tool, locale, canSave, projectId, paid }: CreaToolProps) {
  const kit = useBrandKit();
  const nameId = useId();
  const aboutId = useId();
  const [kind, setKind] = useState<LogoKind>("logo");
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [styleId, setStyleId] = useState(LOGO_STYLES[0]!.id);
  const [useBrand, setUseBrand] = useState(true);
  const [jobId, setJobId] = useState<Id<"generationJobs"> | null>(null);
  const job = useWatchedJob(jobId);

  const input = { kind, name, about, styleId };
  const missing = logoMissing(input);
  const brand = kit && useBrand ? kit : null;
  const ready = job?.status === "done" && job.outputUrl ? job : null;
  const failed = job?.status === "failed" || job?.status === "refunded";

  return (
    <section
      aria-labelledby="crea-tool-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <ToolHeader tool={tool} locale={locale} icon={<PenTool aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <ChoiceChips<LogoKind>
          legend={T.kind[locale]}
          name="crea-logo-kind"
          options={LOGO_KINDS.map((entry) => ({ id: entry.id, label: entry.label[locale], hint: entry.hint[locale] }))}
          value={kind}
          onChange={setKind}
        />
        <div className="grid gap-4 @min-[760px]:grid-cols-2">
          {kind === "logo" ? (
            <div>
              <label htmlFor={nameId} className="type-body-sm font-black text-ink">
                {T.name[locale]}
              </label>
              <input
                id={nameId}
                value={name}
                maxLength={LOGO_NAME_MAX}
                onChange={(event) => setName(event.target.value)}
                placeholder={T.namePlaceholder[locale]}
                className={FIELD}
              />
            </div>
          ) : null}
          <div className={kind === "logo" ? "" : "@min-[760px]:col-span-2"}>
            <label htmlFor={aboutId} className="type-body-sm font-black text-ink">
              {T.about[locale]}
            </label>
            <input
              id={aboutId}
              value={about}
              maxLength={LOGO_ABOUT_MAX}
              onChange={(event) => setAbout(event.target.value)}
              placeholder={T.aboutPlaceholder[locale]}
              className={FIELD}
            />
          </div>
        </div>
        <ChoiceChips
          legend={T.style[locale]}
          name="crea-logo-style"
          options={LOGO_STYLES.map((entry) => ({ id: entry.id, label: entry.label[locale] }))}
          value={styleId}
          onChange={setStyleId}
        />
        {kit ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" checked={useBrand} onChange={(event) => setUseBrand(event.target.checked)} className="size-5 shrink-0 accent-ink" />
            <span className="type-body-sm font-black text-ink">{T.brand[locale]}</span>
            <span aria-hidden="true" className="flex gap-1">
              {kit.colors.map((hex) => (
                <span key={hex} className="block size-5 rounded-full shadow-[inset_0_0_0_1px_var(--shadow-hard-25)]" style={{ backgroundColor: hex }} />
              ))}
            </span>
          </label>
        ) : null}

        {jobId === null ? (
          <PaidEditPanel
            locale={locale}
            routes={LOGO_ROUTES}
            purpose="edit"
            ready={missing === null}
            notReadyReason={missing === "name" ? T.needName[locale] : T.needAbout[locale]}
            prepare={async () => ({ files: {}, width: 1, height: 1 })}
            request={(route) => logoParams(route, logoPrompt(input, brand))}
            textField={null}
            label={(kind === "logo" ? T.cta : T.ctaIcon)[locale]}
            parentJobId={null}
            projectId={projectId}
            canSubmit={canSave}
            paid={paid}
            onSent={setJobId}
            privacyNote={null}
          />
        ) : (
          <div className="surface-inset space-y-4 bg-paper p-4" aria-live="polite">
            {failed ? (
              <>
                <p className="type-body-sm font-black text-red-700 dark:text-red-300">{T.failed[locale]}</p>
                <Button variant="secondary" onClick={() => setJobId(null)} icon={<RefreshCw aria-hidden="true" className="size-4" />}>
                  {T.another[locale]}
                </Button>
              </>
            ) : ready ? (
              <LogoResult
                key={ready._id}
                locale={locale}
                outputUrl={ready.outputUrl!}
                vector={VECTOR_OUTPUT_MODELS.includes(ready.modelSlug)}
                demo={ready.isMock}
                fileName={logoFileName(kind === "logo" ? name : about, kind)}
                kitName={name.trim() || about.trim()}
                canSave={canSave}
                onAnother={() => setJobId(null)}
              />
            ) : (
              <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
                <Spinner size="sm" />
                {T.waiting[locale]}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function LogoResult({
  locale,
  outputUrl,
  vector,
  demo,
  fileName,
  kitName,
  canSave,
  onAnother,
}: {
  locale: Locale;
  outputUrl: string;
  vector: boolean;
  demo: boolean;
  fileName: string;
  kitName: string;
  canSave: boolean;
  onAnother: () => void;
}) {
  const step = useLocalStep();
  const kit = useBrandKit();
  const saveKit = useMutation(api.creaBrandKit.saveMine);
  const upload = useSlotUpload();
  const [colors, setColors] = useState<2 | 4 | 6>(4);
  const [svg, setSvg] = useState<CreaToolOutput<{ paths: number; inputUrl: string }> | null>(null);
  const [kitState, setKitState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(
    () => () => {
      if (svg?.previewUrl) URL.revokeObjectURL(svg.previewUrl);
    },
    [svg],
  );

  async function fetchOutput(): Promise<Blob> {
    const response = await fetch(outputUrl);
    if (!response.ok) throw new Error(String(response.status));
    return response.blob();
  }

  async function makeVector() {
    const result = await step.run(async (context) => {
      const file = await outputAsPng(outputUrl, context.signal);
      return vectorize(file, outputUrl, "boje", colors, "spline", 4, { ...context, reportProgress: () => undefined });
    });
    if (result) setSvg(result);
  }

  async function toKit() {
    setKitState("saving");
    try {
      const png = await logoPng(await outputAsPng(outputUrl));
      const uploaded = await upload(png, "image", () => undefined);
      if (uploaded.url) URL.revokeObjectURL(uploaded.url);
      const fromLogo = kit ? null : await colorsFromLogo(png).catch(() => []);
      await saveKit({
        name: kit?.name ?? (kitName || T.defaultKitName[locale]),
        colors: kit ? [...kit.colors] : (fromLogo ?? []),
        fonts: kit?.fonts ?? DEFAULT_BRAND_FONTS,
        tone: kit?.tone ?? "",
        logoStorageId: uploaded.storageId as Id<"_storage">,
      });
      setKitState("saved");
    } catch {
      setKitState("error");
    }
  }

  return (
    <div className="space-y-4">
      <p className="inline-flex items-center gap-2 type-body font-black text-ink">
        <CircleCheck aria-hidden="true" className="size-5" />
        {vector ? T.svgDirect[locale] : svg ? fillCopy(T.svgReady[locale], { paths: svg.extra.paths }) : CREA_RECIPE_COPY.done[locale]}
      </p>
      <div className="grid gap-4 @min-[640px]:grid-cols-2">
        <figure className="surface-media overflow-hidden bg-paper-strong p-2 shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
          <img src={outputUrl} alt="" className="mx-auto block aspect-square w-full max-w-64 object-contain" />
        </figure>
        {svg ? (
          <figure className="surface-media overflow-hidden bg-paper-strong p-2 shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
            <img src={svg.previewUrl} alt="SVG" className="mx-auto block aspect-square w-full max-w-64 object-contain" />
          </figure>
        ) : null}
      </div>
      {demo ? <p className="type-body-sm font-semibold text-muted">{CREA_RECIPE_COPY.demoNote[locale]}</p> : null}

      {!vector && !svg ? (
        <div className="space-y-3">
          <ChoiceChips<2 | 4 | 6>
            legend={T.colors[locale]}
            name="crea-logo-colors"
            options={[2, 4, 6].map((count) => ({ id: count as 2 | 4 | 6, label: String(count) }))}
            value={colors}
            onChange={setColors}
            disabled={step.busy}
          />
          <Button onClick={() => void makeVector()} loading={step.busy} icon={<Shapes aria-hidden="true" className="size-4" />} className="shadow-[4px_4px_0_0_var(--ink)]">
            {step.busy ? T.vectorizing[locale] : T.vectorize[locale]}
          </Button>
          <LocalStepStatus locale={locale} state={step.state} onCancel={step.cancel} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {svg || vector ? (
          <Button
            icon={<Download aria-hidden="true" className="size-4" />}
            className={cn(svg && "shadow-[4px_4px_0_0_var(--ink)]")}
            onClick={() => (svg ? download(svg.blob, fileName) : void fetchOutput().then((blob) => download(blob, fileName)))}
          >
            {T.downloadSvg[locale]}
          </Button>
        ) : null}
        {!vector ? (
          <Button variant="secondary" icon={<Download aria-hidden="true" className="size-4" />} onClick={() => void fetchOutput().then((blob) => download(blob, fileName.replace(/\.svg$/, ".png")))}>
            {T.downloadPng[locale]}
          </Button>
        ) : null}
        {canSave && !vector ? (
          kitState === "saved" ? (
            <p className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink">
              <CircleCheck aria-hidden="true" className="size-4" />
              {T.inKit[locale]}
            </p>
          ) : (
            <Button variant="secondary" loading={kitState === "saving"} onClick={() => void toKit()} icon={<Palette aria-hidden="true" className="size-4" />}>
              {T.useInKit[locale]}
            </Button>
          )
        ) : null}
        <Button variant="ghost" onClick={onAnother} icon={<RefreshCw aria-hidden="true" className="size-4" />}>
          {T.another[locale]}
        </Button>
      </div>
      {kitState === "error" ? <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">{T.failed[locale]}</p> : null}
      {svg ? <p className="type-body-sm font-semibold text-muted">{T.vectorNote[locale]}</p> : null}
    </div>
  );
}
