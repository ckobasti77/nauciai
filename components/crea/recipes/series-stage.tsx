"use client";

import { ArrowLeft, CircleCheck, Coins, Layers } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { useBrandKit } from "@/components/crea/brand-kit/use-brand-kit";
import { useJobQueue, type CreateJobArgs } from "@/components/crea/create/use-job-queue";
import { NightToggle } from "@/components/crea/night-toggle";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { providerPhoto } from "@/components/crea/tools/mask-canvas";
import type { CreaPaidContext } from "@/components/crea/tools/types";
import { useSlotUpload } from "@/components/studio/use-slot-upload";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import type { Id } from "@/convex/_generated/dataModel";
import { nightOptionFor, nightParams, nightQuote, nightSavingsPercent } from "@/convex/creaNightCore";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_PAID_EDIT_COPY } from "@/lib/crea-edit-copy";
import {
  SERIES_FORMATS,
  SERIES_MAX_JOBS,
  SERIES_MODEL,
  seriesJobs,
  seriesParams,
  seriesPrompt,
  seriesTexts,
  type CreaRecipeAspect,
} from "@/lib/crea-recipes";
import { CREA_RECIPE_COPY, CREA_SERIES_COPY as T } from "@/lib/crea-recipes-copy";
import type { Locale } from "@/lib/i18n";
import { studioErrorMessage } from "@/lib/studio-messages";
import { buildParams, creditsFor, formatCredits, paramValuesForMode } from "@/lib/studio-params";

const PILL =
  "igra-press inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const INPUT_MODE = "image_multi";

type Phase = { name: "idle" } | { name: "uploading" } | { name: "sending"; total: number; created: number; night: boolean } | { name: "error"; message: string };

/**
 * Serija oglasa (S39, K15): jedna fotka proizvoda × do 6 tekstova × do 4 formata
 * (najviše 12 oglasa). Fotka se okači JEDNOM, a svaki oglas je zaseban posao kroz
 * isti `studio.createJob` - red na klijentu (`useJobQueue`) čeka slobodno mesto
 * kad je javni limit od 2 posla u toku pun. Kad model nudi noćnu turu (K08),
 * serija može ceo da ide u nju, jeftinije.
 */
