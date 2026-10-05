"use client";

import { Copy, Music, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { RangeField } from "@/components/crea/editor/controls";
import { formatShort, type MontageSelection } from "@/components/crea/montaza/format";
import type { MediaLibrary } from "@/components/crea/montaza/media-library";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/components/ui/primitives";
import { fillCopy } from "@/lib/crea-copy";
import { MONTAGE_COPY as T } from "@/lib/crea-montage-copy";
import {
  AUDIO_ROLES,
  DUCK_RANGE_DB,
  deleteItem,
  duplicateItem,
  timelineDuration,
  TIMELINE_LIMITS,
  updateItem,
  type AudioClip,
  type CreaTimelineV1,
} from "@/lib/crea-timeline";
import type { Locale } from "@/lib/i18n";

/**
 * Zvuk montaže (K19, V24): muzika, glas i efekti na svojoj traci, jačina i
 * postepeno pojačavanje/utišavanje, i miks - muzika se SAMA utišava dok neko
 * govori (kriva iz `duckingEnvelope`), ukupna jačina i pretapanje na početku i kraju.
 */

type Commit = (next: CreaTimelineV1, key?: string) => void;
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

function Block({ children }: { children: ReactNode }) {
  return <section className="space-y-3 border-t border-line pt-4">{children}</section>;
}

function AudioEditor({
  locale,
  timeline,
  clip,
  onChange,
  library,
  playheadTime,
}: {
  locale: Locale;
  timeline: CreaTimelineV1;
  clip: AudioClip;
  onChange: Commit;
  library: MediaLibrary;
  playheadTime: number;
}) {
  const set = (patch: Partial<Omit<AudioClip, "id">>, key?: string) => onChange(updateItem(timeline, clip.id, patch), key);
  const sourceDuration = library.get(clip.src)?.durationS ?? clip.out;
  const length = clip.out - clip.in;
  const duration = Math.max(1, timelineDuration(timeline));
  return (
    <div className="space-y-4">
      <ChoiceChips
        legend={T.role[locale]}
        name={`uloga-${clip.id}`}
        options={AUDIO_ROLES.map((role) => ({ id: role, label: T.roles[role][locale] }))}
        value={clip.role}
        onChange={(role) => set({ role })}
      />
      <RangeField
        label={T.volume[locale]}
        value={clip.volumeDb}
        min={TIMELINE_LIMITS.volumeMinDb}
        max={TIMELINE_LIMITS.volumeMaxDb}
        step={1}
        display={`${clip.volumeDb > 0 ? "+" : ""}${clip.volumeDb} dB`}
        onChange={(value) => set({ volumeDb: value }, `zvuk-vol:${clip.id}`)}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <RangeField
          label={T.fadeIn[locale]}
          value={clip.fadeIn}
          min={0}
          max={Math.min(TIMELINE_LIMITS.fadeMaxS, Math.max(0, length / 2))}
          step={0.1}
          display={formatShort(clip.fadeIn, locale)}
          onChange={(value) => set({ fadeIn: value }, `zvuk-fi:${clip.id}`)}
        />
        <RangeField
          label={T.fadeOut[locale]}
          value={clip.fadeOut}
          min={0}
          max={Math.min(TIMELINE_LIMITS.fadeMaxS, Math.max(0, length / 2))}
          step={0.1}
          display={formatShort(clip.fadeOut, locale)}
          onChange={(value) => set({ fadeOut: value }, `zvuk-fo:${clip.id}`)}
        />
      </div>
      <Block>
        <RangeField
          label={T.startsAt[locale]}
          value={clip.start}
          min={0}
          max={duration}
          step={0.1}
          display={formatShort(clip.start, locale)}
          onChange={(value) => set({ start: value }, `zvuk-start:${clip.id}`)}
        />
        <Button variant="secondary" onClick={() => set({ start: Math.min(duration, playheadTime) })}>
          {T.toPlayhead[locale]}
        </Button>
        <div className="grid gap-3 sm:grid-cols-2">
          <RangeField
            label={T.sourceStart[locale]}
            value={clip.in}
            min={0}
            max={Math.max(0, clip.out - 0.2)}
            step={0.1}
            display={formatShort(clip.in, locale)}
            onChange={(value) => set({ in: value }, `zvuk-in:${clip.id}`)}
          />
          <RangeField
            label={T.sourceEnd[locale]}
            value={clip.out}
            min={clip.in + 0.2}
            max={Math.max(clip.in + 0.2, sourceDuration)}
            step={0.1}
            display={formatShort(clip.out, locale)}
            onChange={(value) => set({ out: value }, `zvuk-out:${clip.id}`)}
          />
        </div>
      </Block>
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button
          variant="secondary"
         
          disabled={timeline.audio.length >= TIMELINE_LIMITS.audio}
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

export function AudioPanel({
  locale,
  timeline,
  selection,
  onSelect,
  onChange,
  library,
  playheadTime,
  mixStatus,
  onAdd,
}: {
  locale: Locale;
  timeline: CreaTimelineV1;
  selection: MontageSelection;
  onSelect: (next: MontageSelection) => void;
  onChange: Commit;
  library: MediaLibrary;
  playheadTime: number;
  mixStatus: "idle" | "rendering" | "ready" | "error";
  onAdd: () => void;
}) {
  const selected = selection?.kind === "audio" ? timeline.audio.find((clip) => clip.id === selection.id) : undefined;
  const { mix } = timeline;
  const setMix = (patch: Partial<CreaTimelineV1["mix"]>, key?: string) => onChange({ ...timeline, mix: { ...mix, ...patch } }, key);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onAdd} disabled={timeline.audio.length >= TIMELINE_LIMITS.audio} icon={<Plus aria-hidden="true" className="size-4" />} className="shadow-[4px_4px_0_0_var(--ink)]">
          {T.addSound[locale]}
        </Button>
        {mixStatus === "rendering" ? (
          <p role="status" className="inline-flex items-center gap-2 type-body-sm font-bold text-muted">
            <Spinner size="xs" />
            {T.mixing[locale]}
          </p>
        ) : mixStatus === "error" ? (
          <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
            {T.mixFailed[locale]}
          </p>
        ) : null}
      </div>

      {timeline.audio.length > 0 ? (
        <ul className="divide-y divide-line border-y border-line">
          {timeline.audio.map((clip, index) => {
            const active = selection?.kind === "audio" && selection.id === clip.id;
            return (
              <li key={clip.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect({ kind: "audio", id: clip.id })}
                  className={cn("flex min-h-11 w-full items-center gap-3 px-2 text-left", active ? "bg-yellow/40" : "hover:bg-paper", FOCUS)}
                >
                  <Music aria-hidden="true" className="size-4 shrink-0 text-ink" />
                  <span className="min-w-0 flex-1 truncate type-body-sm font-black text-ink">
                    {fillCopy(T.soundItem[locale], { n: index + 1 })} · {T.roles[clip.role][locale]}
                  </span>
                  <span className="font-mono text-xs font-bold text-muted">{formatShort(clip.out - clip.in, locale)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="type-body-sm font-semibold text-muted">{T.noAudio[locale]}</p>
      )}

      {selected ? (
        <AudioEditor key={selected.id} locale={locale} timeline={timeline} clip={selected} onChange={onChange} library={library} playheadTime={playheadTime} />
      ) : null}

      <Block>
        <label className="flex min-h-11 cursor-pointer items-start gap-2 type-body-sm font-black text-ink">
          <input type="checkbox" checked={mix.duck.on} onChange={(event) => setMix({ duck: { ...mix.duck, on: event.target.checked } })} className="mt-0.5 size-5 shrink-0 accent-ink" />
          <span>
            {T.duck[locale]}
            <span className="block font-semibold text-muted">{T.duckHint[locale]}</span>
          </span>
        </label>
        {mix.duck.on ? (
          <RangeField
            label={T.duckAmount[locale]}
            value={mix.duck.amountDb}
            min={DUCK_RANGE_DB.min}
            max={DUCK_RANGE_DB.max}
            step={1}
            display={`${mix.duck.amountDb} dB`}
            onChange={(value) => setMix({ duck: { ...mix.duck, amountDb: value } }, "mix-duck")}
          />
        ) : null}
        <RangeField
          label={T.master[locale]}
          value={mix.masterDb}
          min={-20}
          max={6}
          step={0.5}
          display={`${mix.masterDb > 0 ? "+" : ""}${mix.masterDb} dB`}
          onChange={(value) => setMix({ masterDb: value }, "mix-master")}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <RangeField
            label={T.masterFadeIn[locale]}
            value={mix.fadeIn}
            min={0}
            max={5}
            step={0.1}
            display={formatShort(mix.fadeIn, locale)}
            onChange={(value) => setMix({ fadeIn: value }, "mix-fi")}
          />
          <RangeField
            label={T.masterFadeOut[locale]}
            value={mix.fadeOut}
            min={0}
            max={5}
            step={0.1}
            display={formatShort(mix.fadeOut, locale)}
            onChange={(value) => setMix({ fadeOut: value }, "mix-fo")}
          />
        </div>
      </Block>
    </div>
  );
}
