"use client";

import { Trash2 } from "lucide-react";

import { FOCUS, formatNumber, formatSeconds, RangeField } from "@/components/crea/zvuk/uredjivac/ui";
import { cn } from "@/components/ui/primitives";
import { EDIT_LIMITS, type ExtraTrack } from "@/lib/crea-audio-edit";
import { CREA_AUDIO_TOOLS_COPY as T } from "@/lib/crea-audio-tools-copy";
import { fillCopy } from "@/lib/crea-copy";
import type { Locale } from "@/lib/i18n";

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/** Dodatne trake ispod govora (muzika, ambijent, efekti) - Crea K24, A14. */
export function TracksPanel({
  locale,
  tracks,
  names,
  mainDuration,
  disabled,
  onChange,
  onRemove,
}: {
  locale: Locale;
  tracks: readonly ExtraTrack[];
  names: ReadonlyMap<string, string>;
  mainDuration: number;
  disabled: boolean;
  onChange: (id: string, patch: Partial<Omit<ExtraTrack, "id" | "source">>) => void;
  onRemove: (id: string) => void;
}) {
  if (tracks.length === 0) return null;
  return (
    <ul className="divide-y divide-line">
      {tracks.map((track, index) => {
        const label = fillCopy(T.editor.trackName[locale], { n: index + 1 });
        return (
          <li key={track.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 truncate type-body-sm font-black text-ink">
                {label} · <span className="font-semibold text-muted">{names.get(track.source) ?? ""}</span> · {formatSeconds(track.out - track.in, locale)}
              </p>
              <button
                type="button"
                aria-label={fillCopy(T.editor.trackRemove[locale], { n: index + 1 })}
                disabled={disabled}
                onClick={() => onRemove(track.id)}
                className={cn("grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink disabled:opacity-50", FOCUS)}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </div>
            <RangeField label={T.editor.trackStart[locale]} value={track.at} min={0} max={Math.max(0, Math.floor(mainDuration))} step={0.5} disabled={disabled} format={(value) => formatNumber(value, locale, 1)} onChange={(at) => onChange(track.id, { at })} />
            <RangeField label={T.editor.trackGain[locale]} value={track.gainDb} min={EDIT_LIMITS.gainDb.min} max={6} disabled={disabled} format={signed} onChange={(gainDb) => onChange(track.id, { gainDb })} />
            <div className="flex flex-wrap gap-x-5">
              {(
                [
                  ["loop", T.editor.trackLoop[locale]],
                  ["duck", T.editor.trackDuck[locale]],
                  ["muted", T.editor.trackMute[locale]],
                ] as const
              ).map(([key, text]) => (
                <label key={key} className="inline-flex min-h-11 cursor-pointer items-center gap-2 type-body-sm font-bold text-ink">
                  <input type="checkbox" checked={track[key]} disabled={disabled} onChange={(event) => onChange(track.id, { [key]: event.target.checked })} className="size-5 accent-ink" />
                  {text}
                </label>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
