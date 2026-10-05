"use client";

import { ArrowLeft, ArrowRight, Copy, Scissors, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { RangeField } from "@/components/crea/editor/controls";
import { formatShort } from "@/components/crea/montaza/format";
import type { MediaLibrary } from "@/components/crea/montaza/media-library";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { Button } from "@/components/ui/button";
import { fillCopy } from "@/lib/crea-copy";
import { KEN_BURNS_PRESETS, KEN_BURNS_PRESET_IDS, type KenBurnsPresetId } from "@/lib/crea-ken-burns";
import { MONTAGE_COPY as T } from "@/lib/crea-montage-copy";
import {
  aspectRatio,
  clipOutputLength,
  clipSourceLength,
  duplicateItem,
  deleteItem,
  mainLayout,
  maxTransitionDuration,
  moveClip,
  setTransition,
  SPEED_RAMP_IDS,
  SPEED_RAMP_PRESETS,
  timelineDuration,
  TIMELINE_LIMITS,
  TRANSITION_KINDS,
  updateItem,
  updateMainClip,
  type CreaTimelineV1,
  type MainClip,
  type OverlayClip,
  type Rect01,
  type SpeedRampId,
  type TransitionKind,
} from "@/lib/crea-timeline";
import type { ExportLimits, VideoSupportTier } from "@/lib/crea-video-caps";
import type { Locale } from "@/lib/i18n";

/**
 * Inspektor izabranog klipa (K19): skraćivanje, brzina i rampa, smer (unazad,
 * bumerang), zvuk, kadar, pokret fotke, prelaz i radnje. Sve što se na traci
 * radi prstom ili mišem ovde ima i dugme ili klizač (tastatura, dodir, čitač
 * ekrana).
 */

export type ReverseState = { clipId: string; percent: number } | { clipId: string; error: true } | null;

type Commit = (next: CreaTimelineV1, key?: string) => void;

const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 4] as const;

/** Grupa kontrola odvojena tankom linijom; naslov samo kad ga kontrola sama nema. */
function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-line pt-4 first:border-t-0 first:pt-0">
      {title ? <h4 className="type-body-sm font-black uppercase tracking-normal text-muted">{title}</h4> : null}
      {children}
    </section>
  );
}

function sameKenBurns(a: MainClip["kenBurns"], b: MainClip["kenBurns"]): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function rampOf(clip: MainClip): SpeedRampId | "none" | "custom" {
  if (!clip.speedKeys) return "none";
  return SPEED_RAMP_IDS.find((id) => JSON.stringify(SPEED_RAMP_PRESETS[id]) === JSON.stringify(clip.speedKeys)) ?? "custom";
}

