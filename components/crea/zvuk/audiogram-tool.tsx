"use client";

import { Clapperboard, Download, FileText, Pause, Play, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { PaidSubmit } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useSaveLocalResult } from "@/components/crea/use-save-local-result";
import { downloadBlob, wavBlob } from "@/components/crea/zvuk/audio-render";
import { SoundInput, useSoundInput } from "@/components/crea/zvuk/sound-input";
import { useSoundSeconds } from "@/components/crea/zvuk/use-sound-upload";
import { useTranscribe } from "@/components/crea/zvuk/use-transcribe";
import type { AudiogramScene } from "@/components/crea/zvuk/uredjivac/audiogram-render";
import { formatSeconds, ToolSection, WorkStatus, type WorkState } from "@/components/crea/zvuk/uredjivac/ui";
import { useDecodedSound } from "@/components/crea/zvuk/uredjivac/use-decoded-sound";
import { Waveform, type WaveSelection } from "@/components/crea/zvuk/uredjivac/waveform";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { exportFileName } from "@/lib/crea-audio-edit";
import { AUDIOGRAM_ASPECTS, AUDIOGRAM_BARS, AUDIOGRAM_FPS, AUDIOGRAM_LABELS, AUDIOGRAM_THEMES, AUDIOGRAM_TITLE_MAX, AUDIOGRAM_WAVES, audiogramLayout, waveAt, waveFrames, type AudiogramAspect, type AudiogramTheme, type AudiogramWave } from "@/lib/crea-audiogram";
import { CREA_AUDIO_TOOLS_COPY as T } from "@/lib/crea-audio-tools-copy";
import { creaSaveErrorMessage, fillCopy } from "@/lib/crea-copy";
import { toLocalAiError } from "@/lib/crea-local-ai/errors";
import { CAPTION_SCRIPTS, CAPTION_STYLE_LABELS, CAPTION_STYLES, cueOptionsFor, cuesFromText, cuesFromWords, wordsInRange, type CaptionScript, type CaptionStyle } from "@/lib/crea-subtitles";
import { emptyTimeline } from "@/lib/crea-timeline";
import { EXPORT_LIMITS, exportLimits, exportSize, maxDurationFor, videoSupport } from "@/lib/crea-video-caps";

const SOURCE_RATE = 44100;
const BASE_SIZE: Record<AudiogramAspect, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};
const PREVIEW_LONG_SIDE = 480;
const DEFAULT_PART_S = 60;
type CaptionMode = "bez" | "sam" | "govor";

function sliceBuffer(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
  const from = Math.max(0, Math.floor(start * buffer.sampleRate));
  const to = Math.min(buffer.length, Math.max(from + 1, Math.floor(end * buffer.sampleRate)));
  const out = new AudioBuffer({ length: to - from, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) out.copyToChannel(buffer.getChannelData(channel).subarray(from, to), channel);
  return out;
}

function mono(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < out.length; index++) out[index]! += data[index]! / buffer.numberOfChannels;
  }
  return out;
}

/**
 * Audiogram (Crea K24, A20): zvuk + slika → video sa talasom i titlovima, na
 * uređaju (0 kr). Izabereš deo snimka na talasu, oblik (9:16, 1:1, 16:9), talas
 * (stubići, talas, prsten oko slike), boje brenda, naslov i titlove (napišeš ih
 * sam ili ih prepozna `stt`). Pregled i MP4 crta isti crtač.
 */
