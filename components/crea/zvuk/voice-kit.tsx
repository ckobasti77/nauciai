"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { paidModel, type PaidModelChoice } from "@/components/crea/tools/paid-video";
import type { CreaPaidContext } from "@/components/crea/tools/types";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fillCopy } from "@/lib/crea-copy";
import { jobCredits } from "@/lib/crea-job-price";
import { CREA_VOICE_COPY as T } from "@/lib/crea-voice-copy";
import { sanitizeVoiceSettings, type VoiceSettings } from "@/lib/crea-voice-tags";
import {
  isVoiceEngineId,
  VOICE_ENGINE_LIST,
  voiceById,
  voiceKey,
  voicesOf,
  type CreaVoice,
  type VoiceEngineId,
} from "@/lib/crea-voices";
import type { Locale } from "@/lib/i18n";
import { formatCredits } from "@/lib/studio-params";

/**
 * Zajednički delovi Zvuka (Crea K22): omiljeni i sačuvana podešavanja, uzorci
 * glasova (jedan plejer za celu stranu), izbor motora i glasa, i stanje
 * napravljenih verzija. Jedan okvir po grupi: ovde nema `border-2 border-ink`
 * osim na kontrolama (dugmad, polja).
 */

/** `?glas=gemini:Kore` i `?podesavanje=<id>`: biblioteka glasova → Govor sa emocijama. */
export const VOICE_PARAM = "glas";
export const PRESET_PARAM = "podesavanje";

export const FIELD =
  "surface-inset block w-full border-2 border-ink bg-paper px-3 py-2 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60";

export type VoicePreset = { id: Id<"creaVoicePresets">; name: string; engine: VoiceEngineId; voiceId: string; settings: VoiceSettings };

/** Omiljeni (`gemini:Kore`) i sačuvana podešavanja; `null` dok se učitava ili bez pristupa. */
export function useMyVoices(enabled: boolean) {
  const data = useQuery(api.creaVoices.listMyVoices, enabled ? {} : "skip");
  return useMemo(() => {
    if (!data) return null;
    const presets: VoicePreset[] = [];
    for (const preset of data.presets) {
      if (!isVoiceEngineId(preset.engine) || !voiceById(preset.engine, preset.voiceId)) continue;
      let settings: unknown = null;
      try {
        settings = JSON.parse(preset.settings);
      } catch {
        settings = null;
      }
      presets.push({ id: preset.id, name: preset.name, engine: preset.engine, voiceId: preset.voiceId, settings: sanitizeVoiceSettings(settings) });
    }
    return { favorites: new Set(data.favorites), presets };
  }, [data]);
}

type SampleState = "loading" | "playing" | "demo" | "busy" | "error";

/**
 * Jedan plejer uzoraka za celu stranu: novo slušanje zaustavlja prethodno. Uzorak
 * koji još ne postoji pravi server pri prvom kliku (0 kr korisniku).
 */
export function useSamplePlayer(enabled: boolean) {
  const gemini = useQuery(api.creaVoices.voiceSamples, enabled ? { engine: "gemini" } : "skip");
  const eleven = useQuery(api.creaVoices.voiceSamples, enabled ? { engine: "eleven" } : "skip");
  const requestSample = useAction(api.creaVoices.requestVoiceSample);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [states, setStates] = useState<Record<string, SampleState>>({});

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const setState = useCallback((key: string, state: SampleState | null) => {
    setStates((current) => {
      const next = { ...current };
      if (state === null) delete next[key];
      else next[key] = state;
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setStates((current) => Object.fromEntries(Object.entries(current).filter(([, state]) => state !== "playing")));
  }, []);

  const play = useCallback(
    async (voice: CreaVoice) => {
      const key = voiceKey(voice);
      if (states[key] === "playing") {
        stop();
        return;
      }
      stop();
      let url = (voice.engine === "gemini" ? gemini : eleven)?.[voice.id];
      if (!url) {
        setState(key, "loading");
        const reply = await requestSample({ engine: voice.engine, voiceId: voice.id }).catch(() => ({ ok: false as const, reason: "GRESKA" as const }));
        if (!reply.ok) {
          setState(key, reply.reason === "DEMO" ? "demo" : reply.reason === "U_TOKU" ? "busy" : "error");
          return;
        }
        url = reply.url;
      }
      const audio = (audioRef.current ??= new Audio());
      audio.src = url;
      audio.onended = () => setState(key, null);
      audio.onerror = () => setState(key, "error");
      setState(key, "playing");
      await audio.play().catch(() => setState(key, "error"));
    },
    [eleven, gemini, requestSample, setState, states, stop],
  );

  return { play, states };
}

export type SamplePlayer = ReturnType<typeof useSamplePlayer>;

export function SampleButton({ voice, player, locale }: { voice: CreaVoice; player: SamplePlayer; locale: Locale }) {
  const state = player.states[voiceKey(voice)];
  const label = state === "playing" ? T.stopListening[locale] : fillCopy(T.listen[locale], { ime: voice.id });
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void player.play(voice)}
        aria-label={label}
        title={label}
        aria-pressed={state === "playing"}
        className="igra-press grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper-strong text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {state === "loading" ? <Spinner size="xs" /> : state === "playing" ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
      </button>
      {state === "demo" || state === "busy" || state === "error" ? (
        <span role="status" className="type-body-sm font-semibold text-muted">
          {(state === "demo" ? T.sampleDemo : state === "busy" ? T.sampleBusy : T.sampleError)[locale]}
        </span>
      ) : null}
    </span>
  );
}