export function CreaSeriesStage({
  locale,
  paid,
  canSave,
  projectId,
  backHref,
}: {
  locale: Locale;
  paid: CreaPaidContext | null;
  canSave: boolean;
  projectId: Id<"studioProjects"> | null;
  backHref: string;
}) {
  const kit = useBrandKit();
  const photo = useImageInput(null);
  const upload = useSlotUpload();
  const [raw, setRaw] = useState("");
  const [formats, setFormats] = useState<CreaRecipeAspect[]>(["1:1", "9:16"]);
  const [useBrand, setUseBrand] = useState(true);
  const [night, setNight] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const queue = useJobQueue((message) => setPhase({ name: "error", message: studioErrorMessage(message, locale) }));
  const textsId = useId();
  const brandId = useId();

  const texts = seriesTexts(raw);
  const jobs = seriesJobs(texts, formats);
  const capped = texts.length * formats.length > SERIES_MAX_JOBS;
  const brand = useBrand && kit ? kit : null;
  const logo = brand?.logoStorageId ?? null;

  const model = paid?.catalog.find((entry) => entry.slug === SERIES_MODEL) ?? null;
  const keyMissing = model ? paid?.providerStatus?.[model.provider] === false : false;
  const available = model !== null && !(keyMissing && paid?.publicEnabled && !paid.isStaff);

  const prices = useMemo(() => {
    if (!model) return null;
    const params = seriesParams({ text: "x", aspect: "1:1" }, "x");
    const day = creditsFor(model.priceRule, buildParams(model.paramSpec, { ...paramValuesForMode(model.paramSpec, INPUT_MODE), ...params }, INPUT_MODE), INPUT_MODE, model.creditFactor);
    const spec = nightOptionFor({ pricingV2: paid?.pricingV2 === true, capabilities: model.capabilities, inputMode: INPUT_MODE, providers: paid?.nightProviders });
    let nightPrice: number | null = null;
    if (spec) {
      try {
        nightPrice = nightQuote(model.priceRule, nightParams(params), INPUT_MODE, spec.discount).credits;
      } catch {
        nightPrice = null;
      }
    }
    return { day, night: nightPrice };
  }, [model, paid?.pricingV2, paid?.nightProviders]);

  const nightOn = night && prices?.night != null;
  const each = nightOn ? prices!.night! : (prices?.day ?? null);
  const blocker = !photo.picked ? T.needProduct[locale] : texts.length === 0 ? T.needText[locale] : formats.length === 0 ? T.needFormat[locale] : null;
  const busy = phase.name === "uploading" || (phase.name === "sending" && phase.created < phase.total);

  async function submit() {
    if (blocker || busy || !photo.picked || each === null) return;
    setPhase({ name: "uploading" });
    try {
      const prepared = await providerPhoto(photo.picked.file);
      const extension = prepared.blob.type === "image/png" ? "png" : "jpg";
      const uploaded = await upload(new File([prepared.blob], `crea-proizvod.${extension}`, { type: prepared.blob.type }), "image", () => undefined);
      if (uploaded.url) URL.revokeObjectURL(uploaded.url);
      const image = [uploaded.storageId, ...(logo ? [logo] : [])];
      const total = jobs.length;
      let created = 0;
      setPhase({ name: "sending", total, created, night: nightOn });
      queue.enqueue(
        jobs.map((job) => {
          const params = seriesParams(job, seriesPrompt(job, brand, logo ? 2 : undefined));
          const args: CreateJobArgs = {
            modelSlug: SERIES_MODEL,
            params: JSON.stringify(nightOn ? nightParams(params) : params),
            inputMode: INPUT_MODE,
            inputs: JSON.stringify({ image }),
            ...(projectId ? { projectId } : {}),
            ...(nightOn ? { deliveryMode: "night" as const } : {}),
          };
          return {
            args,
            onCreated: () => {
              created += 1;
              setPhase({ name: "sending", total, created, night: nightOn });
            },
          };
        }),
      );
    } catch (error) {
      setPhase({ name: "error", message: studioErrorMessage(error instanceof Error ? error.message : String(error), locale) });
    }
  }

  return (
    <section
      aria-labelledby="crea-series-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <header className="flex flex-wrap items-start gap-3">
        <span className="paper-island grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
          <Layers aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="type-eyebrow-sm text-muted">{CREA_RECIPE_COPY.sectionTitle[locale]}</p>
          <h2 id="crea-series-title" className="type-h3 text-ink">
            {T.title[locale]}
          </h2>
          <p className="mt-1 type-body-sm font-semibold text-muted">{T.summary[locale]}</p>
        </div>
        <Link href={backHref} className={PILL}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          {CREA_RECIPE_COPY.allRecipes[locale]}
        </Link>
      </header>

      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <div>
          <p className="mb-2 type-body-sm font-black text-ink">{T.product[locale]}</p>
          <ImageInput locale={locale} input={photo} disabled={busy} />
        </div>
        <div>
          <label htmlFor={textsId} className="type-body-sm font-black text-ink">
            {T.texts[locale]}
          </label>
          <textarea
            id={textsId}
            value={raw}
            rows={4}
            maxLength={600}
            disabled={busy}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={T.textsPlaceholder[locale]}
            className="surface-inset mt-2 block w-full resize-y border-2 border-ink bg-paper px-3 py-2 text-base font-bold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        </div>
        <fieldset disabled={busy} className="min-w-0">
          <legend className="type-body-sm font-black text-ink">{T.formats[locale]}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SERIES_FORMATS.map((format) => {
              const on = formats.includes(format.id);
              return (
                <button
                  key={format.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFormats(on ? formats.filter((id) => id !== format.id) : [...formats, format.id])}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                    on ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper text-ink hover:border-ink",
                  )}
                >
                  {format.label[locale]}
                </button>
              );
            })}
          </div>
        </fieldset>

        {kit ? (
          <label htmlFor={brandId} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input id={brandId} type="checkbox" checked={useBrand} disabled={busy} onChange={(event) => setUseBrand(event.target.checked)} className="size-5 shrink-0 accent-ink" />
            <span className="type-body-sm font-black text-ink">{CREA_RECIPE_COPY.brandOn[locale]}</span>
            <span className="type-body-sm font-semibold text-muted">{kit.name}</span>
          </label>
        ) : null}

        <section className="surface-inset space-y-2 bg-paper p-4">
          <p className="inline-flex items-center gap-2 type-body font-black text-ink">
            <Coins aria-hidden="true" className="size-4" />
            {fillCopy(T.count[locale], { texts: texts.length, formats: formats.length, jobs: jobs.length })}
          </p>
          {each !== null && jobs.length > 0 ? (
            <p className="type-body-sm font-semibold text-muted">
              {fillCopy(T.total[locale], { price: formatCredits(each * jobs.length, locale), each: formatCredits(each, locale) })}
            </p>
          ) : null}
          {capped ? <p className="type-body-sm font-semibold text-muted">{fillCopy(T.capped[locale], { max: SERIES_MAX_JOBS })}</p> : null}
          {prices?.night != null && prices.day !== null ? (
            <div className="space-y-1 pt-1">
              <NightToggle locale={locale} on={night} onChange={setNight} savingsPercent={nightSavingsPercent(prices.day, prices.night)} disabled={busy} />
              {night ? (
                <p className="type-body-sm font-semibold text-muted">
                  {fillCopy(T.nightBody[locale], { each: formatCredits(prices.night, locale), day: formatCredits(prices.day, locale) })}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        {!canSave ? (
          <p className="type-body-sm font-semibold text-muted">{CREA_PAID_EDIT_COPY.noAccess[locale]}</p>
        ) : paid !== null && !available ? (
          <p className="type-body-sm font-semibold text-muted">{CREA_PAID_EDIT_COPY.unavailable[locale]}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void submit()}
            disabled={!canSave || !available || blocker !== null || each === null}
            loading={busy}
            icon={<Layers aria-hidden="true" className="size-4" />}
            className="shadow-[4px_4px_0_0_var(--ink)]"
          >
            {T.make[locale]}
            {each !== null && jobs.length > 0 ? <span className="font-mono">· {formatCredits(each * jobs.length, locale)}</span> : null}
          </Button>
          {blocker && phase.name === "idle" ? <p className="type-body-sm font-semibold text-muted">{blocker}</p> : null}
        </div>
        <div aria-live="polite">
          {phase.name === "uploading" ? <p className="type-body-sm font-bold text-ink">{T.uploading[locale]}</p> : null}
          {phase.name === "sending" ? (
            phase.created < phase.total ? (
              <p className="type-body-sm font-bold text-ink">{fillCopy(T.queued[locale], { done: phase.created, total: phase.total })}</p>
            ) : (
              <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
                <CircleCheck aria-hidden="true" className="size-4" />
                {fillCopy((phase.night ? T.sentNight : T.sent)[locale], { total: phase.total })}
              </p>
            )
          ) : null}
          {phase.name === "error" ? (
            <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
              {phase.message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
