"use client";

import { useEffect, useRef } from "react";

import { buildFxChain, type FxChain } from "@/components/crea/zvuk/uredjivac/fx-graph";
import type { StretchNode } from "@/components/crea/zvuk/uredjivac/stretch";
import type { AudioFx } from "@/lib/crea-audio-edit";

type Graph = { context: AudioContext; source: MediaElementAudioSourceNode; chain: FxChain; pitch: StretchNode | null; loadingPitch: boolean };

/** Jedan graf po `<audio>` elementu (Web Audio dozvoljava samo jedan izvor po elementu). */
const graphs = new WeakMap<HTMLMediaElement, Graph>();

function wire(graph: Graph) {
  graph.source.disconnect();
  graph.pitch?.disconnect();
  if (graph.pitch) {
    graph.source.connect(graph.pitch);
    graph.pitch.connect(graph.chain.input);
  } else {
    graph.source.connect(graph.chain.input);
  }
}

/**
 * Pregled efekata uživo (Crea K24, A14): zvuk talasa (wavesurfer `<audio>`) ide kroz
 * isti lanac efekata kao izvoz (`fx-graph.ts`), pa klizači menjaju zvuk dok sluša.
 * Brzina = `playbackRate` sa očuvanom visinom (pregledač), visina = `signalsmith-stretch`
 * uživo (učitava se tek kad se visina pomeri). Graf se pravi na prvo puštanje -
 * pregledači traže dodir korisnika pre zvuka.
 */
export function useLiveFx(media: HTMLMediaElement | null, fx: AudioFx) {
  const fxRef = useRef(fx);
  useEffect(() => {
    fxRef.current = fx;
  });

  useEffect(() => {
    if (!media) return;
    const ensure = () => {
      let graph = graphs.get(media);
      if (!graph) {
        const context = new AudioContext();
        const source = context.createMediaElementSource(media);
        const chain = buildFxChain(context, fxRef.current);
        chain.output.connect(context.destination);
        graph = { context, source, chain, pitch: null, loadingPitch: false };
        graphs.set(media, graph);
        wire(graph);
      }
      void graph.context.resume();
      apply(media, graph, fxRef.current);
    };
    media.addEventListener("play", ensure);
    return () => media.removeEventListener("play", ensure);
  }, [media]);

  useEffect(() => {
    if (!media) return;
    setRate(media, fx.speed);
    const graph = graphs.get(media);
    if (graph) apply(media, graph, fx);
  }, [media, fx]);
}

/** Brzina pregleda: pregledač menja tempo, a visina ostaje ista. */
function setRate(media: HTMLMediaElement, speed: number) {
  (media as HTMLMediaElement & { preservesPitch?: boolean }).preservesPitch = true;
  media.playbackRate = speed;
}

function apply(media: HTMLMediaElement, graph: Graph, fx: AudioFx) {
  graph.chain.update(fx);
  setRate(media, fx.speed);
  if (graph.pitch) {
    void graph.pitch.schedule({ active: true, semitones: fx.pitch });
  } else if (fx.pitch !== 0 && !graph.loadingPitch) {
    graph.loadingPitch = true;
    void import("@/components/crea/zvuk/uredjivac/stretch")
      .then(({ livePitchNode }) => livePitchNode(graph.context, fx.pitch))
      .then((node) => {
        graph.pitch = node;
        wire(graph);
      })
      .catch(() => undefined)
      .finally(() => {
        graph.loadingPitch = false;
      });
  }
}
