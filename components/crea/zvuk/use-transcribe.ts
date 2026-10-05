"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { paidModel, usePrepareVideo, type SendStatus } from "@/components/crea/tools/paid-video";
import type { CreaPaidContext } from "@/components/crea/tools/types";
import type { PickedSound } from "@/components/crea/zvuk/sound-input";
import { usePrepareSound } from "@/components/crea/zvuk/use-sound-upload";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { jobCredits } from "@/lib/crea-job-price";
import type { Locale } from "@/lib/i18n";
import { studioErrorMessage } from "@/lib/studio-messages";

/**
 * Ko i šta govori (Crea K23, A9/A10): `stt` (Scribe V2, govornici + vremena reči)
 * nad izabranim snimkom ili videom. Rad iz galerije ide kao alias (bez kopije),
 * a fajl sa uređaja kao mali WAV (16 kHz mono) - ceo video se ne šalje samo da bi
 * se prepoznao govor. Trajanje meri server i po njemu naplaćuje.
 */
export function useTranscribe(input: { picked: PickedSound | null; seconds: number | null; paid: CreaPaidContext | null; projectId: Id<"studioProjects"> | null; locale: Locale }) {
  const createJob = useMutation(api.studio.createJob);
  const prepareVideo = usePrepareVideo();
  const prepareSound = usePrepareSound();
  const [status, setStatus] = useState<SendStatus>({ name: "idle" });
  const [job, setJob] = useState<{ id: Id<"generationJobs">; forKey: string } | null>(null);

  const key = input.picked?.key ?? null;
  const mode = input.picked?.sourceJobId && input.picked.kind === "video" ? "video" : "audio";
  const model = paidModel(input.paid, "stt", mode);
  const price =
    input.paid && input.seconds !== null ? jobCredits({ modelSlug: "stt", inputMode: mode, params: {}, measured: { minutes: input.seconds / 60 } }, input.paid.catalog) : null;
  const jobId = job && job.forKey === key ? job.id : null;
  const transcript = useQuery(api.creaTranscripts.getForJob, jobId ? { jobId } : "skip");
  const recognizing = jobId !== null && (transcript === undefined || transcript?.state === "waiting");

  async function start() {
    const picked = input.picked;
    if (!picked || !model) return;
    setStatus({ name: "working" });
    try {
      const prepared =
        mode === "video"
          ? await prepareVideo({ source: picked.source, url: picked.url, name: picked.name, key: picked.key, bytes: picked.bytes, sourceJobId: picked.sourceJobId })
          : await prepareSound(picked, { sampleRate: 16000, channels: 1 });
      if (prepared.seconds === null) throw new Error("MERENJE_NIJE_DOSTUPNO");
      const result = await createJob({
        modelSlug: "stt",
        params: JSON.stringify({}),
        inputMode: mode,
        inputs: JSON.stringify({ [mode]: [prepared.storageId] }),
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
