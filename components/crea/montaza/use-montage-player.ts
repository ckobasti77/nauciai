"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MontagePlayer, type PlayerMedia } from "@/components/crea/video/engine/player";
import type { CreaTimelineV1 } from "@/lib/crea-timeline";

/**
 * Pregled montaže kao React kuka (K19): jedan `MontagePlayer` po platnu. Vreme
 * za React (natpis, dugmad) osvežava se ~8 puta u sekundi dok svira; traka i
 * glava za reprodukciju se pretplaćuju direktno (`subscribe`) i pomeraju bez
 * renderovanja.
 */

export type MontagePlayerControls = {
  attach: (canvas: HTMLCanvasElement | null) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (time: number) => void;
  /** Platno je dobilo novu veličinu (posle ResizeObserver-a). */
  resized: () => void;
  subscribe: (listener: (time: number, playing: boolean) => void) => () => void;
  time: number;
  playing: boolean;
  getTime: () => number;
  /** Raste kad se platno (ponovo) poveže - pretplate se tada obnavljaju. */
  version: number;
};

const UI_TICK_MS = 120;

export function useMontagePlayer(timeline: CreaTimelineV1, media: PlayerMedia, audio: AudioBuffer | null): MontagePlayerControls {
  const playerRef = useRef<MontagePlayer | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [version, setVersion] = useState(0);
  const latest = useRef({ timeline, media, audio });
  const lastTick = useRef(0);

  useEffect(() => {
    latest.current = { timeline, media, audio };
    playerRef.current?.setTimeline(timeline);
  }, [timeline, media, audio]);
  useEffect(() => {
    playerRef.current?.setMedia(media);
  }, [media]);
  useEffect(() => {
    playerRef.current?.setAudio(audio);
  }, [audio]);
  useEffect(() => () => playerRef.current?.destroy(), []);

  const attach = useCallback((canvas: HTMLCanvasElement | null) => {
    playerRef.current?.destroy();
    playerRef.current = null;
    if (!canvas) return;
    const player = new MontagePlayer(canvas, latest.current.timeline, latest.current.media);
    player.setAudio(latest.current.audio);
    player.subscribe((next, isPlaying) => {
      const now = performance.now();
      if (!isPlaying || now - lastTick.current > UI_TICK_MS) {
        lastTick.current = now;
        setTime(next);
      }
      setPlaying(isPlaying);
    });
    playerRef.current = player;
    player.requestDraw();
    setVersion((current) => current + 1);
  }, []);

  const play = useCallback(() => void playerRef.current?.play(), []);
  const pause = useCallback(() => playerRef.current?.pause(), []);
  const toggle = useCallback(() => playerRef.current?.toggle(), []);
  const seek = useCallback((next: number) => playerRef.current?.seek(next), []);
  const resized = useCallback(() => playerRef.current?.resized(), []);
  const subscribe = useCallback(
    (listener: (time: number, playing: boolean) => void) => playerRef.current?.subscribe(listener) ?? (() => undefined),
    [],
  );
  const getTime = useCallback(() => playerRef.current?.getTime() ?? 0, []);
  return { attach, play, pause, toggle, seek, resized, subscribe, getTime, time, playing, version };
}
