/* eslint-disable @next/next/no-img-element -- izlaz posla je potpisan Convex URL (ili DEMO SVG), next/image ga ne obrađuje. */
"use client";

import { useMutation, useQuery } from "convex/react";
import { Coins, Radio, Square } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { SketchCanvas, SKETCH_SIZE, type SketchCanvasHandle } from "@/components/crea/create/sketch-canvas";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useSlotUpload } from "@/components/studio/use-slot-upload";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CREA_MAKE_TOOLS_COPY as T } from "@/lib/crea-create-copy";
import { fillCopy } from "@/lib/crea-copy";
import { LIVE_DRAW_DEFAULTS, liveDrawDecision, liveDrawMaxCredits } from "@/lib/crea-live-draw";
import { LIVE_ROUTES, referenceRouteParams, SKETCH_ROUTES, type CreaPaidRoute } from "@/lib/crea-paid-edit";
import { sketchToImagePrompt } from "@/lib/crea-prompt-compose";
import { studioErrorMessage } from "@/lib/studio-messages";
import { buildParams, creditsFor, formatCredits, paramValuesForMode } from "@/lib/studio-params";

const WAIT_CODES = ["PREVISE_POSLOVA", "MINUTNI_LIMIT"];
const ACTIVE = new Set(["reserved", "running", "queued"]);

/**
 * Crtaj i gledaj (Crea K13, S9): dok korisnik crta, skica se povremeno šalje brzom
 * jeftinom modelu i slika se osvežava pored platna. Svako osvežavanje je pravi
 * posao kroz `studio.createJob` (ista cena, limiti, DEMO bez ključa). Pravila
 * slanja su u `lib/crea-live-draw.ts`: tek kad ruka miruje, najviše jednom u 5 s,
 * nikad dok prethodno traje, najviše 10 po sesiji - i cena toga piše PRE uključivanja.
 */
