"use client";

import { Download, Pause, Play, RotateCcw, Scissors, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { downloadText } from "@/components/crea/video/picked-media";
import { wavBlob } from "@/components/crea/zvuk/audio-render";
import type { PickedSound } from "@/components/crea/zvuk/sound-input";
import { AudioResultPanel, type AudioResult } from "@/components/crea/zvuk/uredjivac/result-panel";
import { formatSeconds, WorkStatus, type WorkState } from "@/components/crea/zvuk/uredjivac/ui";
import { useDecodedSound } from "@/components/crea/zvuk/uredjivac/use-decoded-sound";
import { Waveform, type WaveformHandle, type WaveMark } from "@/components/crea/zvuk/uredjivac/waveform";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import type { Id } from "@/convex/_generated/dataModel";
import { appendSource, cutRanges, emptyEdit, exportFileName } from "@/lib/crea-audio-edit";
import { CREA_AUDIO_TOOLS_COPY as T } from "@/lib/crea-audio-tools-copy";
import { fillCopy } from "@/lib/crea-copy";
import { toLocalAiError } from "@/lib/crea-local-ai/errors";
import { cuesFromWords, toSrt, toVtt, transliterateCues, transliterateText, type CaptionScript } from "@/lib/crea-subtitles";
import { clock, deletionCuts, paragraphs, remapWords, SPEAKER_LABEL, speakerNumbers, toggleWords, transcriptText, wordRange, type TranscriptWord } from "@/lib/crea-transcript-edit";
import type { Locale } from "@/lib/i18n";

const VIEW_RATE = 22050;

/**
 * Uređivanje tekstom (Crea K24, A16): reči transkripta (vreme svake reči) →
 * izbor i brisanje → isti delovi nestaju iz snimka (`deletionCuts`, na uređaju,
 * 0 kr). Tekst u latinici ili ćirilici; titlovi i tekst prate isečen snimak.
 */
export function TranscriptEditor({
  locale,
  words,
  text,
  demo,
  picked,
  maxSeconds,
  toolId,
  canSave,
  projectId,
}: {
  locale: Locale;
  words: readonly TranscriptWord[];
  text: string;
  demo: boolean;
  picked: PickedSound | null;
  maxSeconds: number;
  toolId: string;
  canSave: boolean;
  projectId: Id<"studioProjects"> | null;
}) {
  const decoded = useDecodedSound(words.length > 0 ? picked : null, { sampleRate: VIEW_RATE, channels: 1, maxSeconds });
  const ready = decoded.status === "ready" ? decoded : null;
  const duration = ready?.buffer.duration ?? (words.length > 0 ? words[words.length - 1]!.e : 0);
  const [edit, setEdit] = useState<{ deleted: Set<number>; anchor: number | null; focus: number; selected: number[] }>({ deleted: new Set(), anchor: null, focus: 0, selected: [] });
  const [script, setScript] = useState<CaptionScript>("lat");
  const [handle, setHandle] = useState<WaveformHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const [work, setWork] = useState<WorkState>({ name: "idle" });
  const [rendered, setRendered] = useState<{ cutsKey: string; result: AudioResult } | null>(null);
  const wordRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const cuts = useMemo(() => deletionCuts(words, edit.deleted, duration), [words, edit.deleted, duration]);
  const cutsKey = JSON.stringify(cuts);
  const removedS = cuts.reduce((sum, [a, b]) => sum + (b - a), 0);
  const edited = useMemo(() => (edit.deleted.size > 0 ? remapWords(words, edit.deleted, cuts) : words), [words, edit.deleted, cuts]);
  const marks = useMemo<WaveMark[]>(() => cuts.map(([start, end], index) => ({ id: `rez${index}`, start, end, tone: "cut" })), [cuts]);
  const groups = useMemo(() => paragraphs(words), [words]);
  const numbers = useMemo(() => speakerNumbers(words), [words]);
  const waveUrl = useMemo(() => (ready ? URL.createObjectURL(wavBlob([ready.buffer.getChannelData(0)], VIEW_RATE)) : null), [ready]);
  useEffect(() => () => (waveUrl ? URL.revokeObjectURL(waveUrl) : undefined), [waveUrl]);
  const result = rendered && rendered.cutsKey === cutsKey ? rendered.result : null;

  const update = (patch: Partial<typeof edit>) => setEdit({ ...edit, ...patch });

  function choose(index: number, extend: boolean) {
    const anchor = extend && edit.anchor !== null ? edit.anchor : index;
    update({ anchor, focus: index, selected: wordRange(anchor, index) });
    handle?.seek(words[index]!.s);
  }

  function toggleSelection(indices = edit.selected) {
    if (indices.length === 0) return;
    update({ deleted: toggleWords(edit.deleted, indices) });
  }

  function onWordsKey(event: KeyboardEvent<HTMLDivElement>) {
    if (words.length === 0) return;
    const move = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (move !== 0) {
      event.preventDefault();
      const next = Math.max(0, Math.min(words.length - 1, edit.focus + move));
      choose(next, event.shiftKey);
      wordRefs.current[next]?.focus();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      toggleSelection(edit.selected.length > 0 ? edit.selected : [edit.focus]);
    }
  }

  async function renderCut() {
    if (!picked || cuts.length === 0) return;
    setWork({ name: "running" });
    try {
      const [{ decodeSound }, { renderMainTrack }] = await Promise.all([import("@/components/crea/zvuk/audio-render"), import("@/components/crea/zvuk/uredjivac/render")]);
      const buffer = await decodeSound(picked.source, 44100, 2);
      if (!buffer) throw new Error("NEMA_ZVUKA");
      const doc = cutRanges(appendSource(emptyEdit(), "snimak", buffer.duration), cuts);
      const out = await renderMainTrack(doc, new Map([["snimak", buffer]]), 44100);
      if (!out) throw new Error("PRAZNO");
      setRendered({ cutsKey, result: { kind: "buffer", buffer: out } });
      setWork({ name: "idle" });
    } catch (error) {
      setWork({ name: "error", code: toLocalAiError(error, "INFERENCE_FAILED").code });
    }
  }

  const cues = useMemo(() => transliterateCues(cuesFromWords(edited), script), [edited, script]);

  return (
    <>
      {demo ? <p className="type-body-sm font-semibold text-muted">{T.transcript.demo[locale]}</p> : null}
      <ChoiceChips<CaptionScript>
        legend={T.transcript.script[locale]}
        name="transkript-pismo"
        options={(["lat", "cyr"] as const).map((id) => ({ id, label: T.transcript.scripts[id][locale] }))}
        value={script}
        onChange={setScript}
      />
          {words.length === 0 ? (
            <>
              <p className="type-body-sm font-semibold text-muted">{T.transcript.textOnly[locale]}</p>
              <p className="max-h-72 overflow-y-auto whitespace-pre-wrap type-body text-ink">{transliterateText(text, script)}</p>
            </>
          ) : (
            <>
              {waveUrl ? (
                <div className="surface-inset border border-line bg-paper p-2">
                  <Waveform url={waveUrl} label={T.transcript.waveLabel[locale]} height={80} marks={marks} handleRef={setHandle} onPlayChange={setPlaying} />
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" disabled={!handle} onClick={() => handle?.playPause()} icon={playing ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}>
                  {playing ? T.common.pause[locale] : T.common.play[locale]}
                </Button>
                <Button variant="secondary" disabled={edit.selected.length === 0} onClick={() => toggleSelection()} icon={edit.selected.length > 0 && edit.selected.every((index) => edit.deleted.has(index)) ? <Undo2 aria-hidden="true" className="size-4" /> : <Scissors aria-hidden="true" className="size-4" />}>
                  {edit.selected.length > 0 && edit.selected.every((index) => edit.deleted.has(index)) ? T.transcript.restoreSelected[locale] : T.transcript.deleteSelected[locale]}
                </Button>
                <Button variant="ghost" disabled={edit.deleted.size === 0} onClick={() => update({ deleted: new Set() })} icon={<RotateCcw aria-hidden="true" className="size-4" />}>
                  {T.transcript.restoreAll[locale]}
                </Button>
              </div>

              <div role="group" aria-label={T.transcript.wordsLabel[locale]} onKeyDown={onWordsKey} className="surface-inset max-h-[28rem] space-y-4 overflow-y-auto border border-line bg-paper p-3 sm:p-4">
                {groups.map((group) => (
                  <div key={group.from} className="space-y-1">
                    <p className="font-mono text-xs font-bold text-muted">
                      {clock(group.start)}
                      {group.speaker ? ` · ${SPEAKER_LABEL[locale]} ${numbers.get(group.speaker)}` : ""}
                    </p>
                    <p className="flex flex-wrap gap-x-0.5 type-body text-ink">
                      {words.slice(group.from, group.to + 1).map((word, offset) => {
                        const index = group.from + offset;
                        const deleted = edit.deleted.has(index);
                        const selected = edit.selected.includes(index);
                        return (
                          <button
                            key={index}
                            ref={(element) => {
                              wordRefs.current[index] = element;
                            }}
                            type="button"
                            tabIndex={index === edit.focus ? 0 : -1}
                            aria-pressed={selected}
                            onClick={(event) => choose(index, event.shiftKey)}
                            className={cn(
                              "min-h-11 rounded-full px-1.5 text-left font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink",
                              selected ? "bg-yellow text-ink" : "hover:bg-paper-strong",
                              deleted ? "text-muted line-through decoration-2" : "",
                            )}
                          >
                            {transliterateText(word.w, script)}
                          </button>
                        );
                      })}
                    </p>
                  </div>
                ))}
              </div>

              <p className="type-body-sm font-bold text-ink" aria-live="polite">
                {fillCopy(T.transcript.stats[locale], { n: edit.deleted.size, len: formatSeconds(removedS, locale) })}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={<Download aria-hidden="true" className="size-4" />} onClick={() => downloadText(toSrt(cues), exportFileName("transkript", "srt"), "application/x-subrip")}>
                  {T.transcript.downloadSrt[locale]}
                </Button>
                <Button variant="secondary" icon={<Download aria-hidden="true" className="size-4" />} onClick={() => downloadText(toVtt(cues), exportFileName("transkript", "vtt"), "text/vtt")}>
                  {T.transcript.downloadVtt[locale]}
                </Button>
                <Button variant="secondary" icon={<Download aria-hidden="true" className="size-4" />} onClick={() => downloadText(transcriptText(edited, script, locale), exportFileName("transkript", "txt"), "text/plain")}>
                  {T.transcript.downloadTxt[locale]}
                </Button>
              </div>
              {edit.deleted.size > 0 ? <p className="type-body-sm font-semibold text-muted">{T.transcript.exportNote[locale]}</p> : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void renderCut()} disabled={cuts.length === 0 || work.name === "running"} loading={work.name === "running"} icon={<Scissors aria-hidden="true" className="size-4" />}>
                  {T.transcript.render[locale]}
                </Button>
              </div>
              <WorkStatus locale={locale} state={work} />
              {result ? (
                <AudioResultPanel
                  locale={locale}
                  result={result}
                  toolId={toolId}
                  fileBase="iseceno-tekstom"
                  canSave={canSave}
                  projectId={projectId}
                  parentJobId={picked?.sourceJobId ?? null}
                  params={{ obrisanoReci: edit.deleted.size, kraceS: Math.round(removedS * 10) / 10 }}
                  openInEditor
                />
              ) : null}
            </>
          )}
    </>
  );
}
