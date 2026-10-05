"use client";

import { Combine, Download, Plus, RotateCcw, Save, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useJobQueue } from "@/components/crea/create/use-job-queue";
import { paidModel, PaidSubmit } from "@/components/crea/tools/paid-video";
import type { CreaPaidContext } from "@/components/crea/tools/types";
import { useSaveLocalResult } from "@/components/crea/use-save-local-result";
import { FIELD, SampleButton, useJobStates, useMyVoices, useSamplePlayer, VoiceSelect, type JobState } from "@/components/crea/zvuk/voice-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import type { Id } from "@/convex/_generated/dataModel";
import { creaSaveErrorMessage, fillCopy } from "@/lib/crea-copy";
import {
  concatSpeech,
  DIALOGUE_LIMITS,
  dialogueCost,
  linesToMake,
  lineStatus,
  mergeOrder,
  newSpeaker,
  nextId,
  parseScript,
  sanitizeDialogueDoc,
  sanitizeTakes,
  type DialogueDoc,
  type LineTake,
} from "@/lib/crea-dialogue";
import { demoSpeechWav, estimateSpeechSeconds, pcmWav } from "@/lib/crea-talking";
import { CREA_VOICE_COPY as T } from "@/lib/crea-voice-copy";
import { VOICE_MOOD_LABELS, VOICE_MOODS, type VoiceMood } from "@/lib/crea-voice-tags";
import { DEFAULT_VOICE, VOICE_ENGINE_LIST, voiceById, type VoiceEngineId } from "@/lib/crea-voices";
import { pluralize, type Locale } from "@/lib/i18n";
import { studioErrorMessage } from "@/lib/studio-messages";

/** Frekvencija spojenog snimka (Gemini TTS daje 24 kHz). */
const MERGE_RATE = 24000;

type Pending = Record<string, LineTake>;
type Merged = { url: string; blob: Blob; demo: boolean; key: string };

function loadDraft(key: string): { doc: DialogueDoc; takes: Record<string, LineTake> } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = JSON.parse(window.localStorage.getItem(key) ?? "null") as { doc?: unknown; takes?: unknown } | null;
    const doc = sanitizeDialogueDoc(raw?.doc);
    return doc ? { doc, takes: sanitizeTakes(raw?.takes, doc) } : null;
  } catch {
    return null;
  }
}

/** Dekodira jedan snimak u mono uzorke na `MERGE_RATE`. */
async function decodeMono(bytes: ArrayBuffer): Promise<Float32Array> {
  const context = new OfflineAudioContext(1, 1, MERGE_RATE);
  const buffer = await context.decodeAudioData(bytes);
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index++) mono[index] = mono[index]! + data[index]! / buffer.numberOfChannels;
  }
  return mono;
}

/**
 * Dijalog po replikama (Crea K22, A5; i podkast, A6): do 10 govornika, svaka
 * replika je svoj posao govora. „Napravi" pravi SAMO nove i izmenjene replike
 * (`linesToMake`), a gotove ostaju; spajanje i čuvanje su na uređaju (0 kr).
 * Nacrt (scenario + gotovi snimci) se čuva u `localStorage`-u.
 */
