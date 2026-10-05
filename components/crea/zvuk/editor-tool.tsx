"use client";

import { Crop, Merge, Mic, Minus, Pause, Play, Plus, Redo2, Scissors, SlidersHorizontal, Sparkles, Undo2, Wand2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { wavBlob } from "@/components/crea/zvuk/audio-render";
import { SoundInput, useSoundInput, type PickedSound } from "@/components/crea/zvuk/sound-input";
import { FxPanel } from "@/components/crea/zvuk/uredjivac/fx-panel";
import type { FinalRender } from "@/components/crea/zvuk/uredjivac/render";
import { AudioResultPanel, type AudioResult } from "@/components/crea/zvuk/uredjivac/result-panel";
import { TracksPanel } from "@/components/crea/zvuk/uredjivac/tracks-panel";
import { FOCUS, formatNumber, formatSeconds, RangeField, ToolSection, WorkStatus, type WorkState } from "@/components/crea/zvuk/uredjivac/ui";
import { useDecodedSound } from "@/components/crea/zvuk/uredjivac/use-decoded-sound";
import { useLiveFx } from "@/components/crea/zvuk/uredjivac/use-live-fx";
import { Waveform, type WaveformHandle, type WaveSelection } from "@/components/crea/zvuk/uredjivac/waveform";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import type { Id } from "@/convex/_generated/dataModel";
import {
  addExtra,
  appendSource,
  DEFAULT_FX,
  cutRanges,
  EDIT_LIMITS,
  EDITOR_MAX_SECONDS,
  EDITOR_SAMPLE_RATE,
  emptyEdit,
  historyPush,
  historyRedo,
  historyStart,
  historyUndo,
  keepRange,
  mainDuration,
  removedSeconds,
  removeExtra,
  setFades,
  setFx,
  updateExtra,
  type AudioEditDoc,
  type AudioFx,
  type EditHistory,
} from "@/lib/crea-audio-edit";
import { CREA_AUDIO_TOOLS_COPY as T } from "@/lib/crea-audio-tools-copy";
import { fillCopy } from "@/lib/crea-copy";
import { classifyDevice } from "@/lib/crea-device";
import type { LoudnessTargetId } from "@/lib/crea-loudness";
import { toLocalAiError } from "@/lib/crea-local-ai/errors";
import { creaShellQuery } from "@/lib/crea-shell";
import { silenceCuts, SILENCE_PRESETS, speechSegments, totalSeconds, type SilencePresetId } from "@/lib/crea-silence";

type Source = { buffer: AudioBuffer; name: string; jobId: Id<"generationJobs"> | null };
type AddMode = "spoji" | "traka" | null;
const ZOOMS = [0, 25, 60, 150, 400] as const;
const MAIN_SOURCE = "s1";

function monoOf(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const out = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < out.length; index++) out[index]! += data[index]! / buffer.numberOfChannels;
  }
  return out;
}

