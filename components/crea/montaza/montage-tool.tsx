"use client";

import { useConvex, useMutation } from "convex/react";
import { Film, FilePlus2, FolderOpen, Music, Plus, Redo2, Save, Scissors, Type, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { AudioPanel } from "@/components/crea/montaza/audio-panel";
import { ClipInspector, OverlayInspector, pipRect, TransitionControls, type ReverseState } from "@/components/crea/montaza/clip-inspector";
import { listDrafts, newDraftId, newFileId, saveDraft, type MontageDraft } from "@/components/crea/montaza/draft-store";
import { ExportPanel } from "@/components/crea/montaza/export-panel";
import type { MontageSelection } from "@/components/crea/montaza/format";
import { kindOfFile, useMediaLibrary, type MediaEntry } from "@/components/crea/montaza/media-library";
import { MediaPicker, type PickedGalleryItem } from "@/components/crea/montaza/media-picker";
import { MontagePreview } from "@/components/crea/montaza/preview";
import { ProjectsPanel } from "@/components/crea/montaza/projects-panel";
import { MontageTimeline } from "@/components/crea/montaza/timeline";
import { TitlesPanel } from "@/components/crea/montaza/titles-panel";
import { useMontageMedia } from "@/components/crea/montaza/use-montage-media";
import { useMontagePlayer } from "@/components/crea/montaza/use-montage-player";
import { audioReadyKey, useMix } from "@/components/crea/montaza/use-mix";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { FullScreenDropOverlay, useFullScreenDrop } from "@/components/studio/drop-slot";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { MontageOrigin } from "@/convex/creaMontagesCore";
import { fillCopy } from "@/lib/crea-copy";
import { canRedo, canUndo, createHistory, pushHistory, redo, undo, type History } from "@/lib/crea-editor-history";
import { defaultPresetFor, EXPORT_PRESETS, type ExportPresetId } from "@/lib/crea-export-presets";
import { kenBurnsForIndex } from "@/lib/crea-ken-burns";
import { formatBytes } from "@/lib/crea-local-ai/progress";
import { MONTAGE_COPY as T } from "@/lib/crea-montage-copy";
import {
  addAudio,
  addMainClips,
  addOverlay,
  addTitle,
  aspectRatio,
  deleteItem,
  emptyTimeline,
  mainLayout,
  parseTimeline,
  serializeTimeline,
  splitAt,
  timelineDuration,
  timelineLocalFileIds,
  TIMELINE_ASPECTS,
  TIMELINE_LIMITS,
  updateMainClip,
  reversedKey,
  type CreaTimelineV1,
  type MainClip,
  type NewMainClip,
  type TimelineAspect,
} from "@/lib/crea-timeline";
import { EXPORT_LIMITS, exportLimits, videoSupport } from "@/lib/crea-video-caps";

/**
 * Montaža u browseru (Crea K19, V24; plan K17 §2, §7): klipovi iz galerije i sa
 * uređaja, seci/deli/spajaj/premeštaj, prelazi, natpisi sa srpskim slovima,
 * nalepnice, muzika i glas sa automatskim utišavanjem, brzina i rampa, unazad
 * i bumerang, slika u slici, Ken Burns, pregled u realnom vremenu i izvoz
 * MP4/GIF na uređaju (0 kredita). Nacrt se sam čuva na uređaju (IndexedDB),
 * „Sačuvaj projekat" ga čuva u Crei.
 */

type PanelId = "dodaj" | "klip" | "tekst" | "zvuk" | "izvoz" | "projekti";
type DraftMeta = { id: string; title: string; origin: MontageOrigin; convexId: string | null };

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const DEFAULT_PHOTO_S = 3;
const DEFAULT_PIP_SIZE = 0.34;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName);
}

function aspectFor(entry: MediaEntry): TimelineAspect {
  if (!entry.width || !entry.height) return "9:16";
  const ratio = entry.width / entry.height;
  return ratio > 1.2 ? "16:9" : ratio < 0.83 ? "9:16" : "1:1";
}

