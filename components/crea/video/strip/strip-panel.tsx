/* eslint-disable @next/next/no-img-element -- kadrovi su potpisani Convex URL-ovi (i DEMO SVG), kao u ostalim izborima radova. */
"use client";

import { ArrowLeft, ArrowRight, Minus, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useId } from "react";

import { CameraMoveSketch } from "@/components/crea/video/camera-move-sketch";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { SHOT_TYPE_INFO, SHOT_TYPES, STORYBOARD_LIMITS, type ShotTypeId, type StoryShot } from "@/convex/creaStoryboardsCore";
import { CAMERA_MOVE_GROUPS, CAMERA_MOVES, cameraMoveById } from "@/lib/crea-camera-moves";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_FLOWS_COPY as T } from "@/lib/crea-video-flows-copy";
import type { Locale } from "@/lib/i18n";

export type PanelStatus = keyof typeof T.stripStatus;
export type PanelMedia = { image: { url: string | null; mock: boolean } | null; video: { url: string | null; mock: boolean } | null };

const ICON_BUTTON =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:translate-y-0";
const FIELD =
  "surface-inset mt-1 block w-full border border-line bg-paper-strong px-3 py-2 type-body-sm font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60";

/**
 * Jedan kadar stripa kao stranica sveske (Crea K21, V10): broj kadra, slika (ili
 * skica pokreta kamere dok slike nema), vrsta kadra sa mini-lekcijom („kartice
 * uče vrste kadrova"), potpis na srpskom, pokret i trajanje. Engleski opisi za AI
 * su sklopljeni ispod „Za AI". Panel je deo stripa (jedan okvir po grupi), pa ga
 * od susednih odvaja površina i tanka linija, ne drugi pun okvir.
 */
