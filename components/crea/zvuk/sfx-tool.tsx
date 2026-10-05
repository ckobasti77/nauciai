"use client";

import { Download, Pause, Play, Save, Search, Sparkles, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useJobQueue } from "@/components/crea/create/use-job-queue";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { paidModel, PaidSubmit } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useSaveLocalResult } from "@/components/crea/use-save-local-result";
import { LicenseBadge } from "@/components/crea/zvuk/license-badge";
import { FIELD, TakeAudio, useJobStates } from "@/components/crea/zvuk/voice-kit";
import { cn } from "@/components/ui/primitives";
import type { Id } from "@/convex/_generated/dataModel";
import { creaSaveErrorMessage, fillCopy } from "@/lib/crea-copy";
import { jobCredits } from "@/lib/crea-job-price";
import { CC0_TAG, licenseForModel } from "@/lib/crea-license-tags";
import { SFX_CATEGORIES, SFX_CATEGORY_LABELS, SFX_LICENSE, searchSfx, sfxUrl, type SfxCategory, type SfxFile } from "@/lib/crea-sfx-library";
import { CREA_SOUND_COPY as T } from "@/lib/crea-sound-copy";
import { formatCredits } from "@/lib/studio-params";
import { studioErrorMessage } from "@/lib/studio-messages";

/** Motori novog efekta: jeftin (MMAudio) i najbolji kvalitet (ElevenLabs). */
const ENGINES = [
  { id: "jeftino", slug: "mmaudio-sfx", min: 1, max: 30 },
  { id: "kvalitet", slug: "sfx", min: 5, max: 22 },
] as const;
type EngineId = (typeof ENGINES)[number]["id"];

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * Zvučni efekti (Crea K23, A13): besplatna CC0 biblioteka sa pretragom na srpskom
 * (slušanje, preuzimanje, čuvanje u galeriju za montažu - 0 kr) i nov efekat iz
 * opisa (MMAudio upola jeftinije ili ElevenLabs). Svaki red nosi oznaku licence (A21).
 */
