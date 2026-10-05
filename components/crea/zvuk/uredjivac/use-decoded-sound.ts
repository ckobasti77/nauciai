"use client";

import { useEffect, useState } from "react";

import type { PickedSound } from "@/components/crea/zvuk/sound-input";

export type DecodedSound =
  | { status: "idle" | "loading" | "empty" | "error"; buffer: null; key: string | null }
  | { status: "tooLong"; buffer: null; key: string; seconds: number }
  | { status: "ready"; buffer: AudioBuffer; key: string };

/**
 * Izabran snimak (ili zvuk iz videa) dekodiran na uređaju (Crea K24), za alate koji
 * rade nad uzorcima: uređivač, čišćenje, isecanje po rečima, ritam, audiogram.
 * Predugačak snimak za ovaj uređaj se odbija pre nego što napuni memoriju.
 */
export function useDecodedSound(picked: PickedSound | null, options: { sampleRate: number; channels: 1 | 2; maxSeconds: number }): DecodedSound {
  const [state, setState] = useState<DecodedSound>({ status: "idle", buffer: null, key: null });
  const key = picked?.key ?? null;
  const source = picked?.source ?? null;
  const { sampleRate, channels, maxSeconds } = options;

  useEffect(() => {
    if (!key || !source || !picked) return;
    let alive = true;
    void (async () => {
      try {
        const { probeMedia } = await import("@/components/crea/video/engine/media");
        const probed = await probeMedia(picked.kind, source).catch(() => null);
        if (probed?.durationS && probed.durationS > maxSeconds + 1) {
          if (alive) setState({ status: "tooLong", buffer: null, key, seconds: probed.durationS });
          return;
        }
        const { decodeSound } = await import("@/components/crea/zvuk/audio-render");
        const buffer = await decodeSound(source, sampleRate, channels);
        if (!alive) return;
        if (!buffer) setState({ status: "empty", buffer: null, key });
        else if (buffer.duration > maxSeconds + 1) setState({ status: "tooLong", buffer: null, key, seconds: buffer.duration });
        else setState({ status: "ready", buffer, key });
      } catch {
        if (alive) setState({ status: "error", buffer: null, key });
      }
    })();
    return () => {
      alive = false;
    };
    // `picked.kind` ide uz ključ; isti ključ = isti fajl.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, source, sampleRate, channels, maxSeconds]);

  if (!key) return { status: "idle", buffer: null, key: null };
  return state.key === key ? state : { status: "loading", buffer: null, key };
}