export function ClipInspector({
  locale,
  timeline,
  clip,
  onChange,
  library,
  limits,
  tier,
  playheadTime,
  onSplit,
  onReverse,
  reverseState,
}: {
  locale: Locale;
  timeline: CreaTimelineV1;
  clip: MainClip;
  onChange: Commit;
  library: MediaLibrary;
  limits: ExportLimits;
  tier: VideoSupportTier;
  playheadTime: number;
  onSplit: () => void;
  onReverse: (clip: MainClip, mode: "reverse" | "boomerang") => void;
  reverseState: ReverseState;
}) {
  const index = timeline.main.findIndex((entry) => entry.id === clip.id);
  const entry = library.get(clip.src);
  const sourceDuration = entry?.durationS ?? clip.out;
  const isVideo = clip.media === "video";
  const ramp = rampOf(clip);
  const set = (patch: Partial<Omit<MainClip, "id">>, key?: string) => onChange(updateMainClip(timeline, clip.id, patch), key);
  const reverseBlocked =
    tier !== "webcodecs" ? T.reverseNoCodecs[locale] : limits.reverseMaxS <= 0 ? T.reverseWeak[locale] : clipSourceLength(clip) > limits.reverseMaxS + 0.01 ? fillCopy(T.reverseLimit[locale], { s: formatShort(limits.reverseMaxS, locale) }) : null;
  const reversing = reverseState && reverseState.clipId === clip.id && "percent" in reverseState ? reverseState.percent : null;
  const reverseFailed = reverseState && reverseState.clipId === clip.id && "error" in reverseState;
  const broken = entry?.status === "expired" ? T.expiredClip[locale] : entry?.status === "missing" || entry?.status === "unreadable" ? T.missingClip[locale] : null;
  const after = index < timeline.main.length - 1 ? timeline.main[index + 1] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="type-h4 text-ink">{fillCopy(isVideo ? T.clipTitle[locale] : T.photoTitle[locale], { n: index + 1 })}</h3>
        <p className="font-mono text-xs font-bold text-muted">{fillCopy(T.onTrack[locale], { s: formatShort(clipOutputLength(clip), locale) })}</p>
      </div>
      {broken ? <p className="surface-inset bg-paper p-3 type-body-sm font-bold text-ink">{broken}</p> : null}

      <Section>
        {isVideo ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <RangeField
              label={T.sourceStart[locale]}
              value={clip.in}
              min={0}
              max={Math.max(0, clip.out - TIMELINE_LIMITS.clipMinS)}
              step={0.1}
              display={formatShort(clip.in, locale)}
              onChange={(value) => set({ in: value }, `in:${clip.id}`)}
            />
            <RangeField
              label={T.sourceEnd[locale]}
              value={clip.out}
              min={clip.in + TIMELINE_LIMITS.clipMinS}
              max={Math.max(clip.in + TIMELINE_LIMITS.clipMinS, sourceDuration)}
              step={0.1}
              display={formatShort(clip.out, locale)}
              onChange={(value) => set({ out: value }, `out:${clip.id}`)}
            />
          </div>
        ) : (
          <RangeField
            label={T.photoLength[locale]}
            value={clip.out}
            min={0.5}
            max={15}
            step={0.1}
            display={formatShort(clip.out, locale)}
            onChange={(value) => set({ out: value }, `out:${clip.id}`)}
          />
        )}
      </Section>

      {isVideo ? (
        <Section>
          <ChoiceChips
            legend={T.speed[locale]}
            name={`brzina-${clip.id}`}
            options={SPEEDS.map((speed): { id: number; label: string } => ({ id: speed, label: `${String(speed).replace(".", locale === "sr" ? "," : ".")}×` }))}
            value={ramp === "none" ? clip.speed : -1}
            onChange={(speed) => set({ speed, speedKeys: undefined })}
          />
          <ChoiceChips
            legend={T.ramp[locale]}
            name={`rampa-${clip.id}`}
            options={[{ id: "none" as const, label: T.rampNone[locale] }, ...SPEED_RAMP_IDS.map((id) => ({ id, label: T.ramps[id][locale] }))]}
            value={ramp === "custom" ? "none" : ramp}
            onChange={(id) => set(id === "none" ? { speedKeys: undefined } : { speedKeys: SPEED_RAMP_PRESETS[id] })}
          />
          <p className="type-body-sm font-semibold text-muted">{T.speedAudioNote[locale]}</p>
        </Section>
      ) : null}

      {isVideo ? (
        <Section>
          <ChoiceChips
            legend={T.direction[locale]}
            name={`smer-${clip.id}`}
            disabled={reversing !== null}
            options={[
              { id: "napred" as const, label: T.forward[locale] },
              { id: "unazad" as const, label: T.reverse[locale] },
              { id: "bumerang" as const, label: T.boomerang[locale] },
            ]}
            value={clip.boomerang ? "bumerang" : clip.reverse ? "unazad" : "napred"}
            onChange={(direction) => {
              if (direction === "napred") set({ reverse: undefined, boomerang: undefined });
              else if (!reverseBlocked) onReverse(clip, direction === "unazad" ? "reverse" : "boomerang");
            }}
          />
          {reversing !== null ? (
            <p role="status" className="type-body-sm font-black text-ink">
              {fillCopy(T.reversing[locale], { p: Math.round(reversing) })}
            </p>
          ) : reverseFailed ? (
            <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
              {T.reverseFailed[locale]}
            </p>
          ) : reverseBlocked && !clip.reverse && !clip.boomerang ? (
            <p className="type-body-sm font-semibold text-muted">{reverseBlocked}</p>
          ) : null}
        </Section>
      ) : null}

      {isVideo ? (
        <Section>
          <RangeField
            label={T.volume[locale]}
            value={clip.volumeDb}
            min={TIMELINE_LIMITS.volumeMinDb}
            max={TIMELINE_LIMITS.volumeMaxDb}
            step={1}
            display={`${clip.volumeDb > 0 ? "+" : ""}${clip.volumeDb} dB`}
            onChange={(value) => set({ volumeDb: value }, `vol:${clip.id}`)}
          />
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 type-body-sm font-black text-ink">
              <input type="checkbox" checked={clip.muted} onChange={(event) => set({ muted: event.target.checked })} className="size-5 accent-ink" />
              {T.mute[locale]}
            </label>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 type-body-sm font-black text-ink">
              <input
                type="checkbox"
                checked={clip.isVoice === true}
                onChange={(event) => set({ isVoice: event.target.checked ? true : undefined })}
                className="size-5 accent-ink"
              />
              {T.isVoice[locale]}
            </label>
          </div>
        </Section>
      ) : null}

      <Section>
        <ChoiceChips
          legend={T.fit[locale]}
          name={`kadar-${clip.id}`}
          options={[
            { id: "cover" as const, label: T.fitCover[locale] },
            { id: "contain" as const, label: T.fitContain[locale] },
          ]}
          value={clip.fit}
          onChange={(fit) => set({ fit })}
        />
        {!isVideo && clip.fit === "cover" ? (
          <ChoiceChips
            legend={T.kenBurns[locale]}
            name={`kb-${clip.id}`}
            options={[{ id: "mirno" as const, label: T.kenBurnsNone[locale] }, ...KEN_BURNS_PRESET_IDS.map((id) => ({ id, label: T.kenBurnsPresets[id][locale] }))]}
            value={KEN_BURNS_PRESET_IDS.find((id) => sameKenBurns(KEN_BURNS_PRESETS[id], clip.kenBurns)) ?? "mirno"}
            onChange={(id: KenBurnsPresetId | "mirno") => set({ kenBurns: id === "mirno" ? undefined : KEN_BURNS_PRESETS[id] })}
          />
        ) : null}
      </Section>

      {after ? (
        <Section>
          <TransitionControls locale={locale} timeline={timeline} afterId={clip.id} onChange={onChange} />
        </Section>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="secondary" disabled={index <= 0} onClick={() => onChange(moveClip(timeline, clip.id, index - 1))} icon={<ArrowLeft aria-hidden="true" className="size-4" />}>
          {T.moveLeft[locale]}
        </Button>
        <Button
          variant="secondary"
         
          disabled={index >= timeline.main.length - 1}
          onClick={() => onChange(moveClip(timeline, clip.id, index + 1))}
          icon={<ArrowRight aria-hidden="true" className="size-4" />}
        >
          {T.moveRight[locale]}
        </Button>
        <Button variant="secondary" onClick={onSplit} disabled={!isPlayheadOver(timeline, clip.id, playheadTime)} icon={<Scissors aria-hidden="true" className="size-4" />}>
          {T.splitHere[locale]}
        </Button>
        <Button
          variant="secondary"
         
          disabled={timeline.main.length >= limits.maxClips || timelineDuration(timeline) + clipOutputLength(clip) > TIMELINE_LIMITS.durationS}
          onClick={() => onChange(duplicateItem(timeline, clip.id).timeline)}
          icon={<Copy aria-hidden="true" className="size-4" />}
        >
          {T.duplicate[locale]}
        </Button>
        <Button variant="secondary" onClick={() => onChange(deleteItem(timeline, clip.id))} icon={<Trash2 aria-hidden="true" className="size-4" />}>
          {T.remove[locale]}
        </Button>
      </div>
    </div>
  );
}

