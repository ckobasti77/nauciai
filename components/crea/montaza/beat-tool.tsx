/* eslint-disable @next/next/no-img-element -- sličice su radovi iz galerije ili lokalni `blob:` URL-ovi. */
"use client";

import { Music, Shuffle, Trash2, Wand2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { RangeField } from "@/components/crea/editor/controls";
import { newDraftId, newFileId, saveDraft } from "@/components/crea/montaza/draft-store";
import { ExportPanel } from "@/components/crea/montaza/export-panel";
import { formatClock, formatShort } from "@/components/crea/montaza/format";
import { kindOfFile, useMediaLibrary, type MediaEntry } from "@/components/crea/montaza/media-library";
import { MediaPicker, type PickedGalleryItem } from "@/components/crea/montaza/media-picker";
import { MontagePreview } from "@/components/crea/montaza/preview";
import { useMontageMedia } from "@/components/crea/montaza/use-montage-media";
import { useMontagePlayer } from "@/components/crea/montaza/use-montage-player";
import { audioReadyKey, useMix } from "@/components/crea/montaza/use-mix";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { FullScreenDropOverlay, useFullScreenDrop } from "@/components/studio/drop-slot";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { BEAT_IMAGES, BEAT_TEMPLATES, BPM_RANGE, buildBeatTimeline, FALLBACK_BPM, beatTemplateById } from "@/lib/crea-beat";
import { fillCopy } from "@/lib/crea-copy";
import { defaultPresetFor, EXPORT_PRESETS, type ExportPresetId } from "@/lib/crea-export-presets";
import { MONTAGE_COPY as T } from "@/lib/crea-montage-copy";
import { creaShellQuery } from "@/lib/crea-shell";
import { addTitle, emptyTimeline, timelineDuration, TIMELINE_ASPECTS, type CreaTimelineV1, type TimelineAspect } from "@/lib/crea-timeline";
import { EXPORT_LIMITS, exportLimits, videoSupport } from "@/lib/crea-video-caps";

/**
 * „Ubaci i gotovo" (Crea K19, V29): 5-30 fotki + pesma → šablon ih složi tako da
 * se kadar menja TAČNO na udarcu. Ritam (BPM i prvi udarac) se sluša na uređaju
 * (`web-audio-beat-detector`); bez jasnog ritma 120 BPM uz poruku. Gotov video
 * se pregleda i izvozi kao montaža, ili otvara u montaži za doradu.
 */

type Detection = { status: "idle" | "detecting" | "done" | "fallback"; bpm: number; offset: number };

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

function Step({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-line pt-5">
      <div>
        <h3 className="type-h4 text-ink">{title}</h3>
        {hint ? <p className="mt-1 type-body-sm font-semibold text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function BeatTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const tier = caps ? videoSupport(caps) : "webcodecs";
  const limits = caps ? exportLimits(caps) : EXPORT_LIMITS.desktop;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [images, setImages] = useState<MediaEntry[]>([]);
  const [song, setSong] = useState<MediaEntry | null>(null);
  const [songStart, setSongStart] = useState(0);
  const [detection, setDetection] = useState<Detection>({ status: "idle", bpm: FALLBACK_BPM, offset: 0 });
  const [templateId, setTemplateId] = useState(BEAT_TEMPLATES[1].id);
  const [aspect, setAspect] = useState<TimelineAspect>("9:16");
  const [edited, setEdited] = useState<CreaTimelineV1 | null>(null);
  const [presetId, setPresetId] = useState<ExportPresetId | null>(null);
  const [safeZoneOn, setSafeZoneOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const template = beatTemplateById(templateId) ?? BEAT_TEMPLATES[0];
  const ready = images.length >= BEAT_IMAGES.min && song !== null && detection.status !== "detecting" && detection.status !== "idle";
  const built = useMemo(
    () =>
      ready && song
        ? buildBeatTimeline({
            images: images.map((entry) => ({ src: entry.ref })),
            song: { src: song.ref, start: songStart, durationS: song.durationS },
            bpm: detection.bpm,
            offset: detection.offset,
            template,
            aspect,
            locale,
          })
        : emptyTimeline(aspect),
    [ready, song, images, songStart, detection.bpm, detection.offset, template, aspect, locale],
  );
  // Popravka iz „Proveri pre objave" važi dok se ulazi ne promene.
  const [editedFor, setEditedFor] = useState<CreaTimelineV1 | null>(null);
  if (editedFor !== built) {
    setEditedFor(built);
    setEdited(null);
  }
  const timeline = edited ?? built;

  const library = useMediaLibrary(timeline, true);
  const { playerMedia, exportMedia, prepareReversed } = useMontageMedia(timeline, library, limits.maxLongSide);
  const mix = useMix(timeline, library.sourceFor, audioReadyKey(timeline, (key) => library.entries.get(key)?.status === "ready"));
  const player = useMontagePlayer(timeline, playerMedia, mix.result?.buffer ?? null);
  const effectivePreset = presetId ?? defaultPresetFor(timeline.aspect).id;

  const addImages = useCallback(
    async (entries: Promise<MediaEntry>[]) => {
      setBusy(true);
      const prepared = (await Promise.all(entries)).filter((entry) => entry.status === "ready" && entry.kind === "image");
      setImages((current) => [...current, ...prepared.filter((entry) => !current.some((existing) => existing.key === entry.key))].slice(0, BEAT_IMAGES.max));
      setBusy(false);
    },
    [],
  );

  const chooseSong = useCallback(async (entry: Promise<MediaEntry>) => {
    setBusy(true);
    const prepared = await entry;
    setBusy(false);
    if (prepared.status !== "ready") {
      setProblem(fillCopy(T.fileUnreadable[locale], { name: prepared.name.slice(0, 40) }));
      return;
    }
    setProblem(null);
    setSongStart(0);
    setSong(prepared);
  }, [locale]);

  const fromGallery = (items: PickedGalleryItem[], kind: "image" | "audio") => {
    if (kind === "image") {
      void addImages(items.map((item) => library.prepare({ ref: { jobId: item.jobId }, kind: "image", name: item.name, url: item.url, blob: null })));
    } else if (items[0]) {
      void chooseSong(library.prepare({ ref: { jobId: items[0].jobId }, kind: "audio", name: items[0].name, url: items[0].url, blob: null }));
    }
  };

  const fromFiles = useCallback(
    (files: File[]) => {
      const pictures: Promise<MediaEntry>[] = [];
      for (const file of files) {
        const kind = kindOfFile(file);
        if (kind !== "image" && kind !== "audio") continue;
        if (file.size > limits.maxInputBytes) {
          setProblem(fillCopy(T.fileTooBig[locale], { name: file.name, size: `${Math.round(limits.maxInputBytes / 1024 / 1024)} MB` }));
          continue;
        }
        const id = newFileId();
        const prepared = library.storeFile(id, file).then(() =>
          library.prepare({ ref: { localFileId: id }, kind, name: file.name, url: library.track(URL.createObjectURL(file)), blob: file }),
        );
        if (kind === "image") pictures.push(prepared);
        else void chooseSong(prepared);
      }
      if (pictures.length > 0) void addImages(pictures);
    },
    [addImages, chooseSong, library, limits.maxInputBytes, locale],
  );

  // Slika iz galerije kao ulaz (`?ulaz=`, brza akcija) - jednom.
  const takenSource = useRef<string | null>(null);
  const { prepare } = library;
  useEffect(() => {
    if (!source || source.kind !== "image" || takenSource.current === source.jobId) return;
    takenSource.current = source.jobId;
    void prepare({ ref: { jobId: source.jobId }, kind: "image", name: "", url: source.url, blob: null }).then((entry) => {
      if (entry.status === "ready") setImages((current) => (current.some((item) => item.key === entry.key) ? current : [...current, entry]));
    });
  }, [source, prepare]);

  const dragging = useFullScreenDrop(true, fromFiles);

  // Ritam pesme (od izabranog početka), na uređaju.
  const songSource = song ? (song.blob ?? song.url) : null;
  useEffect(() => {
    if (!songSource) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setDetection((current) => ({ ...current, status: "detecting" }));
      void import("@/components/crea/video/engine/beat-detect")
        .then(({ detectBeat }) => detectBeat(songSource, songStart, controller.signal))
        .catch(() => null)
        .then((found) => {
          if (controller.signal.aborted) return;
          setDetection(found ? { status: "done", bpm: Math.round(found.bpm), offset: found.offset } : { status: "fallback", bpm: FALLBACK_BPM, offset: songStart });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [songSource, songStart]);

  const openInMontage = async () => {
    await saveDraft({ id: newDraftId(), title: `${T.origins.ritam[locale]} · ${template.label[locale]}`, origin: "ritam", timeline, updatedAt: Date.now() }).catch(() => undefined);
    const query = new URLSearchParams(creaShellQuery({ area: "video", mode: "montaza", tool: "video.montaza" }, searchParams));
    router.push(`${pathname}?${query.toString()}`, { scroll: false });
  };

  const missingImages = Math.max(0, BEAT_IMAGES.min - images.length);
  const duration = timelineDuration(timeline);

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Music aria-hidden="true" className="size-5" />} />

      <div className="mt-5 space-y-5">
        <Step title={`${T.beatImages[locale]} · ${fillCopy(T.beatCount[locale], { n: images.length })}`} hint={T.beatImagesHint[locale]}>
          {images.length > 0 ? (
            <div className="space-y-2">
              <ul className="flex flex-wrap gap-2">
                {images.map((entry, index) => (
                  <li key={entry.key} className="relative">
                    <img src={entry.thumbUrl ?? entry.url ?? ""} alt="" className="surface-media size-16 object-cover shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" />
                    <button
                      type="button"
                      aria-label={fillCopy(T.removeImage[locale], { n: index + 1 })}
                      title={fillCopy(T.removeImage[locale], { n: index + 1 })}
                      onClick={() => setImages((current) => current.filter((item) => item.key !== entry.key))}
                      className={cn("absolute -right-2 -top-2 grid size-11 place-items-center rounded-full", FOCUS)}
                    >
                      <span className="grid size-6 place-items-center rounded-full border-2 border-ink bg-paper-strong text-ink">
                        <X aria-hidden="true" className="size-3.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                 
                  onClick={() => setImages((current) => [...current].map((entry) => ({ entry, order: Math.random() })).sort((a, b) => a.order - b.order).map(({ entry }) => entry))}
                  icon={<Shuffle aria-hidden="true" className="size-4" />}
                >
                  {T.shuffle[locale]}
                </Button>
                <Button variant="secondary" onClick={() => setImages([])} icon={<Trash2 aria-hidden="true" className="size-4" />}>
                  {T.clearImages[locale]}
                </Button>
              </div>
            </div>
          ) : null}
          {images.length < BEAT_IMAGES.max ? (
            <MediaPicker locale={locale} kinds={["image"]} busy={busy} onAddGallery={(items) => fromGallery(items, "image")} onAddFiles={fromFiles} />
          ) : null}
        </Step>

        <Step title={T.beatSong[locale]} hint={T.beatSongHint[locale]}>
          {song ? (
            <div className="space-y-3">
              <p className="flex flex-wrap items-center gap-2 type-body-sm font-black text-ink">
                <Music aria-hidden="true" className="size-4" />
                <span className="min-w-0 truncate">{song.name || T.roles.music[locale]}</span>
                {song.durationS ? <span className="font-mono text-xs font-bold text-muted">{formatClock(song.durationS, locale, false)}</span> : null}
                <button type="button" onClick={() => setSong(null)} className={cn("ml-auto inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-black text-ink underline", FOCUS)}>
                  {T.remove[locale]}
                </button>
              </p>
              {song.durationS && song.durationS > 10 ? (
                <RangeField
                  label={T.songStart[locale]}
                  value={songStart}
                  min={0}
                  max={Math.max(0, Math.floor(song.durationS - 5))}
                  step={1}
                  display={formatClock(songStart, locale, false)}
                  onChange={setSongStart}
                />
              ) : null}
              <p role="status" className="inline-flex items-center gap-2 type-body-sm font-bold text-ink">
                {detection.status === "detecting" ? (
                  <>
                    <Spinner size="xs" />
                    {T.detecting[locale]}
                  </>
                ) : detection.status === "fallback" ? (
                  T.notDetected[locale]
                ) : detection.status === "done" ? (
                  fillCopy(T.detected[locale], { bpm: detection.bpm })
                ) : null}
              </p>
              {detection.status === "done" || detection.status === "fallback" ? (
                <RangeField
                  label={T.bpm[locale]}
                  value={detection.bpm}
                  min={BPM_RANGE.min}
                  max={BPM_RANGE.max}
                  step={1}
                  onChange={(bpm) => setDetection((current) => ({ ...current, bpm }))}
                />
              ) : null}
            </div>
          ) : (
            <MediaPicker locale={locale} kinds={["audio"]} busy={busy} onAddGallery={(items) => fromGallery(items, "audio")} onAddFiles={fromFiles} />
          )}
          {problem ? (
            <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
              {problem}
            </p>
          ) : null}
        </Step>

        <Step title={T.beatTemplate[locale]}>
          <ChoiceChips
            legend={T.beatTemplatePick[locale]}
            name="ritam-sablon"
            options={BEAT_TEMPLATES.map((item) => ({ id: item.id, label: item.label[locale], hint: item.hint[locale] }))}
            value={templateId}
            onChange={setTemplateId}
          />
          <ChoiceChips
            legend={T.aspect[locale]}
            name="ritam-oblik"
            options={TIMELINE_ASPECTS.map((id) => ({ id, label: T.aspects[id][locale] }))}
            value={aspect}
            onChange={setAspect}
          />
        </Step>

        <section className="space-y-4 border-t border-line pt-5">
          {ready ? (
            <>
              <p className="type-body-sm font-black text-ink">
                {fillCopy(T.beatReady[locale], { n: timeline.main.length, s: formatShort(duration, locale) })}
              </p>
              <div className="mx-auto w-full max-w-md">
                <MontagePreview
                  locale={locale}
                  player={player}
                  aspect={timeline.aspect}
                  duration={duration}
                  safeZone={safeZoneOn ? EXPORT_PRESETS[effectivePreset].safeZone : null}
                  empty={false}
                  maxHeightVh={56}
                />
              </div>
              <Button variant="secondary" onClick={() => void openInMontage()} icon={<Wand2 aria-hidden="true" className="size-4" />}>
                {T.openInMontage[locale]}
              </Button>
              <div className="border-t border-line pt-4">
                <ExportPanel
                  locale={locale}
                  timeline={timeline}
                  onTimelineChange={(next) => setEdited(next)}
                  presetId={effectivePreset}
                  onPresetChange={setPresetId}
                  safeZoneOn={safeZoneOn}
                  onSafeZoneChange={setSafeZoneOn}
                  tier={tier}
                  limits={limits}
                  mix={mix}
                  media={exportMedia}
                  prepareReversed={prepareReversed}
                  onAddHookTitle={() => setEdited(addTitle(timeline, { text: T.hookTitle[locale], start: 0, end: Math.min(2.5, duration), style: "naslov" }).timeline)}
                  toolId={tool.id}
                  canSave={canSave}
                  projectId={projectId}
                />
              </div>
            </>
          ) : (
            <p className="type-body-sm font-bold text-muted">
              {missingImages > 0 ? fillCopy(T.beatNeedImages[locale], { n: missingImages }) : !song ? T.beatNeedSong[locale] : T.detecting[locale]}
            </p>
          )}
        </section>
      </div>

      {dragging ? <FullScreenDropOverlay label={T.dropLabel[locale]} hint={T.dropHint[locale]} /> : null}
    </section>
  );
}
