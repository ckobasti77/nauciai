"use client";

import { ArrowDown, ArrowUp, Music, Plus, Repeat, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { FieldMic } from "@/components/crea/create/mic-button";

import { useJobQueue } from "@/components/crea/create/use-job-queue";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { paidModel, PaidSubmit } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useSaveLocalResult } from "@/components/crea/use-save-local-result";
import { LicenseBadge } from "@/components/crea/zvuk/license-badge";
import { FIELD, TakeAudio, useJobStates, type JobState } from "@/components/crea/zvuk/voice-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import type { Id } from "@/convex/_generated/dataModel";
import { creaSaveErrorMessage, fillCopy } from "@/lib/crea-copy";
import { licenseForModel } from "@/lib/crea-license-tags";
import {
  clampSectionSeconds,
  elevenMinutes,
  loopCrossfade,
  MUSIC_ENGINE_LIST,
  MUSIC_LIMITS,
  MUSIC_MOOD_META,
  MUSIC_MOODS,
  MUSIC_TEMPLATE_LABELS,
  MUSIC_TEMPLATES,
  MUSIC_TEMPO_META,
  MUSIC_TEMPOS,
  musicCredits,
  musicEngine,
  musicJob,
  musicProblem,
  musicTemplate,
  nextSectionId,
  sanitizeMusicDoc,
  SECTION_KINDS,
  SECTION_META,
  totalSeconds,
  type MusicDoc,
  type MusicEngineId,
  type MusicMood,
  type MusicSection,
  type MusicTemplate,
  type MusicTempo,
  type SectionKind,
} from "@/lib/crea-music";
import { CREA_SOUND_COPY as T } from "@/lib/crea-sound-copy";
import type { Locale } from "@/lib/i18n";
import { formatCredits } from "@/lib/studio-params";
import { studioErrorMessage } from "@/lib/studio-messages";

const DRAFT_KEY = "crea:muzika:v1";
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

