/* eslint-disable @next/next/no-img-element -- skice su potpisani Convex URL-ovi (ili DEMO SVG), next/image ih ne obrađuje. */
"use client";

import { useMutation, useQuery } from "convex/react";
import { CircleCheck, Coins, Grid3x3, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { useJobQueue } from "@/components/crea/create/use-job-queue";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CREA_MAKE_TOOLS_COPY as T } from "@/lib/crea-create-copy";
import { fillCopy } from "@/lib/crea-copy";
import { buildDraftOrder, buildRefineOrder, DRAFT_REFINE_PAIRS, orderCredits, type DraftRefinePair } from "@/lib/crea-draft";
import { CREA_PROMPT_PARAM } from "@/lib/crea-shell";
import { imagesPerRun, SHEET_SIZES, sheetPlan, smallSketchParams, type SheetSize } from "@/lib/crea-variations";
import { studioErrorMessage } from "@/lib/studio-messages";
import { modelLabel, type StudioModel } from "@/lib/studio-models";
import { creditsFor, formatCredits, paramValuesForMode } from "@/lib/studio-params";

const PAIR_IDS = ["slika-skica", "slika-flux"] as const;
type PairId = (typeof PAIR_IDS)[number];
const ACTIVE = new Set(["reserved", "running", "queued"]);

type Picked = { jobId: Id<"generationJobs">; number: number };

/**
 * Probni list (Crea K13, S4 + S5): 4-16 malih skica jeftinim modelom u jednoj mreži,
 * za cenu jedne prave slike - izaberi najbolju, pa „Usavrši" premium modelom sa istim
 * opisom (izabrana skica ide kao referenca, ili isto seme kod FLUX.2). Skice idu kao
 * poslovi sa po 4 slike (`num_images`, svi izlazi se čuvaju od K13) kroz red, jer
 * javni korisnik ima najviše 2 posla u toku.
 */
