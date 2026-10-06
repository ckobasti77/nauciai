"use client";

import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { Megaphone, Pencil, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FieldMic } from "@/components/crea/create/mic-button";
import { usePromptParamState } from "@/components/crea/tools/use-prompt-param";

import { useJobQueue } from "@/components/crea/create/use-job-queue";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { paidModel, PaidSubmit, useUploadInput, type SendStatus } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { imageAsMedia } from "@/components/crea/video/picked-media";
import { TimelineStage, type StageFile } from "@/components/crea/video/timeline-stage";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AD_LIMITS, type AdScript } from "@/convex/creaLlmVideoCore";
import { AD_MODE_INFO, AD_MODES, AD_MODELS, adAnimationTimeline, adCost, adJobs, adNarration, adVoiceTimeline, type AdMode } from "@/lib/crea-ad";
import { fillCopy } from "@/lib/crea-copy";
import { demoSpeechWav, estimateSpeechSeconds } from "@/lib/crea-talking";
import type { CreaTimelineV1, MediaRef, TimelineAspect } from "@/lib/crea-timeline";
import { CREA_FLOWS_COPY as T } from "@/lib/crea-video-flows-copy";
import { DEFAULT_VOICE, narrationEngine } from "@/lib/crea-voices";
import { studioErrorMessage } from "@/lib/studio-messages";

const FIELD =
  "surface-inset mt-2 block w-full border-2 border-ink bg-paper px-3 py-2 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60";
const SMALL_FIELD =
  "surface-inset mt-1 block w-full border border-line bg-paper-strong px-3 py-2 type-body-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60";

type Aspect = Extract<TimelineAspect, "9:16" | "1:1" | "16:9">;
type Run = { script: AdScript; mode: AdMode; aspect: Aspect; product: { ref: MediaRef; file: StageFile | null }; jobId: Id<"generationJobs"> | null };
type Assembled = { timeline: CreaTimelineV1; files: StageFile[]; demo: boolean; title: string };

/**
 * Reklama za mali biznis (Crea K21, V31; plan K17 §6.5): fotka proizvoda + dve
 * rečenice + brend kit (K15) → scenario (besplatan, LLM) → govorni oglas (srpski
 * glas `tts`, fotka sa Ken Burnsom, natpisi u bojama i slovima kita, logo, poziv
 * na akciju) ili animacija proizvoda (jeftin model po receptu „reklama") → montaža
 * na uređaju i izvoz (0 kr), ili dorada u Montaži.
 */
