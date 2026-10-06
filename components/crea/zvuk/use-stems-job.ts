"use client";

import { useQuery } from "convex/react";
import { useState } from "react";

import { paidModel, type SendStatus } from "@/components/crea/tools/paid-video";
import type { CreaPaidContext } from "@/components/crea/tools/types";
import type { PickedSound } from "@/components/crea/zvuk/sound-input";
import { usePrepareSound } from "@/components/crea/zvuk/use-sound-upload";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { jobCredits } from "@/lib/crea-job-price";
import type { Locale } from "@/lib/i18n";
import { studioErrorMessage } from "@/lib/studio-messages";
import { useCreaCreateJob } from "@/components/crea/game/crea-tool-context";

/** Najduži snimak za razdvajanje (isto kao `quantity.max` reda `stems`). */
export const STEMS_MAX_S = 10 * 60;

/**
 * Razdvajanje na trake (Crea K23, A18) kao korak: snimak (stereo WAV 32 kHz ili
 * originalni zvučni fajl) → `stems` posao → glas + bubanj/bas/ostalo
 * (`creaLayers.getStems`). Koriste ga alat „Razdvoji na trake", promena glasa
 * (muzika ostaje) i prevod (zadrži muziku).
 */
export function useStemsJob(input: { picked: PickedSound | null; seconds: number | null; paid: CreaPaidContext | null; projectId: Id<"studioProjects"> | null; locale: Locale }) {
  const createJob = useCreaCreateJob();
  const prepareSound = usePrepareSound();
  const [status, setStatus] = useState<SendStatus>({ name: "idle" });
  const [job, setJob] = useState<{ id: Id<"generationJobs">; forKey: string } | null>(null);

  const key = input.picked?.key ?? null;
  const model = paidModel(input.paid, "stems", "audio");
  const price = input.paid && input.seconds !== null ? jobCredits({ modelSlug: "stems", inputMode: "audio", params: {}, measured: { minutes: input.seconds / 60 } }, input.paid.catalog) : null;
  const jobId = job && job.forKey === key ? job.id : null;
  const stems = useQuery(api.creaLayers.getStems, jobId ? { jobId } : "skip");
  const splitting = jobId !== null && (stems === undefined || ["reserved", "running", "queued"].includes(stems?.status ?? ""));

  async function start() {
    const picked = input.picked;
    if (!picked || !model) return;
    setStatus({ name: "working" });
    try {
      const prepared = await prepareSound(picked, { sampleRate: 32000, channels: 2 });
      if (prepared.seconds === null) throw new Error("MERENJE_NIJE_DOSTUPNO");
      const result = await createJob({
        modelSlug: "stems",
        params: JSON.stringify({}),
        inputMode: "audio",
        inputs: JSON.stringify({ audio: [prepared.storageId] }),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(picked.sourceJobId ? { parentJobId: picked.sourceJobId } : {}),
      });
      if (typeof result !== "string") throw new Error("NEISPRAVAN_PROMPT");
      setJob({ id: result as Id<"generationJobs">, forKey: picked.key });
      setStatus({ name: "sent" });
    } catch (error) {
      setStatus({ name: "error", message: studioErrorMessage(error instanceof Error ? error.message : String(error), input.locale) });
    }
  }

  return { model, price, status, start, jobId, stems: jobId ? (stems ?? null) : null, splitting };
}