function isPlayheadOver(timeline: CreaTimelineV1, clipId: string, time: number): boolean {
  const placement = mainLayout(timeline).find((entry) => entry.clip.id === clipId);
  return placement !== undefined && time - placement.start >= TIMELINE_LIMITS.clipMinS && placement.end - time >= TIMELINE_LIMITS.clipMinS;
}

export function TransitionControls({
  locale,
  timeline,
  afterId,
  onChange,
}: {
  locale: Locale;
  timeline: CreaTimelineV1;
  afterId: string;
  onChange: Commit;
}) {
  const index = timeline.main.findIndex((clip) => clip.id === afterId);
  const current = timeline.transitions.find((transition) => transition.after === afterId) ?? null;
  const a = timeline.main[index];
  const b = timeline.main[index + 1];
  if (!a || !b) return null;
  const max = maxTransitionDuration(a, b);
  return (
    <div className="space-y-3">
      <ChoiceChips
        legend={fillCopy(T.transitionAfter[locale], { n: index + 1 })}
        name={`prelaz-${afterId}`}
        options={[{ id: "rez" as const, label: T.transitionNone[locale] }, ...TRANSITION_KINDS.map((kind) => ({ id: kind, label: T.transitions[kind][locale] }))]}
        value={current?.kind ?? "rez"}
        onChange={(kind: TransitionKind | "rez") =>
          onChange(setTransition(timeline, afterId, kind === "rez" ? null : kind, current?.duration ?? Math.min(0.5, max)))
        }
      />
      {current && max >= TIMELINE_LIMITS.transitionMinS ? (
        <RangeField
          label={T.transitionLength[locale]}
          value={current.duration}
          min={TIMELINE_LIMITS.transitionMinS}
          max={Math.max(TIMELINE_LIMITS.transitionMinS, Math.round(max * 10) / 10)}
          step={0.1}
          display={formatShort(current.duration, locale)}
          onChange={(value) => onChange(setTransition(timeline, afterId, current.kind, value), `prelaz:${afterId}`)}
        />
      ) : null}
    </div>
  );
}

