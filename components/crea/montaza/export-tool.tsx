"use client";

import { Share2, Wand2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { newDraftId, putFile, saveDraft } from "@/components/crea/montaza/draft-store";
import { ExportPanel } from "@/components/crea/montaza/export-panel";
import { useMediaLibrary, type MediaEntry } from "@/components/crea/montaza/media-library";
import { MontagePreview } from "@/components/crea/montaza/preview";
import { useMontageMedia } from "@/components/crea/montaza/use-montage-media";
import { useMontagePlayer } from "@/components/crea/montaza/use-montage-player";
import { audioReadyKey, useMix } from "@/components/crea/montaza/use-mix";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useVideoInput, VideoInput } from "@/components/crea/tools/video-input";
import { Button } from "@/components/ui/button";
import { EXPORT_PRESETS, type ExportPresetId } from "@/lib/crea-export-presets";
import { MONTAGE_COPY as T } from "@/lib/crea-montage-copy";
import { creaShellQuery } from "@/lib/crea-shell";
import { addMainClips, addTitle, emptyTimeline, timelineDuration, type CreaTimelineV1, type MediaRef } from "@/lib/crea-timeline";
import { EXPORT_LIMITS, exportLimits, videoSupport } from "@/lib/crea-video-caps";

/**
 * Izvoz za mreže (Crea K19, V30): jedan gotov video → preset mreže (TikTok,
 * Reels, Shorts, YouTube, Instagram, status, GIF) sa sigurnom zonom u pregledu i
 * proverom pre objave, pa izvoz u tačnom obliku na uređaju (0 kredita). Za
 * natpise i muziku: „Doteraj u montaži".
 */

function localId(key: string): string {
  // Stabilan id fajla sa uređaja za ovaj izbor (ime + veličina + vreme izmene).
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `izvoz-${(hash >>> 0).toString(36)}-${key.length.toString(36)}`;
}

export default function ExportTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const tier = caps ? videoSupport(caps) : "webcodecs";
  const limits = caps ? exportLimits(caps) : EXPORT_LIMITS.desktop;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const video = useVideoInput(source);
  const picked = video.picked;
  const [presetId, setPresetId] = useState<ExportPresetId>("reels");
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [safeZoneOn, setSafeZoneOn] = useState(true);
  const [entry, setEntry] = useState<MediaEntry | null>(null);
  const [edited, setEdited] = useState<CreaTimelineV1 | null>(null);
  const preset = EXPORT_PRESETS[presetId];

  const built = useMemo(() => {
    const base = emptyTimeline(preset.format === "gif" ? "1:1" : preset.aspect);
    if (!entry || entry.status !== "ready" || !entry.durationS) return base;
    return addMainClips(base, [{ src: entry.ref, media: "video", in: 0, out: entry.durationS, speed: 1, volumeDb: 0, muted: false, fit }]);
  }, [entry, fit, preset.aspect, preset.format]);
  const [editedFor, setEditedFor] = useState<CreaTimelineV1 | null>(null);
  if (editedFor !== built) {
    setEditedFor(built);
    setEdited(null);
  }
  const timeline = edited ?? built;

  const library = useMediaLibrary(timeline, true);
  const { prepare } = library;
  const { playerMedia, exportMedia, prepareReversed } = useMontageMedia(timeline, library, limits.maxLongSide);
  const mix = useMix(timeline, library.sourceFor, audioReadyKey(timeline, (key) => library.entries.get(key)?.status === "ready"));
  const player = useMontagePlayer(timeline, playerMedia, mix.result?.buffer ?? null);
  const duration = timelineDuration(timeline);

  // Izabran video → biblioteka (trajanje, veličina).
  useEffect(() => {
    if (!picked) return;
    let alive = true;
    const mediaRef: MediaRef = picked.sourceJobId ? { jobId: picked.sourceJobId } : { localFileId: localId(picked.key) };
    void prepare({ ref: mediaRef, kind: "video", name: picked.name, url: picked.url, blob: typeof picked.source === "string" ? null : picked.source }).then((ready) => {
      if (alive) setEntry(ready);
    });
    return () => {
      alive = false;
    };
  }, [picked, prepare]);

  const openInMontage = async (withHook = false) => {
    const mediaRef = entry?.ref;
    if (picked && typeof picked.source !== "string" && mediaRef && "localFileId" in mediaRef) {
      await putFile(mediaRef.localFileId, picked.source, picked.name).catch(() => undefined);
    }
    // „Popravi" za kuku: montaža se otvara sa natpisom na početku, spremnim za izmenu.
    const draftTimeline = withHook ? addTitle(timeline, { text: T.hookTitle[locale], start: 0, end: Math.min(2.5, duration), style: "naslov" }).timeline : timeline;
    await saveDraft({ id: newDraftId(), title: picked?.name ?? "", origin: "rucno", timeline: draftTimeline, updatedAt: Date.now() }).catch(() => undefined);
    const query = new URLSearchParams(creaShellQuery({ area: "video", mode: "montaza", tool: "video.montaza" }, searchParams));
    router.push(`${pathname}?${query.toString()}`, { scroll: false });
  };

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Share2 aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <div className="space-y-2">
          <h3 className="type-h4 text-ink">{T.exportVideoPick[locale]}</h3>
          <VideoInput locale={locale} input={video} disabled={false} />
          {entry?.status === "unreadable" ? (
            <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
              {T.fileUnreadable[locale].replace("{name}", entry.name.slice(0, 40))}
            </p>
          ) : null}
        </div>

        {timeline.main.length > 0 ? (
          <>
            <ChoiceChips
              legend={T.exportFrameMode[locale]}
              name="izvoz-kadar"
              options={[
                { id: "cover" as const, label: T.fitCover[locale] },
                { id: "contain" as const, label: T.fitContain[locale] },
              ]}
              value={fit}
              onChange={setFit}
            />
            <div className="mx-auto w-full max-w-md">
              <MontagePreview
                locale={locale}
                player={player}
                aspect={timeline.aspect}
                duration={duration}
                safeZone={safeZoneOn ? preset.safeZone : null}
                empty={false}
                maxHeightVh={56}
              />
            </div>
            <Button variant="secondary" onClick={() => void openInMontage()} icon={<Wand2 aria-hidden="true" className="size-4" />}>
              {T.openInMontage[locale]}
            </Button>
            <div className="border-t border-line pt-4">
              <ExportPanel
                locale={locale}
                timeline={timeline}
                onTimelineChange={(next) => setEdited(next)}
                presetId={presetId}
                onPresetChange={setPresetId}
                safeZoneOn={safeZoneOn}
                onSafeZoneChange={setSafeZoneOn}
                tier={tier}
                limits={limits}
                mix={mix}
                media={exportMedia}
                prepareReversed={prepareReversed}
                onAddHookTitle={() => void openInMontage(true)}
                toolId={tool.id}
                canSave={canSave}
                projectId={projectId}
              />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
