import { drawFrame, type LayerImage } from "@/components/crea/video/engine/compositor";
import {
  frameAt,
  mainLayout,
  progressAt,
  clipPassLength,
  reversedKey,
  speedAtProgress,
  timelineDuration,
  type CreaTimelineV1,
  type FrameLayer,
  type MainPlacement,
  type MediaRef,
} from "@/lib/crea-timeline";

/**
 * Pregled montaže u realnom vremenu (Crea K19, V24; plan K17-2). Kadrove daju
 * skriveni `<video>` elementi (rade i bez WebCodecs-a), a crta ih ISTI
 * `drawFrame` kao izvoz. Zvuk je gotov miks (`renderMix`) pušten kroz Web
 * Audio, pa je i on isti kao u izvozu; sat pregleda je sat zvuka.
 *
 * Na glavnoj niti, bez Worker-a (K17-1). Najviše 6 `<video>` elemenata
 * odjednom (telefon ima malo dekodera); sledeći klip se pripremi ~1,5 s ranije.
 */

export type PlayerMedia = {
  /** Adresa izvora za `<video>` (blob: ili galerija); `null` = nema ga (istekao, drugi uređaj). */
  urlFor(ref: MediaRef): string | null;
  /** Obrnut pomoćni snimak (K17-9), kad je napravljen. */
  reversedUrlFor(key: string): string | null;
  imageFor(ref: MediaRef): ImageBitmap | null;
  stickerFor(id: string): CanvasImageSource | null;
};

type VideoSlot = { element: HTMLVideoElement; url: string; usedAt: number };

const MAX_VIDEOS = 6;
const DRIFT_PLAYING_S = 0.3;
const PRELOAD_S = 1.5;

