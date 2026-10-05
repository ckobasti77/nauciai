"use client";

import { useMutation } from "convex/react";
import { Camera, CameraOff, Circle, PersonStanding, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { faceArg, FacePicker, type FaceChoice } from "@/components/crea/tools/face-picker";
import { paidModel, PaidSubmit, useLocalVideoSeconds, usePrepareVideo, useUploadInput, type SendStatus } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useVideoInput, VideoInput } from "@/components/crea/tools/video-input";
import type { CameraProblem } from "@/components/crea/video/engine/recorder";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { ACT_COUNTDOWN_S, ACT_MOTION_MODEL, ACT_SECONDS, actClipProblem, actPhaseAt, clampActSeconds, pickRecorderType } from "@/lib/crea-act";
import { fillCopy } from "@/lib/crea-copy";
import { jobCredits } from "@/lib/crea-job-price";
import { CREA_VIDEO_TOOLS_COPY as T } from "@/lib/crea-video-tools-copy";
import { studioErrorMessage } from "@/lib/studio-messages";

type Source = "kamera" | "video";
type Resolution = "720p" | "1080p";
type Recording = { blob: Blob; url: string; seconds: number };
type CameraState =
  | { name: "off" }
  | { name: "on" }
  | { name: "counting"; left: number }
  | { name: "recording"; left: number }
  | { name: "finishing" }
  | { name: "error"; problem: CameraProblem | "greska" };

/**
 * „Odglumi" (Crea K20, V20): snimiš se kamerom u browseru (odbrojavanje 3-2-1,
 * 3-10 s; pregled je u ogledalu, snimak nije), ili okačiš snimak pokreta, a tvoj
 * Lik ponovi pokret - postojeći Kling prenos pokreta preko `creaFaceJobs.startMotion`
 * (lice bira server: samo tvoj Lik sa pristankom ili rad iz Cree). Snimak se pre
 * slanja prepakuje u MP4 sa trajanjem (server po njemu naplaćuje).
 */