export default function SfxTool({ tool, locale, canSave, projectId, paid }: CreaToolProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SfxCategory | "sve">("sve");
  const [playing, setPlaying] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, "saving" | "saved" | string>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const saveLocalResult = useSaveLocalResult();

  const results = useMemo(() => searchSfx(query, category === "sve" ? null : category), [query, category]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  function play(file: SfxFile) {
    const audio = (audioRef.current ??= new Audio());
    if (playing === file.id) {
      audio.pause();
      setPlaying(null);
      return;
    }
    audio.pause();
    audio.src = sfxUrl(file);
    audio.onended = () => setPlaying(null);
    setPlaying(file.id);
    void audio.play().catch(() => setPlaying(null));
  }

  async function save(file: SfxFile) {
    setSaved((current) => ({ ...current, [file.id]: "saving" }));
    try {
      const response = await fetch(sfxUrl(file));
      if (!response.ok) throw new Error("PREUZIMANJE");
      const blob = new Blob([await response.arrayBuffer()], { type: "audio/mpeg" });
      const result = await saveLocalResult({ toolId: tool.id, kind: "audio", blob, params: { biblioteka: file.id, licenca: SFX_LICENSE.id }, projectId });
      setSaved((current) => ({ ...current, [file.id]: result.ok ? "saved" : creaSaveErrorMessage(result.reason, locale) }));
    } catch (caught) {
      setSaved((current) => ({ ...current, [file.id]: creaSaveErrorMessage(caught instanceof Error ? caught.message : String(caught), locale) }));
    }
  }

  // ── Nov efekat iz opisa ───────────────────────────────────────────────────
  const [engine, setEngine] = useState<EngineId>("jeftino");
  const [prompt, setPrompt] = useState("");
  const [seconds, setSeconds] = useState(5);
  const [takes, setTakes] = useState<Array<{ id: Id<"generationJobs">; slug: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const onQueueError = useCallback((message: string) => setError(studioErrorMessage(message, locale)), [locale]);
  const { enqueue, waiting } = useJobQueue(onQueueError);
  const states = useJobStates(takes.map((take) => take.id));

  const meta = ENGINES.find((entry) => entry.id === engine)!;
  const choice = paidModel(paid, meta.slug, "text");
  const duration = Math.min(meta.max, Math.max(meta.min, seconds));
  const priceOf = (slug: string, value: number) => (paid ? jobCredits({ modelSlug: slug, inputMode: "text", params: { prompt: "x", duration: value }, measured: {} }, paid.catalog) : null);
  const price = priceOf(meta.slug, duration);
  const busy = waiting > 0 || (states !== undefined && takes.some((take) => ["reserved", "running", "queued"].includes(states[take.id]?.status ?? "reserved")));
  const blocker = !canSave ? T.common.noAccess[locale] : !choice ? T.common.modelMissing[locale] : prompt.trim().length === 0 ? T.sfx.emptyPrompt[locale] : busy ? T.common.working[locale] : null;

  function make() {
    setError(null);
    enqueue([
      {
        args: { modelSlug: meta.slug, params: JSON.stringify({ prompt: prompt.trim(), duration }), inputMode: "text", inputs: JSON.stringify({}), ...(projectId ? { projectId } : {}) },
        onCreated: (jobId: Id<"generationJobs">) => setTakes((current) => [{ id: jobId, slug: meta.slug }, ...current]),
      },
    ]);
  }

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Zap aria-hidden="true" className="size-5" />} />

      <div className="mt-5 space-y-4 border-t border-line pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="type-h4 text-ink">{T.sfx.libraryTitle[locale]}</h3>
          <LicenseBadge tag={CC0_TAG} locale={locale} />
        </div>
        <label className="relative block max-w-md">
          <span className="sr-only">{T.sfx.searchLabel[locale]}</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={T.sfx.searchPlaceholder[locale]} className={cn(FIELD, "min-h-11 pl-9")} />
        </label>
        <ChoiceChips<SfxCategory | "sve">
          legend={T.sfx.categoryLegend[locale]}
          name="crea-efekti-kategorija"
          options={[{ id: "sve" as const, label: T.sfx.all[locale] }, ...SFX_CATEGORIES.map((id) => ({ id, label: SFX_CATEGORY_LABELS[id][locale] }))]}
          value={category}
          onChange={setCategory}
        />
        <p className="type-body-sm font-semibold text-muted" aria-live="polite">
          {fillCopy(T.sfx.found[locale], { n: results.length })}
        </p>
        {results.length === 0 ? (
          <p className="surface-inset border border-dashed border-line bg-paper p-3 type-body-sm font-bold text-muted">{T.sfx.nothing[locale]}</p>
        ) : (
          <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto pr-1">
            {results.map((file) => {
              const state = saved[file.id];
              return (
                <li key={file.id} className="flex flex-wrap items-center gap-3 py-2">
                  <button
                    type="button"
                    onClick={() => play(file)}
                    aria-pressed={playing === file.id}
                    aria-label={fillCopy(playing === file.id ? T.sfx.stop[locale] : T.sfx.listen[locale], { ime: file.title[locale] })}
                    className={cn("grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper-strong text-ink transition hover:-translate-y-0.5 motion-reduce:transition-none", FOCUS)}
                  >
                    {playing === file.id ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate type-body-sm font-black text-ink">{file.title[locale]}</span>
                    <span className="block font-mono text-xs font-bold text-muted">
                      {fillCopy(T.sfx.seconds[locale], { s: file.seconds.toLocaleString(locale === "sr" ? "sr-Latn" : "en", { maximumFractionDigits: 1 }) })} · {SFX_CATEGORY_LABELS[file.category][locale]}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <a
                      href={sfxUrl(file)}
                      download={`crea-${file.id}.mp3`}
                      aria-label={fillCopy(T.sfx.download[locale], { ime: file.title[locale] })}
                      className={cn("grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink", FOCUS)}
                    >
                      <Download aria-hidden="true" className="size-4" />
                    </a>
                    {canSave ? (
                      <button
                        type="button"
                        disabled={state === "saving" || state === "saved"}
                        onClick={() => void save(file)}
                        className={cn("inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-3 text-sm font-black text-ink disabled:opacity-60", FOCUS)}
                      >
                        <Save aria-hidden="true" className="size-4" />
                        {state === "saved" ? T.sfx.saved[locale] : state === "saving" ? T.common.saving[locale] : T.sfx.save[locale]}
                      </button>
                    ) : null}
                  </span>
                  {state && state !== "saving" && state !== "saved" ? <p role="alert" className="w-full type-body-sm font-black text-red-700 dark:text-red-300">{state}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
        <p className="type-body-sm font-semibold text-muted">
          {T.sfx.credit[locale]}{" "}
          <a href="/crea/sfx/IZVORI.txt" target="_blank" rel="noreferrer" className={cn("font-black text-ink underline decoration-2 underline-offset-4", FOCUS)}>
            {T.sfx.sources[locale]}
          </a>
        </p>
      </div>

      <div className="mt-6 space-y-4 border-t border-line pt-5">
        <h3 className="type-h4 text-ink">{T.sfx.newTitle[locale]}</h3>
        <ChoiceChips<EngineId>
          legend={T.sfx.engineLegend[locale]}
          name="crea-efekti-motor"
          options={ENGINES.map((entry) => {
            const five = priceOf(entry.slug, 5);
            return { id: entry.id, label: T.sfx.engines[entry.id][locale], hint: five !== null ? fillCopy(T.sfx.perFive[locale], { kr: formatCredits(five, locale) }) : undefined };
          })}
          value={engine}
          onChange={(next) => {
            setEngine(next);
            const target = ENGINES.find((entry) => entry.id === next)!;
            setSeconds((current) => Math.min(target.max, Math.max(target.min, current)));
          }}
        />
        <p className="type-body-sm font-semibold text-muted">{T.sfx.engineHints[engine][locale]}</p>
        <label className="block">
          <span className="type-body-sm font-black text-ink">{T.sfx.promptLabel[locale]}</span>
          <textarea value={prompt} rows={3} maxLength={500} onChange={(event) => setPrompt(event.target.value)} placeholder={T.sfx.promptPlaceholder[locale]} className={cn(FIELD, "mt-1 resize-y")} />
        </label>
        <label className="block max-w-md">
          <span className="flex items-baseline justify-between gap-2">
            <span className="type-body-sm font-black text-ink">{T.sfx.durationLabel[locale]}</span>
            <span className="font-mono text-sm font-black text-ink">{fillCopy(T.sfx.seconds[locale], { s: duration })}</span>
          </span>
          <input type="range" min={meta.min} max={meta.max} step={1} value={duration} onChange={(event) => setSeconds(Number(event.target.value))} className="mt-2 h-11 w-full accent-ink" />
        </label>
        <PaidSubmit
          locale={locale}
          label={T.sfx.make[locale]}
          icon={<Sparkles aria-hidden="true" className="size-4" />}
          credits={price}
          blocker={blocker}
          status={error ? { name: "error", message: error } : { name: "idle" }}
          demo={choice?.demo ?? false}
          onSubmit={make}
        />
        {takes.length > 0 ? (
          <ol className="divide-y divide-line" aria-live="polite">
            {takes.map((take) => (
              <li key={take.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <TakeAudio locale={locale} state={states?.[take.id]} />
                </div>
                <LicenseBadge tag={licenseForModel(take.slug)} locale={locale} />
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