export function voiceLabel(voice: CreaVoice, locale: Locale): string {
  return `${voice.id} · ${voice.trait[locale]} · ${T.genders[voice.gender][locale]}`;
}

/** Izbor glasa jednog motora: prvo omiljeni, pa svi. */
export function VoiceSelect({
  engine,
  value,
  onChange,
  favorites,
  locale,
  id,
  disabled,
  className,
}: {
  engine: VoiceEngineId;
  value: string;
  onChange: (voiceId: string) => void;
  favorites: ReadonlySet<string> | null;
  locale: Locale;
  id?: string;
  disabled?: boolean;
  className?: string;
}) {
  const voices = voicesOf(engine);
  const favorite = voices.filter((voice) => favorites?.has(voiceKey(voice)));
  return (
    <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={cn(FIELD, "min-h-11", className)}>
      {favorite.length > 0 ? (
        <optgroup label={T.favoritesGroup[locale]}>
          {favorite.map((voice) => (
            <option key={`f-${voice.id}`} value={voice.id}>
              {voiceLabel(voice, locale)}
            </option>
          ))}
        </optgroup>
      ) : null}
      <optgroup label={T.allVoicesGroup[locale]}>
        {voices.map((voice) => (
          <option key={voice.id} value={voice.id}>
            {voiceLabel(voice, locale)}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

export type EngineChoice = { engine: VoiceEngineId; choice: PaidModelChoice | null; perThousand: number | null };

/** Motori sa modelom iz kataloga (ista odluka o dostupnosti kao composer) i cenom 1 000 znakova. */
export function useEngineChoices(paid: CreaPaidContext | null): EngineChoice[] {
  return useMemo(
    () =>
      VOICE_ENGINE_LIST.map((engine) => {
        const choice = paidModel(paid, engine.modelSlug, "text");
        const perThousand =
          choice && paid
            ? jobCredits({ modelSlug: engine.modelSlug, inputMode: "text", params: { text: "a".repeat(1000) }, measured: { char_count: 1000 } }, paid.catalog)
            : null;
        return { engine: engine.id, choice, perThousand };
      }),
    [paid],
  );
}

/** A2: izbor motora kao dve kartice-radio, sa oznakom „govori srpski ✓" i cenom. */
export function EnginePicker({
  locale,
  choices,
  value,
  onChange,
  disabled,
}: {
  locale: Locale;
  choices: readonly EngineChoice[];
  value: VoiceEngineId;
  onChange: (engine: VoiceEngineId) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="type-body font-black text-ink">{T.engineLegend[locale]}</legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {choices.map(({ engine, choice, perThousand }) => {
          const meta = VOICE_ENGINE_LIST.find((entry) => entry.id === engine)!;
          const active = value === engine;
          return (
            <label
              key={engine}
              className={cn(
                "surface-inset flex min-h-11 cursor-pointer flex-col gap-1 border-2 p-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 motion-reduce:transition-none",
                active ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper text-ink hover:border-ink",
              )}
            >
              <input type="radio" name="crea-motor" value={engine} checked={active} disabled={!choice} onChange={() => onChange(engine)} className="sr-only" />
              <span className="flex flex-wrap items-center gap-2">
                <span className="type-body font-black">{meta.label[locale]}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-black", active ? "bg-yellow text-ink" : "bg-ink text-paper-strong")}>{T.speaksSerbian[locale]}</span>
              </span>
              <span className={cn("type-body-sm font-semibold", active ? "text-paper-strong/85" : "text-muted")}>{meta.pitch[locale]}</span>
              <span className="font-mono text-xs font-bold">
                {!choice ? T.engineUnavailable[locale] : perThousand !== null ? fillCopy(T.perThousand[locale], { kr: formatCredits(perThousand, locale) }) : null}
                {choice?.demo ? ` · ${T.engineDemo[locale]}` : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** „Sačuvaj podešavanje" (A3): ime + sačuvaj, u istom redu. */
export function PresetSaver({ locale, engine, voiceId, settings }: { locale: Locale; engine: VoiceEngineId; voiceId: string; settings: VoiceSettings }) {
  const savePreset = useMutation(api.creaVoices.saveVoicePreset);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const reply = await savePreset({ name, engine, voiceId, settings: JSON.stringify(settings) }).catch(() => null);
    if (!reply) return setMessage(T.presetErrors.LIMIT[locale]);
    if (!reply.ok) return setMessage(T.presetErrors[reply.reason][locale]);
    setMessage(T.presetSaved[locale]);
    setOpen(false);
    setName("");
  }

  return (
    <div className="space-y-2">
      {open ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="type-body-sm font-black text-ink">{T.presetName[locale]}</span>
            <input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder={T.presetNamePlaceholder[locale]} className={cn(FIELD, "mt-1 min-h-11")} />
          </label>
          <button type="button" onClick={() => void save()} className="min-h-11 rounded-full border-2 border-ink bg-ink px-4 text-sm font-black text-paper-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            {T.save[locale]}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            {T.cancel[locale]}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMessage(null);
          }}
          className="min-h-11 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {T.savePreset[locale]}
        </button>
      )}
      {message ? (
        <p role="status" className="type-body-sm font-semibold text-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export type JobState = { status: string; isMock: boolean; outputUrl: string | null };

/**
 * Stanja do 120 sopstvenih poslova (`creaMontages.jobStates` prima 20 po pozivu;
 * K23: prevod ima do 120 rečenica). Broj upita je stalan (6), prazni se preskaču.
 */
export function useJobStates(ids: readonly Id<"generationJobs">[]): Record<string, JobState> | undefined {
  const unique = [...new Set(ids)];
  const chunk = (index: number) => unique.slice(index * 20, index * 20 + 20);
  const args = (index: number) => (chunk(index).length > 0 ? { jobIds: chunk(index) } : ("skip" as const));
  const results = [
    useQuery(api.creaMontages.jobStates, args(0)),
    useQuery(api.creaMontages.jobStates, args(1)),
    useQuery(api.creaMontages.jobStates, args(2)),
    useQuery(api.creaMontages.jobStates, args(3)),
    useQuery(api.creaMontages.jobStates, args(4)),
    useQuery(api.creaMontages.jobStates, args(5)),
  ];
  if (results.some((result, index) => chunk(index).length > 0 && result === undefined)) return undefined;
  return Object.assign({}, ...results.map((result) => result ?? {})) as Record<string, JobState>;
}

/** Jedna napravljena verzija: plejer, DEMO, greška ili „pravi se". */
export function TakeAudio({ locale, state }: { locale: Locale; state: JobState | undefined }) {
  if (!state || ["reserved", "running", "queued"].includes(state.status)) {
    return (
      <span className="inline-flex min-h-11 items-center gap-2 type-body-sm font-bold text-muted">
        <Spinner size="xs" /> {T.working[locale]}
      </span>
    );
  }
  if (state.status === "failed" || state.status === "refunded") {
    return <p className="type-body-sm font-black text-red-700 dark:text-red-300">{T.failedTake[locale]}</p>;
  }
  if (state.isMock || !state.outputUrl) return <p className="type-body-sm font-semibold text-muted">{T.demoTake[locale]}</p>;
  return <audio controls preload="none" src={state.outputUrl} className="h-11 w-full max-w-md" />;
}

