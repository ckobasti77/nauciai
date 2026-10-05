"use client";

import { useAction, useQuery } from "convex/react";
import { GraduationCap, Pencil, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useJobQueue } from "@/components/crea/create/use-job-queue";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { paidModel, PaidSubmit, type SendStatus } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { TimelineStage, type StageFile } from "@/components/crea/video/timeline-stage";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EXPLAINER_LIMITS, type ExplainerPlan } from "@/convex/creaLlmVideoCore";
import { TEXT_MAX_LENGTH } from "@/convex/providers/modelControls";
import { fillCopy } from "@/lib/crea-copy";
import {
  estimateNarrationSeconds,
  EXPLAINER_LENGTHS,
  EXPLAINER_MODELS,
  EXPLAINER_STYLES,
  explainerCost,
  explainerJobs,
  explainerTimeline,
  narrationText,
  type ExplainerLength,
  type ExplainerStyleId,
} from "@/lib/crea-explainer";
import { CAPTION_STYLE_LABELS, CAPTION_STYLES, type CaptionScript, type CaptionStyle } from "@/lib/crea-subtitles";
import { demoSpeechWav } from "@/lib/crea-talking";
import type { CreaTimelineV1 } from "@/lib/crea-timeline";
import { CREA_FLOWS_COPY as T } from "@/lib/crea-video-flows-copy";
import { studioErrorMessage } from "@/lib/studio-messages";
import { formatCredits } from "@/lib/studio-params";

const FIELD =
  "surface-inset mt-2 block w-full border-2 border-ink bg-paper px-3 py-2 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60";
const SMALL_FIELD =
  "surface-inset mt-1 block w-full border border-line bg-paper-strong px-3 py-2 type-body-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60";

type Aspect = "16:9" | "9:16";
type Run = {
  plan: ExplainerPlan;
  styleId: ExplainerStyleId;
  aspect: Aspect;
  voiceJob: Id<"generationJobs"> | null;
  imageJobs: Array<Id<"generationJobs"> | null>;
};
type Assembled = { forRun: Run; timeline: CreaTimelineV1; files: StageFile[]; demoVoice: boolean };

/**
 * Objašnjavajući video (Crea K21, V28; plan K17 §6.4): lekcija ili tekst →
 * scene (besplatan plan, LLM) → slika po sceni u izabranom stilu (Nano Banana 2
 * Lite) + jedan srpski glas za celu naraciju (`tts`) → montaža na uređaju: Ken
 * Burns dok narator govori o slici, titlovi iz naracije, „list sveske" → MP4
 * (0 kr). Cena unapred i po minutu. Bez ključa za glas: probni DEMO zvuk.
 */
