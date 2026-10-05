"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { paidModel, usePrepareVideo, type SendStatus } from "@/components/crea/tools/paid-video";
import type { CreaPaidContext } from "@/components/crea/tools/types";
import type { PickedVideo } from "@/components/crea/tools/video-input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { jobCredits } from "@/lib/crea-job-price";
import type { Locale } from "@/lib/i18n";
import { studioErrorMessage } from "@/lib/studio-messages";

/**
 * Prepoznavanje govora za titlove (V25) i kratke klipove (V26): video ide kao
 * ulaz `stt` posla (rad iz galerije bez kopije, fajl sa uređaja se okači; trajanje
 * meri server i po njemu naplaćuje), a transkript stiže u `creaTranscripts`
 * (K17-13). Cena na dugmetu je ista računica kao server.
 */
export function useTranscriptJob(input: { picked: PickedVideo | null; durationS: number | null; paid: CreaPaidContext | null; projectId: Id<"studioProjects"> | null; locale: Locale }) {
  const createJob = useMutation(api.studio.createJob);
  const prepareVideo = usePrepareVideo();
  const [status, setStatus] = useState<SendStatus>({ name: "idle" });
  const [job, setJob] = useState<{ id: Id<"generationJobs">; forKey: string } | null>(null);

  const key = input.picked?.key ?? null;
  const model = paidModel(input.paid, "stt", "video");
  const price =
    input.paid && input.durationS !== null
      ? jobCredits({ modelSlug: "stt", inputMode: "video", params: {}, measured: { minutes: input.durationS / 60 } }, input.paid.catalog)
      : null;
  const jobId = job && job.forKey === key ? job.id : null;
  const transcript = useQuery(api.creaTranscripts.getForJob, jobId ? { jobId } : "skip");
  const recognizing = jobId !== null && (transcript === undefined || transcript?.state === "waiting");

  async function start() {
    const picked = input.picked;
    if (!picked || !model) return;
    setStatus({ name: "working" });
    try {
      const prepared = await prepareVideo(picked);
      if (prepared.seconds === null) throw new Error("MERENJE_NIJE_DOSTUPNO");
      const result = await createJob({
        modelSlug: "stt",
        params: JSON.stringify({}),
        inputMode: "video",
        inputs: JSON.stringify({ video: [prepared.storageId] }),
        ...(input.projectId ? { projectId: input.projectId } : {}),
      });
      if (typeof result !== "string") throw new Error("NEISPRAVAN_PROMPT");
      setJob({ id: result as Id<"generationJobs">, forKey: picked.key });
      setStatus({ name: "sent" });
    } catch (error) {
      setStatus({ name: "error", message: studioErrorMessage(error instanceof Error ? error.message : String(error), input.locale) });
    }
  }

  return { model, price, status, start, jobId, transcript: jobId ? (transcript ?? null) : null, recognizing };
}
