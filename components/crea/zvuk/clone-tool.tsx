"use client";

import { useAction, useMutation } from "convex/react";
import { Fingerprint, Mic, ShieldCheck, Square } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useMicRecorder, type MicRecording } from "@/components/crea/zvuk/use-mic-recorder";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fillCopy } from "@/lib/crea-copy";
import { pcmWav } from "@/lib/crea-talking";
import { analyzeVoice, downsample } from "@/lib/crea-voice-check";
import { CREA_VOICE_COPY as T } from "@/lib/crea-voice-copy";
import type { Locale } from "@/lib/i18n";

/** Najmanje govora u uzorku (s) i najduži snimci (s). */
const SAMPLE_MIN_SPEECH_S = 15;
const SAMPLE_MAX_S = 45;
const CONSENT_MAX_S = 20;
const CONSENT_RATE = 16000;

function Step({ n, title, done, children, locale }: { n: number; title: string; done: boolean; children: ReactNode; locale: Locale }) {
  return (
    <li className="grid gap-3 py-5 first:pt-0 sm:grid-cols-[3rem_minmax(0,1fr)]">
      <span
        aria-hidden="true"
        className={cn("grid size-11 place-items-center rounded-full border-2 border-ink font-display text-xl", done ? "bg-yellow text-ink" : "bg-paper text-ink")}
      >
        {n}
      </span>
      <div className="min-w-0 space-y-3">
        <h3 className="type-h4 text-ink">
          <span className="sr-only">{fillCopy(T.step[locale], { n })}: </span>
          {title}
        </h3>
        {children}
      </div>
    </li>
  );
}

function Meter({ level, locale }: { level: number; locale: Locale }) {
  return (
    <div role="meter" aria-label={T.level[locale]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} className="h-3 w-full max-w-sm overflow-hidden rounded-full border border-line bg-paper">
      <div className="h-full w-full origin-left bg-ink transition-transform duration-100 motion-reduce:transition-none" style={{ transform: `scaleX(${level})` }} />
    </div>
  );
}

function Recorder({
  locale,
  maxSeconds,
  disabled,
  onDone,
}: {
  locale: Locale;
  maxSeconds: number;
  disabled: boolean;
  onDone?: (recording: MicRecording) => void;
}) {
  const mic = useMicRecorder(maxSeconds, onDone);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {mic.phase === "recording" ? (
          <Button onClick={mic.stop} icon={<Square aria-hidden="true" className="size-4" />}>
            {T.stop[locale]}
          </Button>
        ) : (
          <Button onClick={() => void mic.start()} disabled={disabled || mic.phase === "decoding"} loading={mic.phase === "decoding"} icon={<Mic aria-hidden="true" className="size-4" />}>
            {mic.recording ? T.recordAgain[locale] : T.record[locale]}
          </Button>
        )}
        {mic.phase === "recording" ? (
          <span className="font-mono text-sm font-bold text-ink" aria-live="polite">
            {fillCopy(T.recording[locale], { s: Math.floor(mic.seconds) })}
          </span>
        ) : null}
      </div>
      {mic.phase === "recording" ? <Meter level={mic.level} locale={locale} /> : null}
      {mic.denied ? (
        <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
          {T.micDenied[locale]}
        </p>
      ) : null}
      {mic.recording && mic.phase === "idle" ? <audio controls src={mic.recording.url} className="h-11 w-full max-w-md" /> : null}
    </div>
  );
}

/**
 * Kloniraj svoj glas (Crea K22, A7; O5 - samo sopstveni glas): čekboks, vođeno
 * snimanje uzorka uz merač i proveru buke/tišine (VAD po jačini, na uređaju),
 * izgovoreni pristanak koji server proveri transkriptom, pa kapija za kloniranje.
 * Provajdera za kloniranje po planu K06 nema, pa kraj puta kaže „uskoro" - bez
 * naplate. Uzorak nikad ne napušta uređaj; snimak pristanka ide samo na proveru.
 */
