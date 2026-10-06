/* eslint-disable @next/next/no-img-element -- koristi se za pregled i zumiranje slika u punoj rezoluciji */
"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Check,
  Clapperboard,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FlaskConical,
  Grid3x3,
  Heart,
  History,
  Layers,
  Music,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  SplitSquareHorizontal,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StudioTileJob } from "@/components/app/studio-media-tile";
import { CreaSharePanel } from "@/components/crea/community/crea-share-panel";
import { TranscriptPanel } from "@/components/crea/transcript-panel";
import { CreaReveal } from "@/components/crea/reveal/crea-reveal";
import { LearnCard } from "@/components/crea/wait/learn-card";
import { CreaWaitScreen } from "@/components/crea/wait/wait-screen";
import { PromptSegmentsView } from "@/components/crea/prompt-parts";
import { QUICK_ACTION_ICONS, type QuickActionLink } from "@/components/crea/quick-actions-menu";
import { VersionStrip } from "@/components/crea/version-strip";
import { LicenseBadge } from "@/components/crea/zvuk/license-badge";
import { CreditIcon } from "@/components/studio/credit-icon";
import { StudioComposer, type JobPayload, type RegenerateSeed } from "@/components/studio/studio-composer";
import { ConfirmDialog, useModalFocus } from "@/components/ui/dialog";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CREA_PICK_COPY, CREA_TOOL_COPY, CREA_VERSION_COPY, fillCopy } from "@/lib/crea-copy";
import { buildRefineOrder, orderCredits, refinePairForJob, type RefineOrder } from "@/lib/crea-draft";
import { licenseForJob } from "@/lib/crea-license-tags";
import { revealStyleFor } from "@/lib/crea-reveal";
import { tipAreaFor } from "@/lib/crea-tips";
import { toolOfJob } from "@/lib/crea-tools";
import { estimateWait, isWaitingStatus, queuePlace } from "@/lib/crea-wait";
import { isAnglesGridPrompt } from "@/lib/crea-grid-crop";
import { CREA_LIBRARY_COPY } from "@/lib/crea-library-copy";
import { CREA_STICKERS_COPY } from "@/lib/crea-recipes-copy";
import { isStickerSheetPrompt } from "@/lib/crea-sticker-pack";
import { toolsForWork, versionInputTarget, type VersionIntent } from "@/lib/crea-versions";
import type { Locale } from "@/lib/i18n";
import { creaMotionFor } from "@/lib/motion-contract";
import { isExpiredOutput, jobPrompt, jobStatusText } from "@/lib/studio-form";
import { downloadSingleMedia, isDemoPoster, isTranscriptJob } from "@/lib/studio-gallery";
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
    close: "Zatvori",
    confirmDeleteTitle: "Obrisati ovaj rad?",
    confirmDeleteBody: "Fajl se trajno briše i ne može da se vrati. Krediti koje si potrošio/la na njega se ne vraćaju. Ako ti fajl još treba, prvo ga preuzmi.",
    deleteConfirm: "Obriši",
    cancel: "Otkaži",
    hideHistory: "Sakrij istoriju",
    showHistory: "Prikaži istoriju",
    history: "Istorija",
    model: "Alat",
    mode: "Režim",
    parameters: "Podešavanja",
    inputs: "Fajlovi koje si dao/la",
    prompt: "Tvoj opis",
    generateAgain: "Napravi ponovo",
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
    untitledWork: "Rad napravljen u Crei",
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
    close: "Close",
    confirmDeleteTitle: "Delete this work?",
    confirmDeleteBody: "The file is deleted for good and cannot be brought back. The credits you spent on it are not returned. If you still need the file, download it first.",
    deleteConfirm: "Delete",
    cancel: "Cancel",
    hideHistory: "Hide history",
    showHistory: "Show history",
    history: "History",
    model: "Tool",
    mode: "Mode",
    parameters: "Settings",
    inputs: "Files you gave it",
    prompt: "Your description",
    generateAgain: "Make it again",
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
    untitledWork: "Work made in Crea",
    audioTrack: "Audio track",
  },
} as const;

