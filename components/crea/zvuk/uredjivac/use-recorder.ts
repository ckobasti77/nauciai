"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { pickRecorderMime, RECORDER_LIMITS } from "@/lib/crea-recorder";
import { meterLevel } from "@/lib/crea-voice-check";

export type RecorderTake = { id: number; blob: Blob; url: string; seconds: number };

/**
 * Snimač (Crea K24, A17): `MediaRecorder` u formatu koji pregledač ume (Opus/WebM,
 * AAC/MP4 na iPhone-u), merač jačine iz `AnalyserNode`-a (~10 puta u sekundi) i
 * više pokušaja (najnoviji prvi, najviše 5). Snimak ostaje u memoriji pregledača
 * dok ga korisnik ne sačuva ili preuzme.
 */
export function useRecorder(clean: boolean) {
  const [phase, setPhase] = useState<"idle" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [takes, setTakes] = useState<RecorderTake[]>([]);
  const [denied, setDenied] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const takesRef = useRef<RecorderTake[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    takesRef.current = takes;
  }, [takes]);

  useEffect(
    () => () => {
      stopRef.current?.();
      for (const take of takesRef.current) URL.revokeObjectURL(take.url);
    },
    [],
  );

  const stop = useCallback(() => stopRef.current?.(), []);

  const start = useCallback(async () => {
    setDenied(false);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: clean, noiseSuppression: clean, autoGainControl: clean } });
    } catch {
      setDenied(true);
      return;
    }
    const mime = pickRecorderMime((type) => MediaRecorder.isTypeSupported(type));
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    context.createMediaStreamSource(stream).connect(analyser);
    const block = new Float32Array(analyser.fftSize);
    const chunks: Blob[] = [];
    const startedAt = performance.now();
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(block);
      setLevel(meterLevel(block));
      const elapsed = (performance.now() - startedAt) / 1000;
      setSeconds(elapsed);
      if (elapsed >= RECORDER_LIMITS.maxSeconds) stopRef.current?.();
    }, 100);
    recorder.onstop = () => {
      window.clearInterval(timer);
      for (const track of stream.getTracks()) track.stop();
      void context.close();
      setLevel(0);
      setPhase("idle");
      const blob = new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" });
      if (blob.size === 0) return;
      const take: RecorderTake = { id: nextId.current++, blob, url: URL.createObjectURL(blob), seconds: (performance.now() - startedAt) / 1000 };
      setTakes((current) => {
        const next = [take, ...current];
        for (const old of next.slice(RECORDER_LIMITS.takes)) URL.revokeObjectURL(old.url);
        return next.slice(0, RECORDER_LIMITS.takes);
      });
    };
    stopRef.current = () => {
      stopRef.current = null;
      if (recorder.state !== "inactive") recorder.stop();
    };
    setSeconds(0);
    setPhase("recording");
    recorder.start(250);
  }, [clean]);

  const remove = useCallback((id: number) => {
    setTakes((current) => {
      const gone = current.find((take) => take.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return current.filter((take) => take.id !== id);
    });
  }, []);

  return { phase, seconds, level, takes, denied, start, stop, remove };
}
