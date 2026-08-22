"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CheckSquare, Download, Heart, Loader2, Play, RefreshCw, Sparkles, Square, Volume2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { isExpiredOutput, jobPrompt, jobStatusText } from "@/lib/studio-form";
import { downloadSingleMedia } from "@/lib/studio-gallery";
import { formatElapsedTime, studioMotionTokens } from "@/lib/studio-motion";

export type StudioTileJob = {
  _id: string;
  modelSlug: string;
  kind: "image" | "video" | "audio";
  params: string;
  status: string;
  creditCost: number;
  outputUrl: string | null;
  error?: string;
  isMock: boolean;
  expiresAt?: number;
  createdAt: number;
  inputMode?: string;
};

export function StudioMediaTile({
  job,
  locale,
  onReuse,
  onExtend,
  onOpenDetail,
  selected = false,
  onToggleSelect,
  isSelectMode = false,
  animateEntrance = false,
}: {
  job: StudioTileJob;
  locale: Locale;
  onReuse?: (job: StudioTileJob) => void;
  onExtend?: (job: StudioTileJob) => void;
  onOpenDetail?: (job: StudioTileJob) => void;
  selected?: boolean;
  onToggleSelect?: (job: StudioTileJob) => void;
  isSelectMode?: boolean;
  animateEntrance?: boolean;
}) {
  const [isFavorited, setIsFavorited] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const reduceMotion = useReducedMotion();

  const prompt = jobPrompt(job.params);
  const isWorking = job.status === "reserved" || job.status === "running";
  const isExpired = isExpiredOutput(job);
  const isFailed = job.status === "failed" || job.status === "refunded";
  const hasOutput = Boolean(job.outputUrl);

  const statusMessage = jobStatusText(job, locale);

  // Živi merač proteklog vremena dok posao traje (mirno i pošteno izveštavanje)
  useEffect(() => {
    if (!isWorking) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [isWorking]);

  const tileContent = (
    <div
      id={`tile-${job._id}`}
      tabIndex={0}
      role="button"
      aria-label={prompt ? `Rad: ${prompt}` : `Rad: ${job.modelSlug}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a")) return;
        onOpenDetail?.(job);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          if ((e.target as HTMLElement).closest("button, a") && e.target !== e.currentTarget) return;
          e.preventDefault();
          onOpenDetail?.(job);
        }
      }}
      className={cn(
        "surface-card group relative mb-4 break-inside-avoid border-2 border-ink bg-paper-strong p-2 text-ink cursor-pointer",
        "shadow-[3px_3px_0_0_var(--shadow-hard-12)] studio-anim-mikro",
        "hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--shadow-hard-16)]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
      )}
    >
      {/* Tamni medijski bunar (Rešenje A — Mastionica) */}
      <div className="surface-media relative min-h-[180px] overflow-hidden bg-studio-well shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
        {/* Stanje: Posao u izradi / redu — mirno stanje koje diše uz tačan protekli tajmer */}
        {isWorking ? (
          <div className="grid min-h-[220px] place-items-center p-6 text-center">
            <div className={cn("flex flex-col items-center gap-3", !reduceMotion && "studio-breathing")}>
              <div className="relative flex size-11 items-center justify-center rounded-full border-2 border-white/25 bg-white/10 text-white shadow-inner">
                <Loader2 className="size-5 animate-spin text-white/90" />
              </div>
              <div>
                <p className="max-w-[240px] text-sm font-extrabold leading-snug text-white/95">
                  {statusMessage}
                </p>
                <p className="mt-1 font-mono text-xs font-bold text-white/60">
                  {locale === "sr" ? "Proteklo: " : "Elapsed: "}
                  {formatElapsedTime(job.createdAt, now)}
                </p>
              </div>
              {prompt ? (
                <p className="line-clamp-2 max-w-[260px] text-xs font-semibold text-white/50">
                  &bdquo;{prompt}&ldquo;
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Stanje: Istekao fajl */}
        {!isWorking && isExpired ? (
          <div className="grid min-h-[220px] place-items-center p-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white/70">
                {locale === "sr" ? "Fajl je istekao" : "File expired"}
              </div>
              {prompt ? (
                <p className="line-clamp-3 max-w-[240px] text-sm font-bold text-white">
                  &bdquo;{prompt}&ldquo;
                </p>
              ) : null}
              {onReuse ? (
                <button
                  type="button"
                  onClick={() => onReuse(job)}
                  className="mt-1 inline-flex min-h-8 items-center gap-1.5 rounded-full border-2 border-ink bg-yellow px-3 py-1 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--ink)] transition hover:-translate-y-0.5"
                >
                  <RefreshCw className="size-3" />
                  {locale === "sr"
                    ? `Generiši ponovo · ${job.creditCost} kr`
                    : `Generate again · ${job.creditCost} cr`}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Stanje: Neuspelo / Refundirano */}
        {!isWorking && !isExpired && isFailed ? (
          <div className="grid min-h-[200px] place-items-center p-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-extrabold text-white/90">{statusMessage}</p>
              {prompt ? (
                <p className="line-clamp-2 max-w-[240px] text-xs font-semibold text-white/60">
                  &bdquo;{prompt}&ldquo;
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Stanje: Gotov medij — medij ulazi u isti tamni bunar (transform + opacity) */}
        {!isWorking && !isExpired && !isFailed && hasOutput ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: studioMotionTokens.element.enterDuration,
              ease: studioMotionTokens.element.easeEnter,
            }}
            className="size-full"
          >
            {job.kind === "image" ? (
              <div className="relative w-full">
                <Image
                  src={job.outputUrl as string}
                  alt={prompt || job.modelSlug}
                  width={1200}
                  height={900}
                  unoptimized
                  sizes="(min-width: 1500px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="block h-auto w-full object-cover"
                />
              </div>
            ) : null}

            {job.kind === "video" ? (
              <div className="relative w-full">
                <video
                  src={`${job.outputUrl}#t=0.1`}
                  preload="metadata"
                  muted
                  playsInline
                  loop
                  controls
                  // Klik na kontrole plejera ne sme da otvori detalj (tile onClick).
                  onClick={(e) => e.stopPropagation()}
                  className="block max-h-[560px] w-full object-cover"
                />
              </div>
            ) : null}

            {job.kind === "audio" ? (
              <div className="flex min-h-[200px] flex-col justify-between p-4">
                <div className="flex items-center gap-2 text-white/80">
                  <Volume2 className="size-5 shrink-0 text-white" />
                  <span className="text-xs font-black uppercase tracking-wider">
                    {locale === "sr" ? "Audio zapis" : "Audio track"}
                  </span>
                </div>
                <div className="py-4" onClick={(e) => e.stopPropagation()}>
                  <audio controls src={job.outputUrl as string} className="w-full" />
                </div>
              </div>
            ) : null}
          </motion.div>
        ) : null}

        {/* Checkbox za višestruki izbor (grupno preuzimanje) */}
        {!isWorking && hasOutput && onToggleSelect ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(job);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                e.preventDefault();
                onToggleSelect(job);
              }
            }}
            aria-label={
              selected
                ? (locale === "sr" ? "Ukloni iz izbora" : "Deselect")
                : (locale === "sr" ? "Izaberi za preuzimanje" : "Select for download")
            }
            className={cn(
              "absolute left-3 top-3 z-30 grid size-7 place-items-center rounded-full border-2 border-ink studio-anim-mikro cursor-pointer studio-focus-ink",
              selected
                ? "bg-yellow text-ink shadow-[2px_2px_0_0_var(--ink)] opacity-100"
                : cn(
                    "bg-paper-strong/90 text-ink backdrop-blur-xs hover:scale-105",
                    isSelectMode ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                  ),
            )}
          >
            {selected ? <CheckSquare className="size-4 text-ink" /> : <Square className="size-4 text-muted" />}
          </button>
        ) : null}

        {/* Oznaka vrste (video / audio) ili Demo */}
        <div
          className={cn(
            "pointer-events-none absolute top-3 z-10 flex flex-wrap items-center gap-1.5",
            !isWorking && hasOutput && onToggleSelect ? "left-12" : "left-3",
          )}
        >
          {job.kind === "video" ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-[#0a0e14]/70 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-xs">
              <Play className="size-2.5 fill-current" />
              video
            </span>
          ) : null}
          {job.isMock ? (
            <span className="rounded-full border border-white/20 bg-paper-strong/90 px-2 py-0.5 text-[10px] font-black uppercase text-ink">
              DEMO
            </span>
          ) : null}
        </div>

        {/* Hover pil gore desno sa tri akcije: Omiljeno, Upotrebi ponovo, Preuzmi */}
        {!isWorking && hasOutput ? (
          <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-full border border-white/15 bg-[#0a0e14]/75 p-1 text-white opacity-0 shadow-md backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              type="button"
              onClick={() => setIsFavorited((prev) => !prev)}
              aria-label={locale === "sr" ? "Omiljeno" : "Favorite"}
              title={locale === "sr" ? "Omiljeno" : "Favorite"}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-full studio-anim-mikro hover:bg-white/20 studio-focus-ink",
                isFavorited && "text-yellow",
              )}
            >
              <Heart className={cn("size-3.5", isFavorited && "fill-current")} />
            </button>

            {onReuse ? (
              <button
                type="button"
                onClick={() => onReuse(job)}
                aria-label={locale === "sr" ? "Upotrebi ponovo" : "Reuse"}
                title={locale === "sr" ? "Upotrebi ponovo" : "Reuse"}
                className="inline-flex size-7 items-center justify-center rounded-full studio-anim-mikro hover:bg-white/20 studio-focus-ink"
              >
                <RefreshCw className="size-3.5" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void downloadSingleMedia({ _id: job._id, outputUrl: job.outputUrl, kind: job.kind });
              }}
              aria-label={locale === "sr" ? "Preuzmi" : "Download"}
              title={locale === "sr" ? "Preuzmi" : "Download"}
              className="inline-flex size-7 items-center justify-center rounded-full studio-anim-mikro hover:bg-white/20 studio-focus-ink"
            >
              <Download className="size-3.5" />
            </button>
          </div>
        ) : null}

        {/* Prompt kao naslov preko medija dole levo */}
        {prompt && hasOutput && !isWorking ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-studio-well/95 via-studio-well/60 to-transparent p-3 pt-9">
            <p className="line-clamp-2 text-xs font-bold leading-snug text-white drop-shadow-sm sm:text-sm">
              {prompt}
            </p>
          </div>
        ) : null}

        {/* Hover dugme zvezdica dole desno: Produži / Animiraj */}
        {!isWorking && hasOutput && onExtend ? (
          <button
            type="button"
            onClick={() => onExtend(job)}
            aria-label={locale === "sr" ? "Produži ili animiraj" : "Extend or animate"}
            title={locale === "sr" ? "Produži ili animiraj" : "Extend or animate"}
            className="absolute bottom-3 right-3 z-20 flex size-8 items-center justify-center rounded-full border-2 border-ink bg-yellow text-ink opacity-0 shadow-[2px_2px_0_0_var(--ink)] transition duration-150 hover:scale-105 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <Sparkles className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );

  if (reduceMotion || !animateEntrance) {
    return tileContent;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: studioMotionTokens.element.enterDuration,
        ease: studioMotionTokens.element.easeEnter,
      }}
    >
      {tileContent}
    </motion.div>
  );
}

/**
 * Skeleton tajl koji koristi tamni bunar bez medija kao prirodan skeleton
 * Rešenja A („Mastionica") uz mirno disanje.
 */
export function StudioMediaSkeletonTile() {
  const reduceMotion = useReducedMotion();
  return (
    <div className="surface-card mb-4 break-inside-avoid border-2 border-ink bg-paper-strong p-2 shadow-[3px_3px_0_0_var(--shadow-hard-12)]">
      <div
        className={cn(
          "surface-media min-h-[220px] bg-studio-well shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]",
          !reduceMotion && "studio-breathing",
        )}
      />
    </div>
  );
}
