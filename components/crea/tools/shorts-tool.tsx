"use client";

import { useAction } from "convex/react";
import { Mic, Scissors, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { newFileId } from "@/components/crea/montaza/draft-store";
import { formatClock } from "@/components/crea/montaza/format";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { PaidSubmit } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useVideoInput, VideoInput } from "@/components/crea/tools/video-input";
import { useVideoInfo } from "@/components/crea/video/picked-media";
import { TimelineStage, type StageFile } from "@/components/crea/video/timeline-stage";
import { useTranscriptJob } from "@/components/crea/video/use-transcript-job";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Moment } from "@/convex/creaLlmVideoCore";
import { fillCopy } from "@/lib/crea-copy";
import { localAiErrorMessage, toLocalAiError } from "@/lib/crea-local-ai/errors";
import { cueOptionsFor, cuesFromWords, wordsInRange, type CaptionScript } from "@/lib/crea-subtitles";
import { addMainClips, emptyTimeline, type CreaTimelineV1 } from "@/lib/crea-timeline";
import { exportLimits } from "@/lib/crea-video-caps";
import { CREA_FLOWS_COPY as T } from "@/lib/crea-video-flows-copy";

/** Najduži dug snimak (plan K17 §6.2). */
const LONG_MAX_S = 30 * 60;

type Made = { index: number; file: StageFile; durationS: number };
type Making = { index: number; percent: number; phase: "lica" | "video" } | { index: number; error: string } | null;

/**
 * Kratki klipovi iz dugog videa (Crea K21, V26): transkript (`stt`, ~2 kr po
 * minutu) → jeftin LLM bira 3-5 momenata (15-60 s, na granicama rečenica,
 * 0 kr) → izabrani moment se na uređaju iseče i prekroji na 9:16 sa licem u
 * kadru (K20 motor) → krupni titlovi iz transkripta → izvoz MP4 (0 kr). Svaki
 * klip je verzija dugog videa u galeriji.
 */
