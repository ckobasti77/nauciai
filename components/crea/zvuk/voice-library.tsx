"use client";

import { useMutation } from "convex/react";
import { Library, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { LicenseBadge } from "@/components/crea/zvuk/license-badge";
import { FIELD, PRESET_PARAM, SampleButton, useMyVoices, useSamplePlayer, VOICE_PARAM } from "@/components/crea/zvuk/voice-kit";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import { fillCopy } from "@/lib/crea-copy";
import { licenseForModel } from "@/lib/crea-license-tags";
import { creaShellQuery } from "@/lib/crea-shell";
import { CREA_VOICE_COPY as T } from "@/lib/crea-voice-copy";
import { VOICE_MOOD_LABELS } from "@/lib/crea-voice-tags";
import {
  CREA_VOICES,
  filterVoices,
  VOICE_ENGINE_LIST,
  VOICE_LANGUAGE_LABELS,
  VOICE_LANGUAGES,
  VOICE_TONES,
  voiceEngine,
  voiceKey,
  type VoiceAge,
  type VoiceEngineId,
  type VoiceGender,
  type VoiceLanguage,
  type VoiceTone,
} from "@/lib/crea-voices";

type Any = "sve";
const ANY: Any = "sve";

/**
 * Biblioteka glasova (Crea K22, A3): filteri (motor, jezik, pol, godine, ton,
 * omiljeni), slušanje uzorka (0 kr; uzorak se pravi pri prvom slušanju, jednom za
 * sve), omiljeni i „Moja podešavanja". „Govori ovim glasom" vodi u Govor sa
 * emocijama sa izabranim glasom.
 */
export default function VoiceLibrary({ tool, locale, canSave }: CreaToolProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mine = useMyVoices(canSave);
  const player = useSamplePlayer(canSave);
  const toggleFavorite = useMutation(api.creaVoices.toggleVoiceFavorite);
  const deletePreset = useMutation(api.creaVoices.deleteVoicePreset);
  const [engine, setEngine] = useState<VoiceEngineId | Any>(ANY);
  const [language, setLanguage] = useState<VoiceLanguage>("sr");
  const [gender, setGender] = useState<VoiceGender | Any>(ANY);
  const [age, setAge] = useState<VoiceAge | Any>(ANY);
  const [tone, setTone] = useState<VoiceTone | Any>(ANY);
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const shown = filterVoices(CREA_VOICES, {
    engine: engine === ANY ? null : engine,
    language,
    gender: gender === ANY ? null : gender,
    age: age === ANY ? null : age,
    tone: tone === ANY ? null : tone,
    only: onlyFavorites ? (mine?.favorites ?? new Set()) : null,
  });

  const speechHref = (extra: Record<string, string>) => {
    const query = new URLSearchParams(creaShellQuery({ area: "zvuk", mode: "govor", tool: "zvuk.govor" }, searchParams));
    for (const [key, value] of Object.entries(extra)) query.set(key, value);
    return `${pathname}?${query.toString()}`;
  };

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Library aria-hidden="true" className="size-5" />} />
      {/* Crea K23 (A21): ugrađeni glasovi oba motora smeju i u reklame. */}
      <LicenseBadge tag={licenseForModel("gemini-tts")} locale={locale} detail className="mt-3" />

      <div className="mt-5 space-y-4 border-t border-line pt-5">
        <ChoiceChips<VoiceEngineId | Any>
          legend={T.filterEngine[locale]}
          name="crea-glasovi-motor"
          options={[{ id: ANY, label: T.all[locale] }, ...VOICE_ENGINE_LIST.map((entry) => ({ id: entry.id, label: entry.label[locale] }))]}
          value={engine}
          onChange={setEngine}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceChips<VoiceGender | Any>
            legend={T.filterGender[locale]}
            name="crea-glasovi-pol"
            options={[{ id: ANY, label: T.all[locale] }, { id: "zenski", label: T.genders.zenski[locale] }, { id: "muski", label: T.genders.muski[locale] }]}
            value={gender}
            onChange={setGender}
          />
          <ChoiceChips<VoiceAge | Any>
            legend={T.filterAge[locale]}
            name="crea-glasovi-godine"
            options={[
              { id: ANY, label: T.all[locale] },
              ...(["mlad", "srednji", "zreo"] as const).map((id) => ({ id, label: T.ages[id][locale] })),
            ]}
            value={age}
            onChange={setAge}
          />
        </div>
        <ChoiceChips<VoiceTone | Any>
          legend={T.filterTone[locale]}
          name="crea-glasovi-ton"
          options={[{ id: ANY, label: T.all[locale] }, ...VOICE_TONES.map((id) => ({ id, label: T.tones[id][locale] }))]}
          value={tone}
          onChange={setTone}
        />
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="type-body-sm font-black text-ink">{T.filterLanguage[locale]}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as VoiceLanguage)} className={cn(FIELD, "mt-1 min-h-11 w-auto")}>
              {VOICE_LANGUAGES.map((id) => (
                <option key={id} value={id}>
                  {VOICE_LANGUAGE_LABELS[id][locale]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 type-body-sm font-black text-ink">
            <input type="checkbox" checked={onlyFavorites} disabled={!canSave} onChange={(event) => setOnlyFavorites(event.target.checked)} className="size-5 accent-ink" />
            {T.onlyFavorites[locale]}
          </label>
        </div>
        <p className="type-body-sm font-semibold text-muted">
          {T.languageNote[locale]} {T.freeListening[locale]}
        </p>
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <p className="type-body-sm font-black text-ink" aria-live="polite">
          {fillCopy(T.shown[locale], { n: shown.length, ukupno: CREA_VOICES.length })}
        </p>
        {shown.length === 0 ? (
          <p className="mt-3 type-body font-semibold text-muted">{T.noMatch[locale]}</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {shown.map((voice) => {
              const key = voiceKey(voice);
              const favorite = mine?.favorites.has(key) ?? false;
              return (
                <li key={key} className="surface-inset flex flex-col gap-2 border border-line bg-paper p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="type-body font-black text-ink">{voice.id}</p>
                      <p className="type-body-sm font-semibold text-muted">
                        {voice.trait[locale]} · {T.genders[voice.gender][locale]} · {T.ages[voice.age][locale]}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-ink/30 px-2 py-0.5 text-xs font-black text-ink">{voiceEngine(voice.engine).label[locale]}</span>
                  </div>
                  <p className="flex flex-wrap gap-1.5">
                    {voice.tones.map((entry) => (
                      <span key={entry} className="rounded-full bg-paper-strong px-2 py-0.5 text-xs font-bold text-ink">
                        {T.tones[entry][locale]}
                      </span>
                    ))}
                    {voice.accent ? <span className="rounded-full px-2 py-0.5 text-xs font-bold text-muted">{fillCopy(T.accent[locale], { naglasak: voice.accent[locale] })}</span> : null}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    <SampleButton voice={voice} player={player} locale={locale} />
                    <button
                      type="button"
                      disabled={!canSave}
                      aria-pressed={favorite}
                      aria-label={fillCopy((favorite ? T.unfavorite : T.favorite)[locale], { ime: voice.id })}
                      title={fillCopy((favorite ? T.unfavorite : T.favorite)[locale], { ime: voice.id })}
                      onClick={() => void toggleFavorite({ engine: voice.engine, voiceId: voice.id })}
                      className={cn(
                        "grid size-11 place-items-center rounded-full border-2 border-ink transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 motion-reduce:transition-none",
                        favorite ? "bg-yellow text-ink" : "bg-paper-strong text-ink",
                      )}
                    >
                      <Star aria-hidden="true" className={cn("size-4", favorite && "fill-current")} />
                    </button>
                    <Link
                      href={speechHref({ [VOICE_PARAM]: key })}
                      className="inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-ink px-4 text-sm font-black text-paper-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      {T.useVoice[locale]}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <h3 className="type-h4 text-ink">{T.presetLegend[locale]}</h3>
        {!mine || mine.presets.length === 0 ? (
          <p className="mt-2 type-body-sm font-semibold text-muted">{T.presetsEmpty[locale]}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {mine.presets.map((preset) => (
              <li key={preset.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="type-body font-black text-ink">{preset.name}</p>
                  <p className="type-body-sm font-semibold text-muted">
                    {voiceEngine(preset.engine).label[locale]} · {preset.voiceId} · {VOICE_MOOD_LABELS[preset.settings.mood][locale]}
                    {preset.settings.describe ? ` · „${preset.settings.describe}"` : ""}
                  </p>
                </div>
                <Link
                  href={speechHref({ [PRESET_PARAM]: preset.id })}
                  className="inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  {T.use[locale]}
                </Link>
                <button
                  type="button"
                  aria-label={`${T.delete[locale]}: ${preset.name}`}
                  onClick={() => void deletePreset({ presetId: preset.id })}
                  className="grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