export function StripPanel({
  locale,
  index,
  count,
  shot,
  media,
  status,
  disabled,
  onChange,
  onMove,
  onRemove,
  onRedraw,
}: {
  locale: Locale;
  index: number;
  count: number;
  shot: StoryShot;
  media: PanelMedia;
  status: PanelStatus;
  disabled: boolean;
  onChange: (patch: Partial<StoryShot>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onRedraw: (() => void) | null;
}) {
  const baseId = useId();
  const move = cameraMoveById(shot.move) ?? CAMERA_MOVES[0]!;
  const info = SHOT_TYPE_INFO[shot.shotType];
  const n = index + 1;
  const working = status === "crta" || status === "ozivljava";

  return (
    <li className="surface-inset flex min-w-0 flex-col border border-line bg-paper p-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-ink font-mono text-sm font-black text-paper-strong">{n}</span>
        <span className="flex-1 truncate type-body-sm font-black text-ink">{info.label[locale]}</span>
        <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-muted" aria-live="polite">
          {working ? <Spinner size="xs" /> : null}
          {T.stripStatus[status][locale]}
        </span>
      </div>

      <div className="surface-media relative mt-3 aspect-video overflow-hidden bg-paper-strong shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
        {media.video?.url && !media.video.mock ? (
          <video src={media.video.url} poster={media.image?.url ?? undefined} controls playsInline preload="metadata" className="size-full object-cover" aria-label={fillCopy(T.stripShot[locale], { n })} />
        ) : media.image?.url ? (
          <img src={media.image.url} alt={shot.caption} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center p-3 text-ink">
            <CameraMoveSketch move={move} playing={false} className="h-full max-h-36 w-auto" />
          </div>
        )}
      </div>
      {media.image?.mock || media.video?.mock ? <p className="mt-2 text-xs font-semibold text-muted">{T.stripDemoShot[locale]}</p> : null}

      <details className="mt-3">
        <summary className="inline-flex min-h-11 cursor-pointer items-center type-body-sm font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          {T.stripLessonTitle[locale]}
        </summary>
        <p className="type-body-sm font-semibold text-muted">{info.lesson[locale]}</p>
      </details>

      <label className="mt-2 block" htmlFor={`${baseId}-tekst`}>
        <span className="type-body-sm font-black text-ink">{T.stripCaption[locale]}</span>
      </label>
      <textarea
        id={`${baseId}-tekst`}
        value={shot.caption}
        rows={2}
        maxLength={STORYBOARD_LIMITS.captionChars}
        disabled={disabled}
        onChange={(event) => onChange({ caption: event.target.value })}
        className={`${FIELD} resize-y bg-[repeating-linear-gradient(transparent,transparent_1.45rem,var(--line)_1.45rem,var(--line)_calc(1.45rem+1px))] leading-[1.5rem]`}
      />

      <div className="mt-2 grid gap-2">
        <label className="block">
          <span className="type-body-sm font-black text-ink">{T.stripShotType[locale]}</span>
          <select value={shot.shotType} disabled={disabled} onChange={(event) => onChange({ shotType: event.target.value as ShotTypeId })} className={`${FIELD} min-h-11`}>
            {SHOT_TYPES.map((id) => (
              <option key={id} value={id}>
                {SHOT_TYPE_INFO[id].label[locale]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="type-body-sm font-black text-ink">{T.stripMove[locale]}</span>
          <select value={shot.move} disabled={disabled} onChange={(event) => onChange({ move: event.target.value })} className={`${FIELD} min-h-11`}>
            {CAMERA_MOVE_GROUPS.map((group) => (
              <optgroup key={group.id} label={group.label[locale]}>
                {CAMERA_MOVES.filter((entry) => entry.group === group.id).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label[locale]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      <details className="mt-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center type-body-sm font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          {locale === "sr" ? "Za AI (engleski)" : "For the AI (English)"}
        </summary>
        <label className="block">
          <span className="type-body-sm font-black text-ink">{T.stripImagePrompt[locale]}</span>
          <textarea value={shot.imagePrompt} rows={3} maxLength={STORYBOARD_LIMITS.promptChars} disabled={disabled} onChange={(event) => onChange({ imagePrompt: event.target.value })} className={`${FIELD} resize-y`} />
        </label>
        <label className="mt-2 block">
          <span className="type-body-sm font-black text-ink">{T.stripMotion[locale]}</span>
          <textarea value={shot.motionPrompt} rows={2} maxLength={STORYBOARD_LIMITS.promptChars} disabled={disabled} onChange={(event) => onChange({ motionPrompt: event.target.value })} className={`${FIELD} resize-y`} />
        </label>
      </details>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button type="button" className={ICON_BUTTON} disabled={disabled || shot.durationS <= STORYBOARD_LIMITS.durationMin} onClick={() => onChange({ durationS: shot.durationS - 1 })} aria-label={`${fillCopy(T.seconds[locale], { s: shot.durationS })} −1`}>
          <Minus aria-hidden="true" className="size-4" />
        </button>
        <span className="w-10 text-center font-mono text-sm font-black tabular-nums text-ink">{fillCopy(T.seconds[locale], { s: shot.durationS })}</span>
        <button type="button" className={ICON_BUTTON} disabled={disabled || shot.durationS >= STORYBOARD_LIMITS.durationMax} onClick={() => onChange({ durationS: shot.durationS + 1 })} aria-label={`${fillCopy(T.seconds[locale], { s: shot.durationS })} +1`}>
          <Plus aria-hidden="true" className="size-4" />
        </button>
        <span className="flex-1" />
        {onRedraw ? (
          <button type="button" className={ICON_BUTTON} disabled={disabled} onClick={onRedraw} aria-label={`${T.stripRedraw[locale]} (${n})`} title={T.stripRedraw[locale]}>
            <RefreshCw aria-hidden="true" className="size-4" />
          </button>
        ) : null}
        <button type="button" className={ICON_BUTTON} disabled={disabled || index === 0} onClick={() => onMove(-1)} aria-label={fillCopy(T.moveUp[locale], { n })}>
          <ArrowLeft aria-hidden="true" className="size-4" />
        </button>
        <button type="button" className={ICON_BUTTON} disabled={disabled || index === count - 1} onClick={() => onMove(1)} aria-label={fillCopy(T.moveDown[locale], { n })}>
          <ArrowRight aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          className={cn(ICON_BUTTON)}
          disabled={disabled || count <= STORYBOARD_LIMITS.shotsMin}
          onClick={onRemove}
          aria-label={fillCopy(T.remove[locale], { n })}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      </div>
    </li>
  );
}
