"use client";

import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "@/components/ui/primitives";
import { CREA_CREATE_COPY as T } from "@/lib/crea-create-copy";
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

/**
 * Mikrofon za opis (K13, S6): Web Speech API sa `sr-RS` (ili `en-US`). Gde
 * pregledač to nema (Firefox, deo Safarija), dugme se ne prikazuje. Prepoznat
 * tekst se dopisuje na kraj opisa; ništa ne ide na naš server.
 */
export function MicButton({ locale, onText, disabled }: { locale: Locale; onText: (text: string) => void; disabled?: boolean }) {
  const supported = useSyncExternalStore(subscribe, () => recognitionCtor() !== null, () => false);
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
          "inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 motion-reduce:transition-none",
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
