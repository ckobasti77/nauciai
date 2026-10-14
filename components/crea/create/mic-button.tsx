"use client";

import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "@/components/ui/primitives";
import { CREA_CREATE_COPY as T } from "@/lib/crea-create-copy";
import { appendSpoken } from "@/lib/crea-dictation";
import type { Locale } from "@/lib/i18n";

/** Minimalan oblik Web Speech API-ja (TS ga nema u `lib.dom`). */
type RecognitionResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const subscribe = () => () => undefined;

/** Da li pregledač ima Web Speech API (Chrome, Edge, deo Safarija); bez njega mikrofona nema. */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(subscribe, () => recognitionCtor() !== null, () => false);
}

/**
 * Mikrofon za opis (K13, S6; K25 U8 - u svakom polju za opis): Web Speech API sa
 * `sr-RS` (ili `en-US`). Gde pregledač to nema (Firefox, deo Safarija), dugme se ne
 * prikazuje. Prepoznat tekst pozivalac dopisuje kroz `appendSpoken` (latinica, razmak,
 * veliko slovo); ništa ne ide na naš server.
 */
export function MicButton({ locale, onText, disabled }: { locale: Locale; onText: (text: string) => void; disabled?: boolean }) {
  const supported = useSpeechSupported();
  const [state, setState] = useState<"idle" | "listening" | "denied" | "failed">("idle");
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => () => recognition.current?.abort(), []);

  if (!supported) return null;

  function toggle() {
    if (state === "listening") {
      recognition.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = locale === "sr" ? "sr-RS" : "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (event) => {
      const text = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) onText(text);
    };
    rec.onerror = (event) => setState(event.error === "not-allowed" || event.error === "service-not-allowed" ? "denied" : "failed");
    rec.onend = () => setState((current) => (current === "listening" ? "idle" : current));
    recognition.current = rec;
    setState("listening");
    try {
      rec.start();
    } catch {
      setState("failed");
    }
  }

  const listening = state === "listening";
  const note = listening ? T.micListening[locale] : state === "denied" ? T.micDenied[locale] : state === "failed" ? T.micFailed[locale] : null;
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? T.micStop[locale] : T.micStart[locale]}
        title={listening ? T.micStop[locale] : T.micStart[locale]}
        className={cn(
          "igra-press igra-shadow igra-depth-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40",
          listening ? "bg-ink text-paper-strong motion-safe:animate-pulse" : "bg-paper-strong text-ink",
        )}
      >
        {listening ? <MicOff aria-hidden="true" className="size-4" /> : <Mic aria-hidden="true" className="size-4" />}
      </button>
      {note ? (
        <span role="status" className="text-xs font-bold text-muted">
          {note}
        </span>
      ) : null}
    </>
  );
}

/**
 * Mikrofon ispod polja za opis u alatima (K25, U8): red sa dugmetom samo kad pregledač ume
 * da sluša, pa bez Web Speech API-ja ne ostaje prazan prostor. Ide POSLE `<label>` (dugme ne
 * sme u labelu koja već nosi polje).
 */
export function FieldMic({
  locale,
  value,
  onChange,
  disabled,
  maxLength,
}: {
  locale: Locale;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  maxLength?: number;
}) {
  const supported = useSpeechSupported();
  if (!supported) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <MicButton locale={locale} disabled={disabled} onText={(spoken) => onChange(appendSpoken(value, spoken, maxLength))} />
    </div>
  );
}
