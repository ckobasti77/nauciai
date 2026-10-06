/* eslint-disable @next/next/no-img-element -- nalepnice su naši mali SVG fajlovi (isti origin). */
"use client";

import { Copy, Shield, Smile, Trash2, Type } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { useSeasonStickerGroups } from "@/components/crea/community/use-season";
import { ColorPicker, RangeField } from "@/components/crea/editor/controls";
import { formatShort, type MontageSelection } from "@/components/crea/montaza/format";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { fillCopy } from "@/lib/crea-copy";
import { defaultPresetFor } from "@/lib/crea-export-presets";
import { MONTAGE_COPY as T } from "@/lib/crea-montage-copy";
import { stickerUrl } from "@/lib/crea-stickers";
import { CAPTION_STYLE_LABELS, CAPTION_STYLES, regroupCues, type CaptionScript, type CaptionStyle } from "@/lib/crea-subtitles";
import {
  addSticker,
  addTitle,
  aspectRatio,
  defaultTitleRect,
  deleteItem,
  duplicateItem,
  fitRectToZone,
  STICKER_ANIMS,
  timelineDuration,
  TIMELINE_LIMITS,
  TITLE_ANIMS,
  TITLE_FONTS,
  TITLE_STYLE_DEFAULTS,
  TITLE_STYLES,
  updateItem,
  type CreaTimelineV1,
  type StickerItem,
  type TitleItem,
} from "@/lib/crea-timeline";
import { CREA_FLOWS_COPY as FLOWS } from "@/lib/crea-video-flows-copy";
import type { Locale } from "@/lib/i18n";

/**
 * Tekst i nalepnice u montaži (K19, V24): natpisi u 5 stilova sa srpskim
 * slovima (Nunito, Rukopis sa ćirilicom kroz Pangolin, Montserrat, Lora - isti
 * fontovi kao editor K10), boje brenda i kita, ulazak i vreme; nalepnice iz
 * istog seta kao editor (Fluent Emoji, MIT).
 */

type Commit = (next: CreaTimelineV1, key?: string) => void;
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const DEFAULT_LENGTH_S = 2.5;

function Row({ children }: { children: ReactNode }) {
  return <div className="space-y-3 border-t border-line pt-4">{children}</div>;
}

function Timing({
  locale,
  item,
  duration,
  playheadTime,
  onChange,
}: {
  locale: Locale;
  item: { id: string; start: number; end: number };
  duration: number;
  playheadTime: number;
  onChange: (patch: { start?: number; end?: number }, key?: string) => void;
}) {
  const max = Math.max(duration, item.end);
  return (
    <Row>
      <div className="grid gap-3 sm:grid-cols-2">
        <RangeField
          label={T.from[locale]}
          value={item.start}
          min={0}
          max={Math.max(0, item.end - 0.3)}
          step={0.1}
          display={formatShort(item.start, locale)}
          onChange={(value) => onChange({ start: value }, `od:${item.id}`)}
        />
        <RangeField
          label={T.to[locale]}
          value={item.end}
          min={item.start + 0.3}
          max={Math.max(item.start + 0.3, max)}
          step={0.1}
          display={formatShort(item.end, locale)}
          onChange={(value) => onChange({ end: value }, `do:${item.id}`)}
        />
      </div>
      <Button
        variant="secondary"
       
        onClick={() => {
          const length = item.end - item.start;
          onChange({ start: playheadTime, end: playheadTime + length });
        }}
      >
        {T.toPlayhead[locale]}
      </Button>
    </Row>
  );
}

