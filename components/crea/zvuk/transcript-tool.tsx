"use client";

import { FileText } from "lucide-react";

import { ToolHeader } from "@/components/crea/tool-runner";
import { PaidSubmit } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { SoundInput, useSoundInput } from "@/components/crea/zvuk/sound-input";
import { useSoundSeconds } from "@/components/crea/zvuk/use-sound-upload";
import { useTranscribe } from "@/components/crea/zvuk/use-transcribe";
import { TranscriptEditor } from "@/components/crea/zvuk/uredjivac/transcript-editor";
import { ToolSection, WorkStatus } from "@/components/crea/zvuk/uredjivac/ui";
import { EDITOR_MAX_SECONDS } from "@/lib/crea-audio-edit";
import { CREA_AUDIO_TOOLS_COPY as T } from "@/lib/crea-audio-tools-copy";
import { classifyDevice } from "@/lib/crea-device";

/**
 * Transkript i uređivanje tekstom (Crea K24, A16): postojeći `stt` (Scribe V2,
 * govornici i vreme svake reči, po minutu) → tekst u latinici ili ćirilici →
 * obrišeš reči → isti delovi nestaju iz snimka (rez po vremenima reči, na uređaju,
 * 0 kr). Titlovi (SRT/VTT) i tekst prate isečen snimak.
 */
export default function TranscriptTool({ tool, locale, caps, canSave, projectId, paid, source }: CreaToolProps) {
  const input = useSoundInput(source);
  const { picked } = input;
  const seconds = useSoundSeconds(picked);
  const recognition = useTranscribe({ picked, seconds, paid, projectId, locale });
  const view = recognition.transcript;
  const maxSeconds = EDITOR_MAX_SECONDS[caps ? classifyDevice(caps) : "desktop"];

  const blocker = !canSave ? T.result.noAccess[locale] : !recognition.model ? null : !picked ? T.common.pickSound[locale] : recognition.status.name === "working" ? T.common.working[locale] : null;

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<FileText aria-hidden="true" className="size-5" />} />

      <ToolSection title={T.transcript.inputTitle[locale]} id="transkript-ulaz">
        <SoundInput locale={locale} input={input} disabled={recognition.status.name === "working"} kinds={["audio", "video"]} />
        {recognition.model ? (
          <PaidSubmit
            locale={locale}
            label={T.transcript.recognize[locale]}
            icon={<FileText aria-hidden="true" className="size-4" />}
            credits={recognition.price}
            blocker={blocker}
            status={recognition.status}
            demo={recognition.model.demo}
            onSubmit={() => void recognition.start()}
          />
        ) : null}
        <p className="type-body-sm font-semibold text-muted">{T.transcript.priceHint[locale]}</p>
        {recognition.recognizing ? <WorkStatus locale={locale} state={{ name: "running", label: T.transcript.waiting[locale] }} /> : null}
        {view?.state === "failed" ? <p className="type-body-sm font-black text-red-700 dark:text-red-300">{T.transcript.failed[locale]}</p> : null}
      </ToolSection>

      {view?.state === "ready" ? (
        <ToolSection title={T.transcript.wordsLabel[locale]} hint={view.words.length > 0 ? T.transcript.editHint[locale] : undefined} id="transkript-reci">
          <TranscriptEditor
            key={recognition.jobId ?? "transkript"}
            locale={locale}
            words={view.words}
            text={view.text}
            demo={view.demo}
            picked={picked}
            maxSeconds={maxSeconds}
            toolId={tool.id}
            canSave={canSave}
            projectId={projectId}
          />
        </ToolSection>
      ) : null}
    </section>
  );
}