export default function AdTool({ tool, locale, caps, canSave, projectId, source, paid }: CreaToolProps) {
  const { isAuthenticated } = useConvexAuth();
  const writeAdScript = useAction(api.creaLlm.writeAdScript);
  const adopt = useMutation(api.creaVersions.adoptOutputAsInput);
  const uploadInput = useUploadInput();
  const kit = useQuery(api.creaBrandKit.getMine, isAuthenticated ? {} : "skip");
  const image = useImageInput(source);

  const [about, setAbout] = usePromptParamState();
  const [mode, setMode] = useState<AdMode>("govor");
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [script, setScript] = useState<(AdScript & { demo: boolean }) | null>(null);
  const [scriptStatus, setScriptStatus] = useState<SendStatus>({ name: "idle" });
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assembled, setAssembled] = useState<Assembled | null>(null);
  const [edited, setEdited] = useState<{ base: CreaTimelineV1; next: CreaTimelineV1 } | null>(null);

  // Gemini govor radi sa Google ključem; ElevenLabs je rezerva (K29-20).
  const engine = narrationEngine(script ? adNarration(script).length : 0, (slug) => {
    const choice = paidModel(paid, slug, AD_MODELS.voice.inputMode);
    return choice ? (choice.demo ? "demo" : "live") : null;
  });
  const ttsChoice = engine ? paidModel(paid, engine.modelSlug, AD_MODELS.voice.inputMode) : null;
  const animationChoice = paidModel(paid, AD_MODELS.animation.slug, AD_MODELS.animation.inputMode);
  const voiceControl = ttsChoice?.model.paramSpec.find((control) => control.key === "voice");
  const voiceOptions = voiceControl?.type === "select" ? (voiceControl.options ?? []) : [];
  const [voicePick, setVoice] = useState<string | null>(null);
  const voice = voicePick !== null && voiceOptions.some((option) => option.value === voicePick) ? voicePick : engine ? DEFAULT_VOICE[engine.id] : "";
  const voiceSlug = engine?.modelSlug;
  const onQueueError = useCallback((message: string) => setError(studioErrorMessage(message, locale)), [locale]);
  const { enqueue, waiting } = useJobQueue(onQueueError);

  const cost = script && paid ? adCost(script, mode, voice, paid.catalog, voiceSlug) : null;
  const choice = mode === "govor" ? ttsChoice : animationChoice;

  async function makeScript() {
    setScriptStatus({ name: "working" });
    setError(null);
    try {
      const reply = await writeAdScript({ product: about, ...(kit?.name ? { brand: kit.name } : {}), locale });
      if (!reply.ok) {
        setScriptStatus({ name: "error", message: T.llmErrors[reply.reason][locale] });
        return;
      }
      setScript({ headline: reply.headline, shots: reply.shots, cta: reply.cta, animationPrompt: reply.animationPrompt, demo: reply.demo });
      setRun(null);
      setAssembled(null);
      setScriptStatus({ name: "idle" });
    } catch (caught) {
      setScriptStatus({ name: "error", message: studioErrorMessage(caught instanceof Error ? caught.message : String(caught), locale) });
    }
  }

  async function make() {
    const product = imageAsMedia(image.picked);
    if (!script || !product || !image.picked) return;
    setError(null);
    setAssembled(null);
    const frozen: Run = { script, mode, aspect, product, jobId: null };
    setRun(frozen);
    const job = adJobs(script, mode, voice, voiceSlug)[0]!;
    try {
      let inputs: Record<string, string[]> = {};
      if (mode === "animacija") {
        const storageId = image.picked.sourceJobId ? (await adopt({ jobId: image.picked.sourceJobId })).storageId : (await uploadInput(image.picked.file, "image")).storageId;
        inputs = { image: [storageId] };
      }
      enqueue([
        {
          args: {
            modelSlug: job.modelSlug,
            params: JSON.stringify(job.params),
            inputMode: job.inputMode,
            inputs: JSON.stringify(inputs),
            ...(mode === "animacija" && image.picked.sourceJobId ? { parentJobId: image.picked.sourceJobId, derivation: "animacija" as const } : {}),
            ...(projectId ? { projectId } : {}),
          },
          onCreated: (jobId) => setRun((current) => (current ? { ...current, jobId } : current)),
        },
      ]);
    } catch (caught) {
      setError(studioErrorMessage(caught instanceof Error ? caught.message : String(caught), locale));
    }
  }

  const states = useQuery(api.creaMontages.jobStates, run?.jobId ? { jobIds: [run.jobId] } : "skip");
  const state = run?.jobId && states ? states[run.jobId] : undefined;
  const failed = state?.status === "failed" || state?.status === "refunded";
  const making = run !== null && state?.status !== "done" && !failed && !error;

  // Posao je gotov → montaža (glas ili klip, logo iz kita kao fajl na uređaju). Jednom po pokretanju.
  const assembling = useRef<Run | null>(null);
  useEffect(() => {
    if (!run || !run.jobId || !state || state.status !== "done" || assembling.current === run) return;
    assembling.current = run;
    void (async () => {
      const files: StageFile[] = run.product.file ? [run.product.file] : [];
      let logo: { ref: MediaRef } | null = null;
      if (kit?.logoUrl) {
        try {
          const blob = await (await fetch(kit.logoUrl)).blob();
          const id = `logo-${kit.logoStorageId ?? "kit"}`;
          files.push({ id, blob, name: "logo", kind: "image" });
          logo = { ref: { localFileId: id } };
        } catch {
          logo = null;
        }
      }
      const look = kit ? { colors: kit.colors, fonts: kit.fonts } : null;
      const { probeMedia } = await import("@/components/crea/video/engine/media");
      let timeline: CreaTimelineV1;
      let demo = false;
      if (run.mode === "govor") {
        let voice: { ref: MediaRef; durationS: number };
        if (state.isMock || !state.outputUrl) {
          const seconds = estimateSpeechSeconds(adNarration(run.script));
          const id = `demo-glas-${run.jobId}`;
          files.push({ id, blob: new Blob([demoSpeechWav(seconds) as BlobPart], { type: "audio/wav" }), name: "crea-demo-glas.wav", kind: "audio" });
          voice = { ref: { localFileId: id }, durationS: seconds };
          demo = true;
        } else {
          const probed = await probeMedia("audio", state.outputUrl);
          voice = { ref: { jobId: run.jobId! }, durationS: probed?.durationS ?? estimateSpeechSeconds(adNarration(run.script)) };
        }
        timeline = adVoiceTimeline({ script: run.script, product: { ref: run.product.ref }, voice, logo, kit: look, aspect: run.aspect });
      } else if (state.isMock || !state.outputUrl) {
        demo = true;
        timeline = adAnimationTimeline({ script: run.script, clip: { ref: run.product.ref, media: "image", durationS: 6 }, logo, kit: look, aspect: run.aspect });
      } else {
        const probed = await probeMedia("video", state.outputUrl);
        timeline = adAnimationTimeline({ script: run.script, clip: { ref: { jobId: run.jobId! }, media: "video", durationS: probed?.durationS ?? 6 }, logo, kit: look, aspect: run.aspect });
      }
      setAssembled({ timeline, files, demo, title: run.script.headline || (locale === "sr" ? "Reklama" : "Ad") });
    })();
  }, [run, state, kit, locale]);

  const timeline = edited && assembled && edited.base === assembled.timeline ? edited.next : (assembled?.timeline ?? null);
  const files = useMemo(() => assembled?.files ?? [], [assembled]);

  const editShot = (index: number, patch: Partial<AdScript["shots"][number]>) =>
    setScript((current) => (current ? { ...current, shots: current.shots.map((shot, other) => (other === index ? { ...shot, ...patch } : shot)) } : current));

  const blocker = !canSave ? T.noAccess[locale] : !image.picked ? T.adNeedPhoto[locale] : !choice ? T.modelUnavailable[locale] : making || waiting > 0 ? T.working[locale] : null;

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Megaphone aria-hidden="true" className="size-5" />} />

      <fieldset disabled={making} className="mt-5 min-w-0 space-y-5 border-t border-line pt-5">
        <div className="space-y-2">
          <p className="type-body font-black text-ink">{T.adPhoto[locale]}</p>
          <ImageInput locale={locale} input={image} disabled={making} />
        </div>
        <label className="block">
          <span className="type-body font-black text-ink">{T.adAbout[locale]}</span>
          <textarea value={about} rows={3} maxLength={AD_LIMITS.productChars} onChange={(event) => setAbout(event.target.value)} placeholder={T.adAboutPlaceholder[locale]} className={`${FIELD} resize-y`} />
        </label>
        <FieldMic locale={locale} value={about} onChange={setAbout} maxLength={AD_LIMITS.productChars} />
        <p className="type-body-sm font-semibold text-muted">{kit ? fillCopy(T.adBrandUsed[locale], { name: kit.name }) : T.adBrandNone[locale]}</p>
        <ChoiceChips<AdMode>
          legend={T.adMode[locale]}
          name="crea-reklama-vrsta"
          options={AD_MODES.map((id) => ({ id, label: AD_MODE_INFO[id].label[locale], hint: AD_MODE_INFO[id].hint[locale] }))}
          value={mode}
          onChange={setMode}
        />
        <ChoiceChips<Aspect> legend={T.aspectLegend[locale]} name="crea-reklama-oblik" options={(["9:16", "1:1", "16:9"] as const).map((id) => ({ id, label: T.aspects[id][locale] }))} value={aspect} onChange={setAspect} />
        <div className="space-y-2">
          <Button onClick={() => void makeScript()} loading={scriptStatus.name === "working"} disabled={!canSave || about.trim().length === 0} icon={<Pencil aria-hidden="true" className="size-4" />}>
            {scriptStatus.name === "working" ? T.adScripting[locale] : T.adScript[locale]}
          </Button>
          {scriptStatus.name === "error" ? (
            <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
              {scriptStatus.message}
            </p>
          ) : null}
        </div>
      </fieldset>

      {script ? (
        <div className="mt-5 space-y-5 border-t border-line pt-5">
          {script.demo ? <p className="type-body-sm font-semibold text-muted">{T.demoPlan[locale]}</p> : null}
          <label className="block max-w-md">
            <span className="type-body-sm font-black text-ink">{T.adHeadline[locale]}</span>
            <input value={script.headline} maxLength={AD_LIMITS.onScreenChars} disabled={making} onChange={(event) => setScript({ ...script, headline: event.target.value })} className={`${SMALL_FIELD} min-h-11`} />
          </label>
          <ol className="divide-y divide-line">
            {script.shots.map((shot, index) => (
              <li key={index} className="grid gap-3 py-3 first:pt-0 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <label className="block">
                  <span className="type-body-sm font-black text-ink">
                    {fillCopy(T.adShot[locale], { n: index + 1 })} · {T.adOnScreen[locale]}
                  </span>
                  <input value={shot.onScreen} maxLength={AD_LIMITS.onScreenChars} disabled={making} onChange={(event) => editShot(index, { onScreen: event.target.value })} className={`${SMALL_FIELD} min-h-11`} />
                </label>
                {mode === "govor" ? (
                  <label className="block">
                    <span className="type-body-sm font-black text-ink">{T.adNarration[locale]}</span>
                    <textarea value={shot.narration} rows={2} maxLength={AD_LIMITS.narrationChars} disabled={making} onChange={(event) => editShot(index, { narration: event.target.value })} className={`${SMALL_FIELD} resize-y`} />
                  </label>
                ) : null}
              </li>
            ))}
          </ol>
          <label className="block max-w-md">
            <span className="type-body-sm font-black text-ink">{T.adCta[locale]}</span>
            <input value={script.cta} maxLength={AD_LIMITS.ctaChars} disabled={making} onChange={(event) => setScript({ ...script, cta: event.target.value })} className={`${SMALL_FIELD} min-h-11`} />
          </label>
          {mode === "animacija" ? (
            <label className="block">
              <span className="type-body-sm font-black text-ink">{T.adAnimation[locale]}</span>
              <textarea value={script.animationPrompt} rows={2} maxLength={AD_LIMITS.promptChars} disabled={making} onChange={(event) => setScript({ ...script, animationPrompt: event.target.value })} className={`${SMALL_FIELD} resize-y`} />
            </label>
          ) : voiceOptions.length > 0 ? (
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

          {run === null || failed || error ? (
            <PaidSubmit
              locale={locale}
              label={T.adMake[locale]}
              icon={<Megaphone aria-hidden="true" className="size-4" />}
              credits={cost}
              blocker={blocker}
              status={{ name: "idle" }}
              demo={choice?.demo ?? false}
              onSubmit={() => void make()}
            />
          ) : null}
          {making ? (
            <p aria-live="polite" className="inline-flex items-center gap-2 type-body-sm font-bold text-ink">
              <Spinner size="xs" />
              {T.working[locale]}
            </p>
          ) : null}
          {failed || error ? (
            <div className="space-y-2">
              <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
                {error ?? T.stepFailed[locale]}
              </p>
              <Button variant="secondary" onClick={() => setRun(null)} icon={<RotateCcw aria-hidden="true" className="size-4" />}>
                {T.adMake[locale]}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {assembled && timeline ? (
        <div className="mt-5 space-y-5 border-t border-line pt-5">
          <p className="type-body-sm font-black text-ink">{T.adReady[locale]}</p>
          {assembled.demo ? <p className="type-body-sm font-semibold text-muted">{run?.mode === "govor" ? T.expVoiceDemo[locale] : T.adDemoAnimation[locale]}</p> : null}
          <TimelineStage
            locale={locale}
            caps={caps}
            timeline={timeline}
            onTimelineChange={(next) => setEdited({ base: assembled.timeline, next })}
            files={files}
            toolId={tool.id}
            canSave={canSave}
            projectId={projectId}
            defaultPreset={assembled.timeline.aspect === "16:9" ? "youtube" : assembled.timeline.aspect === "1:1" ? "instagram" : "reels"}
            origin="reklama"
            title={assembled.title}
            parentJobId={run?.product.ref && "jobId" in run.product.ref ? (run.product.ref.jobId as Id<"generationJobs">) : null}
          />
        </div>
      ) : null}
    </section>
  );
}
