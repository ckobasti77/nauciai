/* eslint-disable @next/next/no-img-element -- koristi se za pregled i zumiranje slika u punoj rezoluciji */
"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Heart,
  History,
  Loader2,
  Music,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StudioTileJob } from "@/components/app/studio-media-tile";
import { CreditIcon } from "@/components/studio/credit-icon";
import { StudioComposer, type JobPayload, type RegenerateSeed } from "@/components/studio/studio-composer";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { isExpiredOutput, jobPrompt, jobStatusText } from "@/lib/studio-form";
import { downloadSingleMedia, isDemoPoster } from "@/lib/studio-gallery";
import { deleteJobErrorMessage, studioErrorMessage } from "@/lib/studio-messages";
import { familyMark, modelLabel, MODEL_BADGE_LABELS, type StudioModel } from "@/lib/studio-models";
import { studioMotionTokens } from "@/lib/studio-motion";
import { formatCreditsLong, type ParamValues } from "@/lib/studio-params";
import type { PlaygroundState } from "@/lib/studio-playground";
import type { SlotFiles } from "@/lib/studio-slots";

const T = {
  sr: {
    back: "Nazad",
    done: "Gotovo",
    favorite: "Omiljeno",
    share: "Podeli",
    copied: "Link je kopiran!",
    download: "Preuzmi",
    delete: "Obriši",
    confirmDeleteTitle: "Brisanje generacije",
    confirmDeleteBody: "Da li ste sigurni da želite da obrišete ovaj rad? Ova akcija je nepovratna.",
    deleteConfirm: "Obriši",
    cancel: "Otkaži",
    hideHistory: "Sakrij istoriju",
    showHistory: "Prikaži istoriju",
    history: "Istorija",
    model: "Model",
    mode: "Režim",
    parameters: "Parametri",
    inputs: "Ulazni fajlovi",
    prompt: "Prompt",
    reuseAsInput: "Upotrebi kao ulaz",
    generateAgain: "Generiši ponovo",
    fileExpired: "Fajl je istekao",
    zoomIn: "Uvećaj",
    zoomOut: "Umanji",
    play: "Pusti",
    pause: "Pauziraj",
    mute: "Isključi zvuk",
    unmute: "Uključi zvuk",
    fullscreen: "Ceo ekran",
    prev: "Prethodni rad",
    next: "Sledeći rad",
    noMedia: "Nema medija za prikaz",
    audioTrack: "Audio zapis",
  },
  en: {
    back: "Back",
    done: "Done",
    favorite: "Favorite",
    share: "Share",
    copied: "Link copied!",
    download: "Download",
    delete: "Delete",
    confirmDeleteTitle: "Delete generation",
    confirmDeleteBody: "Are you sure you want to delete this work? This action cannot be undone.",
    deleteConfirm: "Delete",
    cancel: "Cancel",
    hideHistory: "Hide history",
    showHistory: "Show history",
    history: "History",
    model: "Model",
    mode: "Mode",
    parameters: "Parameters",
    inputs: "Input files",
    prompt: "Prompt",
    reuseAsInput: "Use as input",
    generateAgain: "Generate again",
    fileExpired: "File expired",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    play: "Play",
    pause: "Pause",
    mute: "Mute",
    unmute: "Unmute",
    fullscreen: "Fullscreen",
    prev: "Previous work",
    next: "Next work",
    noMedia: "No media to display",
    audioTrack: "Audio track",
  },
} as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function StudioMediaDetail({
  job,
  jobs,
  catalog,
  activeModel,
  onSelectModel,
  locale,
  studioState,
  balance,
  topUpHref,
  onClose,
  onSelectJob,
  onGenerate,
  isPending,
  error,
}: {
  job: StudioTileJob;
  jobs: StudioTileJob[];
  catalog: StudioModel[];
  activeModel?: StudioModel;
  onSelectModel: (model: StudioModel) => void;
  locale: Locale;
  studioState?: PlaygroundState;
  balance?: number;
  topUpHref: string;
  onClose: () => void;
  onSelectJob: (job: StudioTileJob) => void;
  onGenerate: (payload: JobPayload) => void;
  isPending: boolean;
  error: string | null;
}) {
  const t = T[locale];
  const reduceMotion = useReducedMotion();

  // Učitavanje detalja posla sa servera (model, režim, parametri, ulazi)
  const jobDetail = useQuery(api.studio.getJobForRegenerate, {
    jobId: job._id as Id<"generationJobs">,
  });

  const deleteJobMutation = useMutation(api.studio.deleteJob);

  // Stanja interfejsa
  const [isFavorited, setIsFavorited] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  // Video / Audio reprodukcija
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const prompt = jobPrompt(job.params);
  const isWorking = job.status === "reserved" || job.status === "running";
  const isExpired = isExpiredOutput(job);
  const isFailed = job.status === "failed" || job.status === "refunded";
  const hasOutput = Boolean(job.outputUrl);
  // DEMO video/zvuk nema fajl koji plejer može da pusti - prikazuje se SVG poster.
  const showAsImage = job.kind === "image" || isDemoPoster(job);
  const statusMessage = jobStatusText(job, locale);

  // Indeks u listi za levo/desno navigaciju
  const currentIndex = jobs.findIndex((j) => j._id === job._id);
  const prevJob = currentIndex > 0 ? jobs[currentIndex - 1] : null;
  const nextJob = currentIndex >= 0 && currentIndex < jobs.length - 1 ? jobs[currentIndex + 1] : null;

  // Tastaturna navigacija (Esc, ArrowLeft, ArrowRight)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft" && prevJob) {
        // Samo ako fokus nije u inputu ili textareji
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
        event.preventDefault();
        onSelectJob(prevJob);
      } else if (event.key === "ArrowRight" && nextJob) {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
        event.preventDefault();
        onSelectJob(nextJob);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onSelectJob, prevJob, nextJob]);

  const handleTogglePlay = useCallback(() => {
    if (job.kind === "video" && videoRef.current) {
      if (videoRef.current.paused) {
        void videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    } else if (job.kind === "audio" && audioRef.current) {
      if (audioRef.current.paused) {
        void audioRef.current.play();
        setIsPlaying(true);
      } else {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    }
  }, [job.kind]);

  const handleSeek = useCallback(
    (time: number) => {
      setCurrentTime(time);
      if (job.kind === "video" && videoRef.current) {
        videoRef.current.currentTime = time;
      } else if (job.kind === "audio" && audioRef.current) {
        audioRef.current.currentTime = time;
      }
    },
    [job.kind],
  );

  const handleShare = useCallback(() => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (!url) return;

    if (navigator.clipboard) {
      void navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  }, []);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteJobMutation({ jobId: job._id as Id<"generationJobs"> });
      setConfirmDeleteOpen(false);
      onClose();
    } catch (err) {
      setDeleteError(deleteJobErrorMessage(err instanceof Error ? err.message : String(err), locale));
    } finally {
      setIsDeleting(false);
    }
  }, [deleteJobMutation, job._id, locale, onClose]);

  // Model korišćen za kreiranje ovog posla
  const jobModel = useMemo(
    () => catalog.find((m) => m.slug === job.modelSlug) ?? activeModel ?? catalog[0],
    [catalog, job.modelSlug, activeModel],
  );

  // Parsirani parametri posla za prikaz u istoriji
  const parsedParams = useMemo(() => {
    try {
      const raw = jobDetail?.params ?? job.params;
      const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignoriši grešku u parsiranju
    }
    return {};
  }, [jobDetail, job.params]);

  // Priprema seed objekta za ugrađeni edit composer
  const editSeed: RegenerateSeed | null = useMemo(() => {
    if (!jobDetail) {
      return {
        id: job._id,
        prompt,
        params: parsedParams as ParamValues,
      };
    }

    const files: SlotFiles = {};
    for (const input of jobDetail.inputs) {
      const list = files[input.slot] ?? [];
      list.push({
        storageId: input.storageId,
        name: input.slot,
        mime: input.mime ?? "",
        size: input.size ?? 0,
        url: input.url,
        ...(input.durationS !== undefined ? { measuredSeconds: input.durationS } : {}),
      });
      files[input.slot] = list;
    }

    return {
      id: job._id,
      inputMode: jobDetail.inputMode,
      params: parsedParams as ParamValues,
      files,
      prompt,
      ...(jobDetail.missingSlots.length > 0 ? { missingSlots: jobDetail.missingSlots } : {}),
    };
  }, [job._id, jobDetail, prompt, parsedParams]);

  const resolvedActiveModel = jobModel ?? catalog[0];

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.985 }}
      transition={{
        duration: studioMotionTokens.prelaz.enterDuration,
        ease: studioMotionTokens.prelaz.easeEnter,
      }}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-studio-canvas text-ink"
    >
      {/* ========================================================================= */}
      {/* GORNJA TRAKA (Top Bar)                                                    */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between gap-3 border-b-2 border-ink bg-paper-strong px-4 py-3 sm:px-6 shadow-[0_2px_0_0_var(--shadow-hard-08)]">
        <div className="flex min-w-0 items-center gap-3">
          {/* Dugme Nazad */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t.back}
            title={t.back}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <ArrowLeft className="size-5" />
          </button>

          {/* Prompt kao naslov */}
          <div className="min-w-0">
            <h2 className="truncate text-base font-black text-ink sm:text-lg">
              {prompt || (jobModel ? modelLabel(jobModel, locale) : locale === "sr" ? "Detalj medija" : "Media detail")}
            </h2>
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-muted">
              <span>{job.kind}</span>
              <span>·</span>
              <span>{jobModel ? modelLabel(jobModel, locale) : job.modelSlug}</span>
            </div>
          </div>
        </div>

        {/* Akcije sa desne strane */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Omiljeno */}
          <button
            type="button"
            onClick={() => setIsFavorited((prev) => !prev)}
            aria-label={t.favorite}
            title={t.favorite}
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              isFavorited && "text-yellow",
            )}
          >
            <Heart className={cn("size-4", isFavorited && "fill-current")} />
          </button>

          {/* Podeli */}
          <button
            type="button"
            onClick={handleShare}
            aria-label={t.share}
            title={copiedLink ? t.copied : t.share}
            className="relative inline-flex size-10 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {copiedLink ? <Check className="size-4 text-green-700" /> : <Copy className="size-4" />}
          </button>

          {/* Preuzmi */}
          {hasOutput ? (
            <button
              type="button"
              onClick={() => {
                void downloadSingleMedia({ _id: job._id, outputUrl: job.outputUrl, kind: job.kind });
              }}
              aria-label={t.download}
              title={t.download}
              className="inline-flex size-10 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <Download className="size-4" />
            </button>
          ) : null}

          {/* Obriši */}
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            aria-label={t.delete}
            title={t.delete}
            className="inline-flex size-10 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <Trash2 className="size-4" />
          </button>

          {/* Prekidač Sakrij/Prikaži istoriju */}
          <button
            type="button"
            onClick={() => setHistoryOpen((prev) => !prev)}
            aria-label={historyOpen ? t.hideHistory : t.showHistory}
            title={historyOpen ? t.hideHistory : t.showHistory}
            className={cn(
              "hidden size-10 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 md:inline-flex studio-focus-ink",
              historyOpen && "bg-yellow/30",
            )}
          >
            <History className="size-4" />
          </button>

          {/* Dugme Gotovo */}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center justify-center rounded-full border-2 border-ink bg-ink px-4 py-1.5 text-sm font-black text-paper-strong shadow-[3px_3px_0_0_var(--yellow)] transition hover:-translate-y-0.5"
          >
            {t.done}
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* DIJALOG ZA POTVRDU BRISANJA                                               */}
      {/* ========================================================================= */}
      {confirmDeleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4 backdrop-blur-xs">
          <div className="surface-card w-full max-w-md border-2 border-ink bg-paper-strong p-6 shadow-[6px_6px_0_0_var(--shadow-hard-20)]">
            <h3 className="text-lg font-black text-ink">{t.confirmDeleteTitle}</h3>
            <p className="mt-2 text-sm font-bold text-muted">{t.confirmDeleteBody}</p>

            {deleteError ? (
              <p className="mt-3 text-xs font-black text-red-700">{deleteError}</p>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={isDeleting}
                className="rounded-full border-2 border-ink bg-paper-strong px-4 py-2 text-xs font-extrabold text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-red-600 px-4 py-2 text-xs font-black text-white shadow-[3px_3px_0_0_var(--ink)] transition hover:-translate-y-0.5"
              >
                {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                <span>{t.deleteConfirm}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* SREDINA: MEDIJ + TIMELINE + ISTORIJA                                      */}
      {/* ========================================================================= */}
      <div className="flex flex-1 flex-col p-4 pb-32 sm:p-6 md:flex-row md:gap-6">
        {/* LEVI / CENTRALNI DEO: STAGE (Bunar sa medijem) */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4">
          {/* Navigacione strelice levo/desno (desktop) */}
          <div className="relative flex w-full max-w-[780px] items-center justify-center">
            {prevJob ? (
              <button
                type="button"
                onClick={() => onSelectJob(prevJob)}
                aria-label={t.prev}
                title={t.prev}
                className="absolute -left-5 z-20 hidden size-10 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 lg:inline-flex studio-focus-ink"
              >
                <ChevronLeft className="size-5" />
              </button>
            ) : null}

            {/* TAMNI BUNAR (Rešenje A „Mastionica") */}
            <div
              className={cn(
                "surface-card relative w-full overflow-hidden border-2 border-ink bg-studio-well shadow-[6px_6px_0_0_var(--shadow-hard-16)]",
                "flex min-h-[320px] items-center justify-center",
                isZoomed && "cursor-zoom-out overflow-auto",
              )}
            >
              {/* Stanje: Posao u izradi / redu */}
              {isWorking ? (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <div className="relative flex size-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white">
                    <Loader2 className="size-6 animate-spin" />
                  </div>
                  <p className="max-w-[320px] text-base font-black text-white/90">{statusMessage}</p>
                  {prompt ? (
                    <p className="max-w-[360px] text-xs font-semibold text-white/60">&bdquo;{prompt}&ldquo;</p>
                  ) : null}
                </div>
              ) : null}

              {/* Stanje: Istekao fajl */}
              {!isWorking && isExpired ? (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white/70">
                    {t.fileExpired}
                  </div>
                  {prompt ? (
                    <p className="max-w-[340px] text-sm font-bold text-white">&bdquo;{prompt}&ldquo;</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      if (jobDetail) {
                        onGenerate({
                          params: parsedParams,
                          inputMode: jobDetail.inputMode ?? "text",
                          inputs: {},
                        });
                      }
                    }}
                    className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 py-1.5 text-xs font-black text-ink shadow-[3px_3px_0_0_var(--ink)] transition hover:-translate-y-0.5"
                    aria-label={
                      locale === "sr"
                        ? `Generiši ponovo za ${formatCreditsLong(job.creditCost, locale)}`
                        : `Generate again for ${formatCreditsLong(job.creditCost, locale)}`
                    }
                  >
                    <RefreshCw className="size-3.5" />
                    <span className="inline-flex items-center gap-1">
                      <span>{`${t.generateAgain} · ${job.creditCost}`}</span>
                      <CreditIcon className="size-3.5" />
                    </span>
                  </button>
                </div>
              ) : null}

              {/* Stanje: Neuspeo posao */}
              {!isWorking && !isExpired && isFailed ? (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <p className="text-sm font-extrabold text-white/90">{statusMessage}</p>
                  {job.error ? (
                    <p className="max-w-[320px] text-xs font-bold text-red-300">
                      {studioErrorMessage(job.error, locale)}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Stanje: Gotov medij */}
              {!isWorking && !isExpired && !isFailed && hasOutput ? (
                <>
                  {showAsImage ? (
                    <div
                      className={cn(
                        "relative flex size-full items-center justify-center p-2",
                        isZoomed ? "max-h-none" : "max-h-[580px]",
                      )}
                      onClick={() => setIsZoomed((prev) => !prev)}
                    >
                      <img
                        src={job.outputUrl as string}
                        alt={prompt || "Studio generacija"}
                        className={cn(
                          "transition-transform duration-200",
                          isZoomed
                            ? "max-h-none w-auto max-w-none scale-125 object-none"
                            : "max-h-[560px] w-full object-contain",
                        )}
                      />
                      {/* Zoom dugme u uglu */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsZoomed((prev) => !prev);
                        }}
                        aria-label={isZoomed ? t.zoomOut : t.zoomIn}
                        title={isZoomed ? t.zoomOut : t.zoomIn}
                        className="absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-xs transition hover:bg-white/20 studio-focus-ink"
                      >
                        {isZoomed ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}
                      </button>
                    </div>
                  ) : null}

                  {!showAsImage && job.kind === "video" ? (
                    <div className="relative size-full">
                      <video
                        ref={videoRef}
                        src={job.outputUrl as string}
                        playsInline
                        loop
                        muted={isMuted}
                        onTimeUpdate={() => {
                          if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                        }}
                        onLoadedMetadata={() => {
                          if (videoRef.current) setDuration(videoRef.current.duration);
                        }}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onClick={handleTogglePlay}
                        className="block max-h-[580px] w-full object-contain"
                      />
                      {/* Veliko Play dugme u sredini kada je pauzirano */}
                      {!isPlaying ? (
                        <button
                          type="button"
                          onClick={handleTogglePlay}
                          aria-label={t.play}
                          className="absolute inset-0 m-auto flex size-16 items-center justify-center rounded-full border-2 border-ink bg-paper-strong/90 text-ink shadow-lg transition hover:scale-105 studio-focus-ink"
                        >
                          <Play className="ml-1 size-7 fill-current" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {!showAsImage && job.kind === "audio" ? (
                    <div className="flex size-full min-h-[240px] flex-col items-center justify-center p-8 text-center text-white">
                      <audio
                        ref={audioRef}
                        src={job.outputUrl as string}
                        onTimeUpdate={() => {
                          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
                        }}
                        onLoadedMetadata={() => {
                          if (audioRef.current) setDuration(audioRef.current.duration);
                        }}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                      />
                      <div className="flex size-20 items-center justify-center rounded-full border border-white/20 bg-white/10 text-yellow">
                        <Music className="size-10" />
                      </div>
                      <span className="mt-3 text-xs font-black uppercase tracking-wider text-white/70">
                        {t.audioTrack}
                      </span>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            {nextJob ? (
              <button
                type="button"
                onClick={() => onSelectJob(nextJob)}
                aria-label={t.next}
                title={t.next}
                className="absolute -right-5 z-20 hidden size-10 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 lg:inline-flex studio-focus-ink"
              >
                <ChevronRight className="size-5" />
              </button>
            ) : null}
          </div>

          {/* TIMELINE (Ispod medija za video i audio) */}
          {(job.kind === "video" || job.kind === "audio") && hasOutput && !isWorking ? (
            <div className="surface-inset flex w-full max-w-[780px] items-center gap-3 border-2 border-ink bg-paper-strong px-4 py-2.5 shadow-[3px_3px_0_0_var(--shadow-hard-12)]">
              {/* Play / Pause */}
              <button
                type="button"
                onClick={handleTogglePlay}
                aria-label={isPlaying ? t.pause : t.play}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper text-ink transition hover:bg-yellow studio-focus-ink"
              >
                {isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
              </button>

              {/* Tekuće vreme */}
              <span className="font-mono text-xs font-black text-ink">{formatTime(currentTime)}</span>

              {/* Scrubber traka */}
              <div className="relative flex-1">
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={0.01}
                  value={currentTime}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  aria-label="Timeline scrubber"
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-ink"
                />
              </div>

              {/* Ukupno vreme */}
              <span className="font-mono text-xs font-extrabold text-muted">{formatTime(duration)}</span>

              {/* Mute / Unmute */}
              <button
                type="button"
                onClick={() => setIsMuted((prev) => !prev)}
                aria-label={isMuted ? t.unmute : t.mute}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition hover:text-ink studio-focus-ink"
              >
                {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
            </div>
          ) : null}
        </div>

        {/* DESNI DEO: PANEL „ISTORIJA" (Provenance) */}
        {historyOpen ? (
          <aside className="surface-card mt-4 flex w-full flex-col border-2 border-ink bg-paper-strong p-4 shadow-[4px_4px_0_0_var(--shadow-hard-14)] md:mt-0 md:w-80 md:shrink-0">
            <div className="flex items-center justify-between border-b-2 border-ink/15 pb-3">
              <div className="flex items-center gap-2">
                <History className="size-4 text-ink" />
                <h3 className="text-sm font-black uppercase tracking-wider text-ink">{t.history}</h3>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-full text-xs font-bold text-muted hover:text-ink md:hidden"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex-1 space-y-4 overflow-y-auto">
              {/* Model */}
              <div>
                <span className="block text-[11px] font-black uppercase tracking-wide text-muted">{t.model}</span>
                <div className="mt-1.5 flex items-center gap-2.5 surface-inset border-2 border-ink bg-paper p-2.5">
                  {jobModel ? (
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-xs font-black text-paper-strong">
                      {familyMark(jobModel)}
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <span className="truncate text-xs font-black text-ink">
                      {jobModel ? modelLabel(jobModel, locale) : job.modelSlug}
                    </span>
                    {jobModel?.badge ? (
                      <span className="ml-2 inline-block rounded-full border border-ink bg-paper-strong px-1.5 py-0.2 text-[9px] font-black uppercase text-ink">
                        {MODEL_BADGE_LABELS[jobModel.badge][locale]}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Prompt */}
              {prompt ? (
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-wide text-muted">{t.prompt}</span>
                  <div className="surface-inset mt-1.5 border-2 border-ink bg-paper p-3 text-xs font-bold leading-relaxed text-ink">
                    {prompt}
                  </div>
                </div>
              ) : null}

              {/* Parametri */}
              {Object.keys(parsedParams).length > 0 ? (
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-wide text-muted">
                    {t.parameters}
                  </span>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {Object.entries(parsedParams)
                      .filter(([key]) => key !== "prompt")
                      .map(([key, val]) => (
                        <div key={key} className="surface-inset border border-ink/20 bg-paper p-2 text-xs">
                          <span className="block truncate text-[10px] font-bold text-muted">{key}</span>
                          <span className="block truncate font-mono font-black text-ink">
                            {typeof val === "boolean" ? (val ? "da" : "ne") : String(val)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              {/* Ulazne sličice / fajlovi */}
              {jobDetail?.inputs && jobDetail.inputs.length > 0 ? (
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-wide text-muted">
                    {t.inputs}
                  </span>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {jobDetail.inputs.map((inp, idx) => (
                      <div
                        key={idx}
                        className="surface-media aspect-square overflow-hidden border-2 border-ink bg-paper"
                      >
                        {inp.mime.startsWith("image/") && inp.url ? (
                          <img src={inp.url} alt="" className="size-full object-cover" />
                        ) : inp.mime.startsWith("video/") && inp.url ? (
                          <video src={`${inp.url}#t=0.1`} className="size-full object-cover" muted />
                        ) : (
                          <div className="flex size-full items-center justify-center text-xs font-bold text-muted">
                            <Music className="size-4" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Dugme Upotrebi kao ulaz / ponovo */}
            <div className="mt-4 border-t-2 border-ink/15 pt-3">
              <button
                type="button"
                onClick={() => {
                  if (jobModel) onSelectModel(jobModel);
                }}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-paper py-2 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5"
              >
                <Sparkles className="size-3.5" />
                <span>{t.reuseAsInput}</span>
              </button>
            </div>
          </aside>
        ) : null}
      </div>

      {/* ========================================================================= */}
      {/* DOLE: ISTI COMPOSER (variant="edit")                                      */}
      {/* ========================================================================= */}
      <footer className="fixed bottom-4 left-0 right-0 z-40 flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[720px]">
          <StudioComposer
            models={catalog}
            activeModel={resolvedActiveModel}
            onSelectModel={onSelectModel}
            locale={locale}
            studioState={studioState}
            balance={balance}
            topUpHref={topUpHref}
            seed={editSeed}
            isPending={isPending}
            error={error}
            variant="edit"
            onGenerate={onGenerate}
          />
        </div>
      </footer>
    </motion.div>
  );
}
