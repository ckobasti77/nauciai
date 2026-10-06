"use client";

import { Smile } from "lucide-react";
import { useMemo, useState } from "react";

import {
  paidModel,
  PaidSubmit,
  usePrepareVideo,
  useUploadInput,
  type SendStatus,
} from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import type { PickedVideo } from "@/components/crea/tools/video-input";
import {
  aspectOf,
  useVideoInfo,
  videoAsMedia,
} from "@/components/crea/video/picked-media";
import {
  TimelineStage,
  type StageFile,
} from "@/components/crea/video/timeline-stage";
import type { PickedSound } from "@/components/crea/zvuk/sound-input";
import { TakeAudio, useJobStates } from "@/components/crea/zvuk/voice-kit";
import { Spinner } from "@/components/ui/spinner";
import type { Id } from "@/convex/_generated/dataModel";
import { jobCredits } from "@/lib/crea-job-price";
import { CREA_SOUND_COPY as T } from "@/lib/crea-sound-copy";
import {
  addAudio,
  addMainClips,
  emptyTimeline,
  type CreaTimelineV1,
} from "@/lib/crea-timeline";
import type { Locale } from "@/lib/i18n";
import { studioErrorMessage } from "@/lib/studio-messages";
import { useCreaCreateJob } from "@/components/crea/game/crea-tool-context";

/** Kling lipsync prima video do 60 s. */
const LIPSYNC_MAX_S = 60;

/** Novi zvuk videa: fajl sa uređaja (`localFileId` ≥ 8 znakova) koji montaža pušta umesto originala. */
export type NewSound = { blob: Blob; fileId: string };

/**
 * Video sa novim zvukom (Crea K23, A9/A10): montaža K19 (pregled, izvoz MP4,
 * galerija, „Doteraj u montaži") sa originalnim zvukom isključenim, a po želji i
 * usne koje prate novi glas (Kling lipsync, po sekundi videa, do 60 s).
 */