export default function DraftSheetTool({ tool, locale, canSave, projectId, paid }: CreaToolProps) {
  const searchParams = useSearchParams();
  const createJob = useMutation(api.studio.createJob);
  const adoptOutputAsInput = useMutation(api.creaVersions.adoptOutputAsInput);
  const promptId = useId();
  const [prompt, setPrompt] = useState(() => searchParams.get(CREA_PROMPT_PARAM) ?? "");
  const [pairId, setPairId] = useState<PairId>(() => {
    const fromModel = DRAFT_REFINE_PAIRS.find((pair) => pair.refine.modelSlug === searchParams.get("model"))?.id;
    return PAIR_IDS.find((id) => id === fromModel) ?? "slika-skica";
  });
  const [size, setSize] = useState<SheetSize>(16);
  const [sheetIds, setSheetIds] = useState<Id<"generationJobs">[]>([]);
  const [total, setTotal] = useState(0);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refineState, setRefineState] = useState<"idle" | "busy" | "sent">("idle");
  const queue = useJobQueue((message) => setError(studioErrorMessage(message, locale)));

  const usable = (model: StudioModel | undefined) => {
    if (!model || !paid) return null;
    const keyMissing = paid.providerStatus?.[model.provider] === false;
    if (keyMissing && paid.publicEnabled && !paid.isStaff) return null;
    return { model, demo: keyMissing };
  };
  const pair = DRAFT_REFINE_PAIRS.find((entry) => entry.id === pairId) as DraftRefinePair;
  const draft = usable(paid?.catalog.find((model) => model.slug === pair.draft.modelSlug));
  const refine = usable(paid?.catalog.find((model) => model.slug === pair.refine.modelSlug));

  const plan = useMemo(() => {
    if (!draft || !refine) return null;
    const refineMode = pair.refine.inputMode ?? "text";
    const current = { ...paramValuesForMode(refine.model.paramSpec, refineMode), prompt: prompt.trim() || "x" };
    const built = buildDraftOrder(pair, { params: current, inputMode: "text", model: refine.model }, draft.model);
    const order = { ...built, params: smallSketchParams(built.params) };
    const jobs = sheetPlan(size, imagesPerRun(draft.model, order.inputMode));
    const prices = jobs.map((count) =>
      creditsFor(draft.model.priceRule, { ...order.params, num_images: count }, order.inputMode, draft.model.creditFactor),
    );
    const sheetCredits = prices.some((price) => price === null) ? null : prices.reduce<number>((sum, price) => sum + (price ?? 0), 0);
    const refineOrder = buildRefineOrder({ modelSlug: draft.model.slug, params: order.params, inputMode: order.inputMode }, pair, refine.model);
    return { order, jobs, sheetCredits, refineOrder, refineCredits: orderCredits(refine.model, refineOrder, pair.reference ? 1 : 0) };
  }, [draft, refine, pair, prompt, size]);

  const sheet = useQuery(api.creaVariations.getSheet, sheetIds.length > 0 ? { jobIds: sheetIds } : "skip");
  const images = (sheet ?? []).flatMap((entry) => entry.images.map((image) => ({ ...image, mock: entry.isMock })));
  const working = queue.waiting > 0 || (sheet ?? []).some((entry) => ACTIVE.has(entry.status)) || (sheetIds.length > 0 && sheet === undefined);
  const failed = (sheet ?? []).filter((entry) => entry.status === "failed" || entry.status === "refunded").length;

  function start() {
    if (!plan || !draft || prompt.trim().length === 0) return;
    setError(null);
    setPicked(null);
    setRefineState("idle");
    setSheetIds([]);
    setTotal(size);
    const params = { ...plan.order.params, prompt: prompt.trim() };
    queue.enqueue(
      plan.jobs.map((count) => ({
        args: {
          modelSlug: draft.model.slug,
          params: JSON.stringify({ ...params, num_images: count }),
          inputMode: plan.order.inputMode,
          ...(projectId ? { projectId } : {}),
        },
        onCreated: (jobId: Id<"generationJobs">) => setSheetIds((ids) => [...ids, jobId]),
      })),
    );
  }

  async function refineChosen() {
    if (!picked || !plan || !refine || !draft) return;
    setRefineState("busy");
    setError(null);
    try {
      const chosen = buildRefineOrder(
        { modelSlug: draft.model.slug, params: { ...plan.order.params, prompt: prompt.trim() }, inputMode: plan.order.inputMode },
        pair,
        refine.model,
      );
      let inputs: Record<string, string[]> = {};
      if (chosen.inputs === "reference") {
        const adopted = await adoptOutputAsInput({ jobId: picked.jobId });
        inputs = { [adopted.slot]: [adopted.storageId] };
      }
      const result = await createJob({
        modelSlug: chosen.modelSlug,
        params: JSON.stringify(chosen.params),
        inputMode: chosen.inputMode,
        ...(Object.keys(inputs).length > 0 ? { inputs: JSON.stringify(inputs) } : {}),
        parentJobId: picked.jobId,
        derivation: chosen.derivation,
        ...(projectId ? { projectId } : {}),
      });
      if (result && typeof result === "object" && "moderationBlocked" in result) {
        setError(studioErrorMessage(`NEISPRAVAN_PROMPT:${result.moderationBlocked.reason}`, locale));
        setRefineState("idle");
        return;
      }
      setRefineState("sent");
    } catch (thrown) {
      setError(studioErrorMessage(thrown instanceof Error ? thrown.message : String(thrown), locale));
      setRefineState("idle");
    }
  }

  const header = <ToolHeader tool={tool} locale={locale} icon={<Grid3x3 aria-hidden="true" className="size-5" />} />;
  const frame = "surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6";
  if (!canSave) {
    return (
      <section aria-labelledby="crea-tool-title" className={frame}>
        {header}
        <p className="mt-5 border-t border-line pt-5 type-body-sm font-semibold text-muted">{T.noAccess[locale]}</p>
      </section>
    );
  }

  const busy = working;
  const cells = Math.max(total, images.length);

  return (
    <section aria-labelledby="crea-tool-title" className={frame}>
      {header}
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <div>
          <label htmlFor={promptId} className="type-body-sm font-black text-ink">
            {T.prompt[locale]}
          </label>
          <textarea
            id={promptId}
            value={prompt}
            rows={3}
            maxLength={2000}
            disabled={busy}
            onChange={(event) => setPrompt(event.target.value)}
            className="surface-inset mt-2 block w-full resize-y border-2 border-ink bg-paper px-3 py-2 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
          />
        </div>
        <ChoiceChips<PairId>
          legend={T.sheetPair[locale]}
          name="crea-sheet-pair"
          options={PAIR_IDS.map((id) => ({ id, label: T.pairs[id][locale] }))}
          value={pairId}
          onChange={(id) => {
            setPairId(id);
            setPicked(null);
          }}
          disabled={busy}
        />
        <ChoiceChips<SheetSize>
          legend={T.sheetSize[locale]}
          name="crea-sheet-size"
          options={SHEET_SIZES.map((id) => ({ id, label: String(id) }))}
          value={size}
          onChange={setSize}
          disabled={busy}
        />

        {!draft || !refine || !plan ? (
          paid !== null ? <p className="type-body-sm font-semibold text-muted">{T.unavailable[locale]}</p> : null
        ) : (
          <div className="space-y-3">
            {plan.sheetCredits !== null ? (
              <p className="inline-flex flex-wrap items-center gap-1.5 type-body-sm font-black text-ink">
                <Coins aria-hidden="true" className="size-4" />
                {fillCopy(T.sheetPrice[locale], {
                  n: size,
                  jobs: plan.jobs.length,
                  credits: formatCredits(plan.sheetCredits, locale),
                  refine: plan.refineCredits !== null ? formatCredits(plan.refineCredits, locale) : "—",
                })}
              </p>
            ) : null}
            <Button
              onClick={start}
              disabled={busy || prompt.trim().length === 0 || plan.sheetCredits === null}
              loading={busy}
              icon={<Grid3x3 aria-hidden="true" className="size-4" />}
              className="shadow-[4px_4px_0_0_var(--ink)]"
            >
              {fillCopy(T.sheetRun[locale], { n: size })}
              {plan.sheetCredits !== null ? <span className="font-mono">· {formatCredits(plan.sheetCredits, locale)}</span> : null}
            </Button>
            {prompt.trim().length === 0 ? <p className="type-body-sm font-semibold text-muted">{T.sheetNeedPrompt[locale]}</p> : null}
            {draft.demo || refine.demo ? <p className="type-body-sm font-semibold text-muted">{T.demo[locale]}</p> : null}
          </div>
        )}
      </div>

      {cells > 0 ? (
        <div className="mt-5 space-y-4 border-t border-line pt-5">
          <p aria-live="polite" className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
            {working ? <Spinner size="xs" /> : null}
            {fillCopy(T.sheetProgress[locale], { done: images.length, total: Math.max(total, images.length) })}
            {queue.waiting > 0 ? <span className="font-bold text-muted">· {T.waiting[locale]}</span> : null}
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: cells }, (_, index) => {
              const image = images[index];
              if (!image) {
                return (
                  <li key={`prazno-${index}`} className="surface-media grid aspect-square place-items-center bg-paper">
                    {working ? <Spinner size="xs" className="text-muted" /> : null}
                  </li>
                );
              }
              const active = picked?.jobId === image.jobId;
              return (
                <li key={image.jobId}>
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={fillCopy(T.sheetSketch[locale], { n: index + 1 })}
                    onClick={() => setPicked({ jobId: image.jobId, number: index + 1 })}
                    className={cn(
                      "surface-inset relative block w-full overflow-hidden border-2 p-1 transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                      active ? "border-ink bg-yellow shadow-[3px_3px_0_0_var(--shadow-hard)]" : "border-transparent bg-paper hover:border-ink",
                    )}
                  >
                    <img src={image.url} alt="" className="surface-media aspect-square w-full bg-paper-strong object-cover" />
                    {active ? (
                      <CircleCheck aria-hidden="true" className="absolute right-2 top-2 size-6 rounded-full bg-yellow text-ink" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {failed > 0 ? <p className="type-body-sm font-bold text-muted">{T.failed[locale]}</p> : null}

          <div aria-live="polite" className="space-y-3">
            {picked && plan && refine ? (
              <>
                <p className="type-body-sm font-black text-ink">{fillCopy(T.sheetPicked[locale], { n: picked.number })}</p>
                <Button
                  onClick={() => void refineChosen()}
                  loading={refineState === "busy"}
                  disabled={refineState !== "idle"}
                  icon={<Sparkles aria-hidden="true" className="size-4" />}
                  className="shadow-[4px_4px_0_0_var(--ink)]"
                >
                  {fillCopy(T.sheetRefine[locale], { model: modelLabel(refine.model, locale) })}
                  {plan.refineCredits !== null ? <span className="font-mono">· {formatCredits(plan.refineCredits, locale)}</span> : null}
                </Button>
              </>
            ) : images.length > 0 ? (
              <p className="type-body-sm font-semibold text-muted">{T.sheetPick[locale]}</p>
            ) : null}
            {refineState === "sent" ? (
              <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
                <CircleCheck aria-hidden="true" className="size-4" />
                {T.sheetRefined[locale]}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 type-body-sm font-black text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </section>
  );
}