const formatDb = (value: number, locale: "sr" | "en") =>
  Number.isFinite(value) ? value.toLocaleString(locale === "sr" ? "sr-Latn" : "en", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace("-", "−") : "−∞";

/**
 * Uređivač zvuka (Crea K24, A14): talas sa izborom (wavesurfer + regioni), seci /
 * zadrži / spoji, pretapanje na početku i kraju, skraćivanje pauza (Silero VAD),
 * boja zvuka, kompresor, odjek, brzina i visina (uživo dok sluša), trake ispod
 * govora koje se same utišaju, glasnoća za mreže (−14 LUFS po BS.1770) i izvoz
 * MP3/WAV ili u galeriju - sve na uređaju, 0 kr. Izmene su nedestruktivne
 * (`lib/crea-audio-edit.ts`), sa poništi/ponovi.
 */
export default function EditorTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const maxSeconds = EDITOR_MAX_SECONDS[caps ? classifyDevice(caps) : "desktop"];
  const mainInput = useSoundInput(source);
  const mainDecoded = useDecodedSound(mainInput.picked, { sampleRate: EDITOR_SAMPLE_RATE, channels: 2, maxSeconds });

  const [sources, setSources] = useState<{ key: string | null; map: Map<string, Source> }>({ key: null, map: new Map() });
  const [history, setHistory] = useState<EditHistory<AudioEditDoc> | null>(null);
  // Nov glavni snimak = nov dokument (staro uređivanje se ne meša sa novim snimkom).
  if (mainDecoded.status === "ready" && sources.key !== mainDecoded.key) {
    const picked = mainInput.picked;
    setSources({ key: mainDecoded.key, map: new Map([[MAIN_SOURCE, { buffer: mainDecoded.buffer, name: picked?.name ?? "", jobId: picked?.sourceJobId ?? null }]]) });
    setHistory(historyStart(appendSource(emptyEdit(), MAIN_SOURCE, mainDecoded.buffer.duration)));
  }
  const ready = mainDecoded.status === "ready" && sources.key === mainDecoded.key && history !== null;
  const doc = ready ? history.present : null;
  const buffers = useMemo(() => new Map([...sources.map].map(([id, entry]) => [id, entry.buffer])), [sources]);
  const names = useMemo(() => new Map([...sources.map].map(([id, entry]) => [id, entry.name])), [sources]);
  const duration = doc ? mainDuration(doc) : 0;

  const lastFx = useRef(0);
  const commit = useCallback((next: (current: AudioEditDoc) => AudioEditDoc) => {
    lastFx.current = 0;
    setHistory((current) => (current ? historyPush(current, next(current.present)) : current));
  }, []);
  // Klizač efekata pravi mnogo malih izmena: one u istoj sekundi su jedan korak „poništi".
  const commitFx = useCallback((patch: Partial<AudioFx>) => {
    const now = performance.now();
    const merge = now - lastFx.current < 1000;
    lastFx.current = now;
    setHistory((current) => {
      if (!current) return current;
      const next = setFx(current.present, patch);
      return merge ? { ...current, present: next } : historyPush(current, next);
    });
  }, []);

  // Talas zavisi samo od isečaka i pretapanja - efekti se čuju uživo, bez novog učitavanja.
  const trackKey = doc ? JSON.stringify([doc.main, doc.fadeIn, doc.fadeOut]) : null;
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  });

  // Talas glavne trake (mono WAV, ~0,2 s posle izmene) - njega sluša i pregled efekata.
  const [preview, setPreview] = useState<{ key: string; url: string } | null>(null);
  const previewUrl = useRef<string | null>(null);
  useEffect(() => {
    const current = docRef.current;
    if (!current || !trackKey) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      void import("@/components/crea/zvuk/uredjivac/render").then(async ({ renderMainTrack }) => {
        const buffer = await renderMainTrack(current, buffers, EDITOR_SAMPLE_RATE);
        if (!alive || !buffer) return;
        const url = URL.createObjectURL(wavBlob([monoOf(buffer)], buffer.sampleRate));
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = url;
        setPreview({ key: trackKey, url });
      });
    }, 150);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [trackKey, buffers]);
  useEffect(() => () => (previewUrl.current ? URL.revokeObjectURL(previewUrl.current) : undefined), []);

  // Izbor (vreme trake) važi samo za dokument na kome je napravljen.
  const [selectionState, setSelectionState] = useState<{ key: string; selection: WaveSelection } | null>(null);
  const selection = selectionState && selectionState.key === trackKey ? selectionState.selection : null;
  const setSelection = (next: WaveSelection | null) => setSelectionState(next && trackKey ? { key: trackKey, selection: next } : null);

  const [handle, setHandle] = useState<WaveformHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [zoom, setZoom] = useState(0);
  useLiveFx(handle?.media() ?? null, doc?.fx ?? DEFAULT_FX);

  // Prečice: razmak, Delete, Ctrl+Z / Ctrl+Y (ne dok se kuca u polje).
  const keyState = useRef({ handle, selection, doc });
  useEffect(() => {
    keyState.current = { handle, selection, doc };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, a, [contenteditable]")) return;
      const { handle: wave, selection: chosen } = keyState.current;
      if (event.key === " " && wave) {
        event.preventDefault();
        wave.playPause();
      } else if ((event.key === "Delete" || event.key === "Backspace") && chosen) {
        event.preventDefault();
        commit((current) => cutRanges(current, [[chosen.start, chosen.end]]));
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        setHistory((current) => (current ? (event.shiftKey ? historyRedo(current) : historyUndo(current)) : current));
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        setHistory((current) => (current ? historyRedo(current) : current));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit]);

  // Dodavanje: „spoji" ili „traka" - panel je otvoren najviše jedan (jedna meta prevlačenja).
  const [adding, setAdding] = useState<{ mode: Exclude<AddMode, null>; session: number } | null>(null);
  const addMode: AddMode = adding?.mode ?? null;
  const addSessions = useRef(0);
  const openAdd = (mode: Exclude<AddMode, null>) => setAdding({ mode, session: ++addSessions.current });
  const closeAdd = () => setAdding(null);
  const [addNote, setAddNote] = useState<string | null>(null);
  // Id-jevi izvora su jedinstveni u sesiji (`s1` je glavni snimak).
  const sourceCounter = useRef(1);
  const [addWork, setAddWork] = useState<WorkState>({ name: "idle" });

  const addSound = useCallback(
    async (mode: Exclude<AddMode, null>, picked: PickedSound) => {
      setAddWork({ name: "running" });
      try {
        const { decodeSound } = await import("@/components/crea/zvuk/audio-render");
        const buffer = await decodeSound(picked.source, EDITOR_SAMPLE_RATE, 2);
        if (!buffer) throw new Error("NEMA_ZVUKA");
        if (buffer.duration > maxSeconds + 1) {
          setAddWork({ name: "error", code: "TOO_HEAVY", message: fillCopy(T.common.tooLong[locale], { max: formatSeconds(maxSeconds, locale) }) });
          return;
        }
        const id = `s${++sourceCounter.current}`;
        setSources((current) => {
          const map = new Map(current.map);
          map.set(id, { buffer, name: picked.name, jobId: picked.sourceJobId ?? null });
          return { ...current, map };
        });
        commit((current) => (mode === "spoji" ? appendSource(current, id, buffer.duration) : addExtra(current, id, buffer.duration)));
        setAddNote(mode === "spoji" ? fillCopy(T.editor.joined[locale], { len: formatSeconds(buffer.duration, locale) }) : null);
        setAdding(null);
        setAddWork({ name: "idle" });
      } catch (error) {
        setAddWork({ name: "error", code: toLocalAiError(error, "INFERENCE_FAILED").code });
      }
    },
    [commit, locale, maxSeconds],
  );

  // Pauze (Silero na uređaju ili po jačini).
  const [pauseMethod, setPauseMethod] = useState<"silero" | "jacina">("silero");
  const [pauseStrength, setPauseStrength] = useState<SilencePresetId>("srednje");
  const [pauseWork, setPauseWork] = useState<WorkState>({ name: "idle" });
  const [pauseNote, setPauseNote] = useState<string | null>(null);
  const pauseAbort = useRef<AbortController | null>(null);
  useEffect(() => () => pauseAbort.current?.abort(), []);

  async function shortenPauses() {
    if (!doc) return;
    pauseAbort.current?.abort();
    const controller = new AbortController();
    pauseAbort.current = controller;
    setPauseNote(null);
    setPauseWork(pauseMethod === "silero" ? { name: "downloading", percent: null } : { name: "running" });
    try {
      const [{ renderMainTrack }, { speechMap }] = await Promise.all([import("@/components/crea/zvuk/uredjivac/render"), import("@/components/crea/zvuk/uredjivac/vad")]);
      const buffer = await renderMainTrack(doc, buffers, 16000);
      if (!buffer) return;
      const map = await speechMap(buffer, {
        method: pauseMethod,
        signal: controller.signal,
        onDownload: (progress) => setPauseWork({ name: "downloading", percent: progress.percent }),
        onProgress: (fraction) => setPauseWork({ name: "running", percent: Math.round(fraction * 100) }),
      });
      const cuts = silenceCuts(speechSegments(map.probabilities, map.frameS), buffer.duration, SILENCE_PRESETS[pauseStrength]);
      if (cuts.length === 0) {
        setPauseNote(T.editor.pausesNone[locale]);
      } else {
        const next = cutRanges(doc, cuts);
        setHistory((current) => (current ? historyPush(current, next) : current));
        setPauseNote(fillCopy(T.editor.pausesDone[locale], { len: formatSeconds(removedSeconds(doc, next) || totalSeconds(cuts), locale), method: T.editor.methodUsed[map.method][locale] }));
      }
      setPauseWork({ name: "idle" });
    } catch (error) {
      setPauseWork({ name: "error", code: toLocalAiError(error, "INFERENCE_FAILED").code });
    }
  }

  // Konačan zvuk.
  const [finalWork, setFinalWork] = useState<WorkState>({ name: "idle" });
  const [final, setFinal] = useState<{ doc: AudioEditDoc; render: FinalRender; result: AudioResult } | null>(null);
  async function makeFinal() {
    if (!doc) return;
    setFinalWork({ name: "running", label: T.editor.steps.traka[locale] });
    try {
      const { renderFinal } = await import("@/components/crea/zvuk/uredjivac/render");
      const render = await renderFinal(doc, buffers, EDITOR_SAMPLE_RATE, (step) => setFinalWork({ name: "running", label: T.editor.steps[step][locale] }));
      if (!render) return setFinalWork({ name: "idle" });
      setFinal({ doc, render, result: { kind: "buffer", buffer: render.buffer } });
      setFinalWork({ name: "idle" });
    } catch (error) {
      setFinalWork({ name: "error", code: toLocalAiError(error, "INFERENCE_FAILED").code });
    }
  }

  const busy = addWork.name === "running" || pauseWork.name === "running" || pauseWork.name === "downloading" || finalWork.name === "running";
  const mainSource = sources.map.get(MAIN_SOURCE);
  const recorderHref = `${pathname}?${creaShellQuery({ area: "zvuk", mode: "uredjivac", tool: "zvuk.snimac" }, searchParams)}`;
  const updateFx = commitFx;

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<SlidersHorizontal aria-hidden="true" className="size-5" />} />

      <ToolSection title={T.editor.inputTitle[locale]} id="uredjivac-ulaz">
        <SoundInput locale={locale} input={mainInput} disabled={busy || addMode !== null} kinds={["audio", "video"]} />
        {!ready ? (
          <Link href={recorderHref} className={cn("inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink", FOCUS)}>
            <Mic aria-hidden="true" className="size-4" />
            {T.editor.recordLink[locale]}
          </Link>
        ) : null}
        {mainDecoded.status === "loading" ? <WorkStatus locale={locale} state={{ name: "running", label: T.editor.loading[locale] }} /> : null}
        {mainDecoded.status === "tooLong" ? <p className="type-body-sm font-black text-red-700 dark:text-red-300">{fillCopy(T.common.tooLong[locale], { max: formatSeconds(maxSeconds, locale) })}</p> : null}
        {mainDecoded.status === "empty" ? <p className="type-body-sm font-black text-muted">{T.common.noSound[locale]}</p> : null}
        {mainDecoded.status === "error" ? <p className="type-body-sm font-black text-red-700 dark:text-red-300">{T.common.failed[locale]}</p> : null}
      </ToolSection>

      {doc && history ? (
        <>
          <ToolSection title={T.editor.trackTitle[locale]} hint={T.editor.livePreview[locale]} id="uredjivac-traka">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => handle?.playPause()} disabled={!preview} icon={playing ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}>
                {playing ? T.common.pause[locale] : T.common.play[locale]}
              </Button>
              <p className="font-mono type-body-sm font-black text-ink">
                {formatSeconds(time, locale, true)} / {formatSeconds(duration, locale, true)}
              </p>
              <span className="flex-1" />
              <Button variant="secondary" disabled={history.past.length === 0 || busy} onClick={() => setHistory(historyUndo(history))} icon={<Undo2 aria-hidden="true" className="size-4" />}>
                {T.editor.undo[locale]}
              </Button>
              <Button variant="secondary" disabled={history.future.length === 0 || busy} onClick={() => setHistory(historyRedo(history))} icon={<Redo2 aria-hidden="true" className="size-4" />}>
                {T.editor.redo[locale]}
              </Button>
              <button type="button" aria-label={T.editor.zoomOut[locale]} disabled={zoom === 0} onClick={() => setZoom((value) => Math.max(0, value - 1))} className={cn("grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink disabled:opacity-50", FOCUS)}>
                <Minus aria-hidden="true" className="size-4" />
              </button>
              <button type="button" aria-label={T.editor.zoomIn[locale]} disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((value) => Math.min(ZOOMS.length - 1, value + 1))} className={cn("grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink disabled:opacity-50", FOCUS)}>
                <Plus aria-hidden="true" className="size-4" />
              </button>
            </div>

            <div className="surface-inset border border-line bg-paper p-2">
              {preview ? (
                <Waveform
                  url={preview.url}
                  label={T.editor.waveLabel[locale]}
                  height={128}
                  selectable
                  selection={selection}
                  onSelection={setSelection}
                  handleRef={setHandle}
                  onPlayChange={setPlaying}
                  onTime={(seconds) => setTime((old) => (Math.abs(old - seconds) >= 0.1 ? seconds : old))}
                  onReady={() => {
                    try {
                      handle?.zoom(ZOOMS[zoom]);
                    } catch {
                      // Talas još nije spreman.
                    }
                  }}
                />
              ) : (
                <div className="h-32" />
              )}
            </div>
            <ZoomSync handle={handle} pxPerSec={ZOOMS[zoom]} />

            <div className="flex flex-wrap items-end gap-3">
              <NumberField label={T.editor.from[locale]} value={selection?.start ?? null} max={duration} onChange={(start) => setSelection({ start, end: Math.max(start + 0.05, selection?.end ?? Math.min(duration, start + 1)) })} />
              <NumberField label={T.editor.to[locale]} value={selection?.end ?? null} max={duration} onChange={(end) => setSelection({ start: Math.min(selection?.start ?? 0, end - 0.05), end })} />
              <p className="min-h-11 content-center type-body-sm font-bold text-ink" aria-live="polite">
                {selection ? fillCopy(T.editor.selected[locale], { len: formatSeconds(selection.end - selection.start, locale) }) : T.editor.selectHint[locale]}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={!selection || busy} onClick={() => selection && commit((current) => cutRanges(current, [[selection.start, selection.end]]))} icon={<Scissors aria-hidden="true" className="size-4" />}>
                {T.editor.cut[locale]}
              </Button>
              <Button variant="secondary" disabled={!selection || busy} onClick={() => selection && commit((current) => keepRange(current, selection.start, selection.end))} icon={<Crop aria-hidden="true" className="size-4" />}>
                {T.editor.keep[locale]}
              </Button>
              <Button variant="ghost" disabled={!selection} onClick={() => setSelection(null)} icon={<X aria-hidden="true" className="size-4" />}>
                {T.editor.clearSelection[locale]}
              </Button>
            </div>
          </ToolSection>

          <ToolSection title={T.editor.joinTitle[locale]} hint={T.editor.joinHint[locale]} id="uredjivac-spoji">
            {adding?.mode === "spoji" ? (
              <AddSoundPanel key={adding.session} locale={locale} disabled={addWork.name === "running"} onPick={(picked) => void addSound("spoji", picked)} />
            ) : (
              <Button variant="secondary" disabled={busy || doc.main.length >= EDIT_LIMITS.clips} onClick={() => openAdd("spoji")} icon={<Merge aria-hidden="true" className="size-4" />}>
                {T.editor.joinAdd[locale]}
              </Button>
            )}
            {addMode === "spoji" ? (
              <Button variant="ghost" onClick={closeAdd} icon={<X aria-hidden="true" className="size-4" />}>
                {T.common.cancel[locale]}
              </Button>
            ) : null}
            {addMode === "spoji" ? <WorkStatus locale={locale} state={addWork} /> : null}
            {addNote ? <p className="type-body-sm font-bold text-ink">{addNote}</p> : null}
          </ToolSection>

          <ToolSection title={T.editor.pausesTitle[locale]} hint={T.editor.pausesHint[locale]} id="uredjivac-pauze">
            <ChoiceChips<"silero" | "jacina">
              legend={T.editor.pausesMethod[locale]}
              name="uredjivac-pauze-nacin"
              options={(["silero", "jacina"] as const).map((id) => ({ id, label: T.editor.methods[id].label[locale], hint: T.editor.methods[id].hint[locale] }))}
              value={pauseMethod}
              onChange={setPauseMethod}
              disabled={busy}
            />
            <ChoiceChips<SilencePresetId>
              legend={T.editor.pausesStrength[locale]}
              name="uredjivac-pauze-jacina"
              options={(Object.keys(SILENCE_PRESETS) as SilencePresetId[]).map((id) => ({ id, label: T.editor.strengths[id][locale] }))}
              value={pauseStrength}
              onChange={setPauseStrength}
              disabled={busy}
            />
            <Button variant="secondary" disabled={busy} onClick={() => void shortenPauses()} icon={<Wand2 aria-hidden="true" className="size-4" />}>
              {T.editor.pausesRun[locale]}
            </Button>
            <WorkStatus locale={locale} state={pauseWork} onCancel={() => pauseAbort.current?.abort()} />
            {pauseNote ? (
              <p className="type-body-sm font-bold text-ink" aria-live="polite">
                {pauseNote}
              </p>
            ) : null}
          </ToolSection>

          <ToolSection title={T.editor.fadesTitle[locale]} id="uredjivac-krajevi">
            <RangeField label={T.editor.fadeIn[locale]} value={doc.fadeIn} min={0} max={Math.min(EDIT_LIMITS.fadeS, Math.floor(duration / 2))} step={0.5} disabled={busy} format={(value) => formatNumber(value, locale, 1)} onChange={(value) => commit((current) => setFades(current, value, current.fadeOut))} />
            <RangeField label={T.editor.fadeOut[locale]} value={doc.fadeOut} min={0} max={Math.min(EDIT_LIMITS.fadeS, Math.floor(duration / 2))} step={0.5} disabled={busy} format={(value) => formatNumber(value, locale, 1)} onChange={(value) => commit((current) => setFades(current, current.fadeIn, value))} />
          </ToolSection>

          <ToolSection title={T.editor.fxTitle[locale]} id="uredjivac-zvuk">
            <FxPanel locale={locale} fx={doc.fx} onChange={updateFx} disabled={busy} />
          </ToolSection>

          <ToolSection title={T.editor.tracksTitle[locale]} hint={T.editor.tracksHint[locale]} id="uredjivac-trake">
            <TracksPanel
              locale={locale}
              tracks={doc.extras}
              names={names}
              mainDuration={duration}
              disabled={busy}
              onChange={(id, patch) => commit((current) => updateExtra(current, id, patch))}
              onRemove={(id) => commit((current) => removeExtra(current, id))}
            />
            {addMode === "traka" ? (
              <>
                <AddSoundPanel key={adding?.session} locale={locale} disabled={addWork.name === "running"} onPick={(picked) => void addSound("traka", picked)} />
                <Button variant="ghost" onClick={closeAdd} icon={<X aria-hidden="true" className="size-4" />}>
                  {T.common.cancel[locale]}
                </Button>
                <WorkStatus locale={locale} state={addWork} />
              </>
            ) : doc.extras.length < EDIT_LIMITS.extras ? (
              <Button variant="secondary" disabled={busy} onClick={() => openAdd("traka")} icon={<Plus aria-hidden="true" className="size-4" />}>
                {T.editor.trackAdd[locale]}
              </Button>
            ) : (
              <p className="type-body-sm font-semibold text-muted">{fillCopy(T.editor.trackFull[locale], { n: EDIT_LIMITS.extras })}</p>
            )}
          </ToolSection>

          <ToolSection title={T.editor.loudnessTitle[locale]} hint={T.editor.loudnessHint[locale]} id="uredjivac-glasnoca">
            <ChoiceChips<LoudnessTargetId>
              legend={T.editor.loudnessTarget[locale]}
              name="uredjivac-glasnoca"
              options={(["mreze", "podkast", "isto"] as const).map((id) => ({ id, label: T.editor.loudness[id].label[locale], hint: T.editor.loudness[id].hint[locale] }))}
              value={doc.loudness}
              onChange={(loudness) => commit((current) => ({ ...current, loudness }))}
              disabled={busy}
            />
          </ToolSection>

          <ToolSection title={T.editor.finalTitle[locale]} id="uredjivac-konacno">
            <Button onClick={() => void makeFinal()} disabled={busy} loading={finalWork.name === "running"} icon={<Sparkles aria-hidden="true" className="size-4" />}>
              {T.editor.render[locale]}
            </Button>
            <WorkStatus locale={locale} state={finalWork} />
            {final ? (
              <>
                {final.doc !== doc ? <p className="type-body-sm font-black text-muted">{T.editor.stale[locale]}</p> : null}
                <AudioResultPanel
                  locale={locale}
                  result={final.result}
                  toolId={tool.id}
                  fileBase={mainSource?.name ? mainSource.name.replace(/\.[^.]+$/, "") : "uredjen-zvuk"}
                  canSave={canSave}
                  projectId={projectId}
                  parentJobId={mainSource?.jobId ?? null}
                  params={{
                    trajanje: Math.round(final.render.buffer.duration),
                    lufs: Number.isFinite(final.render.after.integratedLufs) ? Math.round(final.render.after.integratedLufs * 10) / 10 : 0,
                    trake: final.doc.extras.length,
                  }}
                >
                  <p className="font-mono type-body-sm font-bold text-ink">
                    {fillCopy(final.doc.loudness === "isto" ? T.editor.statsSame[locale] : T.editor.stats[locale], {
                      before: formatDb(final.render.before.integratedLufs, locale),
                      after: formatDb(final.render.after.integratedLufs, locale),
                      peak: formatDb(final.render.after.truePeakDb, locale),
                      len: formatSeconds(final.render.buffer.duration, locale, true),
                    })}
                  </p>
                </AudioResultPanel>
              </>
            ) : null}
          </ToolSection>
        </>
      ) : null}
    </section>
  );
}