const PIP_POSITIONS = ["gore-levo", "gore-desno", "dole-levo", "dole-desno", "sredina"] as const;
type PipPosition = (typeof PIP_POSITIONS)[number];

/** Pravougaonik slike u slici: širina `size`, visina po obliku izvora, uz 4 % margine. */
export function pipRect(position: PipPosition, size: number, mediaAspect: number, timelineAspect: number): Rect01 {
  const w = Math.min(0.9, Math.max(0.12, size));
  const h = Math.min(0.9, (w * timelineAspect) / Math.max(0.1, mediaAspect));
  const margin = 0.04;
  const left = position.endsWith("levo") ? margin : position.endsWith("desno") ? 1 - margin - w : (1 - w) / 2;
  const top = position.startsWith("gore") ? margin * timelineAspect : position.startsWith("dole") ? 1 - margin * timelineAspect - h : (1 - h) / 2;
  return { x: left, y: Math.max(0, top), w, h };
}

function positionOf(rect: Rect01): PipPosition | null {
  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  if (Math.abs(centerX - 0.5) < 0.05 && Math.abs(centerY - 0.5) < 0.05) return "sredina";
  const vertical = centerY < 0.5 ? "gore" : "dole";
  const horizontal = centerX < 0.5 ? "levo" : "desno";
  return `${vertical}-${horizontal}` as PipPosition;
}

