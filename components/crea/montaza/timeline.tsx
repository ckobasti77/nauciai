"use client";

import { ArrowLeftRight, AudioLines, Image as ImageIcon, Minus, Music, Plus, Type, Video } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { formatShort, type MontageSelection } from "@/components/crea/montaza/format";
import type { MediaLibrary } from "@/components/crea/montaza/media-library";
import type { MontagePlayerControls } from "@/components/crea/montaza/use-montage-player";
import { cn } from "@/components/ui/primitives";
import { fillCopy } from "@/lib/crea-copy";
import { MONTAGE_COPY as T } from "@/lib/crea-montage-copy";
import { stickerById, stickerUrl } from "@/lib/crea-stickers";
import {
  assignLanes,
  clipSourceLength,
  mainLayout,
  moveClip,
  timelineDuration,
  trimClip,
  TIMELINE_LIMITS,
  type CreaTimelineV1,
  type MainClip,
} from "@/lib/crea-timeline";
import type { Locale } from "@/lib/i18n";

/**
 * Vremenska linija montaže (K19, V24): sopstvena traka na pointer događajima
 * (ODLUKA K17-7: `@xzdarcy/react-timeline-editor` je 71 KB gzip, preko budžeta
 * UI-ja od 80 KB, i ne zna magnetnu traku). Redovi: tekst i nalepnice · slika u
 * slici · klipovi · zvuk. Dodir bira stavku; ivice izabrane stavke se vuku (i
 * prstom); mišem se klip premešta, a natpis i zvuk pomeraju. Na dodir to isto
 * rade dugmad u inspektoru („Pomeri levo/desno", „Na glavu") - traka se tada
 * slobodno skroluje prstom.
 */

const RULER_H = 28;
/** Visina jednog reda stavki (meta 44 px + razmak). */
const LANE_H = 48;
const MIN_PPS = 6;
const MAX_PPS = 240;
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

type Drag =
  | { kind: "trim"; target: "main" | "overlay" | "audio" | "title" | "sticker"; id: string; edge: "start" | "end"; x: number; moved: boolean }
  | { kind: "move"; target: "main" | "overlay" | "audio" | "title" | "sticker"; id: string; x: number; moved: boolean }
  | { kind: "scrub" };