/**
 * Gde ide nov izvor: video i fotka na kraj glavne trake (fotka 3 s sa Ken Burnsom),
 * ili kao slika u slici na glavu; zvuk na traku zvuka (prva pesma od početka).
 * Prva slika/video u praznoj montaži bira oblik videa. Poštuje granice uređaja i 8 min.
 */
function placeMedia(
  current: CreaTimelineV1,
  entries: MediaEntry[],
  options: { asPip: boolean; now: number; maxClips: number },
): { timeline: CreaTimelineV1; skipped: "clips" | "length" | null } {
  let next = current;
  let skipped: "clips" | "length" | null = null;
  if (next.main.length === 0 && next.overlay.length === 0 && !options.asPip) {
    const first = entries.find((entry) => entry.kind !== "audio");
    if (first) next = { ...next, aspect: aspectFor(first) };
  }
  const newMain: NewMainClip[] = [];
  const atPlayhead = () => Math.min(options.now, Math.max(0, timelineDuration(next) - 0.5));
  for (const entry of entries) {
    if (entry.kind === "audio") {
      const length = Math.min(entry.durationS ?? 30, TIMELINE_LIMITS.durationS);
      next = addAudio(next, {
        src: entry.ref,
        in: 0,
        out: Math.max(0.2, length),
        start: next.audio.length === 0 ? 0 : atPlayhead(),
        volumeDb: 0,
        role: "music",
        fadeIn: 0,
        fadeOut: Math.min(1.5, length / 4),
      }).timeline;
      continue;
    }
    if (options.asPip) {
      const mediaAspect = entry.width && entry.height ? entry.width / entry.height : 16 / 9;
      const length = entry.kind === "video" ? Math.min(entry.durationS ?? DEFAULT_PHOTO_S, 60) : DEFAULT_PHOTO_S;
      next = addOverlay(next, {
        src: entry.ref,
        media: entry.kind,
        in: 0,
        out: Math.max(0.2, length),
        start: atPlayhead(),
        rect: pipRect("gore-desno", DEFAULT_PIP_SIZE, mediaAspect, aspectRatio(next.aspect)),
        volumeDb: 0,
        muted: false,
      }).timeline;
      continue;
    }
    if (next.main.length + newMain.length >= options.maxClips) {
      skipped = "clips";
      break;
    }
    const room = TIMELINE_LIMITS.durationS - timelineDuration(next) - newMain.reduce((sum, clip) => sum + (clip.out - clip.in), 0);
    const length = entry.kind === "video" ? Math.min(entry.durationS ?? DEFAULT_PHOTO_S, room) : Math.min(DEFAULT_PHOTO_S, room);
    if (length < TIMELINE_LIMITS.clipMinS) {
      skipped = "length";
      break;
    }
    newMain.push({
      src: entry.ref,
      media: entry.kind,
      in: 0,
      out: length,
      speed: 1,
      volumeDb: 0,
      muted: false,
      fit: "cover",
      ...(entry.kind === "image" ? { kenBurns: kenBurnsForIndex(next.main.length + newMain.length) } : {}),
    });
  }
  return { timeline: newMain.length > 0 ? addMainClips(next, newMain) : next, skipped };
}

function PanelTab({ id, active, onSelect, children }: { id: PanelId; active: boolean; onSelect: (id: PanelId) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls="crea-montaza-panel"
      onClick={() => onSelect(id)}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border-2 px-4 text-sm font-black",
        active ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper text-ink hover:border-ink",
        FOCUS,
      )}
    >
      {children}
    </button>
  );
}

