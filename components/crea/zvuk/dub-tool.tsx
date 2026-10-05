"use client";

import { useAction } from "convex/react";
import { Combine, Download, Languages, Mic, ScanText } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useJobQueue } from "@/components/crea/create/use-job-queue";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { paidModel, PaidSubmit } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useSaveLocalResult } from "@/components/crea/use-save-local-result";
import { downloadText } from "@/components/crea/video/picked-media";
import { LicenseBadge } from "@/components/crea/zvuk/license-badge";
import { SoundInput, useSoundInput, type PickedSound } from "@/components/crea/zvuk/sound-input";
import { useSoundSeconds } from "@/components/crea/zvuk/use-sound-upload";
import { STEMS_MAX_S, useStemsJob } from "@/components/crea/zvuk/use-stems-job";
import { useTranscribe } from "@/components/crea/zvuk/use-transcribe";
import { VideoWithSound } from "@/components/crea/zvuk/video-with-sound";
import { FIELD, SampleButton, useJobStates, useMyVoices, useSamplePlayer, VoiceSelect } from "@/components/crea/zvuk/voice-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DUB_LANGUAGES, isDubLanguage, type DubLanguage } from "@/convex/creaLlmSoundCore";
import { creaSaveErrorMessage, fillCopy } from "@/lib/crea-copy";
import type { LineTake } from "@/lib/crea-dialogue";
import {
  applyTranslations,
  dubCost,
  dubFromWords,
  dubPlacements,
  dubReady,
  dubSrt,
  dubStatus,
  editSource,
  editTranslation,
  keepTranslation,
  sanitizeDubDoc,
  segmentsToSynth,
  segmentsToTranslate,
  setSpeakerVoice,
  type DubDoc,
  type DubStatus,
} from "@/lib/crea-dub";
import { licenseForJob } from "@/lib/crea-license-tags";
import { CREA_SOUND_COPY as T } from "@/lib/crea-sound-copy";
import { speakersOf } from "@/lib/crea-speech-segments";
import { demoSpeechWav, estimateSpeechSeconds } from "@/lib/crea-talking";
import { localModelSlug } from "@/lib/crea-tools";
import { voiceById } from "@/lib/crea-voices";
import { studioErrorMessage } from "@/lib/studio-messages";

/** Najduži snimak za prevod uz pregled (5 min ≈ 60-80 rečenica). */
const DUB_MAX_S = 5 * 60;
const MIX_RATE = 48000;

type Bed = "tiho" | "bez" | "muzika";
type Takes = Record<string, LineTake>;
type Assembled = { url: string; blob: Blob; demo: boolean; key: string; fileId: string };

function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function draftKey(jobId: string): string {
  return `crea:prevod:${jobId}`;
}

function loadDraft(jobId: string): { doc: DubDoc; takes: Takes } | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(draftKey(jobId)) ?? "null") as { doc?: unknown; takes?: unknown } | null;
    const doc = sanitizeDubDoc(raw?.doc, isDubLanguage);
    if (!doc) return null;
    const takes: Takes = {};
    if (raw?.takes && typeof raw.takes === "object") {
      for (const [id, value] of Object.entries(raw.takes as Record<string, unknown>)) {
        const take = value as Record<string, unknown> | null;
        if (doc.segments.some((segment) => segment.id === id) && typeof take?.jobId === "string" && typeof take.fingerprint === "string") takes[id] = { jobId: take.jobId, fingerprint: take.fingerprint };
      }
    }
    return { doc, takes };
  } catch {
    return null;
  }
}

const STATUS_STYLE: Record<DubStatus, string> = {
  prazno: "border-ink/25 text-muted",
  "za-prevod": "border-ink/40 text-ink",
  zastareo: "border-ink bg-yellow text-ink",
  nova: "border-ink/40 text-ink",
  izmenjena: "border-ink bg-yellow text-ink",
  gotova: "border-ink bg-ink text-paper-strong",
};