export default function ActTool({ tool, locale, canSave, projectId, source, paid }: CreaToolProps) {
  const startMotion = useMutation(api.creaFaceJobs.startMotion);
  const uploadInput = useUploadInput();
  const prepareVideo = usePrepareVideo();
  const clip = useVideoInput(source);
  const clipSeconds = useLocalVideoSeconds(clip.picked);
  const [sourceKind, setSourceKind] = useState<Source>(source ? "video" : "kamera");
  const [face, setFace] = useState<FaceChoice | null>(null);
  const [consent, setConsent] = useState(false);
  const [self, setSelf] = useState(false);
  const [seconds, setSeconds] = useState<number>(ACT_SECONDS.default);
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [camera, setCamera] = useState<CameraState>({ name: "off" });
  const [recording, setRecording] = useState<Recording | null>(null);
  const [status, setStatus] = useState<SendStatus>({ name: "idle" });
  const streamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const choice = paidModel(paid, ACT_MOTION_MODEL.slug, ACT_MOTION_MODEL.inputMode);
  const motionSeconds = sourceKind === "kamera" ? (recording?.seconds ?? seconds) : clipSeconds;
  const credits =
    choice && paid && motionSeconds !== null
      ? jobCredits(
          { modelSlug: ACT_MOTION_MODEL.slug, inputMode: ACT_MOTION_MODEL.inputMode, params: { resolution }, measured: { duration: motionSeconds } },
          paid.catalog,
        )
      : null;

  // Kamera se gasi kad alat ode sa ekrana; snimak se oslobađa kad se zameni.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    },
    [],
  );
  useEffect(() => () => {
    if (recording) URL.revokeObjectURL(recording.url);
  }, [recording]);

  async function cameraOn() {
    try {
      const { openCamera, stopCamera } = await import("@/components/crea/video/engine/recorder");
      stopCamera(streamRef.current);
      const stream = await openCamera();
      streamRef.current = stream;
      setCamera({ name: "on" });
      if (previewRef.current) previewRef.current.srcObject = stream;
    } catch (error) {
      const problem = error && typeof error === "object" && "problem" in error ? (error.problem as CameraProblem) : "greska";
      setCamera({ name: "error", problem });
    }
  }

  function cameraOff() {
    abortRef.current?.abort();
    const { current } = streamRef;
    for (const track of current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    setCamera({ name: "off" });
  }

  // Pregled kamere dobija tok čim se element pojavi.
  useEffect(() => {
    if (previewRef.current && streamRef.current && previewRef.current.srcObject !== streamRef.current) {
      previewRef.current.srcObject = streamRef.current;
    }
  });

  async function record() {
    const stream = streamRef.current;
    if (!stream) return;
    const type = pickRecorderType((mime) => MediaRecorder.isTypeSupported(mime));
    if (!type) {
      setCamera({ name: "error", problem: "ne-podrzava" });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const length = clampActSeconds(seconds);
    const startedAt = performance.now();
    const tick = window.setInterval(() => {
      const phase = actPhaseAt((performance.now() - startedAt) / 1000, length);
      if (phase.phase === "odbrojavanje") setCamera({ name: "counting", left: phase.left });
      else if (phase.phase === "snimanje") setCamera({ name: "recording", left: phase.left });
    }, 200);
    setCamera({ name: "counting", left: ACT_COUNTDOWN_S });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(resolve, ACT_COUNTDOWN_S * 1000);
        controller.signal.addEventListener("abort", () => {
          window.clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
      const engine = await import("@/components/crea/video/engine/recorder");
      const raw = await engine.recordStream(stream, length, type, controller.signal);
      window.clearInterval(tick);
      setCamera({ name: "finishing" });
      const blob = await engine.finishRecording(raw);
      setRecording({ blob, url: URL.createObjectURL(blob), seconds: length });
      setCamera({ name: "on" });
    } catch (error) {
      window.clearInterval(tick);
      if (controller.signal.aborted) setCamera(streamRef.current ? { name: "on" } : { name: "off" });
      else setCamera({ name: "error", problem: error && typeof error === "object" && "problem" in error ? (error.problem as CameraProblem) : "greska" });
    }
  }

  const clipProblem = sourceKind === "kamera" ? (recording ? null : "nema") : actClipProblem(clipSeconds);
  const blocker = !choice
    ? T.unavailable[locale]
    : !face
      ? T.needFace[locale]
      : clipProblem
        ? T.actNeedClip[locale]
        : sourceKind === "kamera" && !self
          ? T.actNeedSelf[locale]
          : !consent
            ? T.needConsent[locale]
            : null;

  async function submit() {
    if (!face || blocker || status.name === "working") return;
    setStatus({ name: "working" });
    try {
      let videoStorageId;
      if (sourceKind === "kamera" && recording) {
        const extension = recording.blob.type === "video/webm" ? "webm" : "mp4";
        const file = new File([recording.blob], `crea-odglumi.${extension}`, { type: recording.blob.type });
        videoStorageId = (await uploadInput(file, "video")).storageId;
      } else if (clip.picked) {
        videoStorageId = (await prepareVideo(clip.picked)).storageId;
      } else return;
      await startMotion({ face: faceArg(face), videoStorageId, resolution, consent: true, ...(projectId ? { projectId } : {}) });
      setStatus({ name: "sent" });
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const faceError = Object.keys(T.faceErrors).find((code) => raw.includes(code)) as keyof typeof T.faceErrors | undefined;
      setStatus({ name: "error", message: faceError ? T.faceErrors[faceError][locale] : studioErrorMessage(raw, locale) });
    }
  }

  const busy = status.name === "working";
  const recordingNow = camera.name === "counting" || camera.name === "recording" || camera.name === "finishing";
  const cameraLive = camera.name !== "off" && camera.name !== "error";

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<PersonStanding aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <div className="space-y-2">
          <p className="type-body font-black text-ink">{T.faceTitle[locale]}</p>
          <FacePicker locale={locale} kind="image" value={face} onChange={setFace} disabled={busy || recordingNow} />
        </div>

        <div className="space-y-3 border-t border-line pt-5">
          <ChoiceChips<Source>
            legend={T.actMotion[locale]}
            name="crea-act-source"
            options={(["kamera", "video"] as const).map((id) => ({ id, label: T.actSources[id][locale] }))}
            value={sourceKind}
            onChange={(kind) => {
              if (kind === "video") cameraOff();
              setSourceKind(kind);
            }}
            disabled={busy || recordingNow}
          />
          <p className="type-body-sm font-semibold text-muted">{T.actHow[locale]}</p>

          {sourceKind === "kamera" ? (
            <div className="space-y-3">
              {cameraLive ? (
                <div className="surface-media relative mx-auto max-w-md overflow-hidden bg-ink shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
                  {/* Pregled u ogledalu (prirodnije za snimanje sebe); snimak ostaje neokrenut. */}
                  <video ref={previewRef} autoPlay muted playsInline aria-label={T.actPreviewLabel[locale]} className="block aspect-video w-full -scale-x-100 object-cover" />
                  {camera.name === "counting" || camera.name === "recording" || camera.name === "finishing" ? (
                    <p
                      aria-live="assertive"
                      className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full border-2 border-ink bg-paper-strong px-4 py-1 text-sm font-black text-ink"
                    >
                      {camera.name === "counting"
                        ? fillCopy(T.actCountdown[locale], { n: camera.left })
                        : camera.name === "recording"
                          ? fillCopy(T.actRecording[locale], { n: camera.left })
                          : T.actFinishing[locale]}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {camera.name === "error" ? (
                <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
                  {camera.problem === "greska" ? T.cameraProblems["ne-podrzava"][locale] : T.cameraProblems[camera.problem][locale]}
                </p>
              ) : null}

              <label className="block">
                <span className="type-body-sm font-black text-ink">
                  {T.actSeconds[locale]}: <span className="font-mono tabular-nums">{seconds} s</span>
                </span>
                <input
                  type="range"
                  min={ACT_SECONDS.min}
                  max={ACT_SECONDS.max}
                  step={1}
                  value={seconds}
                  disabled={busy || recordingNow}
                  onChange={(event) => setSeconds(clampActSeconds(Number(event.target.value)))}
                  className="mt-2 block h-11 w-full accent-ink"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                {cameraLive ? (
                  <>
                    <Button onClick={() => void record()} disabled={busy || recordingNow} icon={recording ? <RotateCcw aria-hidden="true" className="size-4" /> : <Circle aria-hidden="true" className="size-4" />}>
                      {recording ? T.actAgain[locale] : T.actRecord[locale]}
                    </Button>
                    <Button variant="ghost" onClick={cameraOff} disabled={busy} icon={<CameraOff aria-hidden="true" className="size-4" />}>
                      {T.actCameraOff[locale]}
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" onClick={() => void cameraOn()} disabled={busy} icon={<Camera aria-hidden="true" className="size-4" />}>
                    {T.actCameraOn[locale]}
                  </Button>
                )}
              </div>

              {recording ? (
                <div className="space-y-1">
                  <p className="type-body-sm font-black text-ink">{T.actClipLabel[locale]}</p>
                  <video src={recording.url} controls playsInline className="surface-media aspect-video w-full max-w-md bg-paper object-contain shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" />
                </div>
              ) : null}

              <label className="flex min-h-11 items-start gap-3 type-body-sm font-bold text-ink">
                <input type="checkbox" checked={self} disabled={busy} onChange={(event) => setSelf(event.target.checked)} className="mt-1 size-5 shrink-0 accent-ink" />
                {T.actSelf[locale]}
              </label>
            </div>
          ) : (
            <VideoInput locale={locale} input={clip} disabled={busy} />
          )}
        </div>

        <div className="space-y-3 border-t border-line pt-5">
          <ChoiceChips<Resolution>
            legend={T.quality[locale]}
            name="crea-act-quality"
            options={(["720p", "1080p"] as const).map((id) => ({ id, label: id }))}
            value={resolution}
            onChange={setResolution}
            disabled={busy}
          />
          <label className="flex min-h-11 items-start gap-3 type-body-sm font-bold text-ink">
            <input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} className="mt-1 size-5 shrink-0 accent-ink" />
            {T.consent[locale]}
          </label>
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-5">
        {!canSave ? (
          <p className="type-body-sm font-semibold text-muted">{T.noAccess[locale]}</p>
        ) : (
          <PaidSubmit
            locale={locale}
            label={T.actRun[locale]}
            icon={<PersonStanding aria-hidden="true" className="size-4" />}
            credits={credits}
            approximate={sourceKind === "kamera" && !recording}
            blocker={blocker}
            status={status}
            demo={choice?.demo ?? false}
            onSubmit={() => void submit()}
          >
            <p className="type-body-sm font-semibold text-muted">{T.perSecond[locale]}</p>
          </PaidSubmit>
        )}
      </div>
    </section>
  );
}
