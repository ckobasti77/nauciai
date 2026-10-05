"use client";

import { Captions, Download, Mic, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { formatClock } from "@/components/crea/montaza/format";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { PaidSubmit } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useVideoInput, VideoInput } from "@/components/crea/tools/video-input";
import { aspectOf, downloadText, useVideoInfo, videoAsMedia } from "@/components/crea/video/picked-media";
import { TimelineStage } from "@/components/crea/video/timeline-stage";
import { useTranscriptJob } from "@/components/crea/video/use-transcript-job";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fillCopy } from "@/lib/crea-copy";
import {
  CAPTION_STYLE_LABELS,
  CAPTION_STYLES,
  cueOptionsFor,
  cuesFromText,
  cuesFromWords,
  cueText,
  regroupCues,
  replaceCueText,
  SUBTITLE_LIMITS,
  toSrt,
  toVtt,
  transliterateCues,
  type CaptionCue,
  type CaptionScript,
  type CaptionStyle,
} from "@/lib/crea-subtitles";
import { addMainClips, emptyTimeline, type CreaTimelineV1 } from "@/lib/crea-timeline";
import { CREA_FLOWS_COPY as T } from "@/lib/crea-video-flows-copy";
import type { Locale } from "@/lib/i18n";

type Source = "prepoznaj" | "napisi";

const FIELD =
  "surface-inset block w-full border-2 border-ink bg-paper px-3 py-2 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60";

/**
 * Titlovi na srpskom (Crea K21, V25): video → tekst (prepoznavanje govora `stt`,
 * ~2 kr po minutu, ili tekst koji napišeš sam - besplatno) → titlovi po
 * pravilima čitljivosti → latinica ili ćirilica, 5 stilova (i karaoke) →
 * utiskivanje u video na uređaju (0 kr) kroz isti izvoz kao Montaža, ili SRT/VTT.
 */
