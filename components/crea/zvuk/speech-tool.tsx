"use client";

import { Mic } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { FieldMic } from "@/components/crea/create/mic-button";
import { usePromptParamState } from "@/components/crea/tools/use-prompt-param";

import { useJobQueue } from "@/components/crea/create/use-job-queue";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { PaidSubmit } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import {
  EnginePicker,
  FIELD,
  PRESET_PARAM,
  PresetSaver,
  SampleButton,
  TakeAudio,
  useEngineChoices,
  useJobStates,
  useMyVoices,
  useSamplePlayer,
  VOICE_PARAM,
  VoiceSelect,
} from "@/components/crea/zvuk/voice-kit";
import { cn } from "@/components/ui/primitives";
import type { Id } from "@/convex/_generated/dataModel";
import { fillCopy } from "@/lib/crea-copy";
import { jobCredits } from "@/lib/crea-job-price";
import { creaShellQuery } from "@/lib/crea-shell";
import { CREA_VOICE_COPY as T } from "@/lib/crea-voice-copy";
import {
  buildSpeechJob,
  DEFAULT_VOICE_SETTINGS,
  speechChars,
  VOICE_DESCRIBE_MAX,
  VOICE_MOOD_LABELS,
  VOICE_MOODS,
  VOICE_PITCHES,
  VOICE_SPEEDS,
  VOICE_STICKERS,
  type VoiceMood,
  type VoicePitch,
  type VoiceSettings,
  type VoiceSpeed,
} from "@/lib/crea-voice-tags";
import { DEFAULT_VOICE, DEFAULT_VOICE_ENGINE, parseVoiceKey, voiceById, voiceEngine, type VoiceEngineId } from "@/lib/crea-voices";
import { studioErrorMessage } from "@/lib/studio-messages";

const VARIATIONS = [1, 2, 3, 4] as const;
type Variations = (typeof VARIATIONS)[number];

/**
 * Govor sa emocijama (Crea K22, A2 + A4): izbor motora („govori srpski ✓", cena
 * na 1 000 znakova), glas iz biblioteke, tekst sa nalepnicama koje se prevode u
 * tagove motora, raspoloženje / brzina / visina / opis, 1-4 verzije. Svaka
 * verzija je poseban posao kroz `studio.createJob` (cena na dugmetu = zbir).
 */