export function DialogueEditor({
  locale,
  canSave,
  projectId,
  paid,
  toolId,
  storageKey,
  initial,
  preferDraft,
}: {
  locale: Locale;
  canSave: boolean;
  projectId: Id<"studioProjects"> | null;
  paid: CreaPaidContext | null;
  toolId: string;
  storageKey: string;
  /** Početni scenario (prazan dijalog ili razgovor iz podkasta). */
  initial: DialogueDoc;
  /** `true`: nacrt sa uređaja ima prednost nad `initial` (povratak na alat). */
  preferDraft: boolean;
}) {
  const mine = useMyVoices(canSave);
  const player = useSamplePlayer(canSave);
  // Nacrt sa uređaja ima prednost kad se alat ponovo otvori (nov razgovor iz podkasta ga zamenjuje).
  const [draft] = useState(() => (preferDraft ? loadDraft(storageKey) : null));
  const [doc, setDoc] = useState<DialogueDoc>(draft?.doc ?? initial);
  const [takes, setTakes] = useState<Record<string, LineTake>>(draft?.takes ?? {});
  const [pending, setPending] = useState<Pending>({});
  const [error, setError] = useState<string | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [merged, setMerged] = useState<Merged | null>(null);
  const [merging, setMerging] = useState(false);
  const [saveState, setSaveState] = useState<{ name: "idle" | "saving" | "saved" } | { name: "error"; message: string }>({ name: "idle" });


  const onQueueError = useCallback((message: string) => setError(studioErrorMessage(message, locale)), [locale]);
  const { enqueue, waiting } = useJobQueue(onQueueError);

  const trackedIds = useMemo(
    () => [...Object.values(pending), ...Object.values(takes)].map((take) => take.jobId as Id<"generationJobs">),
    [pending, takes],
  );
  const states = useJobStates(trackedIds);

  // Posao replike je gotov → postaje njen snimak; pao → greška, stari snimak ostaje.
  const resolved = useMemo(() => {
    const done: Record<string, LineTake> = {};
    const live: Pending = {};
    const failed: Record<string, true> = {};
    for (const [lineId, take] of Object.entries(pending)) {
      const status = states?.[take.jobId]?.status;
      if (status === "done") done[lineId] = take;
      else if (status === "failed" || status === "refunded") failed[lineId] = true;
      else live[lineId] = take;
    }
    return { takes: { ...takes, ...done }, live, failed };
  }, [pending, states, takes]);
  const doneTakes = resolved.takes;

  // Nacrt ide na uređaj posle svake promene (spoljni sistem - zato efekat).
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ doc, takes: doneTakes }));
    } catch {
      // Pun ili zabranjen localStorage: nacrt se samo ne čuva.
    }
  }, [doc, doneTakes, storageKey]);

  const todo = linesToMake(doc, doneTakes);
  const cost = paid ? dialogueCost(doc, doneTakes, paid.catalog) : null;
  const making = waiting > 0 || Object.keys(resolved.live).length > 0;
  const order = mergeOrder(doc, doneTakes);
  const filledLines = doc.lines.filter((line) => line.text.trim().length > 0);
  const canMerge = !making && filledLines.length > 0 && order.length === filledLines.length;
  const mergeKey = JSON.stringify(order);

  const engineReady = (engine: VoiceEngineId) => paidModel(paid, VOICE_ENGINE_LIST.find((entry) => entry.id === engine)!.modelSlug, "text") !== null;

  const blocker = !canSave
    ? T.noAccess[locale]
    : making
      ? T.working[locale]
      : todo.length === 0
        ? T.allDone[locale]
        : todo.some((entry) => paidModel(paid, entry.job.modelSlug, "text") === null)
          ? T.modelMissing[locale]
          : null;

  function make() {
    setError(null);
    setMerged(null);
    // Gotovi poslovi postaju snimci, pali se zaboravljaju, pa kreće nov krug.
    setTakes(doneTakes);
    setPending({});
    const items = todo.map((entry) => ({
      args: { modelSlug: entry.job.modelSlug, params: JSON.stringify(entry.job.params), inputMode: entry.job.inputMode, inputs: JSON.stringify({}), ...(projectId ? { projectId } : {}) },
      onCreated: (jobId: Id<"generationJobs">) => setPending((current) => ({ ...current, [entry.line.id]: { jobId, fingerprint: entry.fingerprint } })),
    }));
    enqueue(items);
  }

  const update = (patch: (current: DialogueDoc) => DialogueDoc) => {
    setDoc(patch);
    setMerged(null);
  };
  const setSpeaker = (id: string, patch: Partial<DialogueDoc["speakers"][number]>) =>
    update((current) => ({ ...current, speakers: current.speakers.map((speaker) => (speaker.id === id ? { ...speaker, ...patch } : speaker)) }));
  const setLine = (id: string, patch: Partial<DialogueDoc["lines"][number]>) =>
    update((current) => ({ ...current, lines: current.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)) }));

  async function merge() {
    setMerging(true);
    setSaveState({ name: "idle" });
    try {
      const parts: Float32Array[] = [];
      let demo = false;
      for (const entry of order) {
        const state: JobState | undefined = states?.[entry.jobId];
        const line = doc.lines.find((candidate) => candidate.id === entry.lineId)!;
        if (!state || state.isMock || !state.outputUrl) {
          // DEMO replika (bez ključa): probni zvuk procenjene dužine, jasno označen.
          demo = true;
          const wav = demoSpeechWav(estimateSpeechSeconds(line.text));
          parts.push(await decodeMono(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer));
          continue;
        }
        const response = await fetch(state.outputUrl);
        if (!response.ok) throw new Error("PREUZIMANJE");
        parts.push(await decodeMono(await response.arrayBuffer()));
      }
      const wav = pcmWav(concatSpeech(parts, MERGE_RATE), MERGE_RATE);
      const blob = new Blob([wav as BlobPart], { type: "audio/wav" });
      setMerged((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { url: URL.createObjectURL(blob), blob, demo, key: mergeKey };
      });
    } catch {
      setError(T.mergeFailed[locale]);
    } finally {
      setMerging(false);
    }
  }

  const saveLocalResult = useSaveLocalResult();
  async function save() {
    if (!merged) return;
    setSaveState({ name: "saving" });
    try {
      const result = await saveLocalResult({
        toolId,
        kind: "audio",
        blob: merged.blob,
        params: { replike: order.length, govornici: doc.speakers.length },
        projectId,
      });
      setSaveState(result.ok ? { name: "saved" } : { name: "error", message: creaSaveErrorMessage(result.reason, locale) });
    } catch (caught) {
      setSaveState({ name: "error", message: creaSaveErrorMessage(caught instanceof Error ? caught.message : String(caught), locale) });
    }
  }

  const statusOf = (lineId: string) => {
    if (resolved.live[lineId]) return "pravi" as const;
    const line = doc.lines.find((candidate) => candidate.id === lineId)!;
    const status = lineStatus(doc, line, doneTakes);
    if (resolved.failed[lineId] && status !== "gotova") return "greska" as const;
    if (status === "gotova" && states?.[doneTakes[lineId]!.jobId]?.isMock) return "demo" as const;
    return status;
  };

  return (
    <div className="space-y-6">
      <fieldset className="min-w-0 space-y-3">
        <legend className="type-body font-black text-ink">{T.speakersLegend[locale]}</legend>
        <ul className="divide-y divide-line">
          {doc.speakers.map((speaker) => {
            const voice = voiceById(speaker.engine, speaker.voiceId);
            const inUse = doc.lines.some((line) => line.speakerId === speaker.id);
            return (
              <li key={speaker.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,8rem)_minmax(0,1fr)_auto] sm:items-end">
                <label className="block min-w-0">
                  <span className="type-body-sm font-black text-ink">{T.speakerName[locale]}</span>
                  <input value={speaker.name} maxLength={DIALOGUE_LIMITS.nameChars} onChange={(event) => setSpeaker(speaker.id, { name: event.target.value })} className={cn(FIELD, "mt-1 min-h-11")} />
                </label>
                <label className="block min-w-0">
                  <span className="type-body-sm font-black text-ink">{T.engineLegend[locale]}</span>
                  <select
                    value={speaker.engine}
                    onChange={(event) => {
                      const engine = event.target.value as VoiceEngineId;
                      setSpeaker(speaker.id, { engine, voiceId: DEFAULT_VOICE[engine] });
                    }}
                    className={cn(FIELD, "mt-1 min-h-11")}
                  >
                    {VOICE_ENGINE_LIST.map((engine) => (
                      <option key={engine.id} value={engine.id} disabled={!engineReady(engine.id)}>
                        {engine.label[locale]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,8rem)]">
                  <label className="block min-w-0">
                    <span className="type-body-sm font-black text-ink">{T.voiceLegend[locale]}</span>
                    <VoiceSelect engine={speaker.engine} value={speaker.voiceId} onChange={(voiceId) => setSpeaker(speaker.id, { voiceId })} favorites={mine?.favorites ?? null} locale={locale} className="mt-1" />
                  </label>
                  <label className="block min-w-0">
                    <span className="type-body-sm font-black text-ink">{T.moodLegend[locale]}</span>
                    <select value={speaker.mood} onChange={(event) => setSpeaker(speaker.id, { mood: Number(event.target.value) as VoiceMood })} className={cn(FIELD, "mt-1 min-h-11")}>
                      {VOICE_MOODS.map((mood) => (
                        <option key={mood} value={mood}>
                          {VOICE_MOOD_LABELS[mood][locale]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  {voice ? <SampleButton voice={voice} player={player} locale={locale} /> : null}
                  <button
                    type="button"
                    disabled={inUse || doc.speakers.length <= 1}
                    title={inUse ? T.speakerInUse[locale] : undefined}
                    aria-label={fillCopy(T.removeSpeaker[locale], { ime: speaker.name })}
                    onClick={() => update((current) => ({ ...current, speakers: current.speakers.filter((entry) => entry.id !== speaker.id) }))}
                    className="grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {doc.speakers.length < DIALOGUE_LIMITS.speakers ? (
          <Button
            variant="secondary"
            icon={<UserPlus aria-hidden="true" className="size-4" />}
            onClick={() => update((current) => ({ ...current, speakers: [...current.speakers, { ...newSpeaker(current.speakers.length, current.speakers[0]?.engine ?? "gemini"), id: nextId("g", current.speakers) }] }))}
          >
            {T.addSpeaker[locale]}
          </Button>
        ) : null}
      </fieldset>

      <fieldset className="min-w-0 space-y-3 border-t border-line pt-5">
        <legend className="sr-only">{T.linesLegend[locale]}</legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="type-body font-black text-ink">{T.linesLegend[locale]}</h3>
          <button
            type="button"
            onClick={() => setScript(script === null ? "" : null)}
            aria-expanded={script !== null}
            className="min-h-11 type-body-sm font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {T.pasteScript[locale]}
          </button>
        </div>
        {script !== null ? (
          <div className="surface-inset space-y-2 border border-line bg-paper p-3">
            <p className="type-body-sm font-semibold text-muted">{T.pasteHint[locale]}</p>
            <textarea value={script} rows={5} onChange={(event) => setScript(event.target.value)} className={cn(FIELD, "resize-y")} aria-label={T.pasteScript[locale]} />
            <Button
              variant="secondary"
              disabled={script.trim().length === 0}
              onClick={() => {
                update((current) => parseScript(script, current));
                setScript(null);
              }}
            >
              {T.pasteApply[locale]}
            </Button>
          </div>
        ) : null}
        <ol className="divide-y divide-line">
          {doc.lines.map((line, index) => {
            const status = statusOf(line.id);
            const take = doneTakes[line.id];
            const state = take ? states?.[take.jobId] : undefined;
            return (
              <li key={line.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
                <div className="flex items-center gap-2 sm:flex-col sm:items-start">
                  <label className="block min-w-0 flex-1 sm:w-full">
                    <span className="sr-only">{T.lineSpeaker[locale]}</span>
                    <select value={line.speakerId} onChange={(event) => setLine(line.id, { speakerId: event.target.value })} className={cn(FIELD, "min-h-11")}>
                      {doc.speakers.map((speaker) => (
                        <option key={speaker.id} value={speaker.id}>
                          {speaker.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-black",
                      status === "gotova" ? "bg-ink text-paper-strong" : status === "greska" ? "border border-current text-red-700 dark:text-red-300" : "border border-ink/30 text-ink",
                    )}
                  >
                    {status === "pravi" ? <Spinner size="xs" className="mr-1 inline-block" /> : null}
                    {T.lineStatus[status][locale]}
                  </span>
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex items-start gap-2">
                    <textarea
                      value={line.text}
                      rows={2}
                      maxLength={DIALOGUE_LIMITS.lineChars}
                      aria-label={fillCopy(T.lineLabel[locale], { n: index + 1 })}
                      onChange={(event) => setLine(line.id, { text: event.target.value })}
                      className={cn(FIELD, "resize-y")}
                    />
                    <button
                      type="button"
                      aria-label={fillCopy(T.removeLine[locale], { n: index + 1 })}
                      onClick={() => update((current) => ({ ...current, lines: current.lines.filter((entry) => entry.id !== line.id) }))}
                      className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                  {status === "gotova" && state?.outputUrl && !state.isMock ? <audio controls preload="none" src={state.outputUrl} className="h-11 w-full max-w-md" /> : null}
                </div>
              </li>
            );
          })}
        </ol>
        {doc.lines.length < DIALOGUE_LIMITS.lines ? (
          <Button
            variant="secondary"
            icon={<Plus aria-hidden="true" className="size-4" />}
            onClick={() =>
              update((current) => {
                const last = current.lines.at(-1);
                const nextSpeaker = current.speakers[(current.speakers.findIndex((speaker) => speaker.id === last?.speakerId) + 1) % current.speakers.length]!;
                return { ...current, lines: [...current.lines, { id: nextId("r", current.lines), speakerId: nextSpeaker.id, text: "" }] };
              })
            }
          >
            {T.addLine[locale]}
          </Button>
        ) : null}
      </fieldset>

      <div className="space-y-3 border-t border-line pt-5">
        <PaidSubmit
          locale={locale}
          label={fillCopy(pluralize(locale, todo.length, T.makeLines[locale]), { n: todo.length })}
          icon={<Plus aria-hidden="true" className="size-4" />}
          credits={cost?.credits ?? null}
          blocker={blocker}
          status={error ? { name: "error", message: error } : { name: "idle" }}
          demo={todo.some((entry) => paidModel(paid, entry.job.modelSlug, "text")?.demo === true)}
          onSubmit={make}
        >
          <p className="type-body-sm font-semibold text-muted">{T.onlyChanged[locale]}</p>
        </PaidSubmit>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void merge()} disabled={!canMerge || merging} loading={merging} icon={<Combine aria-hidden="true" className="size-4" />}>
            {merging ? T.merging[locale] : T.merge[locale]}
          </Button>
          <Button
            variant="secondary"
            icon={<RotateCcw aria-hidden="true" className="size-4" />}
            disabled={making}
            onClick={() => {
              setDoc(initial);
              setTakes({});
              setPending({});
              setMerged(null);
            }}
          >
            {T.newDialogue[locale]}
          </Button>
        </div>
        <p className="type-body-sm font-semibold text-muted">{T.draftNote[locale]}</p>
      </div>

      {merged && merged.key === mergeKey ? (
        <div className="space-y-3 border-t border-line pt-5" aria-live="polite">
          <h3 className="type-h4 text-ink">{T.mergedTitle[locale]}</h3>
          <audio controls src={merged.url} className="h-11 w-full max-w-lg" />
          {merged.demo ? <p className="type-body-sm font-semibold text-muted">{T.mergedDemo[locale]}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void save()} disabled={!canSave || saveState.name === "saving" || saveState.name === "saved"} loading={saveState.name === "saving"} icon={<Save aria-hidden="true" className="size-4" />}>
              {T.saveMerged[locale]}
            </Button>
            <a
              href={merged.url}
              download={`crea-${toolId.replace("zvuk.", "")}.wav`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <Download aria-hidden="true" className="size-4" />
              {T.download[locale]}
            </a>
          </div>
          {saveState.name === "saved" ? <p className="type-body-sm font-black text-ink">{T.savedMerged[locale]}</p> : null}
          {saveState.name === "error" ? (
            <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
              {saveState.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