export default function CloneTool({ tool, locale, canSave }: CreaToolProps) {
  const startConsent = useMutation(api.creaVoices.startVoiceConsent);
  const checkConsent = useAction(api.creaVoices.checkVoiceConsent);
  const requestClone = useMutation(api.creaVoices.requestVoiceClone);
  const [agreed, setAgreed] = useState(false);
  const [sample, setSample] = useState<MicRecording | null>(null);
  const [consent, setConsent] = useState<{ id: Id<"creaVoiceConsents">; phrase: string } | null>(null);
  const [check, setCheck] = useState<{ name: "idle" | "checking" } | { name: "done"; passed: boolean; transcript: string } | { name: "error"; message: string }>({ name: "idle" });
  const [cloneMessage, setCloneMessage] = useState<{ text: string; final: boolean } | null>(null);

  const verdict = useMemo(() => (sample ? analyzeVoice(sample.samples, sample.sampleRate, SAMPLE_MIN_SPEECH_S) : null), [sample]);
  const sampleOk = verdict?.verdict === "ok";
  const consentOk = check.name === "done" && check.passed;

  async function newPhrase() {
    setCheck({ name: "idle" });
    setCloneMessage(null);
    const reply = await startConsent({ locale }).catch(() => null);
    if (!reply || !reply.ok) {
      setCheck({ name: "error", message: T.consentLimit[locale] });
      return;
    }
    setConsent({ id: reply.consentId, phrase: reply.phrase });
  }

  async function verify(recording: MicRecording) {
    if (!consent) return;
    setCheck({ name: "checking" });
    const wav = pcmWav(downsample(recording.samples, recording.sampleRate, CONSENT_RATE), Math.min(CONSENT_RATE, recording.sampleRate));
    const reply = await checkConsent({ consentId: consent.id, audio: wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer, mimeType: "audio/wav" }).catch(() => null);
    if (!reply) return setCheck({ name: "error", message: T.consentErrors.GRESKA[locale] });
    if (!reply.ok) {
      if (reply.reason === "NEMA_RECENICE") setConsent(null);
      return setCheck({ name: "error", message: T.consentErrors[reply.reason][locale] });
    }
    setCheck({ name: "done", passed: reply.passed, transcript: reply.transcript });
    // Pala provera: rečenica je potrošena, sledeći pokušaj dobija novu.
    if (!reply.passed) setConsent(null);
  }

  async function clone() {
    if (!consent) return;
    const reply = await requestClone({ consentId: consent.id, consent: agreed }).catch(() => null);
    const reason = reply?.reason ?? "PRISTANAK_NIJE_PROVEREN";
    setCloneMessage({ text: T.cloneReasons[reason][locale], final: reason === "USKORO" });
  }

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Fingerprint aria-hidden="true" className="size-5" />} />

      <ol className="mt-5 divide-y divide-line border-t border-line pt-5">
        <Step n={1} title={T.cloneOnlyYours[locale]} done={agreed} locale={locale}>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 type-body font-black text-ink">
            <input type="checkbox" checked={agreed} disabled={!canSave} onChange={(event) => setAgreed(event.target.checked)} className="mt-1 size-5 shrink-0 accent-ink" />
            {T.cloneCheckbox[locale]}
          </label>
          <p className="type-body-sm font-semibold text-muted">{T.cloneWhy[locale]}</p>
          {!canSave ? <p className="type-body-sm font-semibold text-muted">{T.noAccess[locale]}</p> : null}
        </Step>

        <Step n={2} title={T.sampleStepTitle[locale]} done={sampleOk} locale={locale}>
          <p className="type-body-sm font-semibold text-muted">{T.sampleStepBody[locale]}</p>
          <blockquote className="surface-inset border border-line bg-paper p-3 type-body font-semibold text-ink">{T.sampleScript[locale]}</blockquote>
          <Recorder locale={locale} maxSeconds={SAMPLE_MAX_S} disabled={!agreed} onDone={setSample} />
          {verdict ? (
            <div aria-live="polite" className="space-y-1">
              <p className={cn("type-body-sm font-black", verdict.verdict === "ok" ? "text-ink" : "text-red-700 dark:text-red-300")}>
                {fillCopy(T.checkVerdicts[verdict.verdict][locale], { s: SAMPLE_MIN_SPEECH_S })}
              </p>
              <p className="font-mono text-xs font-bold text-muted">
                {fillCopy(T.checkStats[locale], { govor: verdict.speechS, buka: verdict.noiseDb, snr: verdict.snrDb })}
              </p>
              <p className="type-body-sm font-semibold text-muted">{T.sampleStays[locale]}</p>
            </div>
          ) : null}
        </Step>

        <Step n={3} title={T.consentStepTitle[locale]} done={consentOk} locale={locale}>
          <p className="type-body-sm font-semibold text-muted">{T.consentStepBody[locale]}</p>
          {consent ? (
            <>
              <p className="surface-inset border border-line bg-paper p-3 font-display text-2xl leading-snug text-ink">{consent.phrase}</p>
              <Recorder key={consent.id} locale={locale} maxSeconds={CONSENT_MAX_S} disabled={!sampleOk || check.name === "checking"} onDone={(recording) => void verify(recording)} />
            </>
          ) : (
            <Button variant="secondary" onClick={() => void newPhrase()} disabled={!sampleOk || !agreed} icon={<ShieldCheck aria-hidden="true" className="size-4" />}>
              {T.consentGet[locale]}
            </Button>
          )}
          <div aria-live="polite">
            {check.name === "checking" ? <p className="type-body-sm font-bold text-ink">{T.consentChecking[locale]}</p> : null}
            {check.name === "done" ? (
              <div className="space-y-1">
                <p className={cn("type-body-sm font-black", check.passed ? "text-ink" : "text-red-700 dark:text-red-300")}>
                  {(check.passed ? T.consentPassed : T.consentFailed)[locale]}
                </p>
                {check.transcript ? <p className="type-body-sm font-semibold text-muted">{fillCopy(T.consentHeard[locale], { tekst: check.transcript })}</p> : null}
              </div>
            ) : null}
            {check.name === "error" ? (
              <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
                {check.message}
              </p>
            ) : null}
          </div>
        </Step>

        <Step n={4} title={T.cloneStepTitle[locale]} done={cloneMessage?.final === true} locale={locale}>
          <Button onClick={() => void clone()} disabled={!agreed || !sampleOk || !consentOk} icon={<Fingerprint aria-hidden="true" className="size-4" />}>
            {T.cloneButton[locale]}
          </Button>
          {cloneMessage ? (
            <p role="status" className="type-body font-black text-ink">
              {cloneMessage.text}
            </p>
          ) : null}
        </Step>
      </ol>
    </section>
  );
}
