"use client";

import { useMutation } from "convex/react";
import { Save, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { useJobQueue } from "@/components/crea/create/use-job-queue";
import { ToolHeader } from "@/components/crea/tool-runner";
import { PaidSubmit } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { FIELD, SampleButton, TakeAudio, useEngineChoices, useJobStates, useSamplePlayer, voiceLabel } from "@/components/crea/zvuk/voice-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { jobCredits } from "@/lib/crea-job-price";
import { CREA_VOICE_COPY as T } from "@/lib/crea-voice-copy";
import { buildSpeechJob, DEFAULT_VOICE_SETTINGS, speechChars, VOICE_DESCRIBE_MAX } from "@/lib/crea-voice-tags";
import { suggestVoices, type CreaVoice } from "@/lib/crea-voices";
import { studioErrorMessage } from "@/lib/studio-messages";

type Preview = { voice: CreaVoice; jobId: Id<"generationJobs"> | null; saved: boolean };

/**
 * Dizajniraj glas (Crea K22, A8; plan K06 §5.3): opis rečima → 3 Gemini glasa koji
 * najviše liče na opis (`suggestVoices`, bez LLM-a) → po jedan kratak predlog sa
 * opisom kao stilom (plaćeno, ~1 kr) → „Sačuvaj ovaj glas" = podešavanje (glas +
 * opis). Nov glas se ne trenira.
 */
export default function DesignTool({ tool, locale, canSave, projectId, paid }: CreaToolProps) {
  const savePreset = useMutation(api.creaVoices.saveVoicePreset);
  const player = useSamplePlayer(canSave);
  const choice = useEngineChoices(paid).find((entry) => entry.engine === "gemini")?.choice ?? null;
  const [description, setDescription] = useState("");
  const [previewText, setPreviewText] = useState<string>(T.designPreviewDefault[locale]);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const suggested = useMemo(() => suggestVoices(description, "gemini", 3), [description]);
  const settings = useMemo(() => ({ ...DEFAULT_VOICE_SETTINGS, describe: description.trim().slice(0, VOICE_DESCRIBE_MAX) }), [description]);
  const jobs = suggested.map((voice) => buildSpeechJob({ engine: "gemini", voiceId: voice.id, text: previewText, settings }));
  const credits = paid
    ? jobs.reduce<number | null>((sum, job) => {
        const price = jobCredits({ ...job, measured: { char_count: speechChars(job) } }, paid.catalog);
        return sum === null || price === null ? null : sum + price;
      }, 0)
    : null;

  const onQueueError = useCallback((message: string) => setError(studioErrorMessage(message, locale)), [locale]);
  const { enqueue, waiting } = useJobQueue(onQueueError);
  const states = useJobStates(previews.flatMap((preview) => (preview.jobId ? [preview.jobId] : [])));
  const busy = waiting > 0 || previews.some((preview) => !preview.jobId || ["reserved", "running", "queued"].includes(states?.[preview.jobId]?.status ?? "reserved"));

  const blocker = !canSave
    ? T.noAccess[locale]
    : !choice
      ? T.modelMissing[locale]
      : description.trim().length === 0 || previewText.trim().length === 0
        ? T.designEmpty[locale]
        : previews.length > 0 && busy
          ? T.working[locale]
          : null;

  function make() {
    setError(null);
    setSaveError(null);
    const voices = [...suggested];
    setPreviews(voices.map((voice) => ({ voice, jobId: null, saved: false })));
    enqueue(
      jobs.map((job, index) => ({
        args: { modelSlug: job.modelSlug, params: JSON.stringify(job.params), inputMode: job.inputMode, inputs: JSON.stringify({}), ...(projectId ? { projectId } : {}) },
        onCreated: (jobId: Id<"generationJobs">) =>
          setPreviews((current) => current.map((preview) => (preview.voice.id === voices[index]!.id ? { ...preview, jobId } : preview))),
      })),
    );
  }

  async function keep(voice: CreaVoice) {
    setSaveError(null);
    const reply = await savePreset({ name: description.trim().slice(0, 40) || voice.id, engine: "gemini", voiceId: voice.id, settings: JSON.stringify(settings) }).catch(() => null);
    if (!reply || !reply.ok) {
      setSaveError(T.presetErrors[reply && !reply.ok ? reply.reason : "LIMIT"][locale]);
      return;
    }
    setPreviews((current) => current.map((preview) => (preview.voice.id === voice.id ? { ...preview, saved: true } : preview)));
  }

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Sparkles aria-hidden="true" className="size-5" />} />

      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <label className="block">
          <span className="type-body font-black text-ink">{T.designLegend[locale]}</span>
          <input
            value={description}
            maxLength={VOICE_DESCRIBE_MAX}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={T.designPlaceholder[locale]}
            className={cn(FIELD, "mt-2 min-h-11")}
          />
        </label>
        <ul className="flex flex-wrap gap-2">
          {T.designExamples.map((example) => (
            <li key={example.sr}>
              <button
                type="button"
                onClick={() => setDescription(example[locale])}
                className="min-h-11 rounded-full border-2 border-ink/25 bg-paper px-4 text-sm font-black text-ink hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {example[locale]}
              </button>
            </li>
          ))}
        </ul>
        <p className="type-body-sm font-semibold text-muted">{T.designNote[locale]}</p>

        <div>
          <h3 className="type-body font-black text-ink">{T.designSuggested[locale]}</h3>
          <ol className="mt-2 divide-y divide-line">
            {suggested.map((voice) => (
              <li key={voice.id} className="flex flex-wrap items-center gap-3 py-2">
                <SampleButton voice={voice} player={player} locale={locale} />
                <span className="min-w-0 flex-1 type-body-sm font-black text-ink">{voiceLabel(voice, locale)}</span>
              </li>
            ))}
          </ol>
        </div>

        <label className="block">
          <span className="type-body-sm font-black text-ink">{T.designPreviewText[locale]}</span>
          <input value={previewText} maxLength={200} onChange={(event) => setPreviewText(event.target.value)} className={cn(FIELD, "mt-1 min-h-11")} />
        </label>

        <PaidSubmit
          locale={locale}
          label={T.designMake[locale]}
          icon={<Sparkles aria-hidden="true" className="size-4" />}
          credits={credits}
          blocker={blocker}
          status={error ? { name: "error", message: error } : { name: "idle" }}
          demo={choice?.demo ?? false}
          onSubmit={make}
        />
      </div>

      {previews.length > 0 ? (
        <div className="mt-5 space-y-2 border-t border-line pt-5" aria-live="polite">
          <ol className="divide-y divide-line">
            {previews.map((preview) => {
              const state = preview.jobId ? states?.[preview.jobId] : undefined;
              const ready = state?.status === "done";
              return (
                <li key={preview.voice.id} className="space-y-2 py-3">
                  <p className="type-body-sm font-black text-ink">{voiceLabel(preview.voice, locale)}</p>
                  <TakeAudio locale={locale} state={state} />
                  {preview.saved ? (
                    <p className="type-body-sm font-black text-ink">{T.designKept[locale]}</p>
                  ) : (
                    <Button variant="secondary" disabled={!ready} onClick={() => void keep(preview.voice)} icon={<Save aria-hidden="true" className="size-4" />}>
                      {T.designKeep[locale]}
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
          {saveError ? (
            <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
              {saveError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
