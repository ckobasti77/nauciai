"use client";

import { useCallback, useEffect, useState } from "react";

import { usePrepareVideo, useUploadInput } from "@/components/crea/tools/paid-video";
import type { PickedSound } from "@/components/crea/zvuk/sound-input";
import type { Id } from "@/convex/_generated/dataModel";
import { AUDIO_ACCEPT } from "@/convex/providers/modelControls";

/** Trajanje izabranog zvuka ili videa (s) - samo za cenu na dugmetu; naplata ide po serveru. */
export function useSoundSeconds(picked: PickedSound | null): number | null {
  const [state, setState] = useState<{ key: string; seconds: number | null } | null>(null);
  const key = picked?.key ?? null;
  const kind = picked?.kind ?? null;
  const source = picked?.source ?? null;
  useEffect(() => {
    if (!key || !source || !kind) return;
    let alive = true;
    void (async () => {
      const { probeMedia } = await import("@/components/crea/video/engine/media");
      const probed = await probeMedia(kind, source);
      if (alive) setState({ key, seconds: probed?.durationS ?? null });
    })();
    return () => {
      alive = false;
    };
  }, [key, kind, source]);
  return state && state.key === key ? state.seconds : null;
}

/**
 * Zvuk kao ulaz plaćenog posla (Crea K23): rad iz galerije postaje alias (bez
 * kopije), zvučni fajl u formatu koji provajder prima ide kakav jeste, a video
 * (ili drugi format) se na uređaju pretvori u WAV. Trajanje uvek meri server.
 */
export function usePrepareSound() {
  const prepareVideo = usePrepareVideo();
  const uploadInput = useUploadInput();
  return useCallback(
    async (picked: PickedSound, wav: { sampleRate: number; channels: 1 | 2 }): Promise<{ storageId: Id<"_storage">; seconds: number | null }> => {
      if (picked.sourceJobId && picked.kind === "audio") {
        return prepareVideo({ source: picked.source, url: picked.url, name: picked.name, key: picked.key, bytes: picked.bytes, sourceJobId: picked.sourceJobId });
      }
      if (picked.kind === "audio" && picked.source instanceof File && AUDIO_ACCEPT.includes(picked.source.type)) {
        return uploadInput(picked.source, "audio");
      }
      const { soundAsWav } = await import("@/components/crea/zvuk/audio-render");
      const converted = await soundAsWav(picked.source, wav.sampleRate, wav.channels, "crea-zvuk.wav");
      if (!converted) throw new Error("NEMA_ZVUKA");
      return uploadInput(converted.file, "audio");
    },
    [prepareVideo, uploadInput],
  );
}