export class MontagePlayer {
  private readonly context2d: CanvasRenderingContext2D;
  private timeline: CreaTimelineV1;
  private layout: MainPlacement[] = [];
  private duration = 0;
  private time = 0;
  private playing = false;
  private frame = 0;
  private drawQueued = false;
  private clockStart = 0;
  private timeStart = 0;
  private audioContext: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private audioNode: AudioBufferSourceNode | null = null;
  private readonly videos = new Map<string, VideoSlot>();
  private readonly listeners = new Set<(time: number, playing: boolean) => void>();
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    timeline: CreaTimelineV1,
    private media: PlayerMedia,
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PLATNO");
    this.context2d = context;
    this.timeline = timeline;
    this.refreshLayout();
  }

  private refreshLayout() {
    this.layout = mainLayout(this.timeline);
    this.duration = timelineDuration(this.timeline);
    if (this.time > this.duration) this.time = this.duration;
  }

  setTimeline(timeline: CreaTimelineV1) {
    if (timeline === this.timeline) return;
    this.timeline = timeline;
    this.refreshLayout();
    if (this.playing) this.restartAudio();
    this.requestDraw();
  }

  setMedia(media: PlayerMedia) {
    this.media = media;
    this.requestDraw();
  }

  /** Nov miks (posle izmene zvuka); ako svira, nastavlja od istog trenutka. */
  setAudio(buffer: AudioBuffer | null) {
    if (buffer === this.audioBuffer) return;
    this.audioBuffer = buffer;
    if (this.playing) this.restartAudio();
  }

  subscribe(listener: (time: number, playing: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getTime(): number {
    return this.time;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getDuration(): number {
    return this.duration;
  }

  /** Platno je promenilo veličinu (piksele crta pozivalac). */
  resized() {
    this.requestDraw();
  }

  async play() {
    if (this.playing || this.duration <= 0) return;
    if (this.time >= this.duration - 0.05) this.time = 0;
    this.playing = true;
    if (this.audioBuffer) {
      this.audioContext ??= new AudioContext();
      // Pregledač dozvoljava zvuk tek posle dodira/klika - `play` se zove iz njega.
      await this.audioContext.resume().catch(() => undefined);
    }
    this.startClock();
    this.restartAudio();
    this.notify();
    this.loop();
  }

  pause() {
    if (!this.playing) return;
    this.time = Math.min(this.clockTime(), this.duration);
    this.playing = false;
    cancelAnimationFrame(this.frame);
    this.stopAudio();
    for (const slot of this.videos.values()) slot.element.pause();
    this.notify();
    this.requestDraw();
  }

  toggle() {
    if (this.playing) this.pause();
    else void this.play();
  }

  seek(time: number) {
    this.time = Math.min(Math.max(0, time), this.duration);
    if (this.playing) {
      this.startClock();
      this.restartAudio();
    }
    this.notify();
    this.requestDraw();
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.stopAudio();
    void this.audioContext?.close().catch(() => undefined);
    for (const slot of this.videos.values()) this.release(slot);
    this.videos.clear();
    this.listeners.clear();
  }

  private startClock() {
    this.timeStart = this.time;
    this.clockStart = this.audioContext && this.audioBuffer ? this.audioContext.currentTime : performance.now() / 1000;
  }

  private clockTime(): number {
    if (!this.playing) return this.time;
    const now = this.audioContext && this.audioBuffer ? this.audioContext.currentTime : performance.now() / 1000;
    return this.timeStart + (now - this.clockStart);
  }

  private stopAudio() {
    if (!this.audioNode) return;
    try {
      this.audioNode.stop();
    } catch {
      // već zaustavljen
    }
    this.audioNode.disconnect();
    this.audioNode = null;
  }

  private restartAudio() {
    this.stopAudio();
    if (!this.playing || !this.audioBuffer || !this.audioContext) {
      this.startClock();
      return;
    }
    const node = this.audioContext.createBufferSource();
    node.buffer = this.audioBuffer;
    node.connect(this.audioContext.destination);
    const offset = Math.min(this.time, Math.max(0, this.audioBuffer.duration - 0.01));
    node.start(0, offset);
    this.audioNode = node;
    this.startClock();
  }

  private notify() {
    for (const listener of this.listeners) listener(this.time, this.playing);
  }

  private loop = () => {
    if (!this.playing || this.destroyed) return;
    this.time = this.clockTime();
    if (this.time >= this.duration) {
      this.time = this.duration;
      this.pause();
      return;
    }
    this.draw(true);
    this.notify();
    this.frame = requestAnimationFrame(this.loop);
  };

  /** Crtanje u sledećem kadru ekrana (posle premotavanja, izmene, učitanog videa). */
  requestDraw() {
    if (this.drawQueued || this.destroyed) return;
    this.drawQueued = true;
    requestAnimationFrame(() => {
      this.drawQueued = false;
      if (!this.playing && !this.destroyed) this.draw(false);
    });
  }

  private release(slot: VideoSlot) {
    slot.element.pause();
    slot.element.removeAttribute("src");
    slot.element.load();
  }

  private videoFor(key: string, url: string): HTMLVideoElement {
    const existing = this.videos.get(key);
    if (existing && existing.url === url) {
      existing.usedAt = performance.now();
      return existing.element;
    }
    if (existing) this.release(existing);
    const element = document.createElement("video");
    element.muted = true;
    element.playsInline = true;
    element.preload = "auto";
    if (/^https?:/.test(url)) element.crossOrigin = "anonymous";
    element.addEventListener("seeked", () => this.requestDraw());
    element.addEventListener("loadeddata", () => this.requestDraw());
    element.src = url;
    this.videos.set(key, { element, url, usedAt: performance.now() });
    if (this.videos.size > MAX_VIDEOS) {
      const oldest = [...this.videos.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt)[0];
      if (oldest && oldest[0] !== key) {
        this.release(oldest[1]);
        this.videos.delete(oldest[0]);
      }
    }
    return element;
  }

  /** Gde i kojom brzinom treba da bude `<video>` sloja. Bez obrnutog snimka: premotavanje unazad po kadar. */
  private target(layer: FrameLayer): { key: string; url: string; time: number; rate: number; scrubOnly: boolean } | null {
    const forwardUrl = this.media.urlFor(layer.src);
    let rate = 1;
    if (!layer.overlay) {
      const placement = this.layout.find((entry) => entry.clip.id === layer.clipId);
      if (placement && placement.clip.media === "video") {
        const pass = clipPassLength(placement.clip);
        const local = Math.max(0, this.time - placement.start);
        rate = speedAtProgress(placement.clip, progressAt(placement.clip, local >= pass ? local - pass : local));
      }
    }
    if (layer.reversed) {
      const reversedUrl = this.media.reversedUrlFor(reversedKey(layer.src, layer.range));
      if (reversedUrl) return { key: `${layer.clipId}:r`, url: reversedUrl, time: layer.time, rate, scrubOnly: false };
      if (!forwardUrl) return null;
      return { key: `${layer.clipId}:f`, url: forwardUrl, time: Math.max(layer.range.in, layer.range.out - layer.time - 1 / 30), rate, scrubOnly: true };
    }
    return forwardUrl ? { key: `${layer.clipId}:f`, url: forwardUrl, time: layer.time, rate, scrubOnly: false } : null;
  }

  private draw(playing: boolean) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width <= 0 || height <= 0) return;
    const plan = frameAt(this.timeline, this.time);
    const sources = new Map<FrameLayer, LayerImage | null>();
    const active = new Set<string>();
    let missingMain = false;

    for (const layer of plan.layers) {
      if (layer.media === "image") {
        const bitmap = this.media.imageFor(layer.src);
        sources.set(layer, bitmap ? { image: bitmap, width: bitmap.width, height: bitmap.height } : null);
        continue;
      }
      const target = this.target(layer);
      if (!target) {
        sources.set(layer, null);
        continue;
      }
      active.add(target.key);
      const element = this.videoFor(target.key, target.url);
      if (playing && !target.scrubOnly) {
        element.playbackRate = Math.min(16, Math.max(0.0625, target.rate));
        if (element.paused) {
          element.currentTime = target.time;
          void element.play().catch(() => undefined);
        } else if (Math.abs(element.currentTime - target.time) > DRIFT_PLAYING_S) {
          element.currentTime = target.time;
        }
      } else {
        if (!element.paused) element.pause();
        if (Math.abs(element.currentTime - target.time) > 1 / 120) element.currentTime = target.time;
      }
      const ready = element.readyState >= 2 && element.videoWidth > 0;
      if (!ready && !layer.overlay) missingMain = true;
      sources.set(layer, ready ? { image: element, width: element.videoWidth, height: element.videoHeight } : null);
    }

    // Sledeći klip se priprema unapred, da rez ne „blicne" crno.
    const upcoming = this.layout.find((entry) => entry.start > this.time && entry.start - this.time < PRELOAD_S);
    if (upcoming && upcoming.clip.media === "video") {
      const url = this.media.urlFor(upcoming.clip.src);
      const key = `${upcoming.clip.id}:${upcoming.clip.reverse ? "r" : "f"}`;
      const reversed = upcoming.clip.reverse ? this.media.reversedUrlFor(reversedKey(upcoming.clip.src, upcoming.clip)) : null;
      const preloadUrl = upcoming.clip.reverse ? reversed : url;
      if (preloadUrl && !active.has(key)) {
        const element = this.videoFor(key, preloadUrl);
        const first = upcoming.clip.reverse ? 0 : upcoming.clip.in;
        if (element.paused && Math.abs(element.currentTime - first) > 0.05) element.currentTime = first;
        active.add(key);
      }
    }
    for (const [key, slot] of this.videos) if (!active.has(key) && !slot.element.paused) slot.element.pause();

    // Dok svira, kadar bez spremnog videa se ne crta (ostaje prethodni) - bolje nego crni blic.
    if (playing && missingMain) return;
    drawFrame(this.context2d, plan, width, height, (layer) => sources.get(layer) ?? null, (id) => this.media.stickerFor(id));
  }
}
