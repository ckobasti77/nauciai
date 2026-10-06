"use client";

import { useAction } from "convex/react";
import { Clapperboard, Eye, Music } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { FieldMic } from "@/components/crea/create/mic-button";

import { useJobQueue } from "@/components/crea/create/use-job-queue";
import { ToolHeader } from "@/components/crea/tool-runner";
import { paidModel, PaidSubmit, usePrepareVideo, type SendStatus } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useVideoInput, VideoInput } from "@/components/crea/tools/video-input";
import { aspectOf, useVideoInfo, videoAsMedia } from "@/components/crea/video/picked-media";
import { TimelineStage } from "@/components/crea/video/timeline-stage";
import { LicenseBadge } from "@/components/crea/zvuk/license-badge";
import { FIELD, TakeAudio, useJobStates } from "@/components/crea/zvuk/voice-kit";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ScoreEffect, ScoreTrack } from "@/convex/creaLlmSoundCore";
import { fillCopy } from "@/lib/crea-copy";
import { licenseForModel } from "@/lib/crea-license-tags";
import { scoringCost, scoringEngine, scoringJob, scoringTimeline, SCORE_TRACK_COUNT } from "@/lib/crea-scoring";
import { musicEngine } from "@/lib/crea-music";
import { CREA_SOUND_COPY as T } from "@/lib/crea-sound-copy";
import type { CreaTimelineV1 } from "@/lib/crea-timeline";
import { studioErrorMessage } from "@/lib/studio-messages";
import { useCreaCreateJob } from "@/components/crea/game/crea-tool-context";

/** Najduži klip za ozvučavanje (isto kao granica montaže je 8 min; numera Lyria ~2 min se ponavlja). */
const SCORE_MAX_S = 3 * 60;
const FRAME_SIDE = 512;

type Plan = { summary: string; mood: string; tracks: ScoreTrack[]; effects: ScoreEffect[]; demo: boolean };

/** Kadrovi klipa kao mali JPEG-ovi (na uređaju; ništa se ne čuva). */
async function framesOf(source: Blob | string, count: number): Promise<ArrayBuffer[]> {
  const { extractFrame } = await import("@/components/crea/video/engine/frames");
  const { canvasToBlob, decodeImage, drawScaled } = await import("@/components/crea/tools/canvas");
  const out: ArrayBuffer[] = [];
  for (let index = 0; index < count; index++) {
    const frame = await extractFrame(source, { fraction: (index + 0.5) / count });
    const bitmap = await decodeImage(frame.blob);
    const { canvas } = drawScaled(bitmap, FRAME_SIDE);
    bitmap.close();
    out.push(await (await canvasToBlob(canvas, "image/jpeg", 0.8)).arrayBuffer());
  }
  return out;
}

/**
 * „Ozvuči moj video" (Crea K23, A12): Crea pogleda 4 kadra klipa (jeftin opis, 0 kr)
 * i predloži muziku → 4 numere (Lyria; klip do 30 s klip, duži cela pesma) i po
 * želji efekti iz slike (Kling) → izabrana numera ide u montažu sa originalnim
 * zvukom kao govorom, pa se muzika sama utiša ispod govora (K19 miks na uređaju).
 */
