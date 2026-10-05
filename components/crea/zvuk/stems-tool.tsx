"use client";

import { Download, Mic2, Split } from "lucide-react";
import { useState } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import { PaidSubmit } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useSaveLocalResult } from "@/components/crea/use-save-local-result";
import { LicenseBadge } from "@/components/crea/zvuk/license-badge";
import { SoundInput, useSoundInput } from "@/components/crea/zvuk/sound-input";
import { useSoundSeconds } from "@/components/crea/zvuk/use-sound-upload";
import { STEMS_MAX_S, useStemsJob } from "@/components/crea/zvuk/use-stems-job";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import type { Id } from "@/convex/_generated/dataModel";
import type { StemKey } from "@/convex/providers/falAudioModels";
import { creaSaveErrorMessage } from "@/lib/crea-copy";
import { licenseForModel } from "@/lib/crea-license-tags";
import { CREA_SOUND_COPY as T } from "@/lib/crea-sound-copy";

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * Razdvoji na trake (Crea K23, A18): pesma ili video → Demucs (fal, po minutu) →
 * glas, bubanj, bas i ostalo kao zasebni radovi (glas je glavni, ostali su deca).
 * „Karaoke" (sve osim glasa) se spaja na uređaju, 0 kr.
 */
export default function StemsTool({ tool, locale, canSave, projectId, paid, source }: CreaToolProps) {
  const input = useSoundInput(source);
  const { picked } = input;
  const seconds = useSoundSeconds(picked);
  const job = useStemsJob({ picked, seconds, paid, projectId, locale });
  const { stems, jobId } = job;
  const working = job.status.name === "working" || job.splitting;
  const blocker = !canSave
    ? T.common.noAccess[locale]
    : !job.model
      ? T.common.modelMissing[locale]
      : !picked
        ? T.stems.pickFirst[locale]
        : seconds !== null && seconds > STEMS_MAX_S
          ? T.stems.tooLong[locale]
          : working
            ? T.common.working[locale]
            : null;

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Split aria-hidden="true" className="size-5" />} />

      <div className="mt-5 space-y-3 border-t border-line pt-5">
        <h3 className="type-h4 text-ink">{T.stems.inputTitle[locale]}</h3>
        <SoundInput locale={locale} input={input} disabled={working} kinds={["audio", "video"]} />
      </div>

      <div className="mt-5 space-y-2 border-t border-line pt-5">
        <PaidSubmit
          locale={locale}
          label={T.stems.split[locale]}
          icon={<Split aria-hidden="true" className="size-4" />}
          credits={job.price}
          blocker={blocker}
          status={job.status}
          demo={job.model?.demo ?? false}
          onSubmit={() => void job.start()}
        />
        <p className="type-body-sm font-semibold text-muted">{T.stems.priceHint[locale]}</p>
        <LicenseBadge tag={licenseForModel("stems")} locale={locale} detail />
      </div>

      {jobId ? (
        <div className="mt-5 space-y-3 border-t border-line pt-5" aria-live="polite">
          <h3 className="type-h4 text-ink">{T.stems.tracksTitle[locale]}</h3>
          {job.splitting ? (
            <p className="inline-flex items-center gap-2 type-body-sm font-bold text-muted">
              <Spinner size="xs" /> {T.stems.splitting[locale]}
            </p>
          ) : !stems || stems.status === "failed" || stems.status === "refunded" ? (
            <p className="type-body-sm font-black text-red-700 dark:text-red-300">{T.common.failed[locale]}</p>
          ) : stems.isMock ? (
            <p className="type-body-sm font-semibold text-muted">{T.stems.demo[locale]}</p>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {stems.tracks.map((track) => (
                  <li key={track.key} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="w-28 shrink-0 type-body-sm font-black text-ink">{T.stems.names[track.key][locale]}</span>
                    <audio src={track.url} controls preload="none" className="h-11 min-w-0 flex-1" />
                    <a href={track.url} download={`crea-${track.key}.mp3`} aria-label={`${T.common.download[locale]}: ${T.stems.names[track.key][locale]}`} className={cn("grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink", FOCUS)}>
                      <Download aria-hidden="true" className="size-4" />
                    </a>
                  </li>
                ))}
              </ul>
              <Karaoke locale={locale} tracks={stems.tracks} canSave={canSave} projectId={projectId} toolId={tool.id} parentJobId={stems.mainJobId} />
              <p className="type-body-sm font-semibold text-muted">{T.stems.inGallery[locale]}</p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** Karaoke: bubanj, bas i ostalo spojeni na uređaju (bez glasa), 0 kr. */
function Karaoke({
  locale,
  tracks,
  canSave,
  projectId,
  toolId,
  parentJobId,
}: {
  locale: CreaToolProps["locale"];
  tracks: ReadonlyArray<{ key: StemKey; url: string }>;
  canSave: boolean;
  projectId: Id<"studioProjects"> | null;
  toolId: string;
  parentJobId: Id<"generationJobs">;
}) {
  const [mix, setMix] = useState<{ url: string; blob: Blob } | null>(null);
  const [state, setState] = useState<"idle" | "working" | "saving" | "saved" | { error: string }>("idle");
  const saveLocalResult = useSaveLocalResult();

  async function make() {
    setState("working");
    try {
      const { decodeSound, mixLayers, bufferToWav } = await import("@/components/crea/zvuk/audio-render");
      const buffers = (await Promise.all(tracks.filter((track) => track.key !== "vocals").map((track) => decodeSound(track.url, 44100, 2)))).filter((buffer): buffer is AudioBuffer => buffer !== null);
      if (buffers.length === 0) throw new Error("PRAZNO");
      const durationS = Math.max(...buffers.map((buffer) => buffer.duration));
      const out = await mixLayers(buffers.map((buffer) => ({ buffer, at: 0 })), { durationS, sampleRate: 44100, channels: 2 });
      const blob = bufferToWav(out);
      setMix((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { url: URL.createObjectURL(blob), blob };
      });
      setState("idle");
    } catch {
      setState({ error: T.stems.karaokeFailed[locale] });
    }
  }

  async function save() {
    if (!mix) return;
    setState("saving");
    try {
      const result = await saveLocalResult({ toolId, kind: "audio", blob: mix.blob, params: { karaoke: true }, projectId, parentJobId });
      setState(result.ok ? "saved" : { error: creaSaveErrorMessage(result.reason, locale) });
    } catch (caught) {
      setState({ error: creaSaveErrorMessage(caught instanceof Error ? caught.message : String(caught), locale) });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" icon={<Mic2 aria-hidden="true" className="size-4" />} disabled={state === "working"} onClick={() => void make()}>
          {state === "working" ? T.common.working[locale] : T.stems.karaoke[locale]}
        </Button>
        {mix ? (
          <>
            <audio src={mix.url} controls preload="none" className="h-11 w-full max-w-xs" />
            <a href={mix.url} download="crea-karaoke.wav" className={cn("inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink", FOCUS)}>
              {T.common.downloadWav[locale]}
            </a>
            {canSave ? (
              <Button variant="secondary" disabled={state === "saving" || state === "saved"} onClick={() => void save()}>
                {state === "saved" ? T.common.saved[locale] : T.common.saveToGallery[locale]}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
      {typeof state === "object" ? (
        <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