function Track({ label, icon, height, children }: { label: string; icon: ReactNode; height: number; children: ReactNode }) {
  return (
    <div className="relative border-t border-line" style={{ height }}>
      <span className="pointer-events-none sticky left-0 z-20 inline-flex h-6 items-center gap-1 rounded-full bg-paper-strong/90 px-2 text-[11px] font-black text-muted">
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

function Handle({ edge, label, onPointerDown }: { edge: "start" | "end"; label: string; onPointerDown: (event: ReactPointerEvent) => void }) {
  return (
    <span
      role="presentation"
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
      // Mala vidljiva ručka, a meta za prst je 44 px (nevidljivo proširenje).
      className={cn(
        "absolute top-0 z-10 flex h-full w-11 cursor-ew-resize touch-none items-center",
        edge === "start" ? "-left-5 justify-end" : "-right-5 justify-start",
      )}
    >
      <span className="block h-[70%] w-2.5 rounded-full border-2 border-ink bg-yellow" />
    </span>
  );
}

export function MontageTimeline({
  locale,
  timeline,
  onChange,
  selection,
  onSelect,
  player,
  library,
}: {
  locale: Locale;
  timeline: CreaTimelineV1;
  onChange: (next: CreaTimelineV1, key?: string) => void;
  selection: MontageSelection;
  onSelect: (next: MontageSelection) => void;
  player: MontagePlayerControls;
  library: MediaLibrary;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const [viewWidth, setViewWidth] = useState(600);
  const [zoom, setZoom] = useState<number | null>(null);
  const [preview, setPreview] = useState<CreaTimelineV1 | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const { subscribe, getTime, seek, version } = player;
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  const shown = preview ?? timeline;
  const duration = timelineDuration(shown);
  const layout = useMemo(() => mainLayout(shown), [shown]);
  const fitPps = Math.min(MAX_PPS, Math.max(MIN_PPS, (viewWidth - 72) / Math.max(4, timelineDuration(timeline))));
  const pps = zoom ?? fitPps;
  const contentWidth = Math.max(viewWidth, (duration + 2) * pps + 48);
  const hasOverlay = shown.overlay.length > 0;
  // Stavke koje se preklapaju u vremenu idu u svoje redove (inače bi se sakrile jedna iza druge).
  const textLanes = useMemo(() => assignLanes([...shown.titles, ...shown.stickers]), [shown]);
  const overlayLanes = useMemo(() => assignLanes(shown.overlay.map((clip) => ({ start: clip.start, end: clip.start + clipSourceLength(clip) }))), [shown]);
  const audioLanes = useMemo(
    () => assignLanes(shown.audio.map((clip) => ({ start: clip.start, end: clip.start + Math.min(clipSourceLength(clip), Math.max(0.1, duration - clip.start + 0.5)) }))),
    [shown, duration],
  );
  const laneHeight = (lanes: number[]) => Math.max(1, ...lanes.map((lane) => lane + 1)) * LANE_H + 4;
  const laneTop = (lane: number) => 4 + lane * LANE_H;

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(([entry]) => setViewWidth(Math.round(entry.contentRect.width)));
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // Glava za reprodukciju se pomera bez renderovanja; dok svira, traka je prati.
  useEffect(() => {
    const move = (time: number, playing: boolean) => {
      const x = time * pps;
      if (playheadRef.current) playheadRef.current.style.transform = `translateX(${x}px)`;
      const scroller = scrollerRef.current;
      if (playing && scroller && (x < scroller.scrollLeft || x > scroller.scrollLeft + scroller.clientWidth - 40)) {
        scroller.scrollLeft = Math.max(0, x - 40);
      }
    };
    move(getTime(), false);
    return subscribe(move);
  }, [subscribe, getTime, pps, version]);

  const timeAt = (clientX: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return 0;
    const rect = scroller.getBoundingClientRect();
    return Math.min(duration, Math.max(0, (clientX - rect.left + scroller.scrollLeft) / pps));
  };

  const sourceDuration = (clip: { src: MainClip["src"] }) => library.get(clip.src)?.durationS ?? null;

  /** Primeni povlačenje na kopiju linije (pregled) - u istoriju ide tek na pušten prst/miš. */
  const applyDrag = (state: Drag, delta: number): CreaTimelineV1 => {
    if (state.kind === "scrub") return timeline;
    const snap = (value: number) => Math.round(value * 20) / 20;
    if (state.target === "main") {
      if (state.kind === "trim") {
        return { ...timeline, main: timeline.main.map((clip) => (clip.id === state.id ? trimClip(clip, state.edge, delta, sourceDuration(clip)) : clip)) };
      }
      return timeline;
    }
    if (state.target === "title" || state.target === "sticker") {
      const key = state.target === "title" ? "titles" : "stickers";
      const items = timeline[key].map((item) => {
        if (item.id !== state.id) return item;
        const length = item.end - item.start;
        if (state.kind === "move") {
          const start = snap(Math.min(Math.max(0, item.start + delta), Math.max(0, TIMELINE_LIMITS.durationS - length)));
          return { ...item, start, end: start + length };
        }
        return state.edge === "start"
          ? { ...item, start: snap(Math.min(Math.max(0, item.start + delta), item.end - 0.3)) }
          : { ...item, end: snap(Math.max(item.start + 0.3, item.end + delta)) };
      });
      return { ...timeline, [key]: items };
    }
    const key = state.target === "overlay" ? "overlay" : "audio";
    const items = (timeline[key] as Array<CreaTimelineV1["overlay"][number] | CreaTimelineV1["audio"][number]>).map((item) => {
      if (item.id !== state.id) return item;
      if (state.kind === "move") return { ...item, start: snap(Math.max(0, item.start + delta)) };
      const isImage = "media" in item && item.media === "image";
      if (state.edge === "start") {
        const shift = Math.min(Math.max(isImage ? -Infinity : -item.in, delta), clipSourceLength(item) - 0.2);
        const start = Math.max(0, item.start + shift);
        const applied = start - item.start;
        return isImage ? { ...item, start, out: item.out - applied } : { ...item, start, in: item.in + applied };
      }
      const max = isImage ? TIMELINE_LIMITS.imageMaxS : (library.get(item.src)?.durationS ?? item.out);
      return { ...item, out: Math.min(Math.max(item.in + 0.2, item.out + delta), Math.max(max, item.in + 0.2)) };
    });
    return { ...timeline, [key]: items };
  };

  const startDrag = (event: ReactPointerEvent, state: Drag) => {
    if (event.button !== 0) return;
    // Premeštanje celih stavki samo mišem/olovkom; prst skroluje traku.
    if (state.kind === "move" && event.pointerType === "touch") return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = state;
    if (state.kind === "move" && state.target === "main") setDraggedId(state.id);
    if (state.kind === "scrub") seek(timeAt(event.clientX));
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const state = drag.current;
    if (!state) return;
    if (state.kind === "scrub") {
      seek(timeAt(event.clientX));
      return;
    }
    const dx = event.clientX - state.x;
    if (!state.moved && Math.abs(dx) < 5) return;
    state.moved = true;
    if (state.kind === "move" && state.target === "main") {
      const x = timeAt(event.clientX);
      const others = layout.filter((placement) => placement.clip.id !== state.id);
      setDropIndex(others.filter((placement) => (placement.start + placement.end) / 2 < x).length);
      return;
    }
    setPreview(applyDrag(state, dx / pps));
  };

  const onPointerUp = (event: ReactPointerEvent) => {
    const state = drag.current;
    drag.current = null;
    if (!state || state.kind === "scrub") return;
    if (state.moved) suppressClick.current = true;
    if (state.kind === "move" && state.target === "main") {
      if (state.moved && dropIndex !== null) onChange(moveClip(timeline, state.id, dropIndex));
      setDropIndex(null);
      setDraggedId(null);
      return;
    }
    if (!state.moved) return;
    const next = applyDrag(state, (event.clientX - state.x) / pps);
    setPreview(null);
    onChange(next);
    if (state.kind === "trim" && state.target === "main") {
      const placement = mainLayout(next).find((entry) => entry.clip.id === state.id);
      if (placement) seek(state.edge === "start" ? placement.start : Math.max(placement.start, placement.end - 0.05));
    }
  };

  const select = (next: MontageSelection) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onSelect(next);
  };

  const isSelected = (kind: NonNullable<MontageSelection>["kind"], id: string) => selection?.kind === kind && selection.id === id;
  const ticks = useMemo(() => {
    const step = pps >= 60 ? 1 : pps >= 24 ? 2 : pps >= 10 ? 5 : 10;
    return Array.from({ length: Math.floor((contentWidth / pps) / step) + 1 }, (_, index) => index * step);
  }, [pps, contentWidth]);

  const zoomBy = (factor: number) => setZoom(Math.min(MAX_PPS, Math.max(MIN_PPS, pps * factor)));

  return (
    <div role="region" aria-label={T.timeline[locale]} className="min-w-0">
      <div className="mb-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.5)}
          disabled={pps <= MIN_PPS}
          aria-label={T.zoomOut[locale]}
          title={T.zoomOut[locale]}
          className={cn("grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink disabled:opacity-40", FOCUS)}
        >
          <Minus aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1.5)}
          disabled={pps >= MAX_PPS}
          aria-label={T.zoomIn[locale]}
          title={T.zoomIn[locale]}
          className={cn("grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink disabled:opacity-40", FOCUS)}
        >
          <Plus aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div
        ref={scrollerRef}
        className="surface-inset relative overflow-x-auto overflow-y-hidden bg-paper shadow-[inset_0_0_0_1px_var(--shadow-hard-14)] [scrollbar-color:var(--ink)_transparent]"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setPreview(null);
          setDropIndex(null);
          setDraggedId(null);
        }}
      >
        <div className="relative select-none" style={{ width: contentWidth }}>
          {/* Lenjir: dodir/povlačenje premotava. */}
          <div
            className="relative cursor-pointer touch-none"
            style={{ height: RULER_H }}
            onPointerDown={(event) => startDrag(event, { kind: "scrub" })}
          >
            {ticks.map((second) => (
              <span key={second} className="absolute top-0 h-full border-l border-line pl-1 font-mono text-[10px] font-bold leading-[28px] text-muted" style={{ left: second * pps }}>
                {formatShort(second, locale).replace(/[,.]0 s$/, " s")}
              </span>
            ))}
          </div>

          <Track label={T.trackText[locale]} icon={<Type aria-hidden="true" className="size-3" />} height={laneHeight(textLanes)}>
            {shown.titles.map((title, titleIndex) => (
              <button
                key={title.id}
                type="button"
                aria-pressed={isSelected("title", title.id)}
                aria-label={`${T.titleStyles[title.style][locale]}: ${title.text || "…"}`}
                onPointerDown={(event) => startDrag(event, { kind: "move", target: "title", id: title.id, x: event.clientX, moved: false })}
                onClick={() => select({ kind: "title", id: title.id })}
                className={cn(
                  "absolute flex h-11 items-center overflow-visible rounded-full border-2 px-3 text-left text-xs font-black text-ink",
                  isSelected("title", title.id) ? "z-10 border-ink bg-yellow" : "border-ink/30 bg-surface-b hover:border-ink",
                  FOCUS,
                )}
                style={{ left: title.start * pps, top: laneTop(textLanes[titleIndex] ?? 0), width: Math.max(44, (title.end - title.start) * pps) }}
              >
                <span className="truncate">{title.text || "…"}</span>
                {isSelected("title", title.id) ? (
                  <>
                    <Handle edge="start" label={T.trimStart[locale]} onPointerDown={(event) => startDrag(event, { kind: "trim", target: "title", id: title.id, edge: "start", x: event.clientX, moved: false })} />
                    <Handle edge="end" label={T.trimEnd[locale]} onPointerDown={(event) => startDrag(event, { kind: "trim", target: "title", id: title.id, edge: "end", x: event.clientX, moved: false })} />
                  </>
                ) : null}
              </button>
            ))}
            {shown.stickers.map((sticker, stickerIndex) => (
              <button
                key={sticker.id}
                type="button"
                aria-pressed={isSelected("sticker", sticker.id)}
                aria-label={`${T.stickerName[locale]}: ${stickerById(sticker.sticker)?.label[locale] ?? sticker.sticker}`}
                onPointerDown={(event) => startDrag(event, { kind: "move", target: "sticker", id: sticker.id, x: event.clientX, moved: false })}
                onClick={() => select({ kind: "sticker", id: sticker.id })}
                className={cn(
                  "absolute flex h-11 items-center gap-1 overflow-visible rounded-full border-2 px-2",
                  isSelected("sticker", sticker.id) ? "z-10 border-ink bg-yellow" : "border-ink/30 bg-surface-a hover:border-ink",
                  FOCUS,
                )}
                style={{ left: sticker.start * pps, top: laneTop(textLanes[shown.titles.length + stickerIndex] ?? 0), width: Math.max(44, (sticker.end - sticker.start) * pps) }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- naša mala SVG nalepnica, isti origin. */}
                <img src={stickerUrl(sticker.sticker)} alt="" className="size-5 shrink-0" />
                {isSelected("sticker", sticker.id) ? (
                  <>
                    <Handle edge="start" label={T.trimStart[locale]} onPointerDown={(event) => startDrag(event, { kind: "trim", target: "sticker", id: sticker.id, edge: "start", x: event.clientX, moved: false })} />
                    <Handle edge="end" label={T.trimEnd[locale]} onPointerDown={(event) => startDrag(event, { kind: "trim", target: "sticker", id: sticker.id, edge: "end", x: event.clientX, moved: false })} />
                  </>
                ) : null}
              </button>
            ))}
          </Track>

          {hasOverlay ? (
            <Track label={T.trackOverlay[locale]} icon={<ImageIcon aria-hidden="true" className="size-3" />} height={laneHeight(overlayLanes)}>
              {shown.overlay.map((clip, overlayIndex) => {
                const entry = library.get(clip.src);
                return (
                  <button
                    key={clip.id}
                    type="button"
                    aria-pressed={isSelected("overlay", clip.id)}
                    aria-label={`${T.pipTitle[locale]} · ${formatShort(clipSourceLength(clip), locale)}`}
                    onPointerDown={(event) => startDrag(event, { kind: "move", target: "overlay", id: clip.id, x: event.clientX, moved: false })}
                    onClick={() => select({ kind: "overlay", id: clip.id })}
                    className={cn(
                      "surface-media absolute h-11 overflow-visible border-2 bg-surface-b bg-cover bg-center",
                      isSelected("overlay", clip.id) ? "z-10 border-ink ring-2 ring-yellow" : "border-ink/30 hover:border-ink",
                      FOCUS,
                    )}
                    style={{
                      left: clip.start * pps,
                      top: laneTop(overlayLanes[overlayIndex] ?? 0),
                      width: Math.max(44, clipSourceLength(clip) * pps),
                      backgroundImage: entry?.thumbUrl ? `url("${entry.thumbUrl}")` : undefined,
                    }}
                  >
                    {isSelected("overlay", clip.id) ? (
                      <>
                        <Handle edge="start" label={T.trimStart[locale]} onPointerDown={(event) => startDrag(event, { kind: "trim", target: "overlay", id: clip.id, edge: "start", x: event.clientX, moved: false })} />
                        <Handle edge="end" label={T.trimEnd[locale]} onPointerDown={(event) => startDrag(event, { kind: "trim", target: "overlay", id: clip.id, edge: "end", x: event.clientX, moved: false })} />
                      </>
                    ) : null}
                  </button>
                );
              })}
            </Track>
          ) : null}

          <Track label={T.trackMain[locale]} icon={<Video aria-hidden="true" className="size-3" />} height={72}>
            {layout.map((placement, index) => {
              const { clip } = placement;
              const entry = library.get(clip.src);
              const broken = entry?.status === "expired" || entry?.status === "missing" || entry?.status === "unreadable";
              const selected = isSelected("main", clip.id);
              return (
                <button
                  key={clip.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${fillCopy(clip.media === "image" ? T.photoTitle[locale] : T.clipTitle[locale], { n: index + 1 })} · ${formatShort(placement.length, locale)}`}
                  onPointerDown={(event) => startDrag(event, { kind: "move", target: "main", id: clip.id, x: event.clientX, moved: false })}
                  onClick={() => select({ kind: "main", id: clip.id })}
                  className={cn(
                    "surface-media absolute top-2 h-14 overflow-visible border-2 bg-surface-b bg-left text-left",
                    clip.media === "image" ? "bg-cover" : "bg-[length:auto_100%] bg-repeat-x",
                    selected ? "z-10 border-ink ring-2 ring-yellow" : "border-ink/30 hover:border-ink",
                    FOCUS,
                  )}
                  style={{
                    left: placement.start * pps,
                    width: Math.max(16, placement.length * pps - 2),
                    backgroundImage: entry?.thumbUrl && !broken ? `url("${entry.thumbUrl}")` : undefined,
                  }}
                >
                  <span className="absolute bottom-1 left-1 inline-flex max-w-[calc(100%-8px)] items-center gap-1 truncate rounded-full bg-paper-strong/90 px-1.5 text-[10px] font-black text-ink">
                    {clip.media === "image" ? <ImageIcon aria-hidden="true" className="size-3" /> : <Video aria-hidden="true" className="size-3" />}
                    {index + 1}
                    {broken ? ` · ${entry?.status === "expired" ? T.expiredBadge[locale] : T.missingBadge[locale]}` : ""}
                  </span>
                  {selected ? (
                    <>
                      <Handle edge="start" label={T.trimStart[locale]} onPointerDown={(event) => startDrag(event, { kind: "trim", target: "main", id: clip.id, edge: "start", x: event.clientX, moved: false })} />
                      <Handle edge="end" label={T.trimEnd[locale]} onPointerDown={(event) => startDrag(event, { kind: "trim", target: "main", id: clip.id, edge: "end", x: event.clientX, moved: false })} />
                    </>
                  ) : null}
                </button>
              );
            })}
            {/* Prelazi: dugme na spoju dva klipa. */}
            {layout.slice(0, -1).map((placement, index) => {
              const next = layout[index + 1];
              const transition = placement.transitionOut;
              const center = transition ? next.start + transition.duration / 2 : next.start;
              const selected = isSelected("transition", placement.clip.id);
              return (
                <button
                  key={`t-${placement.clip.id}`}
                  type="button"
                  aria-pressed={selected}
                  aria-label={fillCopy(T.transitionAfter[locale], { n: index + 1 })}
                  title={transition ? T.transitions[transition.kind][locale] : T.transitionNone[locale]}
                  onClick={() => select({ kind: "transition", id: placement.clip.id })}
                  className={cn("absolute top-3.5 z-20 grid size-11 -translate-x-1/2 place-items-center rounded-full", FOCUS)}
                  style={{ left: center * pps }}
                >
                  <span
                    className={cn(
                      "grid size-7 place-items-center rounded-full border-2 border-ink",
                      selected ? "bg-yellow" : transition ? "bg-ink text-paper-strong" : "bg-paper text-ink",
                    )}
                  >
                    <ArrowLeftRight aria-hidden="true" className="size-3.5" />
                  </span>
                </button>
              );
            })}
            {dropIndex !== null ? (
              <span
                aria-hidden="true"
                className="absolute top-1 z-30 h-16 w-1 -translate-x-1/2 rounded-full bg-yellow"
                style={{ left: (layout.filter((placement) => placement.clip.id !== draggedId)[dropIndex]?.start ?? duration) * pps }}
              />
            ) : null}
          </Track>

          <Track label={T.trackAudio[locale]} icon={<AudioLines aria-hidden="true" className="size-3" />} height={laneHeight(audioLanes)}>
            {shown.audio.map((clip, index) => (
              <button
                key={clip.id}
                type="button"
                aria-pressed={isSelected("audio", clip.id)}
                aria-label={`${fillCopy(T.soundItem[locale], { n: index + 1 })} · ${T.roles[clip.role][locale]}`}
                onPointerDown={(event) => startDrag(event, { kind: "move", target: "audio", id: clip.id, x: event.clientX, moved: false })}
                onClick={() => select({ kind: "audio", id: clip.id })}
                className={cn(
                  "absolute flex h-11 items-center gap-1 overflow-visible rounded-full border-2 px-3 text-xs font-black text-ink",
                  isSelected("audio", clip.id) ? "z-10 border-ink bg-yellow" : "border-ink/30 bg-surface-a hover:border-ink",
                  FOCUS,
                )}
                style={{
                  left: clip.start * pps,
                  top: laneTop(audioLanes[index] ?? 0),
                  width: Math.max(44, Math.min(clipSourceLength(clip), Math.max(0.1, duration - clip.start + 0.5)) * pps),
                }}
              >
                <Music aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">{T.roles[clip.role][locale]}</span>
                {isSelected("audio", clip.id) ? (
                  <>
                    <Handle edge="start" label={T.trimStart[locale]} onPointerDown={(event) => startDrag(event, { kind: "trim", target: "audio", id: clip.id, edge: "start", x: event.clientX, moved: false })} />
                    <Handle edge="end" label={T.trimEnd[locale]} onPointerDown={(event) => startDrag(event, { kind: "trim", target: "audio", id: clip.id, edge: "end", x: event.clientX, moved: false })} />
                  </>
                ) : null}
              </button>
            ))}
          </Track>

          {/* Glava za reprodukciju. */}
          <div
            ref={playheadRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 z-30 h-full w-0.5 bg-ink"
            style={{ transform: `translateX(${player.time * pps}px)` }}
          >
            <span className="absolute -left-[7px] top-0 size-4 rounded-full border-2 border-ink bg-yellow" />
          </div>
        </div>
      </div>
    </div>
  );
}