export default function AudiogramTool({ tool, locale, caps, canSave, projectId, paid, source }: CreaToolProps) {
  const sound = useSoundInput(source && source.kind !== "image" ? source : null);
  const image = useImageInput(source && source.kind === "image" ? source : null);
  const { picked } = sound;
  const limits = caps ? exportLimits(caps) : EXPORT_LIMITS.desktop;
  const webcodecs = caps ? videoSupport(caps) === "webcodecs" : true;
  const decoded = useDecodedSound(picked, { sampleRate: SOURCE_RATE, channels: 2, maxSeconds: 15 * 60 });
  const ready = decoded.status === "ready" ? decoded : null;

  const [aspect, setAspect] = useState<AudiogramAspect>("9:16");
  const [wave, setWave] = useState<AudiogramWave>("stubici");
  const [theme, setTheme] = useState<AudiogramTheme>("papir");
  const [title, setTitle] = useState("");
  const [captionMode, setCaptionMode] = useState<CaptionMode>("bez");
  const [captionText, setCaptionText] = useState("");
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("zuta-traka");
  const [script, setScript] = useState<CaptionScript>("lat");
  const size = exportSize(BASE_SIZE[aspect].width, BASE_SIZE[aspect].height, limits.maxLongSide);
  const maxPart = maxDurationFor(limits, size.width, size.height);

  // Deo snimka (izbor na talasu); podrazumevano prvi minut.
  const [part, setPart] = useState<{ key: string; selection: WaveSelection } | null>(null);
  const fullLength = ready?.buffer.duration ?? 0;
  const selection: WaveSelection | null = ready
    ? part && part.key === ready.key
      ? { start: part.selection.start, end: Math.min(part.selection.end, part.selection.start + maxPart) }
      : { start: 0, end: Math.min(fullLength, DEFAULT_PART_S, maxPart) }
    : null;
  const segment = useMemo(() => (ready && selection ? sliceBuffer(ready.buffer, selection.start, selection.end) : null), [ready, selection?.start, selection?.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const levels = useMemo(() => (segment ? waveFrames(mono(segment), segment.sampleRate, AUDIOGRAM_FPS, AUDIOGRAM_BARS).levels : null), [segment]);
  const fullWaveUrl = useMemo(() => (ready ? URL.createObjectURL(wavBlob([mono(ready.buffer)], SOURCE_RATE)) : null), [ready]);
  const segmentUrl = useMemo(() => (segment ? URL.createObjectURL(wavBlob([mono(segment)], segment.sampleRate)) : null), [segment]);
  useEffect(() => () => (fullWaveUrl ? URL.revokeObjectURL(fullWaveUrl) : undefined), [fullWaveUrl]);
  useEffect(() => () => (segmentUrl ? URL.revokeObjectURL(segmentUrl) : undefined), [segmentUrl]);

  // Titlovi: napisani (raspored po slogovima) ili prepoznati (`stt`, reči iz izabranog dela).
  const seconds = useSoundSeconds(picked);
  const recognition = useTranscribe({ picked, seconds, paid, projectId, locale });
  const recognizedWords = recognition.transcript?.state === "ready" ? recognition.transcript.words : null;
  const cues = useMemo(() => {
    if (!segment || !selection || captionMode === "bez") return [];
    if (captionMode === "sam") return cuesFromText(captionText, segment.duration, captionStyle);
    return recognizedWords ? cuesFromWords(wordsInRange(recognizedWords, selection.start, selection.end), cueOptionsFor(captionStyle)) : [];
  }, [segment, selection?.start, selection?.end, captionMode, captionText, captionStyle, recognizedWords]); // eslint-disable-line react-hooks/exhaustive-deps

  // Slika kao bitmap za platno.
  const [bitmap, setBitmap] = useState<{ key: string; image: ImageBitmap } | null>(null);
  const imageKey = image.picked?.key ?? null;
  useEffect(() => {
    const file = image.picked?.file;
    if (!file || !imageKey) return;
    let alive = true;
    void createImageBitmap(file)
      .then((created) => {
        if (alive) setBitmap({ key: imageKey, image: created });
        else created.close();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [image.picked?.file, imageKey]);
  const currentBitmap = bitmap && bitmap.key === imageKey ? bitmap.image : null;

  const scene = useMemo<AudiogramScene>(
    () => ({
      layout: audiogramLayout(aspect, wave, title.trim().length > 0),
      wave,
      theme,
      image: currentBitmap,
      title: title.slice(0, AUDIOGRAM_TITLE_MAX),
      captions: cues.length > 0 ? { ...emptyTimeline(aspect), captions: { cues, style: captionStyle, script } } : null,
    }),
    [aspect, wave, theme, currentBitmap, title, cues, captionStyle, script],
  );

  // Pregled: isti crtač, u maloj veličini, prati zvuk koji svira.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const preview = exportSize(size.width, size.height, PREVIEW_LONG_SIDE);
  const [renderer, setRenderer] = useState<typeof import("@/components/crea/zvuk/uredjivac/audiogram-render") | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([import("@/components/crea/zvuk/uredjivac/audiogram-render"), import("@/components/crea/editor/fonts").then(({ loadCanvasFonts }) => loadCanvasFonts())]).then(([module]) => {
      if (alive) setRenderer(module);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !levels || !renderer) return;
    let frameId = 0;
    const draw = () => {
      const t = audioRef.current?.currentTime ?? 0;
      renderer.drawAudiogram(context, scene, t, waveAt(levels, AUDIOGRAM_BARS, Math.floor(t * AUDIOGRAM_FPS)), canvas.width, canvas.height);
      if (playing) frameId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frameId);
  }, [renderer, scene, levels, playing, preview.width, preview.height]);

  // Izvoz.
  const [work, setWork] = useState<WorkState>({ name: "idle" });
  const [video, setVideo] = useState<{ blob: Blob; url: string } | null>(null);
  const [saved, setSaved] = useState<{ video: Blob; jobId: Id<"generationJobs"> } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const saveLocalResult = useSaveLocalResult();
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => () => (video ? URL.revokeObjectURL(video.url) : undefined), [video]);

  async function make() {
    if (!segment || !levels) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setWork({ name: "running", label: fillCopy(T.audiogram.making[locale], { p: 0 }) });
    try {
      const { exportAudiogram } = await import("@/components/crea/zvuk/uredjivac/audiogram-render");
      const blob = await exportAudiogram({
        scene,
        width: size.width,
        height: size.height,
        fps: AUDIOGRAM_FPS,
        audio: segment,
        levelsAt: (frame) => waveAt(levels, AUDIOGRAM_BARS, frame),
        signal: controller.signal,
        onProgress: (fraction) => setWork({ name: "running", label: fillCopy(T.audiogram.making[locale], { p: Math.round(fraction * 100) }) }),
      });
      setVideo({ blob, url: URL.createObjectURL(blob) });
      setSaveError(null);
      setWork({ name: "idle" });
    } catch (error) {
      setWork({ name: "error", code: toLocalAiError(error, "INFERENCE_FAILED").code });
    }
  }

  async function save() {
    if (!video) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveLocalResult({ toolId: tool.id, kind: "video", blob: video.blob, params: { oblik: aspect, talas: wave, titlovi: captionMode }, projectId, parentJobId: picked?.sourceJobId ?? null });
      if (result.ok) setSaved({ video: video.blob, jobId: result.jobId });
      else setSaveError(creaSaveErrorMessage(result.reason, locale));
    } catch (caught) {
      setSaveError(creaSaveErrorMessage(caught instanceof Error ? caught.message : String(caught), locale));
    } finally {
      setSaving(false);
    }
  }

  const busy = work.name === "running";
  const blocker = !webcodecs ? T.audiogram.needWebCodecs[locale] : !picked ? T.common.pickSound[locale] : !currentBitmap ? T.audiogram.needImage[locale] : null;
  const isSaved = saved !== null && video !== null && saved.video === video.blob;

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Clapperboard aria-hidden="true" className="size-5" />} />

      <div className="mt-5 grid gap-5 border-t border-line pt-5">
        <div className="min-w-0 space-y-3">
          <h3 className="type-h4 text-ink">{T.audiogram.soundTitle[locale]}</h3>
          <SoundInput locale={locale} input={sound} disabled={busy} kinds={["audio", "video"]} />
        </div>
        <div className="min-w-0 space-y-3">
          <h3 className="type-h4 text-ink">{T.audiogram.imageTitle[locale]}</h3>
          <ImageInput locale={locale} input={image} disabled={busy} fullScreenDrop={false} chooseLabel={T.audiogram.imagePick[locale]} />
        </div>
      </div>

      {ready && fullWaveUrl && selection ? (
        <ToolSection title={T.audiogram.rangeTitle[locale]} hint={fillCopy(T.audiogram.rangeHint[locale], { max: formatSeconds(maxPart, locale) })} id="audiogram-deo">
          <div className="surface-inset border border-line bg-paper p-2">
            <Waveform url={fullWaveUrl} label={T.audiogram.rangeTitle[locale]} height={72} selectable selection={selection} onSelection={(next) => next && setPart({ key: ready.key, selection: next })} />
          </div>
          <p className="font-mono type-body-sm font-bold text-ink">
            {formatSeconds(selection.start, locale, true)} – {formatSeconds(selection.end, locale, true)} · {formatSeconds(selection.end - selection.start, locale)}
          </p>
        </ToolSection>
      ) : decoded.status === "loading" ? (
        <WorkStatus locale={locale} state={{ name: "running" }} />
      ) : null}

      <ToolSection title={T.audiogram.preview[locale]} id="audiogram-izgled">
        <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)]">
          <div className="space-y-2">
            <canvas
              ref={canvasRef}
              width={preview.width}
              height={preview.height}
              role="img"
              aria-label={T.audiogram.previewLabel[locale]}
              className="surface-media block max-w-full bg-paper shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
              style={{ width: preview.width, maxWidth: "100%", height: "auto" }}
            />
            {segmentUrl ? (
              <>
                <audio ref={audioRef} src={segmentUrl} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} className="hidden" />
                <Button variant="secondary" onClick={() => (playing ? audioRef.current?.pause() : void audioRef.current?.play())} icon={playing ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}>
                  {playing ? T.common.pause[locale] : T.common.play[locale]}
                </Button>
              </>
            ) : null}
          </div>
          <div className="min-w-0 space-y-4">
            <ChoiceChips<AudiogramAspect> legend={T.audiogram.shape[locale]} name="audiogram-oblik" options={AUDIOGRAM_ASPECTS.map((id) => ({ id, label: id }))} value={aspect} onChange={setAspect} disabled={busy} />
            <ChoiceChips<AudiogramWave> legend={T.audiogram.wave[locale]} name="audiogram-talas" options={AUDIOGRAM_WAVES.map((id) => ({ id, label: AUDIOGRAM_LABELS.waves[id][locale] }))} value={wave} onChange={setWave} disabled={busy} />
            <ChoiceChips<AudiogramTheme> legend={T.audiogram.theme[locale]} name="audiogram-boje" options={AUDIOGRAM_THEMES.map((id) => ({ id, label: AUDIOGRAM_LABELS.themes[id][locale] }))} value={theme} onChange={setTheme} disabled={busy} />
            <label className="block space-y-1">
              <span className="type-body-sm font-black text-ink">{T.audiogram.title[locale]}</span>
              <input
                type="text"
                value={title}
                maxLength={AUDIOGRAM_TITLE_MAX}
                disabled={busy}
                placeholder={T.audiogram.titlePlaceholder[locale]}
                onChange={(event) => setTitle(event.target.value)}
                className="surface-inset min-h-11 w-full border-2 border-ink bg-paper px-3 type-body text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              />
            </label>
          </div>
        </div>
      </ToolSection>

      <ToolSection title={T.audiogram.captions[locale]} id="audiogram-titlovi">
        <ChoiceChips<CaptionMode>
          legend={T.audiogram.captionSource[locale]}
          name="audiogram-titl-nacin"
          options={(["bez", "sam", "govor"] as const).filter((id) => id !== "govor" || recognition.model).map((id) => ({ id, label: T.audiogram.captionModes[id][locale] }))}
          value={captionMode}
          onChange={setCaptionMode}
          disabled={busy}
        />
        {captionMode === "sam" ? (
          <label className="block space-y-1">
            <span className="type-body-sm font-black text-ink">{T.audiogram.captionText[locale]}</span>
            <textarea
              value={captionText}
              rows={4}
              maxLength={2000}
              disabled={busy}
              onChange={(event) => setCaptionText(event.target.value)}
              className="surface-inset w-full border-2 border-ink bg-paper p-3 type-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />
            <span className="type-body-sm font-semibold text-muted">{T.audiogram.captionTextHint[locale]}</span>
          </label>
        ) : null}
        {captionMode === "govor" && recognition.model ? (
          <>
            <PaidSubmit
              locale={locale}
              label={T.transcript.recognize[locale]}
              icon={<FileText aria-hidden="true" className="size-4" />}
              credits={recognition.price}
              blocker={!canSave ? T.result.noAccess[locale] : !picked ? T.common.pickSound[locale] : null}
              status={recognition.status}
              demo={recognition.model.demo}
              onSubmit={() => void recognition.start()}
            />
            {recognition.recognizing ? <WorkStatus locale={locale} state={{ name: "running", label: T.transcript.waiting[locale] }} /> : null}
            {recognition.transcript?.state === "ready" && recognition.transcript.demo ? <p className="type-body-sm font-semibold text-muted">{T.transcript.demo[locale]}</p> : null}
          </>
        ) : null}
        {captionMode !== "bez" ? (
          <>
            <ChoiceChips<CaptionStyle> legend={T.audiogram.captionStyle[locale]} name="audiogram-titl-stil" options={CAPTION_STYLES.map((id) => ({ id, label: CAPTION_STYLE_LABELS[id].label[locale] }))} value={captionStyle} onChange={setCaptionStyle} disabled={busy} />
            <ChoiceChips<CaptionScript> legend={T.transcript.script[locale]} name="audiogram-pismo" options={CAPTION_SCRIPTS.map((id) => ({ id, label: T.transcript.scripts[id][locale] }))} value={script} onChange={setScript} disabled={busy} />
          </>
        ) : null}
      </ToolSection>

      <div className="mt-5 space-y-3 border-t border-line pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void make()} disabled={blocker !== null || !segment || busy} icon={<Clapperboard aria-hidden="true" className="size-4" />}>
            {T.audiogram.make[locale]}
          </Button>
          {blocker ? <p className="type-body-sm font-black text-muted">{blocker}</p> : null}
        </div>
        <WorkStatus locale={locale} state={work} onCancel={busy ? () => abortRef.current?.abort() : undefined} />
        {video ? (
          <div className="space-y-3" aria-live="polite">
            <p className="type-body font-black text-ink">{T.audiogram.done[locale]}</p>
            <video src={video.url} controls playsInline className="surface-media max-h-[28rem] max-w-full bg-paper shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={<Download aria-hidden="true" className="size-4" />} onClick={() => downloadBlob(video.blob, exportFileName("audiogram", "mp4"))}>
                {T.audiogram.downloadMp4[locale]}
              </Button>
              {canSave ? (
                <Button loading={saving} disabled={saving || isSaved} icon={<Save aria-hidden="true" className="size-4" />} onClick={() => void save()}>
                  {isSaved ? T.result.saved[locale] : T.result.save[locale]}
                </Button>
              ) : null}
            </div>
            {!canSave ? <p className="type-body-sm font-semibold text-muted">{T.result.noAccess[locale]}</p> : null}
            {saveError ? (
              <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
                {saveError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
