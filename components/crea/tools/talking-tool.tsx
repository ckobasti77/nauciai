"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { CircleAlert, CircleCheck, Mic, Speech, Square, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { FieldMic } from "@/components/crea/create/mic-button";
import { usePromptParamState } from "@/components/crea/tools/use-prompt-param";

import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { faceArg, FacePicker, type FaceChoice } from "@/components/crea/tools/face-picker";
import { paidModel, PaidSubmit, useLocalVideoSeconds, useUploadInput, type SendStatus } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import type { PickedVideo } from "@/components/crea/tools/video-input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AUDIO_ACCEPT } from "@/convex/providers/modelControls";
import { fillCopy } from "@/lib/crea-copy";
import {
  demoSpeechWav,
  estimateSpeechSeconds,
  needsPriceConfirm,
  pcmWav,
  SCENE_REFS_MAX,
  stepCredits,
  TALKING_MODELS,
  TALKING_SCENES,
  TALKING_SECONDS,
  TALKING_TEXT_MAX,
  talkingNext,
  talkingProblem,
  talkingSteps,
  type ChainJobState,
  type TalkingOutput,
  type TalkingSceneId,
  type TalkingStep,
  type TalkingStepId,
  type TalkingVoice,
} from "@/lib/crea-talking";
import { CREA_VIDEO_TOOLS_COPY as T } from "@/lib/crea-video-tools-copy";
import type { Locale } from "@/lib/i18n";
import { studioErrorMessage } from "@/lib/studio-messages";
import { formatCredits } from "@/lib/studio-params";
import { useCreaCreateJob } from "@/components/crea/game/crea-tool-context";

type Quality = "720p" | "1080p";
type Audio = { file: File; url: string; seconds: number | null };

type Run = {
  steps: TalkingStep[];
  sceneJobId: Id<"generationJobs"> | null;
  voiceJobId: Id<"generationJobs"> | null;
  /** Izmeren glas za poslednji korak (upload, izlaz govora ili DEMO zvuk). */
  audio: { storageId: Id<"_storage">; seconds: number } | null;
  finalJobId: Id<"generationJobs"> | null;
  /** Cena poslednjeg koraka koja je pisala na dugmetu. */
  videoEstimate: number;
  confirm: { seconds: number; credits: number } | null;
  confirmed: boolean;
  demoVoice: boolean;
  error: string | null;
};

type JobRow = { status: string; isMock?: boolean; outputUrl: string | null } | null | undefined;

function jobState(job: JobRow, id: Id<"generationJobs"> | null): ChainJobState {
  if (!id) return "idle";
  if (!job) return "waiting";
  if (job.status === "done") return job.isMock ? "demo" : "done";
  if (job.status === "failed" || job.status === "refunded") return "failed";
  return "waiting";
}

function useJob(id: Id<"generationJobs"> | null) {
  return useQuery(api.studio.getJobForDetail, id ? { jobId: id } : "skip");
}

/** Mikrofon → WAV (WebM iz `MediaRecorder`-a nema trajanje, a server po trajanju naplaćuje). */
async function recordingToWav(blob: Blob): Promise<{ file: File; seconds: number }> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index++) mono[index] = (mono[index] ?? 0) + data[index]! / buffer.numberOfChannels;
    }
    const wav = pcmWav(mono, buffer.sampleRate);
    return { file: new File([wav as BlobPart], "crea-glas.wav", { type: "audio/wav" }), seconds: buffer.duration };
  } finally {
    void context.close();
  }
}

function audioSeconds(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => resolve(Number.isFinite(audio.duration) ? audio.duration : null), { once: true });
    audio.addEventListener("error", () => resolve(null), { once: true });
    audio.src = url;
  });
}

const PROBLEM_COPY = {
  "nema-teksta": "talkNeedText",
  "predug-tekst": "talkTooLong",
  "nema-glasa": "talkNeedAudio",
  "glas-predug": "talkTooLong",
  "glas-prekratak": "talkTooShort",
  "video-predug": "talkTooLong",
  "nema-videa": "talkNeedVideo",
} as const;

/**
 * Lik koji govori (Crea K20, V21-V23): napiši tekst → Crea ga izgovori na
 * srpskom (`tts`) → tvoj Lik ga kaže (Kling avatar), po želji u sceni (Selfi,
 * Podkast, Vesti, Predavanje, Auto - Nano Banana 2 sa tvojim Likom). Ili tvoj
 * video iz Cree dobije nov glas (Kling lipsync). Lanac od 2-3 postojeća posla,
 * ukupna cena unapred; video se plaća po sekundi glasa, pa kad glas ispadne
 * primetno duži od procene, pita se ponovo. Bez ključa provajdera ide DEMO do kraja.
 */
