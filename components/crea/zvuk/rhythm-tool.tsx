"use client";

import { Download, Gauge, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { downloadText } from "@/components/crea/video/picked-media";
import { wavBlob } from "@/components/crea/zvuk/audio-render";
import { SoundInput, useSoundInput } from "@/components/crea/zvuk/sound-input";
import type { RhythmAnalysis } from "@/components/crea/zvuk/uredjivac/rhythm";
import { formatSeconds, ToolSection, WorkStatus, type WorkState } from "@/components/crea/zvuk/uredjivac/ui";
import { useDecodedSound } from "@/components/crea/zvuk/uredjivac/use-decoded-sound";
import { Waveform, type WaveformHandle, type WaveMark } from "@/components/crea/zvuk/uredjivac/waveform";
import { Button } from "@/components/ui/button";
import { EDITOR_MAX_SECONDS, exportFileName } from "@/lib/crea-audio-edit";
import { CREA_AUDIO_TOOLS_COPY as T } from "@/lib/crea-audio-tools-copy";
import { BPM_RANGE } from "@/lib/crea-beat";
import { fillCopy } from "@/lib/crea-copy";
import { classifyDevice } from "@/lib/crea-device";
import { audacityLabels, beatMarkers, camelot, keyConfidence, KEY_CONFIDENCE_LABELS, keyName, keySymbol, markersCsv } from "@/lib/crea-key";
import { toLocalAiError } from "@/lib/crea-local-ai/errors";

/** `web-audio-beat-detector` na 22,05 kHz ne nalazi udarce (provereno u pregledaču) - zato 44,1 kHz, mono. */
const RHYTHM_RATE = 44100;
/** Više od ovoliko obeležja na talasu usporava stranu - tada samo prvi udarci takta. */
const MAX_WAVE_MARKS = 600;

/**
 * Ritam i tonalitet (Crea K24, A19): BPM (sa „duplo / upola" za čestu grešku
 * detektora), tonalitet sa srpskim imenom, oznakom akorda i Camelot brojem, i
 * markeri udaraca na talasu i kao fajl za montažu. Sve na uređaju, 0 kr.
 */
export default function RhythmTool({ tool, locale, caps, source }: CreaToolProps) {
  const input = useSoundInput(source);
  const { picked } = input;
  const maxSeconds = EDITOR_MAX_SECONDS[caps ? classifyDevice(caps) : "desktop"];
  const decoded = useDecodedSound(picked, { sampleRate: RHYTHM_RATE, channels: 1, maxSeconds });
  const [work, setWork] = useState<WorkState>({ name: "idle" });
  const [analysis, setAnalysis] = useState<{ key: string; result: RhythmAnalysis; bpm: number } | null>(null);
  const [handle, setHandle] = useState<WaveformHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const [clicks, setClicks] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const ready = decoded.status === "ready" ? decoded : null;
  const current = analysis && ready && analysis.key === ready.key ? analysis : null;
  const busy = work.name === "running";

  const waveUrl = useMemo(() => {
    if (!ready) return null;
    // Talas i slušanje iz dekodiranog zvuka (radi i za video i za rad iz galerije).
    return URL.createObjectURL(wavBlob([ready.buffer.getChannelData(0)], RHYTHM_RATE));
  }, [ready]);
  useEffect(() => () => (waveUrl ? URL.revokeObjectURL(waveUrl) : undefined), [waveUrl]);

  const markers = useMemo(() => (current && ready ? beatMarkers(current.bpm, current.result.offset, ready.buffer.duration) : []), [current, ready]);
  const marks = useMemo<WaveMark[]>(() => {
    const visible = markers.length > MAX_WAVE_MARKS ? markers.filter((marker) => marker.downbeat) : markers;
    return visible.map((marker, index) => ({ id: `u${index}`, start: marker.t, tone: marker.downbeat ? "downbeat" : "beat" }));
  }, [markers]);

  async function run() {
    if (!ready) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setWork({ name: "running" });
    try {
      const { analyzeRhythm } = await import("@/components/crea/zvuk/uredjivac/rhythm");
      const result = await analyzeRhythm(ready.buffer, controller.signal);
      if (controller.signal.aborted) return;
      setAnalysis({ key: ready.key, result, bpm: result.bpm ?? 120 });
      setWork({ name: "idle" });
    } catch (error) {
      setWork({ name: "error", code: toLocalAiError(error, "INFERENCE_FAILED").code });
    }
  }

  const setBpm = (bpm: number) => setAnalysis((value) => (value ? { ...value, bpm: Math.round(Math.min(BPM_RANGE.max, Math.max(BPM_RANGE.min, bpm)) * 10) / 10 } : value));

  // Klik na svaki udarac dok sluša (metronom preko pesme).
  useEffect(() => {
    const media = handle?.media();
    if (!clicks || !playing || !media || markers.length === 0) return;
    const context = new AudioContext();
    let next = markers.findIndex((marker) => marker.t >= media.currentTime);
    const timer = window.setInterval(() => {
      const now = media.currentTime;
      while (next >= 0 && next < markers.length && markers[next]!.t < now + 0.12) {
        const marker = markers[next]!;
        const at = context.currentTime + Math.max(0, marker.t - now);
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.frequency.value = marker.downbeat ? 1600 : 1000;
        gain.gain.setValueAtTime(0.3, at);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
        osc.connect(gain);
        gain.connect(context.destination);
        osc.start(at);
        osc.stop(at + 0.05);
        next++;
      }
    }, 30);
    return () => {
      window.clearInterval(timer);
      void context.close();
    };
  }, [clicks, playing, handle, markers]);

  const key = current?.result.key ?? null;
  const bars = markers.length > 0 ? markers[markers.length - 1]!.bar : 0;

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Gauge aria-hidden="true" className="size-5" />} />

      <ToolSection title={T.rhythm.inputTitle[locale]} id="ritam-ulaz">
        <SoundInput locale={locale} input={input} disabled={busy} kinds={["audio", "video"]} />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void run()} disabled={!ready || busy} loading={decoded.status === "loading" || busy} icon={<Gauge aria-hidden="true" className="size-4" />}>
            {T.rhythm.run[locale]}
          </Button>
          {decoded.status === "tooLong" ? <p className="type-body-sm font-black text-muted">{fillCopy(T.common.tooLong[locale], { max: formatSeconds(maxSeconds, locale) })}</p> : null}
          {decoded.status === "empty" ? <p className="type-body-sm font-black text-muted">{T.common.noSound[locale]}</p> : null}
        </div>
        <WorkStatus locale={locale} state={work} />
      </ToolSection>

      {current ? (
        <>
          <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
            <div className="space-y-2">
              <h3 className="type-h4 text-ink">{T.rhythm.bpm[locale]}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="ritam-bpm">
                  {T.rhythm.bpm[locale]}
                </label>
                <input
                  id="ritam-bpm"
                  type="number"
                  inputMode="decimal"
                  min={BPM_RANGE.min}
                  max={BPM_RANGE.max}
                  step={0.5}
                  value={current.bpm}
                  onChange={(event) => setBpm(Number(event.target.value))}
                  className="surface-inset h-14 w-32 border-2 border-ink bg-paper px-3 font-mono text-3xl font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                />
                <Button variant="secondary" onClick={() => setBpm(current.bpm * 2)}>
                  {T.rhythm.double[locale]}
                </Button>
                <Button variant="secondary" onClick={() => setBpm(current.bpm / 2)}>
                  {T.rhythm.half[locale]}
                </Button>
              </div>
              <p className="type-body-sm font-semibold text-muted">{current.result.bpm === null ? T.rhythm.noBeat[locale] : T.rhythm.bpmHint[locale]}</p>
            </div>
            <div className="space-y-2">
              <h3 className="type-h4 text-ink">{T.rhythm.key[locale]}</h3>
              {key ? (
                <>
                  <p className="type-h3 text-ink">
                    {keyName(key, locale)} <span className="font-mono text-base text-muted">({keySymbol(key)})</span>
                  </p>
                  <p className="type-body-sm font-bold text-ink">
                    {fillCopy(T.rhythm.camelot[locale], { code: camelot(key) })} · {KEY_CONFIDENCE_LABELS[keyConfidence(key)][locale]}
                  </p>
                  {keyConfidence(key) !== "sigurno" ? <p className="type-body-sm font-semibold text-muted">{fillCopy(T.rhythm.orMaybe[locale], { name: keyName(key.runnerUp, locale) })}</p> : null}
                </>
              ) : (
                <p className="type-body-sm font-semibold text-muted">{T.rhythm.noKey[locale]}</p>
              )}
            </div>
          </div>

          <ToolSection title={T.rhythm.markersTitle[locale]} hint={T.rhythm.markersHint[locale]} id="ritam-markeri">
            {waveUrl ? (
              <div className="surface-inset border border-line bg-paper p-2">
                <Waveform url={waveUrl} label={T.rhythm.waveLabel[locale]} height={96} marks={marks} handleRef={setHandle} onPlayChange={setPlaying} />
              </div>
            ) : null}
            {markers.length > MAX_WAVE_MARKS ? <p className="type-body-sm font-semibold text-muted">{T.rhythm.tooLongForMarkers[locale]}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => handle?.playPause()} icon={playing ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}>
                {playing ? T.common.pause[locale] : T.common.play[locale]}
              </Button>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 type-body-sm font-bold text-ink">
                <input type="checkbox" checked={clicks} onChange={(event) => setClicks(event.target.checked)} className="size-5 accent-ink" />
                {T.rhythm.click[locale]}
              </label>
            </div>
            <p className="type-body-sm font-bold text-ink">{fillCopy(T.rhythm.markersCount[locale], { n: markers.length, bars })}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={<Download aria-hidden="true" className="size-4" />} onClick={() => downloadText(audacityLabels(markers), exportFileName(`markeri-${Math.round(current.bpm)}-bpm`, "txt"), "text/plain")}>
                {T.rhythm.downloadLabels[locale]}
              </Button>
              <Button variant="secondary" icon={<Download aria-hidden="true" className="size-4" />} onClick={() => downloadText(markersCsv(markers, locale), exportFileName(`markeri-${Math.round(current.bpm)}-bpm`, "csv"), "text/csv")}>
                {T.rhythm.downloadCsv[locale]}
              </Button>
            </div>
          </ToolSection>
        </>
      ) : null}
    </section>
  );
}