/**
 * Prevod uz pregled (Crea K23, A10): prepoznavanje govora → rečenice po govorniku
 * → prevod (0 kr) → korisnik ispravi original i prevod PRE izgovora → govor po
 * rečenici (plaća se samo nova ili izmenjena) → spajanje na uređaju na mesta
 * originala, uz originalni zvuk tiho ispod ili muziku iz traka → video sa novim
 * glasom, po želji usne (Kling), i titlovi (SRT) besplatno.
 */
export default function DubTool({ tool, locale, caps, canSave, projectId, paid, source }: CreaToolProps) {
  const input = useSoundInput(source);
  const { picked } = input;
  const seconds = useSoundSeconds(picked);
  const stt = useTranscribe({ picked, seconds, paid, projectId, locale });
  const { transcript } = stt;
  const tooLong = seconds !== null && seconds > DUB_MAX_S;

  const [to, setTo] = useState<DubLanguage>(locale === "sr" ? "en" : "sr");
  const [state, setState] = useState<{ forJob: string; doc: DubDoc; takes: Takes } | null>(null);
  const [pending, setPending] = useState<Takes>({});
  const [error, setError] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  // Transkript posla postaje dokument (jednom po poslu); nacrt sa uređaja ima prednost.
  if (stt.jobId && transcript?.state === "ready" && state?.forJob !== stt.jobId) {
    const draft = loadDraft(stt.jobId);
    const doc = draft?.doc ?? dubFromWords(transcript.words, { to, from: transcript.language, durationS: seconds ?? 0 });
    setState({ forJob: stt.jobId, doc, takes: draft?.takes ?? {} });
    setPending({});
  }
  const doc = state && state.forJob === stt.jobId ? state.doc : null;

  const setDoc = (patch: (current: DubDoc) => DubDoc) => setState((current) => (current ? { ...current, doc: patch(current.doc) } : current));

  const onQueueError = useCallback((message: string) => setError(studioErrorMessage(message, locale)), [locale]);
  const { enqueue, waiting } = useJobQueue(onQueueError);
  const trackedIds = useMemo(() => [...Object.values(pending), ...Object.values(state?.takes ?? {})].map((take) => take.jobId as Id<"generationJobs">), [pending, state]);
  const states = useJobStates(trackedIds);

  // Posao rečenice je gotov → postaje njen snimak; pao → greška, stari snimak ostaje.
  const resolved = useMemo(() => {
    const done: Takes = {};
    const live: Takes = {};
    const failed: Record<string, true> = {};
    for (const [segmentId, take] of Object.entries(pending)) {
      const status = states?.[take.jobId]?.status;
      if (status === "done") done[segmentId] = take;
      else if (status === "failed" || status === "refunded") failed[segmentId] = true;
      else live[segmentId] = take;
    }
    return { takes: { ...(state?.takes ?? {}), ...done }, live, failed };
  }, [pending, states, state]);
  const takes = resolved.takes;

  // Nacrt ide na uređaj posle svake promene (spoljni sistem - zato efekat).
  useEffect(() => {
    if (!state) return;
    try {
      window.localStorage.setItem(draftKey(state.forJob), JSON.stringify({ doc: state.doc, takes }));
    } catch {
      // Pun ili zabranjen localStorage: nacrt se samo ne čuva.
    }
  }, [state, takes]);

  const translate = useAction(api.creaLlm.translateSegments);
  async function runTranslate() {
    if (!doc) return;
    setTranslating(true);
    setError(null);
    try {
      const reply = await translate({ segments: segmentsToTranslate(doc, takes), to: doc.to, ...(doc.from ? { from: doc.from } : {}) });
      if (!reply.ok) setError(T.dub.translateErrors[reply.reason][locale]);
      else setDoc((current) => applyTranslations(current, reply.translations));
    } catch {
      setError(T.dub.translateErrors.GRESKA[locale]);
    } finally {
      setTranslating(false);
    }
  }

  const toSynth = doc ? segmentsToSynth(doc, takes) : [];
  const cost = doc && paid ? dubCost(doc, takes, paid.catalog) : null;
  const speaking = waiting > 0 || Object.keys(resolved.live).length > 0;
  const ttsChoice = paidModel(paid, "gemini-tts", "text");

  function speak() {
    if (!doc) return;
    setError(null);
    setState((current) => (current ? { ...current, takes } : current));
    setPending({});
    enqueue(
      toSynth.map((entry) => ({
        args: { modelSlug: entry.job.modelSlug, params: JSON.stringify(entry.job.params), inputMode: entry.job.inputMode, inputs: JSON.stringify({}), ...(projectId ? { projectId } : {}) },
        onCreated: (jobId: Id<"generationJobs">) => setPending((current) => ({ ...current, [entry.segment.id]: { jobId, fingerprint: entry.fingerprint } })),
      })),
    );
  }

  const toTranslate = doc ? segmentsToTranslate(doc, takes).length : 0;
  const speakers = doc ? speakersOf(doc.segments.map((segment) => ({ ...segment, text: segment.source }))) : [];
  const mine = useMyVoices(canSave);
  const player = useSamplePlayer(canSave);

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Languages aria-hidden="true" className="size-5" />} />
      <p className="mt-3 type-body-sm font-semibold text-muted">{T.dub.steps[locale]}</p>

      <div className="mt-5 space-y-3 border-t border-line pt-5">
        <h3 className="type-h4 text-ink">{T.dub.inputTitle[locale]}</h3>
        <SoundInput locale={locale} input={input} disabled={stt.status.name === "working" || stt.recognizing} />
        {tooLong ? <p className="type-body-sm font-black text-ink">{T.dub.tooLong[locale]}</p> : null}
      </div>

      {picked && !tooLong ? (
        <div className="mt-5 space-y-3 border-t border-line pt-5">
          <h3 className="type-h4 text-ink">{T.dub.recognizeTitle[locale]}</h3>
          <ChoiceChips<DubLanguage>
            legend={T.dub.toLegend[locale]}
            name="crea-prevod-jezik"
            options={DUB_LANGUAGES.map((id) => ({ id, label: T.dub.languages[id][locale] }))}
            value={doc?.to ?? to}
            onChange={(next) => {
              setTo(next);
              setDoc((current) => ({ ...current, to: next, segments: current.segments.map((segment) => ({ ...segment, translatedFrom: null })) }));
            }}
          />
          {!doc ? (
            <>
              <PaidSubmit
                locale={locale}
                label={T.dub.recognize[locale]}
                icon={<ScanText aria-hidden="true" className="size-4" />}
                credits={stt.price}
                blocker={!canSave ? T.common.noAccess[locale] : !stt.model ? T.common.modelMissing[locale] : stt.recognizing ? T.common.working[locale] : null}
                status={stt.status}
                demo={stt.model?.demo ?? false}
                onSubmit={() => void stt.start()}
              />
              {stt.recognizing ? (
                <p className="inline-flex items-center gap-2 type-body-sm font-bold text-muted">
                  <Spinner size="xs" /> {T.dub.recognizing[locale]}
                </p>
              ) : transcript?.state === "failed" ? (
                <p className="type-body-sm font-black text-red-700 dark:text-red-300">{T.common.failed[locale]}</p>
              ) : null}
            </>
          ) : transcript?.state === "ready" && transcript.demo ? (
            <p className="type-body-sm font-semibold text-muted">{T.dub.demoTranscript[locale]}</p>
          ) : null}
        </div>
      ) : null}

      {doc ? (
        <>
          {speakers.length > 0 ? (
            <fieldset className="mt-5 min-w-0 space-y-2 border-t border-line pt-5">
              <legend className="type-h4 text-ink">{T.dub.voicesTitle[locale]}</legend>
              <ul className="divide-y divide-line">
                {speakers.map((speaker) => {
                  const voice = voiceById("gemini", doc.voices[speaker.id] ?? "") ?? voiceById("gemini", "Sulafat")!;
                  return (
                    <li key={speaker.id} className="flex flex-wrap items-center gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block type-body-sm font-black text-ink">{fillCopy(T.common.speaker[locale], { n: speaker.number })}</span>
                        <span className="block truncate type-body-sm font-semibold text-muted">„{speaker.sample}”</span>
                      </span>
                      <VoiceSelect engine="gemini" value={voice.id} onChange={(voiceId) => setDoc((current) => setSpeakerVoice(current, speaker.id, voiceId))} favorites={mine?.favorites ?? null} locale={locale} className="max-w-xs" />
                      <SampleButton voice={voice} player={player} locale={locale} />
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ) : null}

          <div className="mt-5 space-y-3 border-t border-line pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="type-h4 text-ink">{T.dub.reviewTitle[locale]}</h3>
              <Button
                variant="secondary"
                icon={translating ? <Spinner size="xs" /> : <Languages aria-hidden="true" className="size-4" />}
                disabled={translating || toTranslate === 0 || !canSave}
                onClick={() => void runTranslate()}
              >
                {toTranslate === 0 ? T.dub.allTranslated[locale] : fillCopy(T.dub.translate[locale], { n: toTranslate })}
              </Button>
            </div>
            <p className="type-body-sm font-semibold text-muted">{T.dub.reviewHint[locale]}</p>
            <ol className="divide-y divide-line">
              {doc.segments.map((segment) => {
                const status: DubStatus = resolved.live[segment.id] ? "nova" : dubStatus(doc, segment, takes);
                const speaker = speakers.find((entry) => entry.id === segment.speaker);
                return (
                  <li key={segment.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-muted">
                        {clock(segment.start)}–{clock(segment.end)}
                      </span>
                      <span className="type-body-sm font-black text-ink">{speaker ? fillCopy(T.common.speaker[locale], { n: speaker.number }) : null}</span>
                      <span className={cn("rounded-full border-2 px-2 py-0.5 text-xs font-black", STATUS_STYLE[status])}>
                        {resolved.live[segment.id] ? T.dub.speaking[locale] : resolved.failed[segment.id] && status !== "gotova" ? T.common.failed[locale] : T.dub.statuses[status][locale]}
                      </span>
                      {status === "zastareo" ? (
                        <button type="button" onClick={() => setDoc((current) => keepTranslation(current, segment.id))} className="min-h-11 type-body-sm font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                          {T.dub.keep[locale]}
                        </button>
                      ) : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="block">
                        <span className="type-body-sm font-black text-ink">{T.dub.original[locale]}</span>
                        <textarea value={segment.source} rows={2} maxLength={500} onChange={(event) => setDoc((current) => editSource(current, segment.id, event.target.value))} className={cn(FIELD, "mt-1 resize-y")} />
                      </label>
                      <label className="block">
                        <span className="type-body-sm font-black text-ink">{fillCopy(T.dub.translation[locale], { jezik: T.dub.languages[doc.to][locale] })}</span>
                        <textarea
                          value={segment.translation}
                          rows={2}
                          maxLength={500}
                          onChange={(event) => setDoc((current) => editTranslation(current, segment.id, event.target.value))}
                          placeholder={T.dub.translationPlaceholder[locale]}
                          className={cn(FIELD, "mt-1 resize-y")}
                        />
                      </label>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={<Download aria-hidden="true" className="size-4" />} onClick={() => downloadText(dubSrt(doc, "prevod"), `crea-prevod-${doc.to}.srt`, "application/x-subrip")}>
                {T.dub.srtTranslation[locale]}
              </Button>
              <Button variant="secondary" icon={<Download aria-hidden="true" className="size-4" />} onClick={() => downloadText(dubSrt(doc, "original"), "crea-original.srt", "application/x-subrip")}>
                {T.dub.srtOriginal[locale]}
              </Button>
            </div>
          </div>

          <div className="mt-5 space-y-2 border-t border-line pt-5">
            <PaidSubmit
              locale={locale}
              label={fillCopy(T.dub.speak[locale], { n: toSynth.length })}
              icon={<Mic aria-hidden="true" className="size-4" />}
              credits={cost?.credits ?? null}
              blocker={
                !canSave
                  ? T.common.noAccess[locale]
                  : !ttsChoice
                    ? T.common.modelMissing[locale]
                    : speaking
                      ? T.common.working[locale]
                      : toSynth.length === 0
                        ? dubReady(doc, takes)
                          ? T.dub.allSpoken[locale]
                          : T.dub.translateFirst[locale]
                        : null
              }
              status={error ? { name: "error", message: error } : { name: "idle" }}
              demo={ttsChoice?.demo ?? false}
              onSubmit={speak}
            />
            <p className="type-body-sm font-semibold text-muted">{T.dub.payOnlyChanged[locale]}</p>
          </div>

          {dubReady(doc, takes) && picked ? (
            <Assemble locale={locale} caps={caps} tool={tool} canSave={canSave} projectId={projectId} paid={paid} picked={picked} seconds={seconds} doc={doc} takes={takes} states={states} />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/** Spajanje (0 kr), pozadina, video sa novim glasom i usne. */
function Assemble({
  locale,
  caps,
  tool,
  canSave,
  projectId,
  paid,
  picked,
  seconds,
  doc,
  takes,
  states,
}: Pick<CreaToolProps, "locale" | "caps" | "tool" | "canSave" | "projectId" | "paid"> & {
  picked: PickedSound;
  seconds: number | null;
  doc: DubDoc;
  takes: Takes;
  states: ReturnType<typeof useJobStates>;
}) {
  const [bed, setBed] = useState<Bed>("tiho");
  const [assembled, setAssembled] = useState<Assembled | null>(null);
  const [status, setStatus] = useState<"idle" | "working" | "saving" | "saved" | { error: string }>("idle");
  const stems = useStemsJob({ picked, seconds, paid, projectId, locale });
  const saveLocalResult = useSaveLocalResult();
  const key = JSON.stringify([bed, takes, doc.segments.map((segment) => segment.start)]);
  const fresh = assembled && assembled.key === key ? assembled : null;
  const stemsReady = stems.stems && stems.stems.status === "done" && !stems.stems.isMock && stems.stems.tracks.length > 1;

  async function assemble() {
    setStatus("working");
    try {
      const { decodeSound, mixLayers, bufferToWav } = await import("@/components/crea/zvuk/audio-render");
      let demo = false;
      const voices = new Map<string, AudioBuffer>();
      for (const segment of doc.segments) {
        const take = takes[segment.id];
        if (!take) continue;
        const state = states?.[take.jobId];
        let buffer: AudioBuffer | null;
        if (!state || state.isMock || !state.outputUrl) {
          demo = true;
          const wav = demoSpeechWav(estimateSpeechSeconds(segment.translation));
          buffer = await decodeSound(new Blob([wav as BlobPart], { type: "audio/wav" }), MIX_RATE, 1);
        } else buffer = await decodeSound(state.outputUrl, MIX_RATE, 1);
        if (buffer) voices.set(segment.id, buffer);
      }
      const durations = Object.fromEntries([...voices.entries()].map(([id, buffer]) => [id, buffer.duration]));
      const layers: Parameters<typeof mixLayers>[0][number][] = dubPlacements(doc, takes, durations).map((placement) => ({
        buffer: voices.get(placement.segmentId)!,
        at: placement.at,
        rate: placement.rate,
        voice: true,
        fade: 0.02,
      }));
      if (bed === "tiho") {
        const original = await decodeSound(picked.source, MIX_RATE, 2);
        if (original) layers.push({ buffer: original, at: 0, gainDb: -6, bed: true, fade: 0.3 });
      } else if (bed === "muzika" && stemsReady) {
        for (const track of stems.stems!.tracks.filter((entry) => entry.key !== "vocals")) {
          const buffer = await decodeSound(track.url, MIX_RATE, 2);
          if (buffer) layers.push({ buffer, at: 0, bed: true, fade: 0.3 });
        }
      }
      const out = await mixLayers(layers, { durationS: Math.max(doc.durationS, seconds ?? 0), sampleRate: MIX_RATE, channels: 2, duckDb: bed === "tiho" ? -14 : -8 });
      const blob = bufferToWav(out);
      setAssembled((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { url: URL.createObjectURL(blob), blob, demo, key, fileId: `prevod-${Date.now().toString(36)}` };
      });
      setStatus("idle");
    } catch {
      setStatus({ error: T.dub.assembleFailed[locale] });
    }
  }

  async function save() {
    if (!fresh) return;
    setStatus("saving");
    try {
      const result = await saveLocalResult({ toolId: tool.id, kind: "audio", blob: fresh.blob, params: { jezik: doc.to, recenice: doc.segments.length }, projectId, parentJobId: picked.sourceJobId ?? null });
      setStatus(result.ok ? "saved" : { error: creaSaveErrorMessage(result.reason, locale) });
    } catch (caught) {
      setStatus({ error: creaSaveErrorMessage(caught instanceof Error ? caught.message : String(caught), locale) });
    }
  }

  return (
    <div className="mt-5 space-y-4 border-t border-line pt-5">
      <h3 className="type-h4 text-ink">{T.dub.assembleTitle[locale]}</h3>
      <ChoiceChips<Bed>
        legend={T.dub.bedLegend[locale]}
        name="crea-prevod-pozadina"
        options={(["tiho", "bez", "muzika"] as const).map((id) => ({ id, label: T.dub.beds[id][locale], hint: T.dub.bedHints[id][locale] }))}
        value={bed}
        onChange={setBed}
      />
      {bed === "muzika" && !stemsReady ? (
        <div className="space-y-2">
          <PaidSubmit
            locale={locale}
            label={T.dub.splitMusic[locale]}
            icon={<Combine aria-hidden="true" className="size-4" />}
            credits={stems.price}
            blocker={!canSave ? T.common.noAccess[locale] : !stems.model ? T.common.modelMissing[locale] : seconds !== null && seconds > STEMS_MAX_S ? T.stems.tooLong[locale] : stems.splitting ? T.common.working[locale] : null}
            status={stems.status}
            demo={stems.model?.demo ?? false}
            onSubmit={() => void stems.start()}
          />
          {stems.stems?.isMock ? <p className="type-body-sm font-semibold text-muted">{T.stems.demo[locale]}</p> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<Combine aria-hidden="true" className="size-4" />} disabled={status === "working" || (bed === "muzika" && !stemsReady)} onClick={() => void assemble()} className="shadow-[4px_4px_0_0_var(--ink)]">
          {status === "working" ? T.common.working[locale] : T.dub.assemble[locale]}
        </Button>
        <LicenseBadge tag={licenseForJob({ modelSlug: localModelSlug(tool.id) })} locale={locale} />
      </div>
      {typeof status === "object" ? (
        <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
          {status.error}
        </p>
      ) : null}
      {fresh ? (
        <div className="space-y-3">
          {fresh.demo ? <p className="type-body-sm font-semibold text-muted">{T.dub.demoMix[locale]}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <audio src={fresh.url} controls preload="none" className="h-11 w-full max-w-md" />
            <a href={fresh.url} download={`crea-prevod-${doc.to}.wav`} className="inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              {T.common.downloadWav[locale]}
            </a>
            {canSave && picked.kind === "audio" ? (
              <Button variant="secondary" disabled={status === "saving" || status === "saved"} onClick={() => void save()}>
                {status === "saved" ? T.common.saved[locale] : T.common.saveToGallery[locale]}
              </Button>
            ) : null}
          </div>
          {picked.kind === "video" ? <VideoWithSound locale={locale} caps={caps} tool={tool} canSave={canSave} projectId={projectId} paid={paid} picked={picked} audio={fresh} withLips /> : null}
        </div>
      ) : null}
    </div>
  );
}
