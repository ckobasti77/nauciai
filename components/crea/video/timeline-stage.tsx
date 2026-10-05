"use client";

import { Wand2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { newDraftId, putFile, saveDraft } from "@/components/crea/montaza/draft-store";
import { ExportPanel } from "@/components/crea/montaza/export-panel";
import { useMediaLibrary } from "@/components/crea/montaza/media-library";
import { MontagePreview } from "@/components/crea/montaza/preview";
import { useMontageMedia } from "@/components/crea/montaza/use-montage-media";
import { useMontagePlayer } from "@/components/crea/montaza/use-montage-player";
import { audioReadyKey, useMix } from "@/components/crea/montaza/use-mix";
import type { MediaKind } from "@/components/crea/video/engine/media";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import type { MontageOrigin } from "@/convex/creaMontagesCore";
import type { CreaDeviceCaps } from "@/lib/crea-device";
import { EXPORT_PRESETS, type ExportPresetId } from "@/lib/crea-export-presets";
import { creaShellQuery } from "@/lib/crea-shell";
import { timelineDuration, type CreaTimelineV1 } from "@/lib/crea-timeline";
import { EXPORT_LIMITS, exportLimits, videoSupport } from "@/lib/crea-video-caps";
import { CREA_FLOWS_COPY as T } from "@/lib/crea-video-flows-copy";
import type { Locale } from "@/lib/i18n";

/** Fajl sa uređaja koji montaža koristi (`{ localFileId: id }`): glas, isečen klip, logo… */
export type StageFile = { id: string; blob: Blob; name: string; kind: MediaKind };

/**
 * Pozornica K21 tokova: gotova montaža (titlovi, strip, objašnjenje, reklama,
 * kratki klip) se gleda u pregledu, izvozi na uređaju (isti `ExportPanel` kao
 * Montaža, K19: preset, provera pre objave, MP4/GIF, „Sačuvaj u galeriju") ili
 * otvara u Montaži za doradu. Isti `frameAt` crta pregled i izvoz (K17-2).
 */
export function TimelineStage({
  locale,
  caps,
  timeline,
  onTimelineChange,
  files,
  toolId,
  canSave,
  projectId,
  defaultPreset,
  origin,
  title,
  parentJobId,
  onSaved,
}: {
  locale: Locale;
  caps: CreaDeviceCaps | null;
  timeline: CreaTimelineV1;
  onTimelineChange: (next: CreaTimelineV1) => void;
  files: readonly StageFile[];
  toolId: string;
  canSave: boolean;
  projectId: Id<"studioProjects"> | null;
  defaultPreset: ExportPresetId;
  origin: MontageOrigin;
  title: string;
  parentJobId?: Id<"generationJobs"> | null;
  onSaved?: (jobId: Id<"generationJobs">) => void;
}) {
  const tier = caps ? videoSupport(caps) : "webcodecs";
  const limits = caps ? exportLimits(caps) : EXPORT_LIMITS.desktop;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [presetId, setPresetId] = useState<ExportPresetId>(defaultPreset);
  const [safeZoneOn, setSafeZoneOn] = useState(false);
  const [opening, setOpening] = useState(false);

  const library = useMediaLibrary(timeline, true);
  const { prepare, track } = library;
  const { playerMedia, exportMedia, prepareReversed } = useMontageMedia(timeline, library, limits.maxLongSide);
  const mix = useMix(timeline, library.sourceFor, audioReadyKey(timeline, (key) => library.entries.get(key)?.status === "ready"));
  const player = useMontagePlayer(timeline, playerMedia, mix.result?.buffer ?? null);

  // Fajlovi sa uređaja (glas, isečen klip, logo) ulaze u biblioteku jednom po fajlu.
  useEffect(() => {
    for (const file of files) {
      void prepare({ ref: { localFileId: file.id }, kind: file.kind, name: file.name, url: track(URL.createObjectURL(file.blob)), blob: file.blob });
    }
  }, [files, prepare, track]);

  const openInMontage = async () => {
    setOpening(true);
    for (const file of files) await putFile(file.id, file.blob, file.name).catch(() => undefined);
    await saveDraft({ id: newDraftId(), title: title.slice(0, 80), origin, timeline, updatedAt: Date.now() }).catch(() => undefined);
    const query = new URLSearchParams(creaShellQuery({ area: "video", mode: "montaza", tool: "video.montaza" }, searchParams));
    router.push(`${pathname}?${query.toString()}`, { scroll: false });
  };

  const vertical = timeline.aspect === "9:16" || timeline.aspect === "4:5";
  return (
    <div className="min-w-0 space-y-5">
      <div className="space-y-3">
        <h3 className="type-h4 text-ink">{T.stagePreview[locale]}</h3>
        <div className={vertical ? "mx-auto w-full max-w-xs" : "mx-auto w-full max-w-2xl"}>
          <MontagePreview
            locale={locale}
            player={player}
            aspect={timeline.aspect}
            duration={timelineDuration(timeline)}
            safeZone={safeZoneOn ? EXPORT_PRESETS[presetId].safeZone : null}
            empty={timeline.main.length === 0}
            maxHeightVh={vertical ? 58 : 50}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void openInMontage()} loading={opening} icon={<Wand2 aria-hidden="true" className="size-4" />}>
            {opening ? T.openingMontage[locale] : T.openInMontage[locale]}
          </Button>
          <p className="type-body-sm font-semibold text-muted">{T.montageHint[locale]}</p>
        </div>
      </div>
      <div className="space-y-3 border-t border-line pt-5">
        <h3 className="type-h4 text-ink">{T.stageExport[locale]}</h3>
        <ExportPanel
          locale={locale}
          timeline={timeline}
          onTimelineChange={(next) => onTimelineChange(next)}
          presetId={presetId}
          onPresetChange={setPresetId}
          safeZoneOn={safeZoneOn}
          onSafeZoneChange={setSafeZoneOn}
          tier={tier}
          limits={limits}
          mix={mix}
          media={exportMedia}
          prepareReversed={prepareReversed}
          onAddHookTitle={() => void openInMontage()}
          toolId={toolId}
          canSave={canSave}
          projectId={projectId}
          {...(parentJobId !== undefined ? { parentJobId } : {})}
          {...(onSaved ? { onSaved } : {})}
        />
      </div>
    </div>
  );
}