export default function ShortsTool({ tool, locale, caps, canSave, projectId, source, paid }: CreaToolProps) {
  const findMoments = useAction(api.creaLlm.findMoments);
  const video = useVideoInput(source);
  const picked = video.picked;
  const info = useVideoInfo(picked);
  const durationS = info.status === "ready" ? info.info.durationS : null;
  const stt = useTranscriptJob({ picked, durationS, paid, projectId, locale });
  const { transcript } = stt;

  const [moments, setMoments] = useState<{ forJob: string; list: Moment[]; demo: boolean } | { forJob: string; error: string } | null>(null);
  const [finding, setFinding] = useState(false);
  const [making, setMaking] = useState<Making>(null);
  const [made, setMade] = useState<Made | null>(null);
  const [script, setScript] = useState<CaptionScript>("lat");
  const [edited, setEdited] = useState<{ base: CreaTimelineV1; next: CreaTimelineV1 } | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const jobId = stt.jobId;
  const ready = transcript?.state === "ready" ? transcript : null;
  const current = moments && jobId && moments.forJob === jobId ? moments : null;
  const tooLong = durationS !== null && durationS > LONG_MAX_S;

  async function find() {
    if (!jobId || durationS === null) return;
    setFinding(true);
    try {
      const reply = await findMoments({ transcriptJobId: jobId, durationS, locale });
      setMoments(reply.ok ? { forJob: jobId, list: reply.moments, demo: reply.demo } : { forJob: jobId, error: T.llmErrors[reply.reason][locale] });
    } catch {
      setMoments({ forJob: jobId, error: T.llmErrors.GRESKA[locale] });
    } finally {
      setFinding(false);
    }
  }

  async function make(index: number, moment: Moment) {
    if (!picked) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setMade(null);
    setMaking({ index, percent: 0, phase: "lica" });
    try {
      const { cutShort } = await import("@/components/crea/video/engine/shorts-cut");
      const cut = await cutShort(picked.source, { start: moment.start, end: moment.end }, {
        maxLongSide: caps ? exportLimits(caps).maxLongSide : 1920,
        signal: controller.signal,
        onProgress: (fraction, phase) => {
          if (!controller.signal.aborted) setMaking({ index, percent: Math.round(fraction * 100), phase });
        },
      });
      const id = `kratak-${newFileId()}`;
      setMade({ index, file: { id, blob: cut.blob, name: `${moment.title}.mp4`, kind: "video" }, durationS: cut.durationS });
      setMaking(null);
    } catch (error) {
      if (controller.signal.aborted) return;
      const code = toLocalAiError(error, "INFERENCE_FAILED").code;
      setMaking({ index, error: code === "INFERENCE_FAILED" ? T.shortsFailed[locale] : localAiErrorMessage(code, locale) });
    }
  }

  const madeMoment = made && current && "list" in current ? current.list[made.index] : null;
  const base = useMemo(() => {
    if (!made || !madeMoment) return null;
    const timeline = addMainClips(emptyTimeline("9:16"), [
      { src: { localFileId: made.file.id }, media: "video", in: 0, out: made.durationS, speed: 1, volumeDb: 0, muted: false, fit: "cover", isVoice: true },
    ]);
    const words = ready ? wordsInRange(ready.words, madeMoment.start, madeMoment.end) : [];
    const cues = cuesFromWords(words, cueOptionsFor("veliki"));
    return cues.length > 0 ? { ...timeline, captions: { cues, style: "veliki" as const, script } } : timeline;
  }, [made, madeMoment, ready, script]);
  const timeline = edited && base && edited.base === base ? edited.next : base;
  const files = useMemo(() => (made ? [made.file] : []), [made]);
  const busy = stt.status.name === "working" || stt.recognizing || finding || (making !== null && !("error" in making));

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Scissors aria-hidden="true" className="size-5" />} />
      <p className="mt-3 max-w-prose type-body-sm font-semibold text-muted">{T.shortsIntro[locale]}</p>

      <div className="mt-5 space-y-3 border-t border-line pt-5">
        <h3 className="type-h4 text-ink">{T.subVideo[locale]}</h3>
        <VideoInput locale={locale} input={video} disabled={busy} />
        <p role={tooLong ? "alert" : undefined} className={tooLong ? "type-body-sm font-black text-red-700 dark:text-red-300" : "type-body-sm font-semibold text-muted"}>
          {T.shortsTooLong[locale]}
        </p>
      </div>

      {picked && durationS !== null && !tooLong ? (
        <div className="mt-5 space-y-4 border-t border-line pt-5">
          <h3 className="type-h4 text-ink">{T.subSources.prepoznaj[locale]}</h3>
          <PaidSubmit
            locale={locale}
            label={T.subRecognize[locale]}
            icon={<Mic aria-hidden="true" className="size-4" />}
            credits={stt.price}
            blocker={!canSave ? T.noAccess[locale] : !stt.model ? T.sttUnavailable[locale] : null}
            status={stt.status}
            demo={stt.model?.demo ?? false}
            onSubmit={() => void stt.start()}
          />
          {stt.recognizing ? (
            <p aria-live="polite" className="inline-flex items-center gap-2 type-body-sm font-bold text-ink">
              <Spinner size="xs" />
              {T.subRecognizing[locale]}
            </p>
          ) : null}
          {transcript?.state === "failed" ? <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">{T.stepFailed[locale]}</p> : null}
          {ready?.demo ? <p className="type-body-sm font-semibold text-muted">{T.subTranscriptDemo[locale]}</p> : null}
          {ready ? (
            <Button onClick={() => void find()} loading={finding} disabled={busy} icon={<Sparkles aria-hidden="true" className="size-4" />}>
              {finding ? T.shortsFinding[locale] : `${T.shortsFind[locale]} · ${T.free[locale]}`}
            </Button>
          ) : null}
        </div>
      ) : null}

      {current && "error" in current ? (
        <p role="alert" className="mt-4 type-body-sm font-black text-red-700 dark:text-red-300">
          {current.error}
        </p>
      ) : null}

      {current && "list" in current ? (
        <div className="mt-5 space-y-3 border-t border-line pt-5">
          <h3 className="type-h4 text-ink">{T.shortsMoments[locale]}</h3>
          {current.demo ? <p className="type-body-sm font-semibold text-muted">{T.shortsDemo[locale]}</p> : null}
          <ChoiceChips<CaptionScript>
            legend={T.scriptLegend[locale]}
            name="crea-shorts-pismo"
            options={(["lat", "cyr"] as const).map((id) => ({ id, label: T.scripts[id][locale] }))}
            value={script}
            onChange={setScript}
          />
          <ol className="divide-y divide-line">
            {current.list.map((moment, index) => {
              const state = making && making.index === index ? making : null;
              return (
                <li key={`${moment.start}-${moment.end}`} className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="type-body font-black text-ink">{moment.title}</p>
                    {moment.why ? <p className="mt-1 type-body-sm font-semibold text-muted">{moment.why}</p> : null}
                    <p className="mt-1 font-mono text-xs font-bold text-muted">
                      {formatClock(moment.start, locale)} – {formatClock(moment.end, locale)} · {fillCopy(T.shortsScore[locale], { n: moment.score })}
                    </p>
                    {state && !("error" in state) ? (
                      <p aria-live="polite" className="mt-1 type-body-sm font-bold text-ink">
                        {fillCopy(state.phase === "lica" ? T.shortsFaces[locale] : T.shortsMaking[locale], { p: state.percent })}
                      </p>
                    ) : null}
                    {state && "error" in state ? (
                      <p role="alert" className="mt-1 type-body-sm font-black text-red-700 dark:text-red-300">
                        {state.error}
                      </p>
                    ) : null}
                  </div>
                  <Button variant={made?.index === index ? "primary" : "secondary"} onClick={() => void make(index, moment)} disabled={busy} icon={<Scissors aria-hidden="true" className="size-4" />}>
                    {T.shortsMake[locale]}
                  </Button>
                </li>
              );
            })}
          </ol>
          {busy && making ? <p className="type-body-sm font-semibold text-muted">{T.keepOpen[locale]}</p> : null}
        </div>
      ) : null}

      {timeline && made ? (
        <div className="mt-5 space-y-3 border-t border-line pt-5">
          <p className="type-body-sm font-black text-ink">{T.shortsReady[locale]}</p>
          <TimelineStage
            locale={locale}
            caps={caps}
            timeline={timeline}
            onTimelineChange={(next) => base && setEdited({ base, next })}
            files={files}
            toolId={tool.id}
            canSave={canSave}
            projectId={projectId}
            defaultPreset="shorts"
            origin="shorts"
            title={madeMoment?.title ?? ""}
            parentJobId={picked?.sourceJobId ?? null}
          />
        </div>
      ) : null}
    </section>
  );
}
