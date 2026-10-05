"use client";

import { useQuery } from "convex/react";
import { Download, FileText } from "lucide-react";
import { useMemo, useState } from "react";

import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { downloadText } from "@/components/crea/video/picked-media";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cuesFromWords, toSrt, toVtt, transliterateCues, transliterateText, type CaptionScript } from "@/lib/crea-subtitles";
import { CREA_FLOWS_COPY as T } from "@/lib/crea-video-flows-copy";
import type { Locale } from "@/lib/i18n";

/**
 * Transkript u detalju rada (Crea K21, K17-13): `stt` posao nema fajl nego tekst
 * sa vremenima reči (`creaTranscripts`). Tekst u latinici ili ćirilici i preuzimanje
 * SRT/VTT titlova; stariji rad (pre K21) kaže da transkript nije sačuvan.
 */
export function TranscriptPanel({ jobId, locale }: { jobId: Id<"generationJobs">; locale: Locale }) {
  const view = useQuery(api.creaTranscripts.getForJob, { jobId });
  const [script, setScript] = useState<CaptionScript>("lat");
  const cues = useMemo(() => (view?.state === "ready" && view.words.length > 0 ? transliterateCues(cuesFromWords(view.words), script) : []), [view, script]);

  return (
    <div className="surface-inset w-full max-w-2xl space-y-3 bg-paper-strong p-4 text-left text-ink">
      <p className="inline-flex items-center gap-2 type-h4 text-ink">
        <FileText aria-hidden="true" className="size-5" />
        {locale === "sr" ? "Transkript" : "Transcript"}
      </p>
      {view === undefined || view?.state === "waiting" ? (
        <p className="inline-flex items-center gap-2 type-body-sm font-bold text-muted">
          <Spinner size="xs" />
          {T.waiting[locale]}
        </p>
      ) : view === null || view.state === "failed" ? (
        <p className="type-body-sm font-bold text-muted">{T.stepFailed[locale]}</p>
      ) : view.state === "missing" ? (
        <p className="type-body-sm font-bold text-muted">{T.subTranscriptMissing[locale]}</p>
      ) : (
        <>
          {view.demo ? <p className="type-body-sm font-semibold text-muted">{T.subTranscriptDemo[locale]}</p> : null}
          <ChoiceChips<CaptionScript>
            legend={T.scriptLegend[locale]}
            name={`transkript-pismo-${jobId}`}
            options={(["lat", "cyr"] as const).map((id) => ({ id, label: T.scripts[id][locale] }))}
            value={script}
            onChange={setScript}
          />
          <p className="max-h-60 overflow-y-auto whitespace-pre-wrap type-body-sm font-semibold text-ink">{transliterateText(view.text, script)}</p>
          {cues.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={<Download aria-hidden="true" className="size-4" />} onClick={() => downloadText(toSrt(cues), "crea-transkript.srt", "application/x-subrip")}>
                {T.subDownloadSrt[locale]}
              </Button>
              <Button variant="secondary" icon={<Download aria-hidden="true" className="size-4" />} onClick={() => downloadText(toVtt(cues), "crea-transkript.vtt", "text/vtt")}>
                {T.subDownloadVtt[locale]}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
