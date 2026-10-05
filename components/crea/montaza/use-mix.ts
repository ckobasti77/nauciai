"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AudioDecodeCache, renderMix, type MixResult, type SourceResolver } from "@/components/crea/video/engine/audio-mix";
import { audioPlan } from "@/lib/crea-audio-plan";
import { mediaKey, type CreaTimelineV1 } from "@/lib/crea-timeline";

/**
 * Miks za pregled i izvoz (K19): pravi se ponovo tek kad se promeni nešto što se
 * čuje (potpis `audioPlan`-a) ili kad izvor postane dostupan, 400 ms posle
 * poslednje izmene. Naslovi, nalepnice i prelazi slike ne diraju zvuk.
 */

export type MixState = {
  status: "idle" | "rendering" | "ready" | "error";
  result: MixResult | null;
  /** Potpis plana za koji je `result` napravljen (izvoz proverava da je svež). */
  signature: string;
};

export function audioSignature(timeline: CreaTimelineV1): string {
  return JSON.stringify(audioPlan(timeline));
}

export function useMix(timeline: CreaTimelineV1, sourceFor: SourceResolver, readyKeys: string) {
  const cache = useRef(new AudioDecodeCache());
  const signature = useMemo(() => audioSignature(timeline), [timeline]);
  const [state, setState] = useState<MixState>({ status: "idle", result: null, signature: "" });
  const latest = useRef({ timeline, sourceFor });
  useEffect(() => {
    latest.current = { timeline, sourceFor };
  }, [timeline, sourceFor]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState((current) => ({ ...current, status: "rendering" }));
      renderMix(latest.current.timeline, latest.current.sourceFor, cache.current, { signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) setState({ status: "ready", result, signature });
        })
        .catch(() => {
          if (!controller.signal.aborted) setState({ status: "error", result: null, signature });
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [signature, readyKeys]);

  /** Svež miks za izvoz (ako pregled još nije stigao da ga napravi). */
  const renderNow = async (current: CreaTimelineV1, signal: AbortSignal): Promise<MixResult> => {
    if (state.status === "ready" && state.result && state.signature === audioSignature(current)) return state.result;
    return renderMix(current, latest.current.sourceFor, cache.current, { signal });
  };

  return { ...state, renderNow };
}

/** Ključ spremnosti izvora zvuka: kad se promeni, miks se pravi ponovo. */
export function audioReadyKey(timeline: CreaTimelineV1, isReady: (key: string) => boolean): string {
  return audioPlan(timeline)
    .segments.map((segment) => mediaKey(segment.src))
    .filter((key, index, all) => all.indexOf(key) === index && isReady(key))
    .join(",");
}