export default function TalkingTool({ tool, locale, canSave, projectId, paid }: CreaToolProps) {
  const createJob = useCreaCreateJob();
  const adopt = useMutation(api.creaVersions.adoptOutputAsInput);
  const measure = useAction(api.studioActions.measureInputUpload);
  const startTalking = useMutation(api.creaFaceJobs.startTalking);
  const startLipsync = useMutation(api.creaFaceJobs.startLipsync);
  const uploadInput = useUploadInput();

  const [output, setOutput] = useState<TalkingOutput>("avatar");
  const [face, setFace] = useState<FaceChoice | null>(null);
  const [scene, setScene] = useState<TalkingSceneId>("bez");
  const [voice, setVoice] = useState<TalkingVoice>("tekst");
  const [text, setText] = usePromptParamState();
  const [quality, setQuality] = useState<Quality>("720p");
  const [consent, setConsent] = useState(false);
  const [mic, setMic] = useState<{ recording: boolean; startedAt: number; elapsed: number; problem: boolean }>({ recording: false, startedAt: 0, elapsed: 0, problem: false });
  const [audio, setAudio] = useState<Audio | null>(null);
  const [audioBad, setAudioBad] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [status, setStatus] = useState<SendStatus>({ name: "idle" });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const stepping = useRef(false);

  const ttsModel = paidModel(paid, TALKING_MODELS.voice.slug, TALKING_MODELS.voice.inputMode);
  const voiceControl = ttsModel?.model.paramSpec.find((control) => control.key === "voice");
  const voiceOptions = voiceControl?.type === "select" ? (voiceControl.options ?? []) : [];
  const [voiceName, setVoiceName] = useState<string>("Aria");
  const finalModel =
    output === "avatar"
      ? paidModel(paid, TALKING_MODELS.avatar.slug, TALKING_MODELS.avatar.inputMode)
      : paidModel(paid, TALKING_MODELS.lipsync.slug, TALKING_MODELS.lipsync.inputMode);

  // Lipsync: trajanje izabranog videa (cena po sekundi videa).
  const faceVideo: PickedVideo | null = useMemo(
    () => (output === "usne" && face?.kind === "rad" ? { source: face.url, url: face.url, name: "", key: `rad:${face.jobId}`, bytes: null } : null),
    [face, output],
  );
  const videoSeconds = useLocalVideoSeconds(faceVideo);

  useEffect(() => () => {
    if (audio) URL.revokeObjectURL(audio.url);
  }, [audio]);
  useEffect(() => () => recorderRef.current?.stop(), []);

  const plan = {
    output,
    scene: output === "avatar" && face?.kind === "lik" ? scene : ("bez" as TalkingSceneId),
    element: face?.kind === "lik" ? { name: face.name, description: face.description } : null,
    refCount: face?.kind === "lik" ? Math.min(SCENE_REFS_MAX, face.imageIds.length) : 0,
    voice,
    text,
    voiceName,
    audioSeconds: voice === "tekst" ? null : (audio?.seconds ?? null),
    videoSeconds,
    quality,
  };
  const steps = talkingSteps(plan);
  const prices = steps.map((step) => (paid ? stepCredits(step, paid.catalog) : null));
  const total = prices.every((price) => price !== null) ? prices.reduce<number>((sum, price) => sum + (price ?? 0), 0) : null;
  const problem = talkingProblem(plan);

  // ── Praćenje poslova lanca ─────────────────────────────────────────────────
  const sceneJob = useJob(run?.sceneJobId ?? null);
  const voiceJob = useJob(run?.voiceJobId ?? null);
  const finalJob = useJob(run?.finalJobId ?? null);
  const hasScene = run?.steps.some((step) => step.id === "scena") ?? false;
  const hasVoice = run?.steps.some((step) => step.id === "glas") ?? false;
  const finalState = jobState(finalJob, run?.finalJobId ?? null);
  const states: Record<TalkingStepId, ChainJobState | "skip"> = {
    scena: hasScene ? jobState(sceneJob, run?.sceneJobId ?? null) : "skip",
    glas: hasVoice ? jobState(voiceJob, run?.voiceJobId ?? null) : "skip",
    video: finalState,
  };
  const next = run && !run.error && !run.confirm ? talkingNext({ scene: states.scena, voice: states.glas, audioReady: run.audio !== null, final: finalState }) : null;
  const nextKey = next ? `${next.kind}:${run?.audio ? 1 : 0}:${run?.confirmed ? 1 : 0}` : null;

  useEffect(() => {
    if (!run || !next || stepping.current) return;
    if (next.kind === "prepare-voice") {
      stepping.current = true;
      void (async () => {
        try {
          let prepared: { storageId: Id<"_storage">; seconds: number | null };
          if (next.demo) {
            const seconds = estimateSpeechSeconds(text);
            const file = new File([demoSpeechWav(seconds) as BlobPart], "crea-demo-glas.wav", { type: "audio/wav" });
            prepared = await uploadInput(file, "audio");
          } else {
            const adopted = await adopt({ jobId: run.voiceJobId! });
            const measured = adopted.durationS !== null ? { ok: true as const, seconds: adopted.durationS } : await measure({ storageId: adopted.storageId });
            prepared = { storageId: adopted.storageId, seconds: measured.ok ? measured.seconds : null };
          }
          if (prepared.seconds === null) throw new Error("MERENJE_NIJE_DOSTUPNO");
          const seconds = prepared.seconds;
          setRun((current) => (current ? { ...current, audio: { storageId: prepared.storageId, seconds }, demoVoice: next.demo } : current));
        } catch (error) {
          setRun((current) => (current ? { ...current, error: studioErrorMessage(error instanceof Error ? error.message : String(error), locale) } : current));
        } finally {
          stepping.current = false;
        }
      })();
    } else if (next.kind === "start-final") {
      stepping.current = true;
      void (async () => {
        try {
          const audioInput = run.audio!;
          const finalStep = run.steps.find((step) => step.id === "video")!;
          if (output === "avatar" && paid && !run.confirmed) {
            const actual = stepCredits({ ...finalStep, measured: { duration: audioInput.seconds } }, paid.catalog);
            if (actual !== null && needsPriceConfirm(run.videoEstimate, actual)) {
              setRun((current) => (current ? { ...current, confirm: { seconds: audioInput.seconds, credits: actual } } : current));
              return;
            }
          }
          let jobId: unknown;
          if (output === "avatar") {
            const faceSource = next.face === "scene" && run.sceneJobId ? { jobId: run.sceneJobId } : faceArg(face!);
            jobId = await startTalking({ face: faceSource, audioStorageId: audioInput.storageId, quality, consent: true, ...(projectId ? { projectId } : {}) });
          } else if (face?.kind === "rad") {
            // Lipsync naplaćuje po sekundi videa: alias izlaza se meri pre posla.
            const adopted = await adopt({ jobId: face.jobId });
            if (adopted.durationS === null) await measure({ storageId: adopted.storageId });
            jobId = await startLipsync({ videoJobId: face.jobId, audioStorageId: audioInput.storageId, consent: true, ...(projectId ? { projectId } : {}) });
          }
          setRun((current) => (current ? { ...current, finalJobId: jobId as Id<"generationJobs"> } : current));
        } catch (error) {
          const raw = error instanceof Error ? error.message : String(error);
          const faceError = Object.keys(T.faceErrors).find((code) => raw.includes(code)) as keyof typeof T.faceErrors | undefined;
          setRun((current) => (current ? { ...current, error: faceError ? T.faceErrors[faceError][locale] : studioErrorMessage(raw, locale) } : current));
        } finally {
          stepping.current = false;
        }
      })();
    }
    // Lanac napreduje samo na promenu koraka; ostale vrednosti se čitaju iz trenutnog stanja.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextKey]);

  const failedStep = next?.kind === "failed" ? next.step : null;
  const chainDone = next?.kind === "done";

  async function start() {
    if (!paid || problem || !face || !consent || total === null || status.name === "working") return;
    setStatus({ name: "working" });
    try {
      const sceneStep = steps.find((step) => step.id === "scena");
      const voiceStep = steps.find((step) => step.id === "glas");
      const finalStep = steps.find((step) => step.id === "video")!;
      const videoEstimate = stepCredits(finalStep, paid.catalog) ?? 0;
      let sceneJobId: Id<"generationJobs"> | null = null;
      let voiceJobId: Id<"generationJobs"> | null = null;
      let ready: Run["audio"] = null;
      if (sceneStep && face.kind === "lik") {
        const result = await createJob({
          modelSlug: sceneStep.modelSlug,
          params: JSON.stringify(sceneStep.params),
          inputMode: sceneStep.inputMode,
          inputs: JSON.stringify({ image: face.imageIds.slice(0, SCENE_REFS_MAX) }),
          ...(projectId ? { projectId } : {}),
        });
        if (result && typeof result === "object" && "moderationBlocked" in result) throw new Error(`NEISPRAVAN_PROMPT:${result.moderationBlocked.reason}`);
        sceneJobId = result as Id<"generationJobs">;
      }
      if (voiceStep) {
        const result = await createJob({
          modelSlug: voiceStep.modelSlug,
          params: JSON.stringify(voiceStep.params),
          inputMode: voiceStep.inputMode,
          inputs: JSON.stringify({}),
          ...(projectId ? { projectId } : {}),
        });
        if (result && typeof result === "object" && "moderationBlocked" in result) throw new Error(`NEISPRAVAN_PROMPT:${result.moderationBlocked.reason}`);
        voiceJobId = result as Id<"generationJobs">;
      } else if (audio) {
        const uploaded = await uploadInput(audio.file, "audio");
        if (uploaded.seconds === null) throw new Error("MERENJE_NIJE_DOSTUPNO");
        ready = { storageId: uploaded.storageId, seconds: uploaded.seconds };
      }
      setRun({
        steps,
        sceneJobId,
        voiceJobId,
        audio: ready,
        finalJobId: null,
        videoEstimate,
        confirm: null,
        confirmed: false,
        demoVoice: false,
        error: null,
      });
      setStatus({ name: "idle" });
    } catch (error) {
      setStatus({ name: "error", message: studioErrorMessage(error instanceof Error ? error.message : String(error), locale) });
    }
  }

  async function startMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        for (const track of stream.getTracks()) track.stop();
        void recordingToWav(new Blob(chunks, { type: recorder.mimeType }))
          .then(({ file, seconds }) => setAudio({ file, url: URL.createObjectURL(file), seconds }))
          .catch(() => setMic((current) => ({ ...current, problem: true })));
        setMic((current) => ({ ...current, recording: false }));
      };
      recorderRef.current = recorder;
      recorder.start(250);
      const startedAt = performance.now();
      setMic({ recording: true, startedAt, elapsed: 0, problem: false });
    } catch {
      setMic((current) => ({ ...current, problem: true }));
    }
  }

  // Brojač snimanja i automatski kraj na 60 s.
  useEffect(() => {
    if (!mic.recording) return;
    const timer = window.setInterval(() => {
      const elapsed = (performance.now() - mic.startedAt) / 1000;
      setMic((current) => ({ ...current, elapsed }));
      if (elapsed >= TALKING_SECONDS.max) recorderRef.current?.stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [mic.recording, mic.startedAt]);

  async function chooseAudioFile(file: File | undefined) {
    if (!file) return;
    if (!AUDIO_ACCEPT.includes(file.type) && file.type !== "audio/x-m4a" && file.type !== "audio/x-wav") {
      setAudioBad(true);
      return;
    }
    setAudioBad(false);
    const url = URL.createObjectURL(file);
    setAudio({ file, url, seconds: await audioSeconds(url) });
  }

  const busy = status.name === "working" || (run !== null && !run.error && !chainDone);
  const blocker = !finalModel
    ? T.unavailable[locale]
    : !face
      ? output === "avatar"
        ? T.needFace[locale]
        : T.talkNeedVideo[locale]
      : problem
        ? T[PROBLEM_COPY[problem]][locale]
        : voice === "tekst" && !ttsModel
          ? T.unavailable[locale]
          : !consent
            ? T.needConsent[locale]
            : null;
  const demo = (finalModel?.demo ?? false) || (voice === "tekst" && (ttsModel?.demo ?? false));
  const finalUrl = finalJob?.status === "done" ? finalJob.outputUrl : null;

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Speech aria-hidden="true" className="size-5" />} />
      <fieldset disabled={busy} className="mt-5 min-w-0 space-y-5 border-t border-line pt-5">
        <ChoiceChips<TalkingOutput>
          legend={T.talkOutput[locale]}
          name="crea-talk-output"
          options={(["avatar", "usne"] as const).map((id) => ({ id, label: T.talkOutputs[id][locale], hint: T.talkOutputHints[id][locale] }))}
          value={output}
          onChange={(id) => {
            setOutput(id);
            setFace(null);
          }}
        />

        <div className="space-y-2">
          <p className="type-body font-black text-ink">{output === "avatar" ? T.faceTitle[locale] : T.faceTitleVideo[locale]}</p>
          <FacePicker key={output} locale={locale} kind={output === "avatar" ? "image" : "video"} value={face} onChange={setFace} disabled={busy} />
        </div>

        {output === "avatar" ? (
          face?.kind === "lik" ? (
            <ChoiceChips<TalkingSceneId>
              legend={T.talkScene[locale]}
              name="crea-talk-scene"
              options={TALKING_SCENES.map((entry) => ({ id: entry.id, label: entry.label[locale], hint: entry.hint[locale] }))}
              value={scene}
              onChange={setScene}
            />
          ) : face ? (
            <p className="type-body-sm font-semibold text-muted">{T.talkSceneOnlyLik[locale]}</p>
          ) : null
        ) : null}

        <div className="space-y-3 border-t border-line pt-5">
          <ChoiceChips<TalkingVoice>
            legend={T.talkVoice[locale]}
            name="crea-talk-voice"
            options={(["tekst", "snimak", "fajl"] as const).map((id) => ({ id, label: T.talkVoices[id][locale] }))}
            value={voice}
            onChange={(id) => {
              setVoice(id);
              setAudio(null);
            }}
          />
          {voice === "tekst" ? (
            <div className="space-y-3">
              <label className="block">
                <span className="type-body-sm font-black text-ink">{T.talkText[locale]}</span>
                <textarea
                  value={text}
                  rows={4}
                  maxLength={TALKING_TEXT_MAX}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={T.talkTextPlaceholder[locale]}
                  className="surface-inset mt-2 block w-full resize-y border-2 border-ink bg-paper px-3 py-2 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
                />
                <span className="mt-1 block font-mono text-xs font-bold text-muted">
                  {fillCopy(T.talkTextCount[locale], { n: text.length, max: TALKING_TEXT_MAX, s: estimateSpeechSeconds(text) })}
                </span>
              </label>
              <FieldMic locale={locale} value={text} onChange={setText} maxLength={TALKING_TEXT_MAX} />
              {voiceOptions.length > 0 ? (
                <label className="block">
                  <span className="type-body-sm font-black text-ink">{T.talkVoiceName[locale]}</span>
                  <select
                    value={voiceName}
                    onChange={(event) => setVoiceName(event.target.value)}
                    className="surface-inset mt-2 block min-h-11 w-full max-w-xs border-2 border-ink bg-paper px-3 type-body font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {voiceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.value}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <p className="type-body-sm font-semibold text-muted">{T.talkMascotSoon[locale]}</p>
            </div>
          ) : voice === "snimak" ? (
            <div className="flex flex-wrap items-center gap-3">
              {mic.recording ? (
                <Button variant="secondary" onClick={() => recorderRef.current?.stop()} icon={<Square aria-hidden="true" className="size-4" />}>
                  {T.talkMicStop[locale]}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => void startMic()} icon={<Mic aria-hidden="true" className="size-4" />}>
                  {T.talkMicStart[locale]}
                </Button>
              )}
              {mic.recording ? (
                <p aria-live="polite" className="inline-flex items-center gap-2 font-mono text-sm font-black text-ink">
                  <span aria-hidden="true" className="size-2.5 rounded-full bg-red-600 motion-safe:animate-pulse" />
                  {fillCopy(T.talkMicRecording[locale], { s: Math.floor(mic.elapsed) })}
                </p>
              ) : null}
              {mic.problem ? (
                <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
                  {T.talkMicProblem[locale]}
                </p>
              ) : null}
            </div>
          ) : (
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink transition hover:-translate-y-0.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink motion-reduce:transition-none">
              <Upload aria-hidden="true" className="size-4" />
              {T.talkAudioFile[locale]}
              <input
                type="file"
                accept="audio/*"
                className="sr-only"
                onChange={(event) => {
                  void chooseAudioFile(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          )}
          {audioBad ? (
            <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
              {T.talkAudioBad[locale]}
            </p>
          ) : null}
          {voice !== "tekst" && audio ? (
            <div className="space-y-1">
              <audio src={audio.url} controls className="w-full max-w-md" />
              {audio.seconds !== null ? (
                <p className="font-mono text-xs font-bold text-muted">{fillCopy(T.talkAudioLength[locale], { s: audio.seconds.toLocaleString(locale === "sr" ? "sr-Latn-RS" : "en-GB", { maximumFractionDigits: 1 }) })}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-line pt-5">
          {output === "avatar" ? (
            <ChoiceChips<Quality>
              legend={T.quality[locale]}
              name="crea-talk-quality"
              options={(["720p", "1080p"] as const).map((id) => ({ id, label: id }))}
              value={quality}
              onChange={setQuality}
            />
          ) : null}
          <label className="flex min-h-11 items-start gap-3 type-body-sm font-bold text-ink">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 size-5 shrink-0 accent-ink" />
            {T.consent[locale]}
          </label>
        </div>
      </fieldset>

      <div className="mt-5 space-y-4 border-t border-line pt-5">
        <div>
          <p className="type-body-sm font-black text-ink">{T.talkTotal[locale]}</p>
          <ul className="mt-2 divide-y divide-line">
            {steps.map((step, index) => {
              const state = run ? states[step.id] : null;
              return (
                <li key={step.id} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-1.5 type-body-sm font-bold text-ink">
                  <span>{T.talkSteps[step.id][locale]}</span>
                  <span className="inline-flex items-center gap-2 font-mono text-xs">
                    {prices[index] !== null ? `${step.id === "video" && voice === "tekst" ? "≈ " : ""}${formatCredits(prices[index]!, locale)}` : "-"}
                    {state ? <StepState locale={locale} state={state} /> : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {voice === "tekst" && output === "avatar" ? <p className="mt-2 type-body-sm font-semibold text-muted">{T.talkEstimate[locale]}</p> : null}
        </div>

        {!canSave ? (
          <p className="type-body-sm font-semibold text-muted">{T.noAccess[locale]}</p>
        ) : run === null ? (
          <PaidSubmit
            locale={locale}
            label={T.talkRun[locale]}
            icon={<Speech aria-hidden="true" className="size-4" />}
            credits={total}
            approximate={voice === "tekst"}
            blocker={blocker}
            status={status}
            demo={demo}
            onSubmit={() => void start()}
          />
        ) : null}

        {run?.confirm ? (
          <div className="surface-inset space-y-3 bg-paper p-4" role="alertdialog" aria-live="assertive">
            <p className="type-body font-black text-ink">
              {fillCopy(T.talkPriceChanged[locale], {
                s: Math.round(run.confirm.seconds),
                kr: formatCredits(run.confirm.credits, locale),
                was: formatCredits(run.videoEstimate, locale),
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setRun((current) => (current ? { ...current, confirm: null, confirmed: true } : current))}>{T.talkContinue[locale]}</Button>
              <Button variant="ghost" onClick={() => setRun(null)}>
                {T.talkStop[locale]}
              </Button>
            </div>
          </div>
        ) : null}

        <div aria-live="polite" className="space-y-2">
          {run?.demoVoice ? <p className="type-body-sm font-semibold text-muted">{T.talkDemoVoice[locale]}</p> : null}
          {run && states.scena === "demo" ? <p className="type-body-sm font-semibold text-muted">{T.talkDemoScene[locale]}</p> : null}
          {run?.error || failedStep ? (
            <div className="space-y-2">
              <p role="alert" className="inline-flex items-start gap-2 type-body-sm font-black text-red-700 dark:text-red-300">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {run?.error ?? fillCopy(T.talkFailed[locale], { step: T.talkSteps[failedStep!][locale] })}
              </p>
              <Button variant="secondary" onClick={() => setRun(null)}>
                {T.talkAgain[locale]}
              </Button>
            </div>
          ) : null}
          {chainDone ? (
            <div className="space-y-3">
              <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
                <CircleCheck aria-hidden="true" className="size-4" />
                {T.talkDone[locale]}
              </p>
              {finalUrl && !finalJob?.isMock ? (
                <video src={finalUrl} controls playsInline className="surface-media mx-auto max-h-[60vh] w-full bg-paper object-contain shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" />
              ) : null}
              <Button variant="secondary" onClick={() => setRun(null)}>
                {T.talkAgain[locale]}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StepState({ locale, state }: { locale: Locale; state: ChainJobState | "skip" }) {
  return (
    <span className="inline-flex items-center gap-1 font-sans font-bold text-muted">
      {state === "waiting" ? <Spinner size="xs" /> : null}
      {T.talkStatus[state][locale]}
    </span>
  );
}
