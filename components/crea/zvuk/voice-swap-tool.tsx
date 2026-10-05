"use client";

import { useMutation } from "convex/react";
import { AudioWaveform, Combine, ScanText, Split } from "lucide-react";
import { useMemo, useState } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import { paidModel, PaidSubmit, useUploadInput, type SendStatus } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useSaveLocalResult } from "@/components/crea/use-save-local-result";
import { LicenseBadge } from "@/components/crea/zvuk/license-badge";
import { SoundInput, useSoundInput, type PickedSound } from "@/components/crea/zvuk/sound-input";
import { useSoundSeconds } from "@/components/crea/zvuk/use-sound-upload";
import { STEMS_MAX_S, useStemsJob } from "@/components/crea/zvuk/use-stems-job";
import { useTranscribe } from "@/components/crea/zvuk/use-transcribe";
import { VideoWithSound } from "@/components/crea/zvuk/video-with-sound";
import { FIELD, TakeAudio, useJobStates } from "@/components/crea/zvuk/voice-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { creaSaveErrorMessage, fillCopy } from "@/lib/crea-copy";
import { licenseForJob } from "@/lib/crea-license-tags";
import { CREA_SOUND_COPY as T } from "@/lib/crea-sound-copy";
import { compactPlan, segmentsFromWords, speakersOf, type SpeechSegment } from "@/lib/crea-speech-segments";
import { localModelSlug } from "@/lib/crea-tools";
import { changedSpeakers, stepCredits, swapSteps, swapVoices, type SwapStep } from "@/lib/crea-voice-swap";
import { studioErrorMessage } from "@/lib/studio-messages";

/** Najduži snimak za promenu glasa po govorniku. */
const SWAP_MAX_S = 5 * 60;
/** Frekvencija glasa koji ide promeni glasa (ElevenLabs prima i manju, 24 kHz je čist govor). */
const VOICE_RATE = 24000;
const MIX_RATE = 48000;

type SwapJob = { stepId: string; jobId: Id<"generationJobs">; speaker: string | null };

/**
 * Promena glasa po govorniku (Crea K23, A9): po želji muzika ostaje (trake), po
 * želji svaki govornik dobije svoj glas (prepoznavanje govornika), a promena glasa
 * dobija SAMO delove izabranih govornika spojene jedan za drugim (plaća se po
 * minutu). Na uređaju se nov glas vrati tačno na stara mesta, uz netaknute ostale
 * govornike i muziku, pa nastaje zvuk ili video sa novim glasovima.
 */