export default function ExplainerTool({ tool, locale, caps, canSave, projectId, paid }: CreaToolProps) {
  const planExplainer = useAction(api.creaLlm.planExplainer);
  const [text, setText] = useState("");
  const [styleId, setStyleId] = useState<ExplainerStyleId>("tabla");
  const [length, setLength] = useState<ExplainerLength>(60);
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [plan, setPlan] = useState<(ExplainerPlan & { demo: boolean }) | null>(null);
  const [planStatus, setPlanStatus] = useState<SendStatus>({ name: "idle" });
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("zuta-traka");
  const [script, setScript] = useState<CaptionScript>("lat");
  const [titleCard, setTitleCard] = useState(true);
  const [assembled, setAssembled] = useState<Assembled | null>(null);
  const [edited, setEdited] = useState<{ base: CreaTimelineV1; next: CreaTimelineV1 } | null>(null);

  const ttsChoice = paidModel(paid, EXPLAINER_MODELS.voice.slug, EXPLAINER_MODELS.voice.inputMode);
  const imageChoice = paidModel(paid, EXPLAINER_MODELS.image.slug, EXPLAINER_MODELS.image.inputMode);
  const voiceControl = ttsChoice?.model.paramSpec.find((control) => control.key === "voice");
  const voiceOptions = voiceControl?.type === "select" ? (voiceControl.options ?? []) : [];
  const [voice, setVoice] = useState("Aria");

  const onQueueError = useCallback((message: string) => setError(studioErrorMessage(message, locale)), [locale]);
  const { enqueue, waiting } = useJobQueue(onQueueError);

  const cost = plan && paid ? explainerCost(plan, { styleId, aspect, voice }, paid.catalog) : null;
  const narrationChars = plan ? narrationText(plan).length : 0;

  async function makePlan() {
    setPlanStatus({ name: "working" });
    setError(null);
    try {
      const reply = await planExplainer({ text, seconds: length, styleId, locale });
      if (!reply.ok) {
        setPlanStatus({ name: "error", message: T.llmErrors[reply.reason][locale] });
        return;
      }
      setPlan({ title: reply.title, scenes: reply.scenes, demo: reply.demo });
      setRun(null);
      setAssembled(null);
      setPlanStatus({ name: "idle" });
    } catch (caught) {
      setPlanStatus({ name: "error", message: studioErrorMessage(caught instanceof Error ? caught.message : String(caught), locale) });
    }
  }

  function make() {
    if (!plan) return;
    setError(null);
    setAssembled(null);
    const frozen: Run = { plan: { title: plan.title, scenes: plan.scenes }, styleId, aspect, voiceJob: null, imageJobs: plan.scenes.map(() => null) };
    setRun(frozen);
    const jobs = explainerJobs(frozen.plan, { styleId, aspect, voice });
    const args = (job: (typeof jobs.images)[number]) => ({
      modelSlug: job.modelSlug,
      params: JSON.stringify(job.params),
      inputMode: job.inputMode,
      inputs: JSON.stringify({}),
      ...(projectId ? { projectId } : {}),
    });
    enqueue([
      { args: args(jobs.voice), onCreated: (jobId) => setRun((current) => (current === null ? current : { ...current, voiceJob: jobId })) },
      ...jobs.images.map((job, index) => ({
        args: args(job),
        onCreated: (jobId: Id<"generationJobs">) =>
          setRun((current) => (current === null ? current : { ...current, imageJobs: current.imageJobs.map((id, other) => (other === index ? jobId : id)) })),
      })),
    ]);
  }

  const ids = run ? ([run.voiceJob, ...run.imageJobs].filter(Boolean) as Id<"generationJobs">[]) : [];
  const states = useQuery(api.creaMontages.jobStates, ids.length > 0 ? { jobIds: ids } : "skip");
  const stateOf = (id: Id<"generationJobs"> | null) => (id && states ? states[id] : undefined);
  const imagesDone = run ? run.imageJobs.filter((id) => stateOf(id)?.status === "done").length : 0;
  const failed = run ? [run.voiceJob, ...run.imageJobs].some((id) => ["failed", "refunded"].includes(stateOf(id)?.status ?? "")) : false;
  const allDone = run !== null && run.voiceJob !== null && stateOf(run.voiceJob)?.status === "done" && imagesDone === run.imageJobs.length;
  const making = run !== null && !allDone && !failed && !error;

  // Sve je stiglo: glas (pravi ili DEMO probni) + slike → montaža. Jednom po pokretanju.
  const assembling = useRef<Run | null>(null);
  useEffect(() => {
    if (!run || !allDone || !states || assembling.current === run) return;
    assembling.current = run;
    void (async () => {
      const voiceState = states[run.voiceJob!]!;
      let voiceRef: { ref: { jobId: string } | { localFileId: string }; durationS: number };
      const files: StageFile[] = [];
      let demoVoice = false;
      if (voiceState.isMock || !voiceState.outputUrl) {
        // DEMO govor je plakat, ne zvuk (O3): probni zvuk procenjene dužine, jasno označen.
        const seconds = estimateNarrationSeconds(run.plan);
        const id = `demo-glas-${run.voiceJob}`;
        files.push({ id, blob: new Blob([demoSpeechWav(seconds) as BlobPart], { type: "audio/wav" }), name: "crea-demo-glas.wav", kind: "audio" });
        voiceRef = { ref: { localFileId: id }, durationS: seconds };
        demoVoice = true;
      } else {
        const { probeMedia } = await import("@/components/crea/video/engine/media");
        const probed = await probeMedia("audio", voiceState.outputUrl);
        voiceRef = { ref: { jobId: run.voiceJob! }, durationS: probed?.durationS ?? estimateNarrationSeconds(run.plan) };
      }
      const timeline = explainerTimeline({
        plan: run.plan,
        images: run.imageJobs.map((id) => ({ jobId: id! })),
        voice: voiceRef,
        aspect: run.aspect,
        captions: null,
        title: false,
      });
      setAssembled({ forRun: run, timeline, files, demoVoice });
    })();
  }, [run, allDone, states]);

  // Titlovi, pismo i naslov se menjaju i posle sklapanja (bez novih poslova).
  const base = useMemo(() => {
    if (!assembled) return null;
    const voiceClip = assembled.timeline.audio[0];
    return explainerTimeline({
      plan: assembled.forRun.plan,
      images: assembled.forRun.imageJobs.map((id) => ({ jobId: id! })),
      voice: { ref: voiceClip!.src, durationS: voiceClip!.out - voiceClip!.in },
      aspect: assembled.forRun.aspect,
      captions: captionsOn ? { style: captionStyle, script } : null,
      title: titleCard,
    });
  }, [assembled, captionsOn, captionStyle, script, titleCard]);
  const timeline = edited && base && edited.base === base ? edited.next : base;

  const editScene = (index: number, patch: Partial<ExplainerPlan["scenes"][number]>) =>
    setPlan((current) => (current ? { ...current, scenes: current.scenes.map((scene, other) => (other === index ? { ...scene, ...patch } : scene)) } : current));

  const blocker = !canSave
    ? T.noAccess[locale]
    : !ttsChoice || !imageChoice
      ? T.sttUnavailable[locale]
      : narrationChars > TEXT_MAX_LENGTH
        ? T.expTooLong[locale]
        : making || waiting > 0
          ? T.working[locale]
          : null;

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<GraduationCap aria-hidden="true" className="size-5" />} />

      <fieldset disabled={making} className="mt-5 min-w-0 space-y-5 border-t border-line pt-5">
        <label className="block">
          <span className="type-body font-black text-ink">{T.expText[locale]}</span>
          <textarea value={text} rows={6} maxLength={EXPLAINER_LIMITS.textChars} onChange={(event) => setText(event.target.value)} placeholder={T.expTextPlaceholder[locale]} className={`${FIELD} resize-y`} />
          <span className="mt-1 block font-mono text-xs font-bold text-muted">
            {text.length}/{EXPLAINER_LIMITS.textChars}
          </span>
        </label>
        <ChoiceChips<ExplainerStyleId>
          legend={T.expStyle[locale]}
          name="crea-obj-stil"
          options={EXPLAINER_STYLES.map((style) => ({ id: style.id, label: style.label[locale], hint: style.hint[locale] }))}
          value={styleId}
          onChange={setStyleId}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceChips<ExplainerLength> legend={T.expLength[locale]} name="crea-obj-duzina" options={EXPLAINER_LENGTHS.map((id) => ({ id, label: fillCopy(T.seconds[locale], { s: id }) }))} value={length} onChange={setLength} />
          <ChoiceChips<Aspect> legend={T.aspectLegend[locale]} name="crea-obj-oblik" options={(["16:9", "9:16"] as const).map((id) => ({ id, label: T.aspects[id][locale] }))} value={aspect} onChange={setAspect} />
        </div>
        <div className="space-y-2">
          <Button onClick={() => void makePlan()} loading={planStatus.name === "working"} disabled={!canSave || text.trim().length === 0} icon={<Pencil aria-hidden="true" className="size-4" />}>
            {planStatus.name === "working" ? T.expPlanning[locale] : T.expPlan[locale]}
          </Button>
          {planStatus.name === "error" ? (
            <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
              {planStatus.message}
            </p>
          ) : null}
        </div>
      </fieldset>

      {plan ? (
        <div className="mt-5 space-y-5 border-t border-line pt-5">
          <h3 className="type-h4 text-ink">{plan.title}</h3>
          {plan.demo ? <p className="type-body-sm font-semibold text-muted">{T.demoPlan[locale]}</p> : null}
          <ol className="divide-y divide-line">
            {plan.scenes.map((scene, index) => (
              <li key={index} className="grid gap-3 py-4 first:pt-0 md:grid-cols-2">
                <label className="block">
                  <span className="type-body-sm font-black text-ink">
                    {fillCopy(T.expScene[locale], { n: index + 1 })} · {T.expNarration[locale]}
                  </span>
                  <textarea value={scene.narration} rows={3} maxLength={EXPLAINER_LIMITS.narrationChars} disabled={making} onChange={(event) => editScene(index, { narration: event.target.value })} className={`${SMALL_FIELD} resize-y`} />
                </label>
                <label className="block">
                  <span className="type-body-sm font-black text-ink">{T.expVisual[locale]}</span>
                  <textarea value={scene.visual} rows={3} maxLength={EXPLAINER_LIMITS.visualChars} disabled={making} onChange={(event) => editScene(index, { visual: event.target.value })} className={`${SMALL_FIELD} resize-y`} />
                </label>
              </li>
            ))}
          </ol>

          {voiceOptions.length > 0 ? (
            <label className="block max-w-xs">
              <span className="type-body-sm font-black text-ink">{T.voiceLegend[locale]}</span>
              <select value={voice} disabled={making} onChange={(event) => setVoice(event.target.value)} className={`${FIELD} min-h-11`}>
                {voiceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {cost && cost.total !== null ? (
            <div>
              <p className="type-body font-black text-ink">
                {fillCopy(T.expCost[locale], { img: formatCredits(cost.images!, locale), voice: formatCredits(cost.voice!, locale), total: formatCredits(cost.total, locale) })}
              </p>
              {cost.perMinute !== null ? (
                <p className="type-body-sm font-semibold text-muted">{fillCopy(T.expPerMinute[locale], { kr: formatCredits(cost.perMinute, locale), s: cost.seconds })}</p>
              ) : null}
            </div>
          ) : null}

          {run === null || failed || error ? (
            <PaidSubmit
              locale={locale}
              label={T.expMake[locale]}
              icon={<GraduationCap aria-hidden="true" className="size-4" />}
              credits={cost?.total ?? null}
              blocker={blocker}
              status={{ name: "idle" }}
              demo={(ttsChoice?.demo ?? false) || (imageChoice?.demo ?? false)}
              onSubmit={make}
            />
          ) : null}

          {run ? (
            <ul className="divide-y divide-line" aria-live="polite">
              <li className="flex min-h-11 items-center justify-between gap-2 py-1.5 type-body-sm font-bold text-ink">
                <span>{T.expVoice[locale]}</span>
                <JobLine locale={locale} state={stateOf(run.voiceJob)} />
              </li>
              <li className="flex min-h-11 items-center justify-between gap-2 py-1.5 type-body-sm font-bold text-ink">
                <span>{fillCopy(T.expImages[locale], { done: imagesDone, n: run.imageJobs.length })}</span>
                {imagesDone < run.imageJobs.length && !failed ? <Spinner size="xs" /> : null}
              </li>
            </ul>
          ) : null}
          {making ? <p className="type-body-sm font-semibold text-muted">{T.keepOpen[locale]}</p> : null}
          {failed || error ? (
            <div className="space-y-2">
              <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
                {error ?? T.stepFailed[locale]}
              </p>
              <Button variant="secondary" onClick={() => setRun(null)} icon={<RotateCcw aria-hidden="true" className="size-4" />}>
                {T.expMake[locale]}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {assembled && timeline ? (
        <div className="mt-5 space-y-5 border-t border-line pt-5">
          <p className="type-body-sm font-black text-ink">{T.expReady[locale]}</p>
          {assembled.demoVoice ? <p className="type-body-sm font-semibold text-muted">{T.expVoiceDemo[locale]}</p> : null}
          <div className="space-y-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 type-body-sm font-black text-ink">
              <input type="checkbox" checked={captionsOn} onChange={(event) => setCaptionsOn(event.target.checked)} className="size-5 accent-ink" />
              {T.captionsOn[locale]}
            </label>
            {captionsOn ? (
              <>
                <ChoiceChips<CaptionStyle>
                  legend={T.styleLegend[locale]}
                  name="crea-obj-titl"
                  options={CAPTION_STYLES.map((id) => ({ id, label: CAPTION_STYLE_LABELS[id].label[locale] }))}
                  value={captionStyle}
                  onChange={setCaptionStyle}
                />
                <ChoiceChips<CaptionScript> legend={T.scriptLegend[locale]} name="crea-obj-pismo" options={(["lat", "cyr"] as const).map((id) => ({ id, label: T.scripts[id][locale] }))} value={script} onChange={setScript} />
              </>
            ) : null}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 type-body-sm font-black text-ink">
              <input type="checkbox" checked={titleCard} onChange={(event) => setTitleCard(event.target.checked)} className="size-5 accent-ink" />
              {T.expTitleCard[locale]}
            </label>
          </div>
          <TimelineStage
            locale={locale}
            caps={caps}
            timeline={timeline}
            onTimelineChange={(next) => base && setEdited({ base, next })}
            files={assembled.files}
            toolId={tool.id}
            canSave={canSave}
            projectId={projectId}
            defaultPreset={assembled.forRun.aspect === "9:16" ? "reels" : "youtube"}
            origin="objasnjenje"
            title={assembled.forRun.plan.title}
          />
        </div>
      ) : null}
    </section>
  );
}

function JobLine({ locale, state }: { locale: "sr" | "en"; state: { status: string; isMock: boolean } | undefined }) {
  if (!state) return <span className="font-mono text-xs text-muted">{T.waiting[locale]}</span>;
  if (state.status === "done") return <span className="font-mono text-xs text-muted">{state.isMock ? T.demo[locale] : T.done[locale]}</span>;
  if (state.status === "failed" || state.status === "refunded") return <span className="font-mono text-xs font-black text-red-700 dark:text-red-300">{T.stepFailed[locale]}</span>;
  return <Spinner size="xs" />;
}
