"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { meterLevel } from "@/lib/crea-voice-check";

export type MicRecording = { samples: Float32Array; sampleRate: number; url: string };

/**
 * Snimanje mikrofona za proveru glasa (Crea K22, A7): `MediaRecorder` za snimak,
 * `AnalyserNode` za merač jačine (osvežava se ~10 puta u sekundi), pa dekodiranje
 * u mono uzorke. Bez čišćenja šuma i automatskog pojačanja - provera buke treba
 * da čuje sobu kakva jeste. Snimak ostaje u memoriji browsera.
 */
export function useMicRecorder(maxSeconds: number, onRecorded?: (recording: MicRecording) => void) {
  const [phase, setPhase] = useState<"idle" | "recording" | "decoding">("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [recording, setRecording] = useState<MicRecording | null>(null);
  const [denied, setDenied] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const onRecordedRef = useRef(onRecorded);
  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  useEffect(
    () => () => {
      stopRef.current?.();
    },
    [],
  );

  useEffect(
    () => () => {
      if (recording) URL.revokeObjectURL(recording.url);
    },
    [recording],
  );

  const stop = useCallback(() => stopRef.current?.(), []);

  const start = useCallback(async () => {
    setDenied(false);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      setDenied(true);
      return;
    }
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    context.createMediaStreamSource(stream).connect(analyser);
    const block = new Float32Array(analyser.fftSize);
    const recorder = new MediaRecorder(stream);
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
      if (elapsed >= maxSeconds) stopRef.current?.();
    }, 100);
    recorder.onstop = () => {
      window.clearInterval(timer);
      for (const track of stream.getTracks()) track.stop();
      setLevel(0);
      setPhase("decoding");
      void (async () => {
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType });
          const buffer = await context.decodeAudioData(await blob.arrayBuffer());
          const mono = new Float32Array(buffer.length);
          for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel);
            for (let index = 0; index < data.length; index++) mono[index] = mono[index]! + data[index]! / buffer.numberOfChannels;
          }
          const result = { samples: mono, sampleRate: buffer.sampleRate, url: URL.createObjectURL(blob) };
          setRecording(result);
          onRecordedRef.current?.(result);
        } catch {
          setDenied(true);
        } finally {
          void context.close();
          setPhase("idle");
        }
      })();
    };
    stopRef.current = () => {
      stopRef.current = null;
      if (recorder.state !== "inactive") recorder.stop();
    };
    setRecording(null);
    setSeconds(0);
    setPhase("recording");
    recorder.start(250);
  }, [maxSeconds]);

  return { phase, seconds, level, recording, denied, start, stop, reset: () => setRecording(null) };
}