export function VideoWithSound({
  locale,
  caps,
  tool,
  canSave,
  projectId,
  paid,
  picked,
  audio,
  withLips = false,
}: Pick<
  CreaToolProps,
  "locale" | "caps" | "tool" | "canSave" | "projectId" | "paid"
> & { picked: PickedSound; audio: NewSound; withLips?: boolean }) {
  const video = picked as PickedVideo;
  const info = useVideoInfo(video);
  const media = useMemo(() => videoAsMedia(video), [video]);
  const [edited, setEdited] = useState<{
    base: CreaTimelineV1;
    next: CreaTimelineV1;
  } | null>(null);
  const base = useMemo(() => {
    if (!media || info.status !== "ready") return null;
    let timeline = addMainClips(
      emptyTimeline(aspectOf(info.info.width, info.info.height)),
      [
        {
          src: media.ref,
          media: "video",
          in: 0,
          out: info.info.durationS,
          speed: 1,
          volumeDb: 0,
          muted: true,
          fit: "cover",
        },
      ],
    );
    timeline = addAudio(timeline, {
      src: { localFileId: audio.fileId },
      in: 0,
      out: info.info.durationS,
      start: 0,
      volumeDb: 0,
      role: "voice",
      fadeIn: 0.01,
      fadeOut: 0.2,
    }).timeline;
    return timeline;
  }, [media, info, audio.fileId]);
  const timeline = edited && base && edited.base === base ? edited.next : base;
  const files = useMemo<StageFile[]>(
    () => [
      ...(media?.file ? [media.file] : []),
      {
        id: audio.fileId,
        blob: audio.blob,
        name: "crea-zvuk.wav",
        kind: "audio",
      },
    ],
    [media, audio],
  );

  // Usne prate novi glas (Kling lipsync, po sekundi videa).
  const createJob = useCreaCreateJob();
  const prepareVideo = usePrepareVideo();
  const uploadInput = useUploadInput();
  const [lipStatus, setLipStatus] = useState<SendStatus>({ name: "idle" });
  const [lipJob, setLipJob] = useState<Id<"generationJobs"> | null>(null);
  const lipStates = useJobStates(lipJob ? [lipJob] : []);
  const lipModel = paidModel(paid, "kling-lipsync", "video_audio");
  const videoS = info.status === "ready" ? info.info.durationS : null;
  const lipPrice =
    paid && videoS !== null
      ? jobCredits(
          {
            modelSlug: "kling-lipsync",
            inputMode: "video_audio",
            params: { source: "audio" },
            measured: { duration: videoS },
          },
          paid.catalog,
        )
      : null;

  async function lipsync() {
    setLipStatus({ name: "working" });
    try {
      const preparedVideo = await prepareVideo(video);
      const uploadedAudio = await uploadInput(
        new File([audio.blob], "crea-zvuk.wav", { type: "audio/wav" }),
        "audio",
      );
      const result = await createJob({
        modelSlug: "kling-lipsync",
        params: JSON.stringify({ source: "audio" }),
        inputMode: "video_audio",
        inputs: JSON.stringify({
          video: [preparedVideo.storageId],
          audio: [uploadedAudio.storageId],
        }),
        ...(projectId ? { projectId } : {}),
        ...(picked.sourceJobId ? { parentJobId: picked.sourceJobId } : {}),
      });
      if (typeof result !== "string") throw new Error("NEISPRAVAN_PROMPT");
      setLipJob(result as Id<"generationJobs">);
      setLipStatus({ name: "sent" });
    } catch (error) {
      setLipStatus({
        name: "error",
        message: studioErrorMessage(
          error instanceof Error ? error.message : String(error),
          locale,
        ),
      });
    }
  }

  return (
    <div className="space-y-4">
      {timeline ? (
        <TimelineStage
          locale={locale}
          caps={caps}
          timeline={timeline}
          onTimelineChange={(next) => base && setEdited({ base, next })}
          files={files}
          toolId={tool.id}
          canSave={canSave}
          projectId={projectId}
          defaultPreset={
            timeline.aspect === "16:9"
              ? "youtube"
              : timeline.aspect === "1:1"
                ? "instagram"
                : "reels"
          }
          origin="rucno"
          title={picked.name}
          parentJobId={picked.sourceJobId ?? null}
        />
      ) : (
        <p className="inline-flex items-center gap-2 type-body-sm font-bold text-muted">
          <Spinner size="xs" /> {T.common.working[locale]}
        </p>
      )}
      {withLips ? (
        <div className="space-y-2 border-t border-line pt-4">
          <h4 className="type-body font-black text-ink">
            {T.dub.lipsTitle[locale]}
          </h4>
          <p className="type-body-sm font-semibold text-muted">
            {T.dub.lipsHint[locale]}
          </p>
          <PaidSubmit
            locale={locale}
            label={T.dub.lips[locale]}
            icon={<Smile aria-hidden="true" className="size-4" />}
            credits={lipPrice}
            blocker={
              !canSave
                ? T.common.noAccess[locale]
                : !lipModel
                  ? T.common.modelMissing[locale]
                  : videoS !== null && videoS > LIPSYNC_MAX_S
                    ? T.dub.lipsTooLong[locale]
                    : lipJob &&
                        !["done", "failed", "refunded"].includes(
                          lipStates?.[lipJob]?.status ?? "reserved",
                        )
                      ? T.common.working[locale]
                      : null
            }
            status={lipStatus}
            demo={lipModel?.demo ?? false}
            onSubmit={() => void lipsync()}
          />
          {lipJob ? (
            <LipResult locale={locale} state={lipStates?.[lipJob]} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LipResult({
  locale,
  state,
}: {
  locale: Locale;
  state:
    { status: string; isMock: boolean; outputUrl: string | null } | undefined;
}) {
  if (!state || ["reserved", "running", "queued"].includes(state.status)) {
    return <TakeAudio locale={locale} state={undefined} />;
  }
  if (state.status === "failed" || state.status === "refunded")
    return (
      <p className="type-body-sm font-black text-red-700 dark:text-red-300">
        {T.common.failed[locale]}
      </p>
    );
  if (state.isMock || !state.outputUrl)
    return (
      <p className="type-body-sm font-semibold text-muted">
        {T.common.demoResult[locale]}
      </p>
    );
  return (
    <video
      src={state.outputUrl}
      controls
      playsInline
      className="surface-media aspect-video w-full max-w-md bg-paper object-contain shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
    />
  );
}