export default function VoiceSwapTool({ tool, locale, caps, canSave, projectId, paid, source }: CreaToolProps) {
  const input = useSoundInput(source);
  const { picked } = input;
  const seconds = useSoundSeconds(picked);
  const tooLong = seconds !== null && seconds > SWAP_MAX_S;
  const [keepMusic, setKeepMusic] = useState(false);
  const [perSpeaker, setPerSpeaker] = useState(true);
  const [voice, setVoice] = useState(swapVoices()[0]!);
  const [choices, setChoices] = useState<Record<string, string | null>>({});

  const stt = useTranscribe({ picked, seconds, paid, projectId, locale });
  const stems = useStemsJob({ picked, seconds, paid, projectId, locale });
  const segments = useMemo<SpeechSegment[] | null>(() => (stt.transcript?.state === "ready" ? segmentsFromWords(stt.transcript.words) : null), [stt.transcript]);
  const speakers = useMemo(() => (segments ? speakersOf(segments) : []), [segments]);
  const stemsReady = stems.stems !== null && stems.stems.status === "done";
  const steps = swapSteps({ durationS: seconds ?? 0, keepMusic, perSpeaker, segments, choices, voice });
  const voiceSteps = steps.filter((step) => step.modelSlug === "voice-changer");
  const voiceModel = paidModel(paid, "voice-changer", "audio");

  // Ceo tok: trake (ako treba) → govornici (ako treba) → promena glasa → spajanje.
  const ready = (!keepMusic || stemsReady) && (!perSpeaker || segments !== null);

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<AudioWaveform aria-hidden="true" className="size-5" />} />

      <div className="mt-5 space-y-3 border-t border-line pt-5">
        <h3 className="type-h4 text-ink">{T.swap.inputTitle[locale]}</h3>
        <SoundInput locale={locale} input={input} disabled={stt.recognizing || stems.splitting} />
        {tooLong ? <p className="type-body-sm font-black text-ink">{T.swap.tooLong[locale]}</p> : null}
      </div>

      {picked && !tooLong ? (
        <div className="mt-5 space-y-2 border-t border-line pt-5">
          <h3 className="type-h4 text-ink">{T.swap.optionsTitle[locale]}</h3>
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="checkbox" checked={keepMusic} onChange={(event) => setKeepMusic(event.target.checked)} className="mt-1 size-5 shrink-0 accent-ink" />
            <span>
              <span className="block type-body-sm font-black text-ink">{T.swap.keepMusic[locale]}</span>
              <span className="block type-body-sm font-semibold text-muted">{T.swap.keepMusicHint[locale]}</span>
            </span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="checkbox" checked={perSpeaker} onChange={(event) => setPerSpeaker(event.target.checked)} className="mt-1 size-5 shrink-0 accent-ink" />
            <span>
              <span className="block type-body-sm font-black text-ink">{T.swap.perSpeaker[locale]}</span>
              <span className="block type-body-sm font-semibold text-muted">{T.swap.perSpeakerHint[locale]}</span>
            </span>
          </label>
        </div>
      ) : null}

      {picked && !tooLong && keepMusic ? (
        <div className="mt-5 space-y-2 border-t border-line pt-5">
          <h3 className="type-h4 text-ink">{T.swap.stepStems[locale]}</h3>
          {stemsReady ? (
            <p className="type-body-sm font-bold text-ink">{stems.stems?.isMock ? T.stems.demo[locale] : T.swap.stemsDone[locale]}</p>
          ) : (
            <PaidSubmit
              locale={locale}
              label={T.dub.splitMusic[locale]}
              icon={<Split aria-hidden="true" className="size-4" />}
              credits={stems.price}
              blocker={!canSave ? T.common.noAccess[locale] : !stems.model ? T.common.modelMissing[locale] : seconds !== null && seconds > STEMS_MAX_S ? T.stems.tooLong[locale] : stems.splitting ? T.common.working[locale] : null}
              status={stems.status}
              demo={stems.model?.demo ?? false}
              onSubmit={() => void stems.start()}
            />
          )}
        </div>
      ) : null}

      {picked && !tooLong && perSpeaker ? (
        <div className="mt-5 space-y-3 border-t border-line pt-5">
          <h3 className="type-h4 text-ink">{T.swap.stepSpeakers[locale]}</h3>
          {segments === null ? (
            <>
              <PaidSubmit
                locale={locale}
                label={T.swap.findSpeakers[locale]}
                icon={<ScanText aria-hidden="true" className="size-4" />}
                credits={stt.price}
                blocker={!canSave ? T.common.noAccess[locale] : !stt.model ? T.common.modelMissing[locale] : stt.recognizing ? T.common.working[locale] : null}
                status={stt.status}
                demo={stt.model?.demo ?? false}
                onSubmit={() => void stt.start()}
              />
              {stt.recognizing ? (
                <p className="inline-flex items-center gap-2 type-body-sm font-bold text-muted">
                  <Spinner size="xs" /> {T.dub.recognizing[locale]}
                </p>
              ) : null}
            </>
          ) : speakers.length === 0 ? (
            <p className="type-body-sm font-bold text-muted">{T.swap.noSpeech[locale]}</p>
          ) : (
            <ul className="divide-y divide-line">
              {speakers.map((speaker) => (
                <li key={speaker.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block type-body-sm font-black text-ink">
                      {fillCopy(T.common.speaker[locale], { n: speaker.number })} · {fillCopy(T.swap.speakerSeconds[locale], { s: Math.round(speaker.seconds) })}
                    </span>
                    <span className="block truncate type-body-sm font-semibold text-muted">„{speaker.sample}”</span>
                  </span>
                  <label className="min-w-0">
                    <span className="sr-only">{fillCopy(T.swap.voiceFor[locale], { n: speaker.number })}</span>
                    <select value={choices[speaker.id] ?? ""} onChange={(event) => setChoices((current) => ({ ...current, [speaker.id]: event.target.value || null }))} className={cn(FIELD, "min-h-11 w-auto")}>
                      <option value="">{T.swap.keepOwn[locale]}</option>
                      {swapVoices().map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {picked && !tooLong && !perSpeaker ? (
        <div className="mt-5 space-y-2 border-t border-line pt-5">
          <label className="block max-w-xs">
            <span className="type-body-sm font-black text-ink">{T.swap.newVoice[locale]}</span>
            <select value={voice} onChange={(event) => setVoice(event.target.value)} className={cn(FIELD, "mt-1 min-h-11")}>
              {swapVoices().map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {picked && !tooLong && ready ? (
        <SwapRun
          key={`${picked.key}|${keepMusic}|${perSpeaker}`}
          locale={locale}
          caps={caps}
          tool={tool}
          canSave={canSave}
          projectId={projectId}
          paid={paid}
          picked={picked}
          seconds={seconds}
          vocalsUrl={keepMusic && stems.stems && !stems.stems.isMock ? (stems.stems.tracks.find((track) => track.key === "vocals")?.url ?? null) : null}
          backgroundUrls={keepMusic && stems.stems && !stems.stems.isMock ? stems.stems.tracks.filter((track) => track.key !== "vocals").map((track) => track.url) : []}
          segments={perSpeaker ? segments : null}
          steps={voiceSteps}
          voiceModelReady={voiceModel !== null}
          voiceDemo={voiceModel?.demo ?? false}
          choicesMade={!perSpeaker || changedSpeakers(choices).length > 0}
        />
      ) : null}
    </section>
  );
}

/** Promena glasa (plaćeno) i spajanje na uređaju (0 kr). */
function SwapRun({
  locale,
  caps,
  tool,
  canSave,
  projectId,
  paid,
  picked,
  seconds,
  vocalsUrl,
  backgroundUrls,
  segments,
  steps,
  voiceModelReady,
  voiceDemo,
  choicesMade,
}: Pick<CreaToolProps, "locale" | "caps" | "tool" | "canSave" | "projectId" | "paid"> & {
  picked: PickedSound;
  seconds: number | null;
  vocalsUrl: string | null;
  backgroundUrls: readonly string[];
  segments: readonly SpeechSegment[] | null;
  steps: readonly SwapStep[];
  voiceModelReady: boolean;
  voiceDemo: boolean;
  choicesMade: boolean;
}) {
  const createJob = useMutation(api.studio.createJob);
  const uploadInput = useUploadInput();
  const saveLocalResult = useSaveLocalResult();
  const [status, setStatus] = useState<SendStatus>({ name: "idle" });
  const [jobs, setJobs] = useState<SwapJob[]>([]);
  const states = useJobStates(jobs.map((job) => job.jobId));
  const [result, setResult] = useState<{ url: string; blob: Blob; fileId: string; demo: boolean } | null>(null);
  const [mixState, setMixState] = useState<"idle" | "working" | "saving" | "saved" | { error: string }>("idle");

  const credits = paid ? steps.reduce<number | null>((sum, step) => {
    const price = stepCredits(step, paid.catalog);
    return sum === null || price === null ? null : sum + price;
  }, 0) : null;
  const allDone = jobs.length > 0 && jobs.every((job) => ["done", "failed", "refunded"].includes(states?.[job.jobId]?.status ?? ""));
  const running = jobs.length > 0 && !allDone;
  const source = vocalsUrl ?? picked.source;

  async function changeVoices() {
    setStatus({ name: "working" });
    setJobs([]);
    setResult(null);
    try {
      const { decodeSound, wavBlob } = await import("@/components/crea/zvuk/audio-render");
      const vocals = await decodeSound(source, VOICE_RATE, 1);
      if (!vocals) throw new Error("NEMA_ZVUKA");
      const data = vocals.getChannelData(0);
      const created: SwapJob[] = [];
      for (const step of steps) {
        const speaker = step.id.startsWith("glas:") && step.id !== "glas:sve" ? step.id.slice(5) : null;
        let samples: Float32Array = data;
        if (speaker && segments) {
          const plan = compactPlan(segments, speaker, vocals.duration);
          samples = new Float32Array(Math.ceil(plan.durationS * VOICE_RATE));
          for (const piece of plan.pieces) {
            const from = Math.floor(piece.srcStart * VOICE_RATE);
            const to = Math.min(data.length, Math.ceil(piece.srcEnd * VOICE_RATE));
            samples.set(data.subarray(from, to), Math.floor(piece.at * VOICE_RATE));
          }
        }
        const uploaded = await uploadInput(new File([wavBlob([samples], VOICE_RATE)], "crea-glas.wav", { type: "audio/wav" }), "audio");
        if (uploaded.seconds === null) throw new Error("MERENJE_NIJE_DOSTUPNO");
        const jobId = await createJob({
          modelSlug: "voice-changer",
          params: JSON.stringify(step.params),
          inputMode: "audio",
          inputs: JSON.stringify({ audio: [uploaded.storageId] }),
          ...(projectId ? { projectId } : {}),
          ...(picked.sourceJobId ? { parentJobId: picked.sourceJobId } : {}),
        });
        if (typeof jobId !== "string") throw new Error("NEISPRAVAN_PROMPT");
        created.push({ stepId: step.id, jobId: jobId as Id<"generationJobs">, speaker });
        setJobs([...created]);
      }
      setStatus({ name: "sent" });
    } catch (error) {
      setStatus({ name: "error", message: studioErrorMessage(error instanceof Error ? error.message : String(error), locale) });
    }
  }

  async function assemble() {
    setMixState("working");
    try {
      const { decodeSound, mixLayers, bufferToWav } = await import("@/components/crea/zvuk/audio-render");
      const vocals = await decodeSound(source, MIX_RATE, 1);
      if (!vocals) throw new Error("NEMA_ZVUKA");
      const durationS = Math.max(vocals.duration, seconds ?? 0);
      let demo = false;
      // Glas koji ostaje: originalni glas bez delova govornika kojima se menja glas.
      const kept = new Float32Array(vocals.getChannelData(0));
      const layers: Parameters<typeof mixLayers>[0][number][] = [];
      for (const job of jobs) {
        const state = states?.[job.jobId];
        if (!state || state.status !== "done") continue;
        if (state.isMock || !state.outputUrl) {
          demo = true;
          continue;
        }
        const converted = await decodeSound(state.outputUrl, MIX_RATE, 1);
        if (!converted) continue;
        if (!job.speaker || !segments) {
          kept.fill(0);
          layers.push({ buffer: converted, at: 0, voice: true });
          continue;
        }
        for (const piece of compactPlan(segments, job.speaker, durationS).pieces) {
          const from = Math.floor(piece.srcStart * MIX_RATE);
          const to = Math.min(kept.length, Math.ceil(piece.srcEnd * MIX_RATE));
          kept.fill(0, from, to);
          layers.push({ buffer: converted, at: piece.srcStart, offset: piece.at, duration: piece.srcEnd - piece.srcStart, voice: true, fade: 0.02 });
        }
      }
      const keptBuffer = new AudioBuffer({ length: kept.length, numberOfChannels: 1, sampleRate: MIX_RATE });
      keptBuffer.copyToChannel(kept, 0);
      layers.push({ buffer: keptBuffer, at: 0, voice: true });
      for (const url of backgroundUrls) {
        const buffer = await decodeSound(url, MIX_RATE, 2);
        if (buffer) layers.push({ buffer, at: 0, fade: 0.05 });
      }
      const out = await mixLayers(layers, { durationS, sampleRate: MIX_RATE, channels: 2 });
      const blob = bufferToWav(out);
      setResult((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { url: URL.createObjectURL(blob), blob, fileId: `glasovi-${Date.now().toString(36)}`, demo };
      });
      setMixState("idle");
    } catch {
      setMixState({ error: T.dub.assembleFailed[locale] });
    }
  }

  async function save() {
    if (!result) return;
    setMixState("saving");
    try {
      const saved = await saveLocalResult({ toolId: tool.id, kind: "audio", blob: result.blob, params: { govornici: jobs.length }, projectId, parentJobId: picked.sourceJobId ?? null });
      setMixState(saved.ok ? "saved" : { error: creaSaveErrorMessage(saved.reason, locale) });
    } catch (caught) {
      setMixState({ error: creaSaveErrorMessage(caught instanceof Error ? caught.message : String(caught), locale) });
    }
  }

  return (
    <div className="mt-5 space-y-4 border-t border-line pt-5">
      <h3 className="type-h4 text-ink">{T.swap.stepVoice[locale]}</h3>
      <PaidSubmit
        locale={locale}
        label={T.swap.change[locale]}
        icon={<AudioWaveform aria-hidden="true" className="size-4" />}
        credits={credits}
        approximate
        blocker={!canSave ? T.common.noAccess[locale] : !voiceModelReady ? T.common.modelMissing[locale] : !choicesMade || steps.length === 0 ? T.swap.pickVoice[locale] : running || status.name === "working" ? T.common.working[locale] : null}
        status={status}
        demo={voiceDemo}
        onSubmit={() => void changeVoices()}
      />
      <p className="type-body-sm font-semibold text-muted">{T.swap.priceHint[locale]}</p>
      {jobs.length > 0 ? (
        <ul className="divide-y divide-line" aria-live="polite">
          {jobs.map((job) => (
            <li key={job.jobId} className="flex flex-wrap items-center gap-3 py-2">
              <span className="w-32 shrink-0 type-body-sm font-black text-ink">{job.speaker ? job.speaker.replace(/^speaker_/, "#") : T.swap.wholeRecording[locale]}</span>
              <div className="min-w-0 flex-1">
                <TakeAudio locale={locale} state={states?.[job.jobId]} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {allDone ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={<Combine aria-hidden="true" className="size-4" />} disabled={mixState === "working"} onClick={() => void assemble()} className="shadow-[4px_4px_0_0_var(--ink)]">
              {mixState === "working" ? T.common.working[locale] : T.swap.assemble[locale]}
            </Button>
            <LicenseBadge tag={licenseForJob({ modelSlug: localModelSlug(tool.id) })} locale={locale} />
          </div>
          {typeof mixState === "object" ? (
            <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
              {mixState.error}
            </p>
          ) : null}
          {result ? (
            <div className="space-y-3">
              {result.demo ? <p className="type-body-sm font-semibold text-muted">{T.swap.demoMix[locale]}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                <audio src={result.url} controls preload="none" className="h-11 w-full max-w-md" />
                <a href={result.url} download="crea-novi-glas.wav" className="inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                  {T.common.downloadWav[locale]}
                </a>
                {canSave && picked.kind === "audio" ? (
                  <Button variant="secondary" disabled={mixState === "saving" || mixState === "saved"} onClick={() => void save()}>
                    {mixState === "saved" ? T.common.saved[locale] : T.common.saveToGallery[locale]}
                  </Button>
                ) : null}
              </div>
              {picked.kind === "video" ? <VideoWithSound locale={locale} caps={caps} tool={tool} canSave={canSave} projectId={projectId} paid={paid} picked={picked} audio={result} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