function TitleEditor({
  locale,
  timeline,
  title,
  onChange,
  playheadTime,
}: {
  locale: Locale;
  timeline: CreaTimelineV1;
  title: TitleItem;
  onChange: Commit;
  playheadTime: number;
}) {
  const textId = useId();
  const set = (patch: Partial<Omit<TitleItem, "id">>, key?: string) => onChange(updateItem(timeline, title.id, patch), key);
  const left = TIMELINE_LIMITS.titleChars - Array.from(title.text).length;
  const zone = defaultPresetFor(timeline.aspect).safeZone;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={textId} className="type-body-sm font-black text-ink">
          {T.textLabel[locale]}
        </label>
        <textarea
          id={textId}
          value={title.text}
          rows={2}
          maxLength={TIMELINE_LIMITS.titleChars}
          placeholder={T.textPlaceholder[locale]}
          onChange={(event) => set({ text: event.target.value }, `tekst:${title.id}`)}
          className="surface-inset mt-2 block w-full resize-y border-2 border-ink bg-paper-strong p-3 text-base font-bold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
        <p className="mt-1 text-right font-mono text-xs font-bold text-muted">{fillCopy(T.charsLeft[locale], { n: left })}</p>
      </div>
      <ChoiceChips
        legend={T.style[locale]}
        name={`stil-${title.id}`}
        options={TITLE_STYLES.map((style) => ({ id: style, label: T.titleStyles[style][locale] }))}
        value={title.style}
        onChange={(style) => set({ style, ...TITLE_STYLE_DEFAULTS[style], rect: defaultTitleRect(style, timeline.aspect) })}
      />
      <ChoiceChips
        legend={T.font[locale]}
        name={`slova-${title.id}`}
        options={TITLE_FONTS.map((font) => ({ id: font, label: T.fonts[font][locale] }))}
        value={title.font}
        onChange={(font) => set({ font })}
      />
      <ColorPicker locale={locale} legend={T.color[locale]} value={title.color} onChange={(color) => set({ color }, `boja:${title.id}`)} customLabel={T.customColor[locale]} />
      <ChoiceChips
        legend={T.entrance[locale]}
        name={`ulazak-${title.id}`}
        options={TITLE_ANIMS.map((anim) => ({ id: anim, label: T.titleAnims[anim][locale] }))}
        value={title.anim}
        onChange={(anim) => set({ anim })}
      />
      <Timing locale={locale} item={title} duration={timelineDuration(timeline)} playheadTime={playheadTime} onChange={(patch, key) => set(patch, key)} />
      <Row>
        <div className="grid gap-3 sm:grid-cols-2">
          <RangeField
            label={T.heightOnScreen[locale]}
            value={Math.round(title.rect.y * 100)}
            min={0}
            max={Math.round((1 - title.rect.h) * 100)}
            step={1}
            display={`${Math.round(title.rect.y * 100)} %`}
            onChange={(value) => set({ rect: { ...title.rect, y: value / 100 } }, `y:${title.id}`)}
          />
          <RangeField
            label={T.size[locale]}
            value={Math.round(title.rect.h * 100)}
            min={4}
            max={30}
            step={1}
            display={`${Math.round(title.rect.h * 100)} %`}
            onChange={(value) => set({ rect: { ...title.rect, h: value / 100, y: Math.min(title.rect.y, 1 - value / 100) } }, `h:${title.id}`)}
          />
        </div>
        <Button variant="secondary" onClick={() => set({ rect: fitRectToZone(title.rect, zone) })} icon={<Shield aria-hidden="true" className="size-4" />}>
          {T.toSafeZone[locale]}
        </Button>
      </Row>
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="secondary" onClick={() => onChange(duplicateItem(timeline, title.id).timeline)} icon={<Copy aria-hidden="true" className="size-4" />}>
          {T.duplicate[locale]}
        </Button>
        <Button variant="secondary" onClick={() => onChange(deleteItem(timeline, title.id))} icon={<Trash2 aria-hidden="true" className="size-4" />}>
          {T.remove[locale]}
        </Button>
      </div>
    </div>
  );
}