export default function SubtitlesTool({ tool, locale, caps, canSave, projectId, source, paid }: CreaToolProps) {
  const video = useVideoInput(source);
  const picked = video.picked;
  const info = useVideoInfo(picked);
  const media = useMemo(() => videoAsMedia(picked), [picked]);

  const [mode, setMode] = useState<Source>("prepoznaj");
  const [text, setText] = useState("");
  const [style, setStyle] = useState<CaptionStyle>("karaoke");
  const [script, setScript] = useState<CaptionScript>("lat");
  const [cues, setCues] = useState<CaptionCue[]>([]);
  const [taken, setTaken] = useState<string | null>(null);
  const [edited, setEdited] = useState<{ base: CreaTimelineV1; next: CreaTimelineV1 } | null>(null);

  // Novi video poništava titlove i posao prethodnog.
  const pickedKey = picked?.key ?? null;
  const [cuesFor, setCuesFor] = useState<string | null>(null);
  if (pickedKey !== cuesFor) {
    setCuesFor(pickedKey);
    setCues([]);
  }

  const durationS = info.status === "ready" ? info.info.durationS : null;
  const stt = useTranscriptJob({ picked, durationS, paid, projectId, locale });
  const { transcript, recognizing, status } = stt;

  // Transkript posla: kad stigne, postaje titlovi (jednom po poslu).
  if (stt.jobId && transcript?.state === "ready" && taken !== stt.jobId) {
    setTaken(stt.jobId);
    setCues(transcript.words.length > 0 ? cuesFromWords(transcript.words, cueOptionsFor(style)) : cuesFromText(transcript.text, durationS ?? 10, style));
  }

  const tooLong = durationS !== null && durationS > SUBTITLE_LIMITS.durationS;
  const base = useMemo(() => {
    if (!media || info.status !== "ready" || tooLong) return null;
    const timeline = addMainClips(emptyTimeline(aspectOf(info.info.width, info.info.height)), [
      { src: media.ref, media: "video", in: 0, out: info.info.durationS, speed: 1, volumeDb: 0, muted: false, fit: "cover" },
    ]);
    return cues.length > 0 ? { ...timeline, captions: { cues, style, script } } : timeline;
  }, [media, info, tooLong, cues, style, script]);
  const timeline = edited && base && edited.base === base ? edited.next : base;
  const files = useMemo(() => (media?.file ? [media.file] : []), [media]);

  const shown = useMemo(() => transliterateCues(cues, script), [cues, script]);
  const busy = status.name === "working" || recognizing;

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Captions aria-hidden="true" className="size-5" />} />

      <div className="mt-5 space-y-3 border-t border-line pt-5">
        <h3 className="type-h4 text-ink">{T.subVideo[locale]}</h3>
        <VideoInput locale={locale} input={video} disabled={busy} />
        {info.status === "loading" ? <p className="type-body-sm font-semibold text-muted">{T.working[locale]}</p> : null}
        {tooLong ? <p className="type-body-sm font-black text-ink">{T.subTooLong[locale]}</p> : null}
      </div>

      {picked && durationS !== null && !tooLong ? (
        <>
          <div className="mt-5 space-y-4 border-t border-line pt-5">
            <h3 className="type-h4 text-ink">{T.subText[locale]}</h3>
            <ChoiceChips<Source>
              legend={T.subSourceLegend[locale]}
              name="crea-titl-izvor"
              options={(["prepoznaj", "napisi"] as const).map((id) => ({ id, label: T.subSources[id][locale], hint: T.subSourceHints[id][locale] }))}
              value={mode}
              onChange={setMode}
              disabled={busy}
            />
            {mode === "prepoznaj" ? (
              <div className="space-y-2">
                <PaidSubmit
                  locale={locale}
                  label={T.subRecognize[locale]}
                  icon={<Mic aria-hidden="true" className="size-4" />}
                  credits={stt.price}
                  blocker={!canSave ? T.noAccess[locale] : !stt.model ? T.sttUnavailable[locale] : null}
                  status={status}
                  demo={stt.model?.demo ?? false}
                  onSubmit={() => void stt.start()}
                />
                <p className="type-body-sm font-semibold text-muted">{T.subPriceHint[locale]}</p>
                <TranscriptState locale={locale} recognizing={recognizing} state={transcript} />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block">
                  <span className="type-body-sm font-black text-ink">{T.subWriteLabel[locale]}</span>
                  <textarea
                    value={text}
                    rows={4}
                    maxLength={6000}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={T.subWritePlaceholder[locale]}
                    className={`mt-2 resize-y ${FIELD}`}
                  />
                </label>
                <Button variant="secondary" disabled={text.trim().length === 0} onClick={() => setCues(cuesFromText(text, durationS, style))} icon={<Wand2 aria-hidden="true" className="size-4" />}>
                  {T.subWriteApply[locale]}
                </Button>
              </div>
            )}
          </div>

          <div className="mt-5 space-y-4 border-t border-line pt-5">
            <h3 className="type-h4 text-ink">{T.subLook[locale]}</h3>
            <ChoiceChips<CaptionStyle>
              legend={T.styleLegend[locale]}
              name="crea-titl-stil"
              options={CAPTION_STYLES.map((id) => ({ id, label: CAPTION_STYLE_LABELS[id].label[locale], hint: CAPTION_STYLE_LABELS[id].hint[locale] }))}
              value={style}
              onChange={(next) => {
                setStyle(next);
                setCues((current) => regroupCues(current, next));
              }}
            />
            <ChoiceChips<CaptionScript>
              legend={T.scriptLegend[locale]}
              name="crea-titl-pismo"
              options={(["lat", "cyr"] as const).map((id) => ({ id, label: T.scripts[id][locale] }))}
              value={script}
              onChange={setScript}
            />
            <CueList locale={locale} cues={shown} onEdit={(index, value) => setCues((current) => replaceCueText(current, index, value))} />
            {cues.length > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" icon={<Download aria-hidden="true" className="size-4" />} onClick={() => downloadText(toSrt(shown, cueOptionsFor(style)), "crea-titlovi.srt", "application/x-subrip")}>
                    {T.subDownloadSrt[locale]}
                  </Button>
                  <Button variant="secondary" icon={<Download aria-hidden="true" className="size-4" />} onClick={() => downloadText(toVtt(shown, cueOptionsFor(style)), "crea-titlovi.vtt", "text/vtt")}>
                    {T.subDownloadVtt[locale]}
                  </Button>
                </div>
                <p className="type-body-sm font-semibold text-muted">{T.subFilesHint[locale]}</p>
              </div>
            ) : null}
          </div>

          {timeline && cues.length > 0 ? (
            <div className="mt-5 border-t border-line pt-5">
              <h3 className="sr-only">{T.subExport[locale]}</h3>
              <TimelineStage
                locale={locale}
                caps={caps}
                timeline={timeline}
                onTimelineChange={(next) => base && setEdited({ base, next })}
                files={files}
                toolId={tool.id}
                canSave={canSave}
                projectId={projectId}
                defaultPreset={timeline.aspect === "16:9" ? "youtube" : timeline.aspect === "1:1" ? "instagram" : "reels"}
                origin="rucno"
                title={picked.name}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function TranscriptState({
  locale,
  recognizing,
  state,
}: {
  locale: Locale;
  recognizing: boolean;
  state: { state: "waiting" | "failed" | "missing" } | { state: "ready"; demo: boolean } | null;
}) {
  if (recognizing) {
    return (
      <p aria-live="polite" className="inline-flex items-center gap-2 type-body-sm font-bold text-ink">
        <Spinner size="xs" />
        {T.subRecognizing[locale]}
      </p>
    );
  }
  if (!state) return null;
  if (state.state === "failed") return <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">{T.stepFailed[locale]}</p>;
  if (state.state === "missing") return <p className="type-body-sm font-semibold text-muted">{T.subTranscriptMissing[locale]}</p>;
  if (state.state === "ready" && state.demo) return <p className="type-body-sm font-semibold text-muted">{T.subTranscriptDemo[locale]}</p>;
  return null;
}

/** Spisak titlova: vreme i tekst koji se menja (vreme ostaje, prazan titl se briše). */
function CueList({ locale, cues, onEdit }: { locale: Locale; cues: readonly CaptionCue[]; onEdit: (index: number, text: string) => void }) {
  if (cues.length === 0) return <p className="type-body-sm font-semibold text-muted">{T.subNoCues[locale]}</p>;
  return (
    <div className="space-y-2">
      <p className="type-body-sm font-black text-ink">{fillCopy(T.subCues[locale], { n: cues.length })}</p>
      <p className="type-body-sm font-semibold text-muted">{T.subEditHint[locale]}</p>
      <ol className="surface-inset max-h-80 divide-y divide-line overflow-y-auto border border-line bg-paper">
        {cues.map((cue, index) => {
          const label = fillCopy(T.subCueLabel[locale], { n: index + 1, t: formatClock(cue.start, locale) });
          return (
            <li key={`${index}-${cue.start}-${cueText(cue)}`} className="flex items-start gap-3 px-3 py-2">
              <span aria-hidden="true" className="w-14 shrink-0 pt-3 font-mono text-xs font-bold text-muted">
                {formatClock(cue.start, locale)}
              </span>
              <input
                defaultValue={cueText(cue)}
                aria-label={label}
                maxLength={200}
                onBlur={(event) => {
                  if (event.target.value !== cueText(cue)) onEdit(index, event.target.value);
                }}
                className="surface-inset min-h-11 w-full min-w-0 border border-line bg-paper-strong px-3 type-body-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