export function OverlayInspector({
  locale,
  timeline,
  clip,
  onChange,
  library,
  playheadTime,
}: {
  locale: Locale;
  timeline: CreaTimelineV1;
  clip: OverlayClip;
  onChange: Commit;
  library: MediaLibrary;
  playheadTime: number;
}) {
  const entry = library.get(clip.src);
  const mediaAspect = entry?.width && entry.height ? entry.width / entry.height : 16 / 9;
  const ratio = aspectRatio(timeline.aspect);
  const position = positionOf(clip.rect) ?? "gore-desno";
  const set = (patch: Partial<Omit<OverlayClip, "id">>, key?: string) => onChange(updateItem(timeline, clip.id, patch), key);
  const duration = Math.max(1, timelineDuration(timeline));
  const isVideo = clip.media === "video";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="type-h4 text-ink">{T.pipTitle[locale]}</h3>
        <p className="font-mono text-xs font-bold text-muted">{fillCopy(T.onTrack[locale], { s: formatShort(clipSourceLength(clip), locale) })}</p>
      </div>
      <Section>
        <ChoiceChips
          legend={T.pipPosition[locale]}
          name={`pip-mesto-${clip.id}`}
          options={PIP_POSITIONS.map((id) => ({ id, label: T.pipPositions[id][locale] }))}
          value={position}
          onChange={(next) => set({ rect: pipRect(next, clip.rect.w, mediaAspect, ratio) })}
        />
        <RangeField
          label={T.pipSize[locale]}
          value={Math.round(clip.rect.w * 100)}
          min={15}
          max={70}
          step={1}
          display={`${Math.round(clip.rect.w * 100)} %`}
          onChange={(value) => set({ rect: pipRect(position, value / 100, mediaAspect, ratio) }, `pip-velicina:${clip.id}`)}
        />
      </Section>
      <Section>
        <RangeField
          label={T.startsAt[locale]}
          value={clip.start}
          min={0}
          max={duration}
          step={0.1}
          display={formatShort(clip.start, locale)}
          onChange={(value) => set({ start: value }, `pip-start:${clip.id}`)}
        />
        <Button variant="secondary" onClick={() => set({ start: Math.min(duration, playheadTime) })}>
          {T.toPlayhead[locale]}
        </Button>
        {isVideo ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <RangeField
              label={T.sourceStart[locale]}
              value={clip.in}
              min={0}
              max={Math.max(0, clip.out - 0.2)}
              step={0.1}
              display={formatShort(clip.in, locale)}
              onChange={(value) => set({ in: value }, `pip-in:${clip.id}`)}
            />
            <RangeField
              label={T.sourceEnd[locale]}
              value={clip.out}
              min={clip.in + 0.2}
              max={Math.max(clip.in + 0.2, entry?.durationS ?? clip.out)}
              step={0.1}
              display={formatShort(clip.out, locale)}
              onChange={(value) => set({ out: value }, `pip-out:${clip.id}`)}
            />
          </div>
        ) : (
          <RangeField
            label={T.photoLength[locale]}
            value={clip.out}
            min={0.5}
            max={30}
            step={0.1}
            display={formatShort(clip.out, locale)}
            onChange={(value) => set({ out: value }, `pip-out:${clip.id}`)}
          />
        )}
      </Section>
      {isVideo ? (
        <Section>
          <RangeField
            label={T.volume[locale]}
            value={clip.volumeDb}
            min={TIMELINE_LIMITS.volumeMinDb}
            max={TIMELINE_LIMITS.volumeMaxDb}
            step={1}
            display={`${clip.volumeDb > 0 ? "+" : ""}${clip.volumeDb} dB`}
            onChange={(value) => set({ volumeDb: value }, `pip-vol:${clip.id}`)}
          />
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 type-body-sm font-black text-ink">
              <input type="checkbox" checked={clip.muted} onChange={(event) => set({ muted: event.target.checked })} className="size-5 accent-ink" />
              {T.mute[locale]}
            </label>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 type-body-sm font-black text-ink">
              <input
                type="checkbox"
                checked={clip.isVoice === true}
                onChange={(event) => set({ isVoice: event.target.checked ? true : undefined })}
                className="size-5 accent-ink"
              />
              {T.isVoice[locale]}
            </label>
          </div>
        </Section>
      ) : null}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="secondary" onClick={() => onChange(duplicateItem(timeline, clip.id).timeline)} icon={<Copy aria-hidden="true" className="size-4" />}>
          {T.duplicate[locale]}
        </Button>
        <Button variant="secondary" onClick={() => onChange(deleteItem(timeline, clip.id))} icon={<Trash2 aria-hidden="true" className="size-4" />}>
          {T.remove[locale]}
        </Button>
      </div>
    </div>
  );
}