export default function LiveDrawTool({ tool, locale, canSave, projectId, paid }: CreaToolProps) {
  const createJob = useMutation(api.studio.createJob);
  const upload = useSlotUpload();
  const canvas = useRef<SketchCanvasHandle | null>(null);
  const textId = useId();
  const [text, setText] = useState("");
  const [live, setLive] = useState(false);
  const [revision, setRevision] = useState(0);
  const [lastChangeAt, setLastChangeAt] = useState(0);
  const [sentRevision, setSentRevision] = useState(-1);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sentIds, setSentIds] = useState<Id<"generationJobs">[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [routeSlug, setRouteSlug] = useState<string | null>(null);

  // Ista odluka o dostupnosti kao `PaidEditPanel`: javni korisnik ne dobija model bez ključa.
  const available = useMemo(() => {
    if (!paid) return [];
    return LIVE_ROUTES.flatMap((route) => {
      const model = paid.catalog.find((entry) => entry.slug === route.modelSlug);
      if (!model || !model.inputModes.includes(route.inputMode)) return [];
      const keyMissing = paid.providerStatus?.[model.provider] === false;
      if (keyMissing && paid.publicEnabled && !paid.isStaff) return [];
      return [{ route, model, demo: keyMissing }];
    });
  }, [paid]);
  const picked = available.find((entry) => entry.route.modelSlug === routeSlug) ?? available[0] ?? null;

  function priceOf(entry: { route: CreaPaidRoute; model: (typeof available)[number]["model"] }): number | null {
    const params = buildParams(
      entry.model.paramSpec,
      { ...paramValuesForMode(entry.model.paramSpec, entry.route.inputMode), ...referenceRouteParams(entry.route, "x", SKETCH_SIZE, SKETCH_SIZE) },
      entry.route.inputMode,
      { input_images: 1 },
    );
    return creditsFor(entry.model.priceRule, params, entry.route.inputMode, entry.model.creditFactor);
  }
  const perRefresh = picked ? priceOf(picked) : null;
  const maxCredits = liveDrawMaxCredits(perRefresh);

  const sheet = useQuery(api.creaVariations.getSheet, sentIds.length > 0 ? { jobIds: sentIds } : "skip");
  const lastId = sentIds.at(-1) ?? null;
  const lastJob = lastId ? sheet?.find((entry) => entry.jobId === lastId) : undefined;
  const inFlight = sending || (lastId !== null && (lastJob === undefined || ACTIVE.has(lastJob.status)));
  const latest = [...sentIds].reverse().map((id) => sheet?.find((entry) => entry.jobId === id)).find((entry) => entry && entry.images.length > 0);
  const lastFailed = lastJob && (lastJob.status === "failed" || lastJob.status === "refunded");

  async function send() {
    if (!picked || !canvas.current) return;
    const sendingRevision = revision;
    setSending(true);
    setSentRevision(sendingRevision);
    setLastSentAt(Date.now());
    try {
      const blob = await canvas.current.toBlob();
      const uploaded = await upload(new File([blob], "crea-crtez.png", { type: "image/png" }), "image", () => undefined);
      if (uploaded.url) URL.revokeObjectURL(uploaded.url);
      if (!uploaded.storageId) throw new Error("UPLOAD_BEZ_ID");
      const prompt = sketchToImagePrompt({ source: "platno", text }, locale);
      const result = await createJob({
        modelSlug: picked.route.modelSlug,
        params: JSON.stringify(referenceRouteParams(picked.route, prompt, SKETCH_SIZE, SKETCH_SIZE)),
        inputMode: picked.route.inputMode,
        inputs: JSON.stringify({ image: [uploaded.storageId] }),
        ...(projectId ? { projectId } : {}),
      });
      if (typeof result === "string") setSentIds((ids) => [...ids, result]);
      else if (result && typeof result === "object" && "moderationBlocked" in result) {
        setLive(false);
        setError(studioErrorMessage(`NEISPRAVAN_PROMPT:${result.moderationBlocked.reason}`, locale));
      }
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      // Puna mesta nisu greška: crtež ostaje „nepromenjen od slanja" tek kad stvarno ode.
      if (WAIT_CODES.some((code) => message.includes(code))) setSentRevision(-1);
      else {
        setLive(false);
        setError(studioErrorMessage(message, locale));
      }
    } finally {
      setSending(false);
    }
  }

  // Petlja: odluka je čista funkcija; izvršava se u tajmeru (nikad sinhrono u efektu).
  useEffect(() => {
    if (!live) return;
    const decision = liveDrawDecision(
      { revision, sentRevision, lastChangeAt, lastSentAt, inFlight, sent: sentIds.length },
      Date.now(),
    );
    if (decision.action === "idle") return;
    const timer = setTimeout(
      () => (decision.action === "send" ? void send() : setTick((value) => value + 1)),
      decision.action === "wait" ? decision.ms : 0,
    );
    return () => clearTimeout(timer);
    // `send` čita trenutno stanje iz istog rendera; zavisnosti su sve vrednosti odluke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, revision, sentRevision, lastChangeAt, lastSentAt, inFlight, sentIds.length, tick]);

  const limitReached = sentIds.length >= LIVE_DRAW_DEFAULTS.limit;

  if (!canSave) {
    return (
      <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
        <ToolHeader tool={tool} locale={locale} icon={<Radio aria-hidden="true" className="size-5" />} />
        <p className="mt-5 border-t border-line pt-5 type-body-sm font-semibold text-muted">{T.noAccess[locale]}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Radio aria-hidden="true" className="size-5" />} />
      <div className="mt-5 grid gap-5 border-t border-line pt-5 lg:grid-cols-2">
        <SketchCanvas
          ref={canvas}
          locale={locale}
          onChange={(next) => {
            setRevision(next);
            setLastChangeAt(Date.now());
          }}
        />
        <div className="space-y-4">
          <div>
            <label htmlFor={textId} className="type-body-sm font-black text-ink">
              {T.liveDescribe[locale]}
            </label>
            <input
              id={textId}
              value={text}
              maxLength={300}
              onChange={(event) => setText(event.target.value)}
              placeholder={T.liveDescribePlaceholder[locale]}
              className="surface-inset mt-2 block min-h-11 w-full border-2 border-ink bg-paper px-3 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />
          </div>

          {paid !== null && available.length === 0 ? (
            <p className="type-body-sm font-semibold text-muted">{T.unavailable[locale]}</p>
          ) : (
            <>
              {available.length > 1 ? (
                <ChoiceChips
                  legend={T.liveModel[locale]}
                  name="crea-live-route"
                  options={available.map((entry) => {
                    const price = priceOf(entry);
                    return { id: entry.route.modelSlug, label: entry.route.label?.[locale] ?? entry.route.modelSlug, ...(price !== null ? { hint: formatCredits(price, locale) } : {}) };
                  })}
                  value={picked?.route.modelSlug ?? ""}
                  onChange={setRouteSlug}
                  disabled={live}
                />
              ) : null}
              {perRefresh !== null && maxCredits !== null ? (
                <p className="inline-flex flex-wrap items-center gap-1.5 type-body-sm font-black text-ink">
                  <Coins aria-hidden="true" className="size-4" />
                  {fillCopy(T.livePrice[locale], {
                    credits: formatCredits(perRefresh, locale),
                    limit: LIVE_DRAW_DEFAULTS.limit,
                    max: formatCredits(maxCredits, locale),
                  })}
                </p>
              ) : null}
              <p className="type-body-sm font-semibold text-muted">
                {fillCopy(T.liveRule[locale], { s: Math.round(LIVE_DRAW_DEFAULTS.minIntervalMs / 1000) })}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!picked || perRefresh === null || (limitReached && !live)}
                  aria-pressed={live}
                  onClick={() => {
                    setError(null);
                    setLive((on) => !on);
                  }}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink px-4 text-sm font-black transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 motion-reduce:transition-none",
                    live ? "bg-yellow text-ink shadow-[3px_3px_0_0_var(--ink)]" : "bg-ink text-paper-strong shadow-[3px_3px_0_0_var(--yellow)]",
                  )}
                >
                  {live ? <Square aria-hidden="true" className="size-4" /> : <Radio aria-hidden="true" className="size-4" />}
                  {live ? T.liveOff[locale] : T.liveOn[locale]}
                </button>
                <span className="font-mono text-xs font-black tabular-nums text-muted">
                  {fillCopy(T.liveCount[locale], { n: sentIds.length, limit: LIVE_DRAW_DEFAULTS.limit })}
                </span>
              </div>
              {picked?.demo ? <p className="type-body-sm font-semibold text-muted">{T.demo[locale]}</p> : null}
            </>
          )}

          <div aria-live="polite" className="space-y-2">
            {limitReached ? <p className="type-body-sm font-black text-ink">{T.liveLimit[locale]}</p> : null}
            {error ? (
              <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
                {error}
              </p>
            ) : null}
            {lastFailed ? <p className="type-body-sm font-bold text-muted">{T.failed[locale]}</p> : null}
          </div>

          <figure className="surface-inset bg-paper p-3">
            <figcaption className="flex items-center gap-2 type-body-sm font-black text-ink">
              {T.liveResult[locale]}
              {inFlight ? (
                <span className="inline-flex items-center gap-1.5 font-bold text-muted">
                  <Spinner size="xs" />
                  {T.liveWorking[locale]}
                </span>
              ) : null}
            </figcaption>
            {latest ? (
              <img src={latest.images[0]!.url} alt="" className="surface-media mt-2 aspect-square w-full bg-paper-strong object-contain" />
            ) : (
              <p className="mt-2 grid aspect-square place-items-center type-body-sm font-semibold text-muted">{T.liveWaiting[locale]}</p>
            )}
          </figure>
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <h3 className="type-body font-black text-ink">{T.liveRefine[locale]}</h3>
        <div className="mt-3">
          <PaidEditPanel
            locale={locale}
            routes={SKETCH_ROUTES}
            purpose="edit"
            ready={revision > 0}
            notReadyReason={T.sketchNeed[locale]}
            prepare={async () => ({ files: { image: [await canvas.current!.toBlob()] }, width: SKETCH_SIZE, height: SKETCH_SIZE })}
            request={(route, _text, size) =>
              referenceRouteParams(route, sketchToImagePrompt({ source: "platno", text }, locale), size.width, size.height)
            }
            measured={() => ({ input_images: 1 })}
            textField={null}
            label={T.sketchCta[locale]}
            parentJobId={null}
            projectId={projectId}
            canSubmit={canSave}
            paid={paid}
          />
        </div>
      </div>
    </section>
  );
}