export default function ScoringTool({ tool, locale, caps, canSave, projectId, paid, source }: CreaToolProps) {
  const video = useVideoInput(source);
  const { picked } = video;
  const info = useVideoInfo(picked);
  const videoS = info.status === "ready" ? info.info.durationS : null;
  const tooLong = videoS !== null && videoS > SCORE_MAX_S;

  const planScore = useAction(api.creaLlm.planScore);
  const [plan, setPlan] = useState<{ key: string; value: Plan } | null>(null);
  const [planStatus, setPlanStatus] = useState<SendStatus>({ name: "idle" });
  const current = plan && picked && plan.key === picked.key ? plan.value : null;

  async function look() {
    if (!picked || videoS === null) return;
    setPlanStatus({ name: "working" });
    try {
      const frames = await framesOf(picked.source, 4);
      const reply = await planScore({ frames, mimeType: "image/jpeg", durationS: videoS, locale });
      if (!reply.ok) {
        setPlanStatus({ name: "error", message: T.scoring.planErrors[reply.reason][locale] });
        return;
      }
      setPlan({ key: picked.key, value: { summary: reply.summary, mood: reply.mood, tracks: reply.tracks, effects: reply.effects, demo: reply.demo } });
      setPlanStatus({ name: "idle" });
    } catch {
      setPlanStatus({ name: "error", message: T.scoring.planErrors.GRESKA[locale] });
    }
  }

  const setTrack = (index: number, prompt: string) => setPlan((state) => (state ? { ...state, value: { ...state.value, tracks: state.value.tracks.map((track, other) => (other === index ? { ...track, prompt } : track)) } } : state));

  // ── Numere i efekti ────────────────────────────────────────────────────────
  const [withEffects, setWithEffects] = useState(false);
  const [tracks, setTracks] = useState<{ forKey: string; ids: Id<"generationJobs">[] }>({ forKey: "", ids: [] });
  const [effectJob, setEffectJob] = useState<{ forKey: string; id: Id<"generationJobs"> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { enqueue, waiting } = useJobQueue((message) => setError(studioErrorMessage(message, locale)));
  const createJob = useCreaCreateJob();
  const prepareVideo = usePrepareVideo();
  const trackIds = picked && tracks.forKey === picked.key ? tracks.ids : [];
  const effectId = picked && effectJob?.forKey === picked.key ? effectJob.id : null;
  const states = useJobStates([...trackIds, ...(effectId ? [effectId] : [])]);

  const engine = videoS !== null ? musicEngine(scoringEngine(videoS)) : null;
  const musicChoice = engine ? paidModel(paid, engine.modelSlug, "text") : null;
  const effectChoice = paidModel(paid, "kling-v2a", "video");
  const cost = current && paid && videoS !== null ? scoringCost(current.tracks, videoS, withEffects && effectChoice !== null, paid.catalog) : null;
  const busy = waiting > 0 || trackIds.some((id) => ["reserved", "running", "queued"].includes(states?.[id]?.status ?? "reserved"));

  async function make() {
    if (!picked || !current || videoS === null) return;
    setError(null);
    const key = picked.key;
    setTracks({ forKey: key, ids: [] });
    setEffectJob(null);
    enqueue(
      current.tracks.slice(0, SCORE_TRACK_COUNT).map((track) => {
        const job = scoringJob(track, videoS);
        return {
          args: { modelSlug: job.modelSlug, params: JSON.stringify(job.params), inputMode: job.inputMode, inputs: JSON.stringify({}), ...(projectId ? { projectId } : {}), ...(picked.sourceJobId ? { parentJobId: picked.sourceJobId } : {}) },
          onCreated: (jobId: Id<"generationJobs">) => setTracks((state) => (state.forKey === key ? { ...state, ids: [...state.ids, jobId] } : state)),
        };
      }),
    );
    if (withEffects && effectChoice) {
      try {
        const prepared = await prepareVideo(picked);
        const prompt = current.effects.map((effect) => effect.prompt).join(", ");
        const result = await createJob({
          modelSlug: "kling-v2a",
          params: JSON.stringify({ prompt }),
          inputMode: "video",
          inputs: JSON.stringify({ video: [prepared.storageId] }),
          ...(projectId ? { projectId } : {}),
          ...(picked.sourceJobId ? { parentJobId: picked.sourceJobId } : {}),
        });
        if (typeof result === "string") setEffectJob({ forKey: key, id: result as Id<"generationJobs"> });
      } catch (caught) {
        setError(studioErrorMessage(caught instanceof Error ? caught.message : String(caught), locale));
      }
    }
  }

  // ── Izbor numere i miks ───────────────────────────────────────────────────
  const [chosen, setChosen] = useState<Id<"generationJobs"> | null>(null);
  const [hasSpeech, setHasSpeech] = useState(true);
  const [musicDb, setMusicDb] = useState(-6);
  const chosenState = chosen ? states?.[chosen] : undefined;
  const effectState = effectId ? states?.[effectId] : undefined;
  const media = useMemo(() => videoAsMedia(picked), [picked]);
  const [musicSeconds, setMusicSeconds] = useState<Record<string, number>>({});
  const chosenUrl = chosenState && chosenState.status === "done" && !chosenState.isMock ? chosenState.outputUrl : null;
  const effectUrl = effectState && effectState.status === "done" && !effectState.isMock ? effectState.outputUrl : null;

  async function measure(id: string, url: string) {
    if (musicSeconds[id] !== undefined) return;
    const { probeMedia } = await import("@/components/crea/video/engine/media");
    const probed = await probeMedia("audio", url);
    if (probed?.durationS) setMusicSeconds((state) => ({ ...state, [id]: probed.durationS! }));
  }

  // Efekti stižu posle numere: čim su gotovi, izmeri im trajanje (asinhrono, spoljni izvor).
  useEffect(() => {
    if (!effectId || !effectUrl) return;
    let alive = true;
    void import("@/components/crea/video/engine/media").then(async ({ probeMedia }) => {
      const probed = await probeMedia("audio", effectUrl);
      if (alive && probed?.durationS) setMusicSeconds((state) => (state[effectId] !== undefined ? state : { ...state, [effectId]: probed.durationS! }));
    });
    return () => {
      alive = false;
    };
  }, [effectId, effectUrl]);

  const [edited, setEdited] = useState<{ base: CreaTimelineV1; next: CreaTimelineV1 } | null>(null);
  const base = useMemo(() => {
    if (!media || info.status !== "ready" || !chosen || !chosenUrl) return null;
    const seconds = musicSeconds[chosen];
    if (seconds === undefined) return null;
    return scoringTimeline({
      video: media.ref,
      videoS: info.info.durationS,
      aspect: aspectOf(info.info.width, info.info.height),
      hasSpeech,
      music: { ref: { jobId: chosen }, seconds },
      effects: effectId && effectUrl && musicSeconds[effectId] !== undefined ? { ref: { jobId: effectId }, seconds: musicSeconds[effectId]! } : null,
      musicDb,
      effectsDb: -4,
    });
  }, [media, info, chosen, chosenUrl, musicSeconds, hasSpeech, effectId, effectUrl, musicDb]);
  const timeline = edited && base && edited.base === base ? edited.next : base;
  const files = useMemo(() => (media?.file ? [media.file] : []), [media]);

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Clapperboard aria-hidden="true" className="size-5" />} />

      <div className="mt-5 space-y-3 border-t border-line pt-5">
        <h3 className="type-h4 text-ink">{T.scoring.videoTitle[locale]}</h3>
        <VideoInput locale={locale} input={video} disabled={planStatus.name === "working" || busy} />
        {tooLong ? <p className="type-body-sm font-black text-ink">{T.scoring.tooLong[locale]}</p> : null}
      </div>

      {picked && videoS !== null && !tooLong ? (
        <div className="mt-5 space-y-3 border-t border-line pt-5">
          <h3 className="type-h4 text-ink">{T.scoring.lookTitle[locale]}</h3>
          <PaidSubmit
            locale={locale}
            label={T.scoring.look[locale]}
            icon={<Eye aria-hidden="true" className="size-4" />}
            credits={0}
            blocker={!canSave ? T.common.noAccess[locale] : planStatus.name === "working" ? T.common.working[locale] : null}
            status={planStatus}
            demo={false}
            onSubmit={() => void look()}
          >
            <span className="type-body-sm font-semibold text-muted">{T.scoring.lookFree[locale]}</span>
          </PaidSubmit>
          {current ? (
            <div className="space-y-3">
              {current.demo ? <p className="type-body-sm font-semibold text-muted">{T.scoring.demoPlan[locale]}</p> : null}
              <p className="type-body font-semibold text-ink">
                {current.summary} {current.mood ? <span className="font-black">· {current.mood}</span> : null}
              </p>
              <ol className="divide-y divide-line">
                {current.tracks.map((track, index) => (
                  <li key={index} className="py-2">
                    <label className="block">
                      <span className="type-body-sm font-black text-ink">
                        {index + 1}. {track.title}
                      </span>
                      <textarea value={track.prompt} rows={2} maxLength={300} onChange={(event) => setTrack(index, event.target.value)} className={cn(FIELD, "mt-1 resize-y")} />
                    </label>
                    <FieldMic locale={locale} value={track.prompt} onChange={(next) => setTrack(index, next)} maxLength={300} />
                  </li>
                ))}
              </ol>
              {current.effects.length > 0 ? (
                <label className="flex min-h-11 cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={withEffects} disabled={!effectChoice} onChange={(event) => setWithEffects(event.target.checked)} className="mt-1 size-5 shrink-0 accent-ink" />
                  <span>
                    <span className="block type-body-sm font-black text-ink">{T.scoring.effects[locale]}</span>
                    <span className="block type-body-sm font-semibold text-muted">{current.effects.map((effect) => effect.label).join(" · ")}</span>
                  </span>
                </label>
              ) : null}
              <PaidSubmit
                locale={locale}
                label={fillCopy(T.scoring.make[locale], { n: Math.min(SCORE_TRACK_COUNT, current.tracks.length) })}
                icon={<Music aria-hidden="true" className="size-4" />}
                credits={cost?.total ?? null}
                blocker={!canSave ? T.common.noAccess[locale] : !musicChoice ? T.common.modelMissing[locale] : busy ? T.common.working[locale] : null}
                status={error ? { name: "error", message: error } : { name: "idle" }}
                demo={musicChoice?.demo ?? false}
                onSubmit={() => void make()}
              />
              {engine ? <p className="type-body-sm font-semibold text-muted">{fillCopy(T.scoring.engineHint[locale], { motor: engine.label[locale] })}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {trackIds.length > 0 ? (
        <fieldset className="mt-5 min-w-0 space-y-2 border-t border-line pt-5">
          <legend className="type-h4 text-ink">{T.scoring.pickTitle[locale]}</legend>
          <ul className="divide-y divide-line" aria-live="polite">
            {trackIds.map((id, index) => {
              const state = states?.[id];
              const ready = state?.status === "done" && !state.isMock && state.outputUrl !== null;
              return (
                <li key={id} className="flex flex-wrap items-center gap-3 py-2">
                  <label className={cn("inline-flex min-h-11 items-center gap-2 type-body-sm font-black text-ink", ready ? "cursor-pointer" : "opacity-60")}>
                    <input
                      type="radio"
                      name="crea-ozvuci-numera"
                      disabled={!ready}
                      checked={chosen === id}
                      onChange={() => {
                        setChosen(id);
                        if (state?.outputUrl) void measure(id, state.outputUrl);
                      }}
                      className="size-5 accent-ink"
                    />
                    {current?.tracks[index]?.title ?? `#${index + 1}`}
                  </label>
                  <div className="min-w-0 flex-1">
                    <TakeAudio locale={locale} state={state} />
                  </div>
                </li>
              );
            })}
          </ul>
          {effectId ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="type-body-sm font-black text-ink">{T.scoring.effectsTrack[locale]}</span>
              <div className="min-w-0 flex-1">
                <TakeAudio locale={locale} state={effectState} />
              </div>
            </div>
          ) : null}
          {engine ? <LicenseBadge tag={licenseForModel(engine.modelSlug)} locale={locale} detail /> : null}
        </fieldset>
      ) : null}

      {chosen ? (
        <div className="mt-5 space-y-4 border-t border-line pt-5">
          <h3 className="type-h4 text-ink">{T.scoring.mixTitle[locale]}</h3>
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="checkbox" checked={hasSpeech} onChange={(event) => setHasSpeech(event.target.checked)} className="mt-1 size-5 shrink-0 accent-ink" />
            <span>
              <span className="block type-body-sm font-black text-ink">{T.scoring.hasSpeech[locale]}</span>
              <span className="block type-body-sm font-semibold text-muted">{T.scoring.hasSpeechHint[locale]}</span>
            </span>
          </label>
          <label className="block max-w-md">
            <span className="flex items-baseline justify-between gap-2">
              <span className="type-body-sm font-black text-ink">{T.scoring.musicVolume[locale]}</span>
              <span className="font-mono text-sm font-black text-ink">{musicDb} dB</span>
            </span>
            <input type="range" min={-20} max={0} step={1} value={musicDb} onChange={(event) => setMusicDb(Number(event.target.value))} className="mt-2 h-11 w-full accent-ink" />
          </label>
          {timeline && picked ? (
            <TimelineStage
              locale={locale}
              caps={caps}
              timeline={timeline}
              onTimelineChange={(next) => base && setEdited({ base, next })}
              files={files}
              toolId={tool.id}
              canSave={canSave}
              projectId={projectId}
              defaultPreset={timeline.aspect === "16:9" ? "youtube" : timeline.aspect === "1:1" ? "instagram" : "reels"}
              origin="rucno"
              title={picked.name}
              parentJobId={picked.sourceJobId ?? null}
            />
          ) : (
            <p className="inline-flex items-center gap-2 type-body-sm font-bold text-muted">
              <Spinner size="xs" /> {T.common.working[locale]}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