// Pre/posle (K05): `react-compare-slider` se učitava tek kad korisnik uključi poređenje.
const BeforeAfter = dynamic(() => import("@/components/crea/before-after"), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-[320px] w-full place-items-center">
      <Spinner size="lg" />
    </div>
  ),
});

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
  onOpenVersion,
  onUseAsInput,
  onOpenTool,
  quickActions = [],
  onRefine,
  restored,
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
  /** Druga verzija iz stabla (K05); `restored` = otvorena kroz „Vrati". */
  onOpenVersion: (jobId: string, restored: boolean) => void;
  onUseAsInput: (job: StudioTileJob, intent: VersionIntent) => void;
  onOpenTool: (job: StudioTileJob, toolId: string) => void;
  /** Brze akcije (K16, S44) - isti spisak kao na kartici. */
  quickActions?: readonly QuickActionLink[];
  /** „Usavrši" probu (K07): konačna verzija skupljim modelom; `carried` su ulazi probe po slotu. */
  onRefine: (job: StudioTileJob, order: RefineOrder, model: StudioModel, carried: Record<string, string[]>) => void;
  /** Korisnik se „Vrati"-o na ovaj rad: nudi se da nastavi od njega. */
  restored: boolean;
  onGenerate: (payload: JobPayload, model: StudioModel) => void;
  isPending: boolean;
  error: string | null;
}) {
  const t = T[locale];
  const reduceMotion = useReducedMotion();
  const crea = creaMotionFor(Boolean(reduceMotion));
  // Rad koji je stigao dok je pun prikaz bio otvoren dobija otkrivanje (K25, U4).
  const [prevStatus, setPrevStatus] = useState(job.status);
  const [arrived, setArrived] = useState(false);
  if (job.status !== prevStatus) {
    setPrevStatus(job.status);
    if (isWaitingStatus(prevStatus) && job.status === "done") setArrived(true);
  }

  // Učitavanje detalja posla sa servera (model, režim, parametri, ulazi)
  const jobDetail = useQuery(api.studio.getJobForRegenerate, {
    jobId: job._id as Id<"generationJobs">,
  });

  const deleteJobMutation = useMutation(api.studio.deleteJob);
  const toggleFavorite = useMutation(api.creaLibrary.toggleFavorite);

  // Stablo verzija (K05, S25): roditelj ovog rada je meta „Vrati" i strana „pre" u poređenju.
  const versionTree = useQuery(api.creaVersions.getVersionTree, { jobId: job._id as Id<"generationJobs"> });
  const versionNodes = versionTree?.nodes ?? [];
  const parentId = versionNodes.find((node) => node._id === job._id)?.parentJobId ?? null;
  const parentNode = parentId ? (versionNodes.find((node) => node._id === parentId) ?? null) : null;
  const [comparing, setComparing] = useState(false);

  // Stanja interfejsa
  // Omiljeno (K16): pravo polje rada; dok mutacija ne stigne, kartica pokazuje novo stanje.
  const [favoriteOverride, setFavoriteOverride] = useState<boolean | null>(null);
  const isFavorited = favoriteOverride ?? job.favoriteAt !== undefined;
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
  const isWorking = job.status === "reserved" || job.status === "running" || job.status === "queued";
  const isExpired = isExpiredOutput(job);
  const isFailed = job.status === "failed" || job.status === "refunded";
  const hasOutput = Boolean(job.outputUrl);
  // DEMO video/zvuk nema fajl koji plejer može da pusti - prikazuje se SVG poster.
  const showAsImage = job.kind === "image" || isDemoPoster(job);
  const statusMessage = jobStatusText(job, locale);
  const vc = CREA_VERSION_COPY;
  // DEMO (mock) izlaz je SVG, koji nijedan ulazni slot ne prima - za njega se ulaz ne nudi.
  const isDone = job.status === "done" && hasOutput && !isExpired && !isDemoPoster(job);
  const canCompare =
    isDone && job.kind === "image" && parentNode?.kind === "image" && Boolean(parentNode.thumbUrl);
  const inputTarget = isDone ? versionInputTarget(catalog, job.kind, "input") : null;
  const animateTarget = isDone && job.kind === "image" ? versionInputTarget(catalog, job.kind, "animate") : null;
  const workTools = isDone ? toolsForWork(job.kind) : [];
  // Brze akcije (K16) bez onih koje detalj već ima kao veliko dugme („Koristi kao ulaz", „Animiraj").
  const extraQuickActions = quickActions.filter(
    (action) => !(action.id === "izmeni" && inputTarget) && !(action.id === "animiraj" && animateTarget),
  );
  // Slika bez opisa (S45): „Napravi sličnu" vodi u „Kako je ovo napravljeno?" sa ovom slikom.
  const describeLink = prompt ? undefined : quickActions.find((action) => action.id === "slicna");
  // K12: razlaganje se otvara u editoru slojeva, mreža 3×3 se seče u 9 uglova - i DEMO rad, da se vidi tok.
  const followUpTool =
    job.status === "done" && hasOutput && !isExpired && job.kind === "image"
      ? job.inputMode === "layerize"
        ? "slika.slojevi"
        : isAnglesGridPrompt(jobPrompt(job.params))
          ? "slika.uglovi"
          : isStickerSheetPrompt(jobPrompt(job.params))
            ? "slika.nalepnice"
            : null
      : null;

  // Indeks u listi za levo/desno navigaciju
  const currentIndex = jobs.findIndex((j) => j._id === job._id);
  const prevJob = currentIndex > 0 ? jobs[currentIndex - 1] : null;
  const nextJob = currentIndex >= 0 && currentIndex < jobs.length - 1 ? jobs[currentIndex + 1] : null;

  // Pun ekran je pravi modal (`aria-modal` ispod), pa mu treba i pocetni fokus,
  // Tab zamka, zakljucan skrol strane i vracanje fokusa - sve to daje
  // `useModalFocus`, koji preuzima i Escape. Ovde ostaju samo strelice.
  const dialogRef = useModalFocus<HTMLDivElement>(true, onClose);

  // Tastaturna navigacija (ArrowLeft, ArrowRight)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" && prevJob) {
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
  }, [onSelectJob, prevJob, nextJob]);

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

  // Rad lokalnog alata (K04): nema model iz kataloga, pa se ime i oznaka čitaju iz registra
  // alata, a „Generiši ponovo" se ne nudi (išlo bi zamenskim modelom i trošilo kredite).
  const localTool = toolOfJob(job);

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

  // „Usavrši" (K07, S4/V3): rad je proba jeftinog modela -> konačna verzija skupljim.
  // Proba kao referenca traži pravu sliku (DEMO SVG je ne može biti); isti model
  // ponavlja ulaze, pa radi i nad probnim izlazom.
  const refinePair =
    !localTool && job.status === "done" && hasOutput && !isExpired
      ? refinePairForJob({ modelSlug: job.modelSlug, params: parsedParams, ...(jobDetail?.inputMode ? { inputMode: jobDetail.inputMode } : {}) })
      : null;
  const refineModel = refinePair ? catalog.find((model) => model.slug === refinePair.refine.modelSlug) : undefined;
  const refineOrder =
    refinePair && refineModel
      ? buildRefineOrder(
          { modelSlug: job.modelSlug, params: parsedParams, ...(jobDetail?.inputMode ? { inputMode: jobDetail.inputMode } : {}) },
          refinePair,
          refineModel,
        )
      : null;
  const carriedInputs = useMemo(() => {
    const carried: Record<string, string[]> = {};
    for (const input of jobDetail?.inputs ?? []) carried[input.slot] = [...(carried[input.slot] ?? []), input.storageId];
    return carried;
  }, [jobDetail]);
  const canRefine =
    refineOrder !== null &&
    refineModel !== undefined &&
    (refineOrder.inputs !== "reference" || !isDemoPoster(job)) &&
    (refineOrder.inputs !== "carry" || jobDetail !== undefined);
  const refineCredits =
    canRefine && refineOrder && refineModel
      ? orderCredits(
          refineModel,
          refineOrder,
          refineOrder.inputs === "reference" ? 1 : refineOrder.inputs === "carry" ? (carriedInputs.image?.length ?? 0) : 0,
        )
      : null;

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-media-detail-title"
      tabIndex={-1}
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
            <h2 id="studio-media-detail-title" className="truncate text-base font-black text-ink sm:text-lg">
              {prompt ||
                localTool?.title[locale] ||
                (jobModel ? modelLabel(jobModel, locale) : locale === "sr" ? "Detalj medija" : "Media detail")}
            </h2>
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-muted">
              <span>{job.kind}</span>
              <span>·</span>
              <span>
                {localTool ? CREA_TOOL_COPY.galleryLabel[locale] : jobModel ? modelLabel(jobModel, locale) : job.modelSlug}
              </span>
            </div>
          </div>
        </div>

        {/* Akcije sa desne strane */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Omiljeno */}
          <button
            type="button"
            onClick={() => {
              setFavoriteOverride(!isFavorited);
              void toggleFavorite({ jobId: job._id as Id<"generationJobs"> })
                .then((value) => setFavoriteOverride(value))
                .catch(() => setFavoriteOverride(null));
            }}
            aria-pressed={isFavorited}
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
      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        busy={isDeleting}
        destructive
        title={t.confirmDeleteTitle}
        description={t.confirmDeleteBody}
        confirmLabel={t.deleteConfirm}
        cancelLabel={t.cancel}
        closeLabel={t.close}
      >
        {deleteError ? <p role="alert" className="text-xs font-black text-red-700">{deleteError}</p> : null}
      </ConfirmDialog>

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
              {/* Ekran čekanja (K25, U3): olovka crta skicu, koraci, mesto u redu i procena. */}
              {isWorking ? (
                <CreaWaitScreen
                  job={job}
                  locale={locale}
                  estimate={estimateWait(job, jobs)}
                  place={queuePlace(job, jobs)}
                  prompt={prompt}
                  size="stage"
                  animated={!crea.isReduced}
                />
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
                  {localTool ? null : (
                    <button
                      type="button"
                      onClick={() => {
                        if (jobDetail && jobModel) {
                          onGenerate(
                            {
                              params: parsedParams,
                              inputMode: jobDetail.inputMode ?? "text",
                              inputs: {},
                              parentJobId: job._id as Id<"generationJobs">,
                              derivation: "regeneracija",
                            },
                            jobModel,
                          );
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
                  )}
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
                <CreaReveal
                  style={revealStyleFor(job.kind)}
                  active={arrived}
                  ready
                  caption={prompt || localTool?.title[locale] || ""}
                  locale={locale}
                  motion={crea}
                  className="flex size-full items-center justify-center"
                >
                  {canCompare && comparing && parentNode?.thumbUrl ? (
                    <BeforeAfter
                      beforeUrl={parentNode.thumbUrl}
                      afterUrl={job.outputUrl as string}
                      beforeLabel={vc.before[locale]}
                      afterLabel={vc.after[locale]}
                      label={vc.compareLabel[locale]}
                    />
                  ) : null}

                  {showAsImage && !(canCompare && comparing) ? (
                    <div
                      className={cn(
                        "relative flex size-full items-center justify-center p-2",
                        isZoomed ? "max-h-none" : "max-h-[580px]",
                      )}
                      onClick={() => setIsZoomed((prev) => !prev)}
                    >
                      <img
                        src={job.outputUrl as string}
                        alt={prompt || t.untitledWork}
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
                </CreaReveal>
              ) : null}

              {/* Transkript (K21): `stt` rad nema fajl - tekst i SRT/VTT iz `creaTranscripts`. */}
              {isTranscriptJob(job) ? (
                <div className="flex size-full min-h-[240px] items-center justify-center p-4">
                  <TranscriptPanel jobId={job._id as Id<"generationJobs">} locale={locale} />
                </div>
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

          {/* Dok čekaš, nauči (K25, U6) - i u punom prikazu. */}
          {isWorking ? (
            <LearnCard locale={locale} area={tipAreaFor(job.kind)} seed={job._id} motion={crea} className="w-full max-w-[780px]" />
          ) : null}

          {/* VERZIJE (K05): pre/posle i „Vrati" odmah ispod medija */}
          {canCompare || parentNode ? (
            <div className="flex w-full max-w-[780px] flex-wrap items-center gap-2">
              {canCompare ? (
                <button
                  type="button"
                  onClick={() => setComparing((prev) => !prev)}
                  aria-pressed={comparing}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink px-4 text-sm font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                    comparing ? "bg-yellow" : "bg-paper-strong",
                  )}
                >
                  <SplitSquareHorizontal aria-hidden="true" className="size-4" />
                  {comparing ? vc.compareOff[locale] : vc.compare[locale]}
                </button>
              ) : null}
              {parentNode ? (
                <button
                  type="button"
                  onClick={() => onOpenVersion(parentNode._id, true)}
                  title={vc.restoreTitle[locale]}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <Undo2 aria-hidden="true" className="size-4" />
                  {vc.restore[locale]}
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Zajednica (K27, G8/G3): objava u galeriju i prijava na izazov - samo dok je galerija upaljena */}
          {isDone ? <CreaSharePanel locale={locale} jobId={job._id as Id<"generationJobs">} createdAt={job.createdAt} /> : null}

          {/* „Vrati" je otvorio ovu verziju: nastavi od nje */}
          {restored && inputTarget ? (
            <div
              role="status"
              className="surface-card flex w-full max-w-[780px] flex-wrap items-center gap-3 border-2 border-ink bg-paper-strong p-4 shadow-[4px_4px_0_0_var(--shadow-hard-14)]"
            >
              <Undo2 aria-hidden="true" className="size-5 shrink-0 text-ink" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-ink">{vc.restoredTitle[locale]}</p>
                <p className="text-xs font-semibold text-muted">{vc.restoredBody[locale]}</p>
              </div>
              <button
                type="button"
                onClick={() => onUseAsInput(job, "input")}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink shadow-[3px_3px_0_0_var(--ink)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <Sparkles aria-hidden="true" className="size-4" />
                {vc.useAsInput[locale]}
              </button>
            </div>
          ) : null}

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
              {/* Stablo verzija (K05) - samo kad rad ima bar jednu drugu verziju */}
              {versionTree && versionNodes.length > 1 ? (
                <VersionStrip
                  locale={locale}
                  nodes={versionNodes}
                  currentId={job._id}
                  truncated={versionTree.truncated}
                  onOpen={(id) => {
                    if (id !== job._id) onOpenVersion(id, false);
                  }}
                />
              ) : null}

              {/* „Kako je ovo napravljeno?" (K16, S45): model, opis po delovima, podešavanja, cena */}
              <h4 className="border-t border-line pt-3 text-sm font-black text-ink">{CREA_LIBRARY_COPY.howTitle[locale]}</h4>

              {/* Model */}
              <div>
                <span className="block text-[11px] font-black uppercase tracking-wide text-muted">{t.model}</span>
                <div className="mt-1.5 flex items-center gap-2.5 surface-inset border border-line bg-paper p-2.5">
                  {localTool ? (
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-black text-ink">{localTool.title[locale]}</span>
                      <span className="block text-[11px] font-bold text-muted">{CREA_TOOL_COPY.galleryLabel[locale]}</span>
                    </div>
                  ) : null}
                  {localTool ? null : jobModel ? (
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
                {/* Crea K23 (A21): „Sigurno za objavu" za zvuk - odakle je i sme li na mrežu. */}
                {job.kind === "audio" ? <LicenseBadge tag={licenseForJob(job)} locale={locale} detail className="mt-2" /> : null}
              </div>

              {/* Prompt, obojen po delovima (Ko · Šta · Stil · Svetlo · Kamera) */}
              {prompt ? (
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-wide text-muted">{t.prompt}</span>
                  <div className="surface-inset mt-1.5 border border-line bg-paper p-3">
                    <PromptSegmentsView locale={locale} prompt={prompt} legendLabel={CREA_LIBRARY_COPY.howLegend[locale]} />
                  </div>
                </div>
              ) : describeLink ? (
                <div className="surface-inset border border-line bg-paper p-3">
                  <p className="text-xs font-bold text-muted">{CREA_LIBRARY_COPY.howNoPrompt[locale]}</p>
                  <Link
                    href={describeLink.href}
                    scroll={false}
                    className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--ink)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <Sparkles aria-hidden="true" className="size-3.5" />
                    {CREA_LIBRARY_COPY.howDescribe[locale]}
                  </Link>
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

              {/* Cena */}
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-black uppercase tracking-wide text-muted">{CREA_LIBRARY_COPY.howCost[locale]}</span>
                <span className="font-mono text-xs font-black text-ink">
                  {job.creditCost === 0
                    ? localTool
                      ? CREA_LIBRARY_COPY.howFreeLocal[locale]
                      : CREA_LIBRARY_COPY.free[locale]
                    : formatCreditsLong(job.creditCost, locale)}
                </span>
              </div>

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
                        className="surface-media aspect-square overflow-hidden border border-line bg-paper"
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

            {/* Izlaz kao ulaz (K05): u composer, u video ili u besplatan alat; „Usavrši" probu (K07) */}
            {inputTarget || animateTarget || workTools.length > 0 || followUpTool || extraQuickActions.length > 0 || (canRefine && refineCredits !== null) ? (
              <div className="mt-4 space-y-2 border-t-2 border-ink/15 pt-3">
                {followUpTool ? (
                  <button
                    type="button"
                    onClick={() => onOpenTool(job, followUpTool)}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow py-2 text-xs font-black text-ink shadow-[3px_3px_0_0_var(--ink)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    {followUpTool === "slika.slojevi" ? (
                      <Layers aria-hidden="true" className="size-3.5" />
                    ) : (
                      <Grid3x3 aria-hidden="true" className="size-3.5" />
                    )}
                    <span>
                      {followUpTool === "slika.slojevi"
                        ? vc.openLayers[locale]
                        : followUpTool === "slika.nalepnice"
                          ? CREA_STICKERS_COPY.cut[locale]
                          : vc.cutAngles[locale]}
                    </span>
                  </button>
                ) : null}
                {canRefine && refineOrder && refineModel && refineCredits !== null ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onRefine(job, refineOrder, refineModel, carriedInputs)}
                    title={fillCopy(CREA_PICK_COPY.refineTitle[locale], { model: modelLabel(refineModel, locale) })}
                    aria-label={`${CREA_PICK_COPY.refine[locale]}: ${modelLabel(refineModel, locale)}, ${formatCreditsLong(refineCredits, locale)}`}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow py-2 text-xs font-black text-ink shadow-[3px_3px_0_0_var(--ink)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <FlaskConical aria-hidden="true" className="size-3.5" />
                    <span>{`${CREA_PICK_COPY.refine[locale]} · ${modelLabel(refineModel, locale)}`}</span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <span>{refineCredits}</span>
                      <CreditIcon className="size-3.5" />
                    </span>
                  </button>
                ) : null}
                {inputTarget ? (
                  <button
                    type="button"
                    onClick={() => onUseAsInput(job, "input")}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-paper py-2 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <Sparkles aria-hidden="true" className="size-3.5" />
                    <span>{vc.useAsInput[locale]}</span>
                  </button>
                ) : null}
                {animateTarget ? (
                  <button
                    type="button"
                    onClick={() => onUseAsInput(job, "animate")}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-paper py-2 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <Clapperboard aria-hidden="true" className="size-3.5" />
                    <span>{vc.animate[locale]}</span>
                  </button>
                ) : null}
                {extraQuickActions.length > 0 ? (
                  <div>
                    <span className="block text-[11px] font-black uppercase tracking-wide text-muted">{CREA_LIBRARY_COPY.quickMenu[locale]}</span>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {extraQuickActions.map((action) => {
                        const Icon = QUICK_ACTION_ICONS[action.id];
                        return (
                          <Link
                            key={action.id}
                            href={action.href}
                            scroll={false}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-paper px-3 text-xs font-black text-ink transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
                          >
                            <Icon aria-hidden="true" className="size-3.5" />
                            {action.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {workTools.length > 0 ? (
                  <div>
                    <span className="block text-[11px] font-black uppercase tracking-wide text-muted">{vc.tools[locale]}</span>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {workTools.map((tool) => (
                        <button
                          key={tool.id}
                          type="button"
                          onClick={() => onOpenTool(job, tool.id)}
                          className="inline-flex min-h-11 items-center rounded-full border border-line bg-paper px-3 text-xs font-black text-ink transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
                        >
                          {tool.title[locale]}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
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
            // Nov rad iz detalja je verzija OVOG rada (K05): „Napravi ponovo" sa izmenama.
            onGenerate={(payload, model) =>
              onGenerate(
                { ...payload, parentJobId: job._id as Id<"generationJobs">, ...(localTool ? {} : { derivation: "regeneracija" }) },
                model,
              )
            }
          />
        </div>
      </footer>
    </motion.div>
  );
}