function StickerGrid({ locale, value, onPick }: { locale: Locale; value: string | null; onPick: (id: string) => void }) {
  const groups = useSeasonStickerGroups();
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="type-body-sm font-black text-muted">{group.label[locale]}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {group.stickers.map((sticker) => (
              <button
                key={sticker.id}
                type="button"
                aria-pressed={value === sticker.id}
                aria-label={sticker.label[locale]}
                title={sticker.label[locale]}
                onClick={() => onPick(sticker.id)}
                className={cn(
                  "grid size-11 place-items-center rounded-full border-2",
                  value === sticker.id ? "border-ink bg-yellow" : "border-transparent hover:border-ink/40",
                  FOCUS,
                )}
              >
                <img src={stickerUrl(sticker.id)} alt="" className="size-7" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StickerEditor({
  locale,
  timeline,
  sticker,
  onChange,
  playheadTime,
}: {
  locale: Locale;
  timeline: CreaTimelineV1;
  sticker: StickerItem;
  onChange: Commit;
  playheadTime: number;
}) {
  const ratio = aspectRatio(timeline.aspect);
  const set = (patch: Partial<Omit<StickerItem, "id">>, key?: string) => onChange(updateItem(timeline, sticker.id, patch), key);
  const resize = (size: number) => {
    const w = size;
    const h = Math.min(1, size * ratio);
    const centerX = sticker.rect.x + sticker.rect.w / 2;
    const centerY = sticker.rect.y + sticker.rect.h / 2;
    return { x: Math.min(1 - w, Math.max(0, centerX - w / 2)), y: Math.min(1 - h, Math.max(0, centerY - h / 2)), w, h };
  };
  return (
    <div className="space-y-4">
      <StickerGrid locale={locale} value={sticker.sticker} onPick={(id) => set({ sticker: id })} />
      <Row>
        <div className="grid gap-3 sm:grid-cols-3">
          <RangeField
            label={T.size[locale]}
            value={Math.round(sticker.rect.w * 100)}
            min={8}
            max={60}
            step={1}
            display={`${Math.round(sticker.rect.w * 100)} %`}
            onChange={(value) => set({ rect: resize(value / 100) }, `nal-v:${sticker.id}`)}
          />
          <RangeField
            label={T.sideOnScreen[locale]}
            value={Math.round(sticker.rect.x * 100)}
            min={0}
            max={Math.round((1 - sticker.rect.w) * 100)}
            step={1}
            display={`${Math.round(sticker.rect.x * 100)} %`}
            onChange={(value) => set({ rect: { ...sticker.rect, x: value / 100 } }, `nal-x:${sticker.id}`)}
          />
          <RangeField
            label={T.heightOnScreen[locale]}
            value={Math.round(sticker.rect.y * 100)}
            min={0}
            max={Math.round((1 - sticker.rect.h) * 100)}
            step={1}
            display={`${Math.round(sticker.rect.y * 100)} %`}
            onChange={(value) => set({ rect: { ...sticker.rect, y: value / 100 } }, `nal-y:${sticker.id}`)}
          />
        </div>
      </Row>
      <ChoiceChips
        legend={T.entrance[locale]}
        name={`nal-ulazak-${sticker.id}`}
        options={STICKER_ANIMS.map((anim) => ({ id: anim, label: T.stickerAnims[anim][locale] }))}
        value={sticker.anim}
        onChange={(anim) => set({ anim })}
      />
      <Timing locale={locale} item={sticker} duration={timelineDuration(timeline)} playheadTime={playheadTime} onChange={(patch, key) => set(patch, key)} />
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="secondary" onClick={() => onChange(duplicateItem(timeline, sticker.id).timeline)} icon={<Copy aria-hidden="true" className="size-4" />}>
          {T.duplicate[locale]}
        </Button>
        <Button variant="secondary" onClick={() => onChange(deleteItem(timeline, sticker.id))} icon={<Trash2 aria-hidden="true" className="size-4" />}>
          {T.remove[locale]}
        </Button>
      </div>
    </div>
  );
}

export function TitlesPanel({
  locale,
  timeline,
  selection,
  onSelect,
  onChange,
  playheadTime,
}: {
  locale: Locale;
  timeline: CreaTimelineV1;
  selection: MontageSelection;
  onSelect: (next: MontageSelection) => void;
  onChange: Commit;
  playheadTime: number;
}) {
  const [picking, setPicking] = useState(false);
  const duration = timelineDuration(timeline);
  const start = Math.min(Math.max(0, playheadTime), Math.max(0, duration - 0.5));
  const end = Math.min(Math.max(duration, start + 0.5), start + DEFAULT_LENGTH_S);
  const title = selection?.kind === "title" ? timeline.titles.find((item) => item.id === selection.id) : undefined;
  const sticker = selection?.kind === "sticker" ? timeline.stickers.find((item) => item.id === selection.id) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            const added = addTitle(timeline, { text: T.defaultTitle[locale], start, end, style: "naslov" });
            if (!added.id) return;
            onChange(added.timeline);
            onSelect({ kind: "title", id: added.id });
          }}
          disabled={timeline.titles.length >= TIMELINE_LIMITS.titles || duration <= 0}
          icon={<Type aria-hidden="true" className="size-4" />}
          className="shadow-[4px_4px_0_0_var(--ink)]"
        >
          {T.addTitle[locale]}
        </Button>
        <Button
          variant="secondary"
          onClick={() => setPicking((current) => !current)}
          aria-expanded={picking}
          disabled={timeline.stickers.length >= TIMELINE_LIMITS.stickers || duration <= 0}
          icon={<Smile aria-hidden="true" className="size-4" />}
        >
          {T.addSticker[locale]}
        </Button>
      </div>
      {picking ? (
        <div className="surface-inset bg-paper p-3">
          <StickerGrid
            locale={locale}
            value={null}
            onPick={(id) => {
              const added = addSticker(timeline, { sticker: id, start, end });
              setPicking(false);
              if (!added.id) return;
              onChange(added.timeline);
              onSelect({ kind: "sticker", id: added.id });
            }}
          />
        </div>
      ) : null}

      {timeline.titles.length + timeline.stickers.length > 0 ? (
        <ul className="divide-y divide-line border-y border-line">
          {[...timeline.titles.map((item) => ({ kind: "title" as const, item })), ...timeline.stickers.map((item) => ({ kind: "sticker" as const, item }))]
            .sort((a, b) => a.item.start - b.item.start)
            .map(({ kind, item }) => {
              const active = selection?.kind === kind && selection.id === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelect({ kind, id: item.id })}
                    className={cn("flex min-h-11 w-full items-center gap-3 px-2 text-left", active ? "bg-yellow/40" : "hover:bg-paper", FOCUS)}
                  >
                    {kind === "sticker" ? (
                      <img src={stickerUrl((item as StickerItem).sticker)} alt="" className="size-6 shrink-0" />
                    ) : (
                      <Type aria-hidden="true" className="size-4 shrink-0 text-ink" />
                    )}
                    <span className="min-w-0 flex-1 truncate type-body-sm font-black text-ink">
                      {kind === "title" ? (item as TitleItem).text || "…" : T.stickerName[locale]}
                    </span>
                    <span className="font-mono text-xs font-bold text-muted">
                      {formatShort(item.start, locale)}–{formatShort(item.end, locale)}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      ) : (
        <p className="type-body-sm font-semibold text-muted">{T.noTexts[locale]}</p>
      )}

      {title ? <TitleEditor key={title.id} locale={locale} timeline={timeline} title={title} onChange={onChange} playheadTime={playheadTime} /> : null}
      {sticker ? <StickerEditor key={sticker.id} locale={locale} timeline={timeline} sticker={sticker} onChange={onChange} playheadTime={playheadTime} /> : null}
      {timeline.captions ? <CaptionsEditor locale={locale} timeline={timeline} onChange={onChange} /> : null}
    </div>
  );
}

/**
 * Titlovi u montaži (K21, V25): stižu iz „Titlova na srpskom", stripa ili
 * objašnjenja; ovde se menjaju stil i pismo (latinica ↔ ćirilica) ili se uklone.
 */
function CaptionsEditor({ locale, timeline, onChange }: { locale: Locale; timeline: CreaTimelineV1; onChange: Commit }) {
  const captions = timeline.captions!;
  return (
    <Row>
      <p className="type-body-sm font-black text-ink">{fillCopy(FLOWS.montageCaptions[locale], { n: captions.cues.length })}</p>
      <ChoiceChips<CaptionStyle>
        legend={FLOWS.styleLegend[locale]}
        name="montaza-titl-stil"
        options={CAPTION_STYLES.map((id) => ({ id, label: CAPTION_STYLE_LABELS[id].label[locale] }))}
        value={captions.style}
        onChange={(style) => onChange({ ...timeline, captions: { ...captions, style, cues: regroupCues(captions.cues, style) } })}
      />
      <ChoiceChips<CaptionScript>
        legend={FLOWS.scriptLegend[locale]}
        name="montaza-titl-pismo"
        options={(["lat", "cyr"] as const).map((id) => ({ id, label: FLOWS.scripts[id][locale] }))}
        value={captions.script}
        onChange={(script) => onChange({ ...timeline, captions: { ...captions, script } })}
      />
      <Button
        variant="ghost"
        onClick={() => {
          const next = { ...timeline };
          delete next.captions;
          onChange(next);
        }}
        icon={<Trash2 aria-hidden="true" className="size-4" />}
      >
        {FLOWS.montageCaptionsRemove[locale]}
      </Button>
    </Row>
  );
}
