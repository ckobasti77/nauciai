"use client";

import { useMutation, useQuery } from "convex/react";
import { Maximize2 } from "lucide-react";
import { useState } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { paidModel, PaidSubmit, useLocalVideoSeconds, usePrepareVideo, type SendStatus } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useVideoInput, VideoInput } from "@/components/crea/tools/video-input";
import { api } from "@/convex/_generated/api";
import { jobCredits } from "@/lib/crea-job-price";
import { VIDEO_UPSCALE_MODEL } from "@/lib/crea-video-edit";
import { CREA_VIDEO_TOOLS_COPY as T } from "@/lib/crea-video-tools-copy";
import { studioErrorMessage } from "@/lib/studio-messages";
import { optionLabel } from "@/lib/studio-params";

/**
 * Uvećaj video (Crea K20, V17): ByteDance uvećanje (red kataloga iz K20) na
 * 1080p, 2K ili 4K. Plaća se po sekundi okačenog videa (meri server); posao je
 * verzija izvora i ide kroz postojeći `createJob`.
 */
export default function VideoUpscaleTool({ tool, locale, canSave, projectId, source, paid }: CreaToolProps) {
  const video = useVideoInput(source);
  const picked = video.picked;
  const localSeconds = useLocalVideoSeconds(picked);
  const createJob = useMutation(api.studio.createJob);
  const prepareVideo = usePrepareVideo();
  const sourceJob = useQuery(api.studio.getJobForDetail, picked?.sourceJobId ? { jobId: picked.sourceJobId } : "skip");
  const choice = paidModel(paid, VIDEO_UPSCALE_MODEL, "video");
  const control = choice?.model.paramSpec.find((entry) => entry.key === "target_resolution");
  const sizes = control?.options ?? [];
  const [size, setSize] = useState("1080p");
  const [status, setStatus] = useState<SendStatus>({ name: "idle" });
  const seconds = localSeconds ?? 5;
  const credits =
    choice && paid
      ? jobCredits({ modelSlug: VIDEO_UPSCALE_MODEL, inputMode: "video", params: { target_resolution: size }, measured: { duration: seconds } }, paid.catalog)
      : null;
  const blocker = !picked ? T.needVideo[locale] : sourceJob?.isMock ? T.demoSource[locale] : !choice ? T.unavailable[locale] : null;

  async function submit() {
    if (!picked || !choice || blocker || status.name === "working") return;
    setStatus({ name: "working" });
    try {
      const input = await prepareVideo(picked);
      const result = await createJob({
        modelSlug: VIDEO_UPSCALE_MODEL,
        params: JSON.stringify({ target_resolution: size }),
        inputMode: "video",
        inputs: JSON.stringify({ video: [input.storageId] }),
        ...(picked.sourceJobId ? { parentJobId: picked.sourceJobId, derivation: "izmena" as const } : {}),
        ...(projectId ? { projectId } : {}),
      });
      if (result && typeof result === "object" && "moderationBlocked" in result) {
        setStatus({ name: "error", message: studioErrorMessage(`NEISPRAVAN_PROMPT:${result.moderationBlocked.reason}`, locale) });
        return;
      }
      setStatus({ name: "sent" });
    } catch (error) {
      setStatus({ name: "error", message: studioErrorMessage(error instanceof Error ? error.message : String(error), locale) });
    }
  }

  const busy = status.name === "working";
  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Maximize2 aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <VideoInput locale={locale} input={video} disabled={busy} />
        {sizes.length > 0 ? (
          <ChoiceChips<string>
            legend={T.upscaleSize[locale]}
            name="crea-video-upscale-size"
            options={sizes.map((option) => ({ id: option.value, label: optionLabel(option, locale) }))}
            value={size}
            onChange={setSize}
            disabled={busy}
          />
        ) : null}
      </div>
      <div className="mt-5 border-t border-line pt-5">
        {!canSave ? (
          <p className="type-body-sm font-semibold text-muted">{T.noAccess[locale]}</p>
        ) : (
          <PaidSubmit
            locale={locale}
            label={T.upscaleRun[locale]}
            icon={<Maximize2 aria-hidden="true" className="size-4" />}
            credits={credits}
            approximate={localSeconds === null}
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