/** Ulaz za „spoji" / „dodaj traku": nov pri svakom otvaranju (`key`), pa ne pamti prošli fajl. */
function AddSoundPanel({ locale, disabled, onPick }: { locale: CreaToolProps["locale"]; disabled: boolean; onPick: (picked: PickedSound) => void }) {
  const input = useSoundInput();
  const handled = useRef<string | null>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  });
  useEffect(() => {
    if (!input.picked || handled.current === input.picked.key) return;
    handled.current = input.picked.key;
    pick.current(input.picked);
  }, [input.picked]);
  return <SoundInput locale={locale} input={input} disabled={disabled} kinds={["audio", "video"]} />;
}

/** Zum talasa prati izbor (wavesurfer menja svoju širinu, ne React). */
function ZoomSync({ handle, pxPerSec }: { handle: WaveformHandle | null; pxPerSec: number }) {
  useEffect(() => {
    try {
      handle?.zoom(pxPerSec);
    } catch {
      // Talas se još učitava - zum se primeni na „ready".
    }
  }, [handle, pxPerSec]);
  return null;
}

/** Polje za sekunde (izbor sa tastature, bez miša). */
function NumberField({ label, value, max, onChange }: { label: string; value: number | null; max: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-1 type-body-sm font-black text-ink">
      {label}
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={Math.round(max * 10) / 10}
        step={0.1}
        value={value === null ? "" : Math.round(value * 10) / 10}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.max(0, Math.min(max, next)));
        }}
        className="surface-inset h-11 w-28 border-2 border-ink bg-paper px-3 font-mono text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      />
    </label>
  );
}