export default function SpeechTool({ tool, locale, canSave, projectId, paid }: CreaToolProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const mine = useMyVoices(canSave);
  const player = useSamplePlayer(canSave);
  const choices = useEngineChoices(paid);

  const fromUrl = parseVoiceKey(searchParams.get(VOICE_PARAM));
  const [engine, setEngine] = useState<VoiceEngineId>(fromUrl?.engine ?? DEFAULT_VOICE_ENGINE);
  const [voiceId, setVoiceId] = useState(fromUrl?.id ?? DEFAULT_VOICE[DEFAULT_VOICE_ENGINE]);
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const [text, setText] = usePromptParamState();
  const [variations, setVariations] = useState<Variations>(1);
  const [takes, setTakes] = useState<Array<Id<"generationJobs">>>([]);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  // Podešavanje iz biblioteke (`?podesavanje=`) - jednom, kad stignu sačuvana.
  const presetId = searchParams.get(PRESET_PARAM);
  const urlPreset = presetId && mine ? mine.presets.find((entry) => entry.id === presetId) : undefined;
  const [appliedPreset, setAppliedPreset] = useState<string | null>(null);
  if (urlPreset && appliedPreset !== urlPreset.id) {
    setAppliedPreset(urlPreset.id);
    setEngine(urlPreset.engine);
    setVoiceId(urlPreset.voiceId);
    setSettings(urlPreset.settings);
  }

  const onQueueError = useCallback((message: string) => setError(studioErrorMessage(message, locale)), [locale]);
  const { enqueue, waiting } = useJobQueue(onQueueError);
  const states = useJobStates(takes);

  const meta = voiceEngine(engine);
  const choice = choices.find((entry) => entry.engine === engine)?.choice ?? null;
  const voice = voiceById(engine, voiceId) ?? voiceById(engine, DEFAULT_VOICE[engine])!;
  const job = useMemo(() => buildSpeechJob({ engine, voiceId: voice.id, text, settings }), [engine, settings, text, voice.id]);
  const chars = speechChars(job);
  const perTake = paid && chars > 0 ? jobCredits({ ...job, measured: { char_count: chars } }, paid.catalog) : null;
  const total = perTake === null ? null : perTake * variations;
  const busy = waiting > 0 || (states !== undefined && takes.some((id) => ["reserved", "running", "queued"].includes(states[id]?.status ?? "reserved")));

  const blocker = !canSave
    ? T.noAccess[locale]
    : !choice
      ? T.modelMissing[locale]
      : text.trim().length === 0
        ? T.emptyText[locale]
        : chars > meta.maxChars
          ? fillCopy(T.tooLong[locale], { max: meta.maxChars })
          : busy
            ? T.working[locale]
            : null;

  function changeEngine(next: VoiceEngineId) {
    setEngine(next);
    setVoiceId(DEFAULT_VOICE[next]);
  }

  function insertSticker(label: string) {
    const field = textRef.current;
    const start = field?.selectionStart ?? text.length;
    const end = field?.selectionEnd ?? text.length;
    const before = text.slice(0, start);
    const spacer = before.length > 0 && !/\s$/.test(before) ? " " : "";
    const next = `${before}${spacer}${label} ${text.slice(end)}`.slice(0, meta.maxChars);
    setText(next);
    requestAnimationFrame(() => {
      const caret = before.length + spacer.length + label.length + 1;
      field?.focus();
      field?.setSelectionRange(caret, caret);
    });
  }

  function speak() {
    setError(null);
    setTakes([]);
    enqueue(
      Array.from({ length: variations }, () => ({
        args: { modelSlug: job.modelSlug, params: JSON.stringify(job.params), inputMode: job.inputMode, inputs: JSON.stringify({}), ...(projectId ? { projectId } : {}) },
        onCreated: (jobId: Id<"generationJobs">) => setTakes((current) => [...current, jobId]),
      })),
    );
  }

  const libraryHref = `${pathname}?${creaShellQuery({ area: "zvuk", mode: "glasovi", tool: "zvuk.glasovi" }, searchParams)}`;
  const set = <K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Mic aria-hidden="true" className="size-5" />} />

      <div className="mt-5 space-y-6 border-t border-line pt-5">
        <EnginePicker locale={locale} choices={choices} value={engine} onChange={changeEngine} />

        <div className="space-y-3">
          <label htmlFor="crea-govor-glas" className="type-body font-black text-ink">
            {T.voiceLegend[locale]}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <VoiceSelect id="crea-govor-glas" engine={engine} value={voice.id} onChange={setVoiceId} favorites={mine?.favorites ?? null} locale={locale} className="max-w-sm flex-1" />
            <SampleButton voice={voice} player={player} locale={locale} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {mine && mine.presets.length > 0 ? (
              <label className="flex min-w-0 items-center gap-2">
                <span className="type-body-sm font-black text-ink">{T.presetLegend[locale]}</span>
                <select
                  value=""
                  onChange={(event) => {
                    const preset = mine.presets.find((entry) => entry.id === event.target.value);
                    if (!preset) return;
                    setEngine(preset.engine);
                    setVoiceId(preset.voiceId);
                    setSettings(preset.settings);
                  }}
                  className={cn(FIELD, "min-h-11 w-auto max-w-xs")}
                >
                  <option value="">{T.presetNone[locale]}</option>
                  {mine.presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <Link href={libraryHref} className="inline-flex min-h-11 items-center type-body-sm font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              {T.openLibrary[locale]}
            </Link>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="crea-govor-tekst" className="type-body font-black text-ink">
            {T.textLegend[locale]}
          </label>
          <textarea
            id="crea-govor-tekst"
            ref={textRef}
            value={text}
            rows={6}
            maxLength={meta.maxChars}
            onChange={(event) => setText(event.target.value)}
            placeholder={T.textPlaceholder[locale]}
            className={cn(FIELD, "resize-y")}
          />
          <span className="block font-mono text-xs font-bold text-muted">
            {chars}/{meta.maxChars}
          </span>
          <FieldMic locale={locale} value={text} onChange={setText} maxLength={meta.maxChars} />
          <div role="group" aria-label={T.stickersLegend[locale]}>
            <p className="type-body-sm font-black text-ink">{T.stickersLegend[locale]}</p>
            <p className="type-body-sm font-semibold text-muted">{T.stickersHint[locale]}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {VOICE_STICKERS.map((sticker) => (
                <li key={sticker.id}>
                  <button
                    type="button"
                    onClick={() => insertSticker(sticker.label[locale])}
                    aria-label={fillCopy(T.insertSticker[locale], { nalepnica: sticker.label[locale] })}
                    className="min-h-11 rounded-full border-2 border-ink bg-yellow px-3 font-display text-lg text-ink shadow-[2px_2px_0_0_var(--ink)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    {sticker.label[locale]}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-5">
          <label className="block max-w-md">
            <span className="flex items-baseline justify-between gap-2">
              <span className="type-body-sm font-black text-ink">{T.moodLegend[locale]}</span>
              <span className="type-body-sm font-black text-ink">{VOICE_MOOD_LABELS[settings.mood][locale]}</span>
            </span>
            <input
              type="range"
              min={0}
              max={VOICE_MOODS.length - 1}
              step={1}
              value={VOICE_MOODS.indexOf(settings.mood)}
              aria-valuetext={VOICE_MOOD_LABELS[settings.mood][locale]}
              onChange={(event) => set("mood", VOICE_MOODS[Number(event.target.value)] as VoiceMood)}
              className="mt-2 h-11 w-full accent-ink"
            />
            <span className="flex justify-between text-xs font-bold text-muted" aria-hidden="true">
              <span>{VOICE_MOOD_LABELS[-2][locale]}</span>
              <span>{VOICE_MOOD_LABELS[2][locale]}</span>
            </span>
          </label>
          <ChoiceChips<VoiceSpeed>
            legend={T.speedLegend[locale]}
            name="crea-govor-brzina"
            options={VOICE_SPEEDS.map((id) => ({ id, label: T.speeds[String(id)]![locale] }))}
            value={settings.speed}
            onChange={(value) => set("speed", value)}
          />
          <div>
            <ChoiceChips<VoicePitch>
              legend={T.pitchLegend[locale]}
              name="crea-govor-visina"
              options={VOICE_PITCHES.map((id) => ({ id, label: T.pitches[String(id)]![locale] }))}
              value={settings.pitch}
              onChange={(value) => set("pitch", value)}
              disabled={!meta.supports.pitch}
            />
            {!meta.supports.pitch ? <p className="mt-1 type-body-sm font-semibold text-muted">{T.onlyGemini[locale]}</p> : null}
          </div>
          <label className="block">
            <span className="type-body-sm font-black text-ink">{T.describeLegend[locale]}</span>
            <input
              value={settings.describe}
              maxLength={VOICE_DESCRIBE_MAX}
              disabled={!meta.supports.describe}
              onChange={(event) => set("describe", event.target.value)}
              placeholder={T.describePlaceholder[locale]}
              className={cn(FIELD, "mt-1 min-h-11")}
            />
            {!meta.supports.describe ? <span className="mt-1 block type-body-sm font-semibold text-muted">{T.onlyGemini[locale]}</span> : null}
          </label>
          {canSave ? <PresetSaver locale={locale} engine={engine} voiceId={voice.id} settings={settings} /> : null}
        </div>

        <div className="space-y-3 border-t border-line pt-5">
          <ChoiceChips<Variations> legend={T.variationsLegend[locale]} name="crea-govor-verzije" options={VARIATIONS.map((id) => ({ id, label: String(id) }))} value={variations} onChange={setVariations} />
          <p className="type-body-sm font-semibold text-muted">{T.variationsHint[locale]}</p>
          <PaidSubmit
            locale={locale}
            label={T.speak[locale]}
            icon={<Mic aria-hidden="true" className="size-4" />}
            credits={total}
            blocker={blocker}
            status={error ? { name: "error", message: error } : { name: "idle" }}
            demo={choice?.demo ?? false}
            onSubmit={speak}
          />
        </div>

        {takes.length > 0 ? (
          <div className="space-y-2 border-t border-line pt-5" aria-live="polite">
            <h3 className="type-h4 text-ink">{T.takesTitle[locale]}</h3>
            <ol className="divide-y divide-line">
              {takes.map((id, index) => (
                <li key={id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="w-20 shrink-0 type-body-sm font-black text-ink">{fillCopy(T.take[locale], { n: index + 1 })}</span>
                  <div className="min-w-0 flex-1">
                    <TakeAudio locale={locale} state={states?.[id]} />
                  </div>
                </li>
              ))}
            </ol>
            <p className="type-body-sm font-semibold text-muted">{T.inGallery[locale]}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