export default function MontageTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const tier = caps ? videoSupport(caps) : "webcodecs";
  const limits = caps ? exportLimits(caps) : EXPORT_LIMITS.desktop;
  const convex = useConvex();
  const saveMontage = useMutation(api.creaMontages.saveMontage);
  const markExported = useMutation(api.creaMontages.markExported);

  const [draft, setDraft] = useState<DraftMeta>(() => ({ id: newDraftId(), title: "", origin: "rucno", convexId: null }));
  const [history, setHistory] = useState<History<CreaTimelineV1>>(() => createHistory(emptyTimeline("9:16")));
  const timeline = history.present;
  const [loaded, setLoaded] = useState(false);
  const [rawSelection, setSelection] = useState<MontageSelection>(null);
  const [panel, setPanel] = useState<PanelId>("dodaj");
  const [presetId, setPresetId] = useState<ExportPresetId | null>(null);
  const [safeZoneOn, setSafeZoneOn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<"saved" | "unsaved" | null>(null);
  const [projectSave, setProjectSave] = useState<{ status: "idle" | "saving" | "saved" } | { status: "error"; message: string }>({ status: "idle" });
  const [reverseState, setReverseState] = useState<ReverseState>(null);
  const [projectsKey, setProjectsKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const reverseAbort = useRef<AbortController | null>(null);

  const library = useMediaLibrary(timeline, loaded);
  const { playerMedia, exportMedia, reverseClip, prepareReversed } = useMontageMedia(timeline, library, limits.maxLongSide);
  const readyKey = audioReadyKey(timeline, (key) => library.entries.get(key)?.status === "ready");
  const mix = useMix(timeline, library.sourceFor, readyKey);
  const player = useMontagePlayer(timeline, playerMedia, mix.result?.buffer ?? null);
  const { getTime, toggle, seek, pause } = player;
  const duration = timelineDuration(timeline);
  const effectivePreset = presetId ?? defaultPresetFor(timeline.aspect).id;

  // Izbor koji više ne postoji (obrisan, poništen) nije izbor.
  const selection = useMemo<MontageSelection>(() => {
    if (!rawSelection) return null;
    const exists =
      rawSelection.kind === "main" || rawSelection.kind === "transition"
        ? timeline.main.some((clip) => clip.id === rawSelection.id)
        : rawSelection.kind === "overlay"
          ? timeline.overlay.some((clip) => clip.id === rawSelection.id)
          : rawSelection.kind === "audio"
            ? timeline.audio.some((clip) => clip.id === rawSelection.id)
            : rawSelection.kind === "title"
              ? timeline.titles.some((title) => title.id === rawSelection.id)
              : timeline.stickers.some((sticker) => sticker.id === rawSelection.id);
    return exists ? rawSelection : null;
  }, [rawSelection, timeline]);

  const commit = useCallback((next: CreaTimelineV1, key?: string) => {
    setHistory((current) => pushHistory(current, next, key ? { key } : {}));
  }, []);
  const commitWith = useCallback((change: (current: CreaTimelineV1) => CreaTimelineV1) => {
    setHistory((current) => pushHistory(current, change(current.present)));
  }, []);

  const select = useCallback((next: MontageSelection) => {
    setSelection(next);
    if (!next) return;
    setPanel(next.kind === "title" || next.kind === "sticker" ? "tekst" : next.kind === "audio" ? "zvuk" : "klip");
  }, []);

  // Izabrana stavka se vidi u pregledu: ako je glava van nje, pregled skoči u nju (jednom po izboru).
  const soughtFor = useRef<string | null>(null);
  useEffect(() => {
    const key = selection ? `${selection.kind}:${selection.id}` : null;
    if (!key || !selection || soughtFor.current === key || player.playing) return;
    soughtFor.current = key;
    let range: { start: number; end: number } | null = null;
    if (selection.kind === "main" || selection.kind === "transition") {
      const layout = mainLayout(timeline);
      const index = layout.findIndex((entry) => entry.clip.id === selection.id);
      const placement = layout[index];
      if (placement && selection.kind === "main") range = { start: placement.start, end: placement.end };
      if (placement && selection.kind === "transition" && layout[index + 1]) range = { start: layout[index + 1].start, end: placement.end };
    } else if (selection.kind === "overlay") {
      const clip = timeline.overlay.find((entry) => entry.id === selection.id);
      if (clip) range = { start: clip.start, end: clip.start + (clip.out - clip.in) };
    } else if (selection.kind === "title" || selection.kind === "sticker") {
      const item = [...timeline.titles, ...timeline.stickers].find((entry) => entry.id === selection.id);
      if (item) range = { start: item.start, end: item.end };
    }
    if (!range) return;
    // Natpis i nalepnica na samom početku još ulaze (providni), pa se gleda malo posle ulaska.
    const show = range.start + Math.min(0.5, (range.end - range.start) / 2);
    const entering = selection.kind === "title" || selection.kind === "sticker";
    const now = getTime();
    if (now < (entering ? show : range.start) || now >= range.end) seek(show);
  }, [selection, timeline, getTime, seek, player.playing]);

  // Prvo otvaranje: poslednji nacrt sa ovog uređaja.
  useEffect(() => {
    let alive = true;
    void listDrafts()
      .catch(() => [] as MontageDraft[])
      .then((drafts) => {
        if (!alive) return;
        const latest = drafts[0];
        if (latest) {
          setDraft({ id: latest.id, title: latest.title, origin: latest.origin, convexId: latest.convexId ?? null });
          setHistory(createHistory(latest.timeline));
        }
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Obrnuti snimci otvorenog nacrta (napravljeni ranije) iz IndexedDB-a.
  const reversedKeys = useMemo(
    () => timeline.main.filter((clip) => clip.reverse || clip.boomerang).map((clip) => reversedKey(clip.src, clip)),
    [timeline],
  );
  const { loadReversed } = library;
  useEffect(() => {
    if (loaded && reversedKeys.length > 0) void loadReversed(reversedKeys);
  }, [loaded, reversedKeys, loadReversed]);

  // Nacrt se sam čuva na uređaju, sekundu posle poslednje izmene.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      saveDraft({ id: draft.id, title: draft.title, origin: draft.origin, timeline, updatedAt: Date.now(), ...(draft.convexId ? { convexId: draft.convexId } : {}) })
        .then(() => setDraftStatus("saved"))
        .catch(() => setDraftStatus("unsaved"));
    }, 1000);
    return () => clearTimeout(timer);
  }, [loaded, draft, timeline]);

  // Poslednja linija za radnje posle čekanja (dodavanje medija, okretanje klipa).
  const timelineRef = useRef(timeline);
  useEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

  /** Novi izvori na traku: video i fotke na kraj (ili kao slika u slici), zvuk na traku zvuka. */
  const insert = useCallback(
    (entries: MediaEntry[], asPip: boolean) => {
      const usable = entries.filter((entry) => entry.status === "ready");
      if (usable.length === 0) return;
      const placed = placeMedia(timelineRef.current, usable, { asPip, now: getTime(), maxClips: limits.maxClips });
      timelineRef.current = placed.timeline;
      commit(placed.timeline);
      setNotice(
        placed.skipped === "clips"
          ? fillCopy(T.limitClips[locale], { n: limits.maxClips })
          : placed.skipped === "length"
            ? fillCopy(T.tooLong[locale], { s: `${Math.round(TIMELINE_LIMITS.durationS / 60)} min` })
            : fillCopy(T.fileSaved[locale], { n: usable.length }),
      );
    },
    [commit, getTime, limits.maxClips, locale],
  );

  const addGallery = useCallback(
    async (items: PickedGalleryItem[], options: { asPip: boolean }) => {
      setAdding(true);
      const prepared: MediaEntry[] = [];
      for (const item of items) prepared.push(await library.prepare({ ref: { jobId: item.jobId }, kind: item.kind, name: item.name, url: item.url, blob: null }));
      setAdding(false);
      const unreadable = prepared.find((entry) => entry.status === "unreadable");
      insert(prepared, options.asPip);
      if (unreadable) setNotice(fillCopy(T.fileUnreadable[locale], { name: unreadable.name.slice(0, 40) }));
    },
    [insert, library, locale],
  );

  const addFiles = useCallback(
    async (files: File[], options: { asPip: boolean }) => {
      setAdding(true);
      const prepared: MediaEntry[] = [];
      let problem: string | null = null;
      for (const file of files) {
        const kind = kindOfFile(file);
        if (!kind) {
          problem = fillCopy(T.fileUnsupported[locale], { name: file.name });
          continue;
        }
        if (file.size > limits.maxInputBytes) {
          problem = fillCopy(T.fileTooBig[locale], { name: file.name, size: formatBytes(limits.maxInputBytes, locale) });
          continue;
        }
        const id = newFileId();
        await library.storeFile(id, file);
        const url = library.track(URL.createObjectURL(file));
        const entry = await library.prepare({ ref: { localFileId: id }, kind, name: file.name, url, blob: file });
        if (entry.status === "unreadable") problem = fillCopy(T.fileUnreadable[locale], { name: file.name });
        prepared.push(entry);
      }
      setAdding(false);
      insert(prepared, options.asPip);
      if (problem) setNotice(problem);
    },
    [insert, library, limits.maxInputBytes, locale],
  );

  // Rad iz galerije koji je stigao kao ulaz (`?ulaz=`): jednom, u montažu koja je otvorena.
  const takenSource = useRef<string | null>(null);
  const { prepare } = library;
  useEffect(() => {
    if (!loaded || !source || takenSource.current === source.jobId) return;
    takenSource.current = source.jobId;
    if (timeline.main.some((clip) => "jobId" in clip.src && clip.src.jobId === source.jobId)) return;
    void prepare({ ref: { jobId: source.jobId }, kind: source.kind ?? "video", name: "", url: source.url, blob: null }).then((entry) => insert([entry], false));
  }, [loaded, source, timeline.main, prepare, insert]);

  const dragging = useFullScreenDrop(loaded, (files) => void addFiles(files, { asPip: false }));

  const split = useCallback(() => {
    const result = splitAt(timeline, getTime());
    if (!result) {
      setNotice(T.splitNothing[locale]);
      return;
    }
    commit(result.timeline);
    select({ kind: "main", id: result.rightId });
  }, [commit, getTime, locale, select, timeline]);

  const handleReverse = useCallback(
    async (clip: MainClip, mode: "reverse" | "boomerang") => {
      reverseAbort.current?.abort();
      const controller = new AbortController();
      reverseAbort.current = controller;
      setReverseState({ clipId: clip.id, percent: 0 });
      try {
        await reverseClip(clip, controller.signal, (fraction) => setReverseState({ clipId: clip.id, percent: fraction * 100 }));
        commitWith((current) => updateMainClip(current, clip.id, mode === "reverse" ? { reverse: true, boomerang: undefined } : { boomerang: true, reverse: undefined }));
        setReverseState(null);
      } catch {
        if (!controller.signal.aborted) setReverseState({ clipId: clip.id, error: true });
      }
    },
    [commitWith, reverseClip],
  );
  useEffect(() => () => reverseAbort.current?.abort(), []);

  const addHookTitle = useCallback(() => {
    const added = addTitle(timeline, { text: T.hookTitle[locale], start: 0, end: Math.min(Math.max(1, duration), 2.5), style: "naslov" });
    if (!added.id) return;
    commit(added.timeline);
    select({ kind: "title", id: added.id });
  }, [commit, duration, locale, select, timeline]);

  const openTimeline = useCallback(
    (meta: DraftMeta, next: CreaTimelineV1) => {
      pause();
      setDraft(meta);
      setHistory(createHistory(next));
      setSelection(null);
      setProjectSave({ status: "idle" });
      setPresetId(null);
      setPanel(next.main.length === 0 ? "dodaj" : "klip");
      seek(0);
    },
    [pause, seek],
  );

  const openSaved = useCallback(
    async (id: Id<"creaMontages">) => {
      const montage = await convex.query(api.creaMontages.getMontage, { id });
      if (!montage) return;
      const parsed = parseTimeline(montage.doc);
      if (!parsed.ok) return;
      openTimeline({ id: newDraftId(), title: montage.title, origin: montage.origin, convexId: montage._id }, parsed.timeline);
    },
    [convex, openTimeline],
  );

  const saveProject = useCallback(async () => {
    setProjectSave({ status: "saving" });
    try {
      const result = await saveMontage({
        ...(draft.convexId ? { id: draft.convexId as Id<"creaMontages"> } : {}),
        title: draft.title || T.projectPlaceholder[locale],
        doc: serializeTimeline(timeline),
        origin: draft.origin,
        ...(projectId ? { projectId } : {}),
      });
      if (result.ok) {
        setDraft((current) => ({ ...current, convexId: result.id }));
        setProjectSave({ status: "saved" });
        setProjectsKey((value) => value + 1);
      } else {
        setProjectSave({ status: "error", message: T.saveErrors[result.reason][locale] });
      }
    } catch {
      setProjectSave({ status: "error", message: T.saveErrors.OPSTE[locale] });
    }
  }, [draft, locale, projectId, saveMontage, timeline]);

  // Tastatura: razmak pusti/pauza, strelice premotavaju, Delete briše, Ctrl+Z / Ctrl+Y.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === " " && !mod) {
        event.preventDefault();
        toggle();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const step = event.shiftKey ? 1 : 1 / timeline.fps;
        seek(getTime() + (event.key === "ArrowLeft" ? -step : step));
      } else if ((event.key === "Delete" || event.key === "Backspace") && selection && selection.kind !== "transition") {
        event.preventDefault();
        commit(deleteItem(timeline, selection.id));
      } else if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        setHistory((current) => (event.shiftKey ? redo(current) : undo(current)));
      } else if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        setHistory((current) => redo(current));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, getTime, seek, selection, timeline, toggle]);

  const vertical = timeline.aspect === "9:16" || timeline.aspect === "4:5";
  const hasLocalFiles = timelineLocalFileIds(timeline).length > 0;
  const selectedMain = selection?.kind === "main" ? timeline.main.find((clip) => clip.id === selection.id) : undefined;
  const selectedOverlay = selection?.kind === "overlay" ? timeline.overlay.find((clip) => clip.id === selection.id) : undefined;

  let panelBody: ReactNode;
  if (panel === "dodaj") {
    panelBody = (
      <div className="space-y-4">
        <ChoiceChips
          legend={T.aspect[locale]}
          name="oblik"
          options={TIMELINE_ASPECTS.map((aspect) => ({ id: aspect, label: T.aspects[aspect][locale] }))}
          value={timeline.aspect}
          onChange={(aspect) => commit({ ...timeline, aspect })}
        />
        <MediaPicker locale={locale} kinds={["video", "image", "audio"]} busy={adding} allowPip onAddGallery={(items, options) => void addGallery(items, options)} onAddFiles={(files, options) => void addFiles(files, options)} />
      </div>
    );
  } else if (panel === "klip") {
    panelBody = selectedMain ? (
      <ClipInspector
        key={selectedMain.id}
        locale={locale}
        timeline={timeline}
        clip={selectedMain}
        onChange={commit}
        library={library}
        limits={limits}
        tier={tier}
        playheadTime={player.time}
        onSplit={split}
        onReverse={(clip, mode) => void handleReverse(clip, mode)}
        reverseState={reverseState}
      />
    ) : selectedOverlay ? (
      <OverlayInspector key={selectedOverlay.id} locale={locale} timeline={timeline} clip={selectedOverlay} onChange={commit} library={library} playheadTime={player.time} />
    ) : selection?.kind === "transition" ? (
      <TransitionControls locale={locale} timeline={timeline} afterId={selection.id} onChange={commit} library={library} />
    ) : (
      <p className="type-body-sm font-semibold text-muted">{T.pickSomething[locale]}</p>
    );
  } else if (panel === "tekst") {
    panelBody = <TitlesPanel locale={locale} timeline={timeline} selection={selection} onSelect={select} onChange={commit} playheadTime={player.time} />;
  } else if (panel === "zvuk") {
    panelBody = (
      <AudioPanel
        locale={locale}
        timeline={timeline}
        selection={selection}
        onSelect={select}
        onChange={commit}
        library={library}
        playheadTime={player.time}
        mixStatus={mix.status}
        onAdd={() => setPanel("dodaj")}
      />
    );
  } else if (panel === "izvoz") {
    panelBody = (
      <ExportPanel
        locale={locale}
        timeline={timeline}
        onTimelineChange={commit}
        presetId={effectivePreset}
        onPresetChange={setPresetId}
        safeZoneOn={safeZoneOn}
        onSafeZoneChange={setSafeZoneOn}
        tier={tier}
        limits={limits}
        mix={mix}
        media={exportMedia}
        prepareReversed={prepareReversed}
        onAddHookTitle={addHookTitle}
        toolId={tool.id}
        canSave={canSave}
        projectId={projectId}
        onSaved={(jobId) => {
          if (draft.convexId) void markExported({ id: draft.convexId as Id<"creaMontages">, jobId });
        }}
      />
    );
  } else {
    panelBody = (
      <ProjectsPanel
        locale={locale}
        currentDraftId={draft.id}
        currentConvexId={draft.convexId}
        refreshKey={projectsKey}
        onOpenDraft={(item) => openTimeline({ id: item.id, title: item.title, origin: item.origin, convexId: item.convexId ?? null }, item.timeline)}
        onOpenSaved={(id) => void openSaved(id)}
      />
    );
  }

  return (
    <section
      aria-labelledby="crea-tool-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <ToolHeader tool={tool} locale={locale} icon={<Scissors aria-hidden="true" className="size-5" />} />
      {limits.maxLongSide <= 854 ? (
        <p className="mt-3 type-body-sm font-semibold text-muted">{T.weakNote[locale]}</p>
      ) : limits.maxLongSide <= 1280 ? (
        <p className="mt-3 type-body-sm font-semibold text-muted">{T.phoneNote[locale]}</p>
      ) : null}

      {/* Projekat: ime, nova montaža, projekti, čuvanje u Crei. */}
      <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-5">
        <label className="min-w-0 flex-1 basis-56">
          <span className="type-body-sm font-black text-ink">{T.projectName[locale]}</span>
          <input
            value={draft.title}
            maxLength={80}
            placeholder={T.projectPlaceholder[locale]}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            className="surface-inset mt-1 block min-h-11 w-full border-2 border-ink bg-paper-strong px-3 text-base font-bold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        </label>
        <Button
          variant="secondary"
          onClick={() => {
            if (timeline.main.length > 0 && !window.confirm(T.confirmNew[locale])) return;
            openTimeline({ id: newDraftId(), title: "", origin: "rucno", convexId: null }, emptyTimeline(timeline.aspect));
            setProjectsKey((value) => value + 1);
          }}
          icon={<FilePlus2 aria-hidden="true" className="size-4" />}
        >
          {T.newProject[locale]}
        </Button>
        <Button
          onClick={() => void saveProject()}
          loading={projectSave.status === "saving"}
          disabled={!canSave || timeline.main.length === 0}
          icon={<Save aria-hidden="true" className="size-4" />}
        >
          {projectSave.status === "saving" ? T.savingProject[locale] : T.saveProject[locale]}
        </Button>
      </div>
      <div className="mt-2 min-h-5 space-y-1" aria-live="polite">
        {projectSave.status === "saved" ? (
          <p className="type-body-sm font-bold text-ink">
            {T.savedProject[locale]}
            {hasLocalFiles ? <span className="block font-semibold text-muted">{T.localOnlyWarning[locale]}</span> : null}
          </p>
        ) : projectSave.status === "error" ? (
          <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
            {projectSave.message}
          </p>
        ) : draftStatus ? (
          <p className="type-body-sm font-semibold text-muted">{draftStatus === "saved" ? T.draftSaved[locale] : T.draftUnsaved[locale]}</p>
        ) : null}
      </div>

      <div className="@container mt-4 border-t border-line pt-5">
        <div
          className={cn(
            "grid gap-5 [grid-template-areas:'preview'_'timeline'_'panel']",
            vertical && "@min-[600px]:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] @min-[600px]:[grid-template-areas:'preview_panel'_'timeline_timeline']",
          )}
        >
          <div className="min-w-0 [grid-area:preview]">
            <MontagePreview
              locale={locale}
              player={player}
              aspect={timeline.aspect}
              duration={duration}
              safeZone={safeZoneOn ? EXPORT_PRESETS[effectivePreset].safeZone : null}
              empty={timeline.main.length === 0}
              maxHeightVh={timeline.main.length === 0 ? 30 : vertical ? 58 : 50}
            />
          </div>

          <div className="min-w-0 space-y-3 [grid-area:timeline]">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => setPanel("dodaj")} icon={<Plus aria-hidden="true" className="size-4" />}>
                {T.add[locale]}
              </Button>
              <Button variant="secondary" onClick={split} disabled={timeline.main.length === 0} icon={<Scissors aria-hidden="true" className="size-4" />}>
                {T.split[locale]}
              </Button>
              <Button variant="secondary" onClick={() => setPanel("tekst")} disabled={timeline.main.length === 0} icon={<Type aria-hidden="true" className="size-4" />}>
                {T.text[locale]}
              </Button>
              <Button variant="secondary" onClick={() => setPanel("zvuk")} disabled={timeline.main.length === 0} icon={<Music aria-hidden="true" className="size-4" />}>
                {T.sound[locale]}
              </Button>
              <span className="ml-auto inline-flex gap-2">
                <button
                  type="button"
                  onClick={() => setHistory((current) => undo(current))}
                  disabled={!canUndo(history)}
                  aria-label={T.undo[locale]}
                  title={`${T.undo[locale]} (Ctrl+Z)`}
                  className={cn("grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink disabled:opacity-40", FOCUS)}
                >
                  <Undo2 aria-hidden="true" className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setHistory((current) => redo(current))}
                  disabled={!canRedo(history)}
                  aria-label={T.redo[locale]}
                  title={`${T.redo[locale]} (Ctrl+Y)`}
                  className={cn("grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink disabled:opacity-40", FOCUS)}
                >
                  <Redo2 aria-hidden="true" className="size-4" />
                </button>
              </span>
            </div>
            {timeline.main.length === 0 ? (
              <div className="surface-inset border border-dashed border-line bg-paper p-4">
                <p className="type-h4 text-ink">{T.emptyTitle[locale]}</p>
                <p className="mt-1 type-body-sm font-semibold text-muted">{T.emptyBody[locale]}</p>
              </div>
            ) : (
              <MontageTimeline locale={locale} timeline={timeline} onChange={commit} selection={selection} onSelect={select} player={player} library={library} />
            )}
            {notice ? (
              <p role="status" className="type-body-sm font-bold text-ink">
                {notice}
              </p>
            ) : null}
          </div>

          <div className={cn("min-w-0 space-y-4 [grid-area:panel]", vertical && "@min-[600px]:max-h-[78vh] @min-[600px]:overflow-y-auto @min-[600px]:pr-1")}>
            <div role="tablist" aria-label={T.timeline[locale]} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <PanelTab id="dodaj" active={panel === "dodaj"} onSelect={setPanel}>
                <Plus aria-hidden="true" className="size-4" />
                {T.add[locale]}
              </PanelTab>
              <PanelTab id="klip" active={panel === "klip"} onSelect={setPanel}>
                <Scissors aria-hidden="true" className="size-4" />
                {T.clipTab[locale]}
              </PanelTab>
              <PanelTab id="tekst" active={panel === "tekst"} onSelect={setPanel}>
                <Type aria-hidden="true" className="size-4" />
                {T.text[locale]}
              </PanelTab>
              <PanelTab id="zvuk" active={panel === "zvuk"} onSelect={setPanel}>
                <Music aria-hidden="true" className="size-4" />
                {T.sound[locale]}
              </PanelTab>
              <PanelTab id="izvoz" active={panel === "izvoz"} onSelect={setPanel}>
                <Film aria-hidden="true" className="size-4" />
                {T.exportTab[locale]}
              </PanelTab>
              <PanelTab id="projekti" active={panel === "projekti"} onSelect={setPanel}>
                <FolderOpen aria-hidden="true" className="size-4" />
                {T.projects[locale]}
              </PanelTab>
            </div>
            <div id="crea-montaza-panel" role="tabpanel" className="min-w-0">
              {panelBody}
            </div>
          </div>
        </div>
      </div>

      {dragging ? <FullScreenDropOverlay label={T.dropLabel[locale]} hint={T.dropHint[locale]} /> : null}
    </section>
  );
}