function clock(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function loadDraft(): MusicDoc | null {
  if (typeof window === "undefined") return null;
  try {
    return sanitizeMusicDoc(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null"));
  } catch {
    return null;
  }
}

/**
 * Pesma po delovima (Crea K23, A11): šablon (pesma, džingl, petlja, podloga),
 * motor (Lyria klip / Lyria pesma / ElevenLabs tačno trajanje), stil, raspoloženje,
 * tempo, instrumental i petlja, pa delovi - svaki sa tekstom i trajanjem. Cena na
 * dugmetu je ista računica kao server; nacrt ostaje na uređaju.
 */
export default function MusicTool({ tool, locale, canSave, projectId, paid }: CreaToolProps) {
  const [doc, setDoc] = useState<MusicDoc>(() => loadDraft() ?? musicTemplate("pesma"));
  const [engine, setEngine] = useState<MusicEngineId>("lyria-song");
  const [addKind, setAddKind] = useState<SectionKind>("strofa");
  const [takes, setTakes] = useState<Array<{ id: Id<"generationJobs">; slug: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  // Nacrt ide na uređaj posle svake promene (spoljni sistem - zato efekat).
  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(doc));
    } catch {
      // Pun ili zabranjen localStorage: nacrt se samo ne čuva.
    }
  }, [doc]);

  const onQueueError = useCallback((message: string) => setError(studioErrorMessage(message, locale)), [locale]);
  const { enqueue, waiting } = useJobQueue(onQueueError);
  const states = useJobStates(takes.map((take) => take.id));

  const meta = musicEngine(engine);
  const choice = paidModel(paid, meta.modelSlug, "text");
  const price = paid ? musicCredits(doc, engine, paid.catalog) : null;
  const problem = musicProblem(doc, engine);
  const total = totalSeconds(doc);
  const busy = waiting > 0 || (states !== undefined && takes.some((take) => ["reserved", "running", "queued"].includes(states[take.id]?.status ?? "reserved")));
  const blocker = !canSave ? T.common.noAccess[locale] : !choice ? T.common.modelMissing[locale] : problem ? T.music.problems[problem][locale] : busy ? T.common.working[locale] : null;

  const update = (patch: (current: MusicDoc) => MusicDoc) => setDoc(patch);
  const setSection = (id: string, patch: Partial<MusicSection>) => update((current) => ({ ...current, sections: current.sections.map((section) => (section.id === id ? { ...section, ...patch } : section)) }));
  const move = (index: number, delta: number) =>
    update((current) => {
      const sections = current.sections.slice();
      const target = index + delta;
      if (target < 0 || target >= sections.length) return current;
      [sections[index], sections[target]] = [sections[target]!, sections[index]!];
      return { ...current, sections };
    });

  function applyTemplate(id: MusicTemplate) {
    const next = musicTemplate(id);
    // Stil, raspoloženje i tempo ostaju - šablon menja samo oblik pesme.
    setDoc((current) => ({ ...next, style: current.style, mood: current.mood, tempo: current.tempo }));
    if (id === "petlja" || id === "dzingl") setEngine("lyria-clip");
    else if (engine === "lyria-clip") setEngine("lyria-song");
  }

  function make() {
    setError(null);
    const job = musicJob(doc, engine);
    enqueue([
      {
        args: { modelSlug: job.modelSlug, params: JSON.stringify(job.params), inputMode: job.inputMode, inputs: JSON.stringify({}), ...(projectId ? { projectId } : {}) },
        onCreated: (jobId: Id<"generationJobs">) => setTakes((current) => [{ id: jobId, slug: job.modelSlug }, ...current]),
      },
    ]);
  }

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Music aria-hidden="true" className="size-5" />} />

      <div className="mt-5 space-y-6 border-t border-line pt-5">
        <div role="group" aria-labelledby="crea-muzika-sabloni">
          <p id="crea-muzika-sabloni" className="type-body-sm font-black text-ink">
            {T.music.templateLegend[locale]}
          </p>
          <p className="type-body-sm font-semibold text-muted">{T.music.templateHint[locale]}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {MUSIC_TEMPLATES.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => applyTemplate(id)}
                className={cn("igra-press igra-shadow-ink igra-depth-2 min-h-11 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink", FOCUS)}
              >
                {MUSIC_TEMPLATE_LABELS[id][locale]}
              </button>
            ))}
          </div>
        </div>

        <fieldset className="min-w-0">
          <legend className="type-body font-black text-ink">{T.music.engineLegend[locale]}</legend>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            {MUSIC_ENGINE_LIST.map((entry) => {
              const available = paidModel(paid, entry.modelSlug, "text");
              const credits = paid ? musicCredits(doc, entry.id, paid.catalog) : null;
              const active = engine === entry.id;
              return (
                <label
                  key={entry.id}
                  className={cn(
                    "surface-inset flex min-h-11 cursor-pointer flex-col gap-1 border-2 p-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 motion-reduce:transition-none",
                    active ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper text-ink hover:border-ink",
                  )}
                >
                  <input type="radio" name="crea-muzika-motor" value={entry.id} checked={active} disabled={!available} onChange={() => setEngine(entry.id)} className="sr-only" />
                  <span className="type-body font-black">{entry.label[locale]}</span>
                  <span className={cn("type-body-sm font-semibold", active ? "text-paper-strong/85" : "text-muted")}>{entry.pitch[locale]}</span>
                  <span className="font-mono text-xs font-bold">
                    {!available ? T.common.unavailable[locale] : credits !== null ? fillCopy(T.common.credits[locale], { kr: formatCredits(credits, locale) }) : null}
                    {available?.demo ? ` · ${T.common.demo[locale]}` : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-5 lg:grid-cols-2">
          <label className="block">
            <span className="type-body-sm font-black text-ink">{T.music.styleLabel[locale]}</span>
            <input value={doc.style} maxLength={MUSIC_LIMITS.styleChars} onChange={(event) => update((current) => ({ ...current, style: event.target.value }))} placeholder={T.music.stylePlaceholder[locale]} className={cn(FIELD, "mt-1 min-h-11")} />
          </label>
          <ChoiceChips<MusicTempo> legend={T.music.tempoLegend[locale]} name="crea-muzika-tempo" options={MUSIC_TEMPOS.map((id) => ({ id, label: MUSIC_TEMPO_META[id].label[locale], hint: `${MUSIC_TEMPO_META[id].bpm} BPM` }))} value={doc.tempo} onChange={(tempo) => update((current) => ({ ...current, tempo }))} />
        </div>
        <ChoiceChips<MusicMood | "">
          legend={T.music.moodLegend[locale]}
          name="crea-muzika-raspolozenje"
          options={[{ id: "" as const, label: T.music.noMood[locale] }, ...MUSIC_MOODS.map((id) => ({ id, label: MUSIC_MOOD_META[id].label[locale] }))]}
          value={doc.mood ?? ""}
          onChange={(mood) => update((current) => ({ ...current, mood: mood === "" ? null : mood }))}
        />
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 type-body-sm font-black text-ink">
            <input type="checkbox" checked={doc.instrumental} onChange={(event) => update((current) => ({ ...current, instrumental: event.target.checked }))} className="size-5 accent-ink" />
            {T.music.instrumental[locale]}
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 type-body-sm font-black text-ink">
            <input type="checkbox" checked={doc.loop} onChange={(event) => update((current) => ({ ...current, loop: event.target.checked }))} className="size-5 accent-ink" />
            {T.music.loop[locale]}
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="type-h4 text-ink">{T.music.sectionsTitle[locale]}</h3>
            <span className="font-mono text-sm font-black text-ink">
              {fillCopy(T.music.total[locale], { t: clock(total) })}
              {engine === "eleven" ? ` · ${fillCopy(T.music.billedMinutes[locale], { n: elevenMinutes(doc) })}` : ""}
            </span>
          </div>
          <p className="type-body-sm font-semibold text-muted">{T.music.engineTime[meta.seconds.kind][locale]}</p>
          {doc.sections.length === 0 ? <p className="surface-inset border border-dashed border-line bg-paper p-3 type-body-sm font-bold text-muted">{T.music.noSections[locale]}</p> : null}
          <ol className="divide-y divide-line">
            {doc.sections.map((section, index) => (
              <li key={section.id} className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2 py-3 sm:grid-cols-[minmax(0,9rem)_minmax(0,6rem)_minmax(0,1fr)_auto] sm:items-start">
                <label className="block min-w-0">
                  <span className="type-body-sm font-black text-ink">{T.music.sectionKind[locale]}</span>
                  <select value={section.kind} onChange={(event) => setSection(section.id, { kind: event.target.value as SectionKind })} className={cn(FIELD, "mt-1 min-h-11")}>
                    {SECTION_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {SECTION_META[kind].label[locale]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0">
                  <span className="type-body-sm font-black text-ink">{T.music.sectionSeconds[locale]}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={MUSIC_LIMITS.sectionSeconds.min}
                    max={MUSIC_LIMITS.sectionSeconds.max}
                    value={section.seconds}
                    onChange={(event) => setSection(section.id, { seconds: clampSectionSeconds(Number(event.target.value)) })}
                    className={cn(FIELD, "mt-1 min-h-11")}
                  />
                </label>
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <label className="block">
                    <span className="type-body-sm font-black text-ink">{doc.instrumental || section.kind === "solo" ? T.music.sectionSound[locale] : T.music.sectionLyrics[locale]}</span>
                    <textarea
                      value={section.text}
                      rows={section.kind === "uvod" || section.kind === "kraj" ? 1 : 3}
                      maxLength={MUSIC_LIMITS.sectionChars}
                      onChange={(event) => setSection(section.id, { text: event.target.value })}
                      placeholder={(doc.instrumental || section.kind === "solo" ? T.music.soundPlaceholder : T.music.lyricsPlaceholder)[locale]}
                      className={cn(FIELD, "mt-1 resize-y")}
                    />
                  </label>
                  <FieldMic locale={locale} value={section.text} onChange={(next) => setSection(section.id, { text: next })} maxLength={MUSIC_LIMITS.sectionChars} />
                </div>
                <span className="col-span-2 flex gap-1 sm:col-span-1 sm:pt-6">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={T.music.moveUp[locale]} className={cn("grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink disabled:opacity-40", FOCUS)}>
                    <ArrowUp aria-hidden="true" className="size-4" />
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === doc.sections.length - 1} aria-label={T.music.moveDown[locale]} className={cn("grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink disabled:opacity-40", FOCUS)}>
                    <ArrowDown aria-hidden="true" className="size-4" />
                  </button>
                  <button type="button" onClick={() => update((current) => ({ ...current, sections: current.sections.filter((entry) => entry.id !== section.id) }))} aria-label={T.music.remove[locale]} className={cn("grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink", FOCUS)}>
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          {doc.sections.length < MUSIC_LIMITS.sections ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="sr-only">{T.music.sectionKind[locale]}</span>
                <select value={addKind} onChange={(event) => setAddKind(event.target.value as SectionKind)} className={cn(FIELD, "min-h-11 w-auto")}>
                  {SECTION_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {SECTION_META[kind].label[locale]}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="secondary"
                icon={<Plus aria-hidden="true" className="size-4" />}
                onClick={() => update((current) => ({ ...current, sections: [...current.sections, { id: nextSectionId(current), kind: addKind, text: "", seconds: SECTION_META[addKind].seconds }] }))}
              >
                {T.music.addSection[locale]}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-line pt-5">
          <PaidSubmit
            locale={locale}
            label={T.music.make[locale]}
            icon={<Music aria-hidden="true" className="size-4" />}
            credits={price}
            blocker={blocker}
            status={error ? { name: "error", message: error } : { name: "idle" }}
            demo={choice?.demo ?? false}
            onSubmit={make}
          />
          <LicenseBadge tag={licenseForModel(meta.modelSlug)} locale={locale} detail />
        </div>

        {takes.length > 0 ? (
          <div className="space-y-2 border-t border-line pt-5" aria-live="polite">
            <h3 className="type-h4 text-ink">{T.music.takesTitle[locale]}</h3>
            <ol className="divide-y divide-line">
              {takes.map((take) => (
                <li key={take.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <TakeAudio locale={locale} state={states?.[take.id]} />
                    </div>
                    <LicenseBadge tag={licenseForModel(take.slug)} locale={locale} />
                  </div>
                  <LoopMaker locale={locale} state={states?.[take.id]} canSave={canSave} projectId={projectId} toolId={tool.id} parentJobId={take.id} />
                </li>
              ))}
            </ol>
            <p className="type-body-sm font-semibold text-muted">{T.music.inGallery[locale]}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** „Napravi petlju" (0 kr, na uređaju): kraj numere se pretopi u početak, pa se vrti bez skoka. */
function LoopMaker({
  locale,
  state,
  canSave,
  projectId,
  toolId,
  parentJobId,
}: {
  locale: Locale;
  state: JobState | undefined;
  canSave: boolean;
  projectId: Id<"studioProjects"> | null;
  toolId: string;
  parentJobId: Id<"generationJobs">;
}) {
  const [loop, setLoop] = useState<{ url: string; blob: Blob } | null>(null);
  const [status, setStatus] = useState<"idle" | "working" | "saving" | "saved" | { error: string }>("idle");
  const saveLocalResult = useSaveLocalResult();
  if (!state || state.status !== "done" || state.isMock || !state.outputUrl) return null;
  const source = state.outputUrl;

  async function makeLoop() {
    setStatus("working");
    try {
      const { decodeSound, wavBlob } = await import("@/components/crea/zvuk/audio-render");
      const buffer = await decodeSound(source, 44100, 2);
      if (!buffer) throw new Error("PRAZNO");
      const channels = loopCrossfade(Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index)), buffer.sampleRate, 1.5);
      const blob = wavBlob(channels, buffer.sampleRate);
      setLoop((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { url: URL.createObjectURL(blob), blob };
      });
      setStatus("idle");
    } catch {
      setStatus({ error: T.music.loopFailed[locale] });
    }
  }

  async function save() {
    if (!loop) return;
    setStatus("saving");
    try {
      const result = await saveLocalResult({ toolId, kind: "audio", blob: loop.blob, params: { petlja: true }, projectId, parentJobId });
      setStatus(result.ok ? "saved" : { error: creaSaveErrorMessage(result.reason, locale) });
    } catch (caught) {
      setStatus({ error: creaSaveErrorMessage(caught instanceof Error ? caught.message : String(caught), locale) });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" icon={<Repeat aria-hidden="true" className="size-4" />} disabled={status === "working"} onClick={() => void makeLoop()}>
        {status === "working" ? T.common.working[locale] : T.music.makeLoop[locale]}
      </Button>
      {loop ? (
        <>
          <audio src={loop.url} controls loop preload="none" className="h-11 w-full max-w-xs" />
          <a href={loop.url} download="crea-petlja.wav" className={cn("inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink", FOCUS)}>
            {T.common.downloadWav[locale]}
          </a>
          {canSave ? (
            <Button variant="secondary" disabled={status === "saving" || status === "saved"} onClick={() => void save()}>
              {status === "saved" ? T.common.saved[locale] : T.common.saveToGallery[locale]}
            </Button>
          ) : null}
        </>
      ) : null}
      {typeof status === "object" ? (
        <p role="alert" className="w-full type-body-sm font-black text-red-700 dark:text-red-300">
          {status.error}
        </p>
      ) : null}
    </div>
  );
}
