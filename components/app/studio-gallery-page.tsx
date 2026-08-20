"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { usePaginatedQuery, useMutation, useQuery } from "convex/react";
import { CheckSquare, Download, Eye, Loader2, RefreshCw, Sparkles, Square, Trash2, Wand2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Panel, SectionHeader, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ParamControl } from "@/convex/studioParamSpec";
import { withLocale, type Locale } from "@/lib/i18n";
import { isExpiredOutput, jobPrompt, jobStatusText } from "@/lib/studio-form";
import { modelLabel, parseStudioModel, type StudioModel, type StudioModelRow } from "@/lib/studio-models";
import { slotLabel } from "@/lib/studio-slots";
import {
  DATE_RANGE_LABELS,
  DATE_RANGE_PRESETS,
  dateRangeCutoff,
  expiryBadgeDays,
  expiryBadgeText,
  filterJobOwners,
  inputsLabel,
  jobParamSummary,
  regenerateHref,
  GALLERY_KIND_LABELS,
  GALLERY_KINDS,
  GALLERY_SCOPE_LABELS,
  GALLERY_SCOPES,
  isDownloadable,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  regenerateButtonLabel,
  REVEAL_AUDIT_NOTE,
  REVEAL_DETAILS,
  REVEAL_FAILED,
  STUDIO_PROVIDER_LABELS,
  STUDIO_PROVIDERS,
  type DateRangePreset,
  type GalleryKind,
  type GalleryScope,
  type JobStatus,
  type StudioProvider,
} from "@/lib/studio-gallery";
import { deleteJobErrorMessage, GALLERY_NO_GENERATIONS, GALLERY_NO_MATCHES } from "@/lib/studio-messages";

const PAGE_SIZE = 12;

const CHIP =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full border-2 border-ink px-3.5 py-1.5 text-xs font-black transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const ACTION =
  "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-xs font-extrabold transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50";

type InputThumbs = { items: Array<{ slot: string; storageId: string; url: string | null }>; total: number };

type GalleryJob = {
  _id: Id<"generationJobs">;
  modelSlug: string;
  kind: "image" | "video" | "audio";
  // U režimu "Svi korisnici" ovih dvoje NEMA (X4): moderacijski red iz
  // `listAllJobs` ne nosi ni prompt ni potpisane URL-ove tuđih fajlova, a
  // adminu ih na klik daje `revealJobDetail`, koja pristup i beleži.
  params?: string;
  status: string;
  creditCost: number;
  outputUrl: string | null;
  // Ulazi kojima je posao naručen - bez njih "Generiši ponovo" kod modela sa
  // slikama nema smisla, jer se ne vidi šta je bio ulaz (S7).
  inputMode?: string;
  inputThumbs?: InputThumbs;
  error?: string;
  isMock: boolean;
  expiresAt?: number;
  createdAt: number;
  // Samo u režimu "Svi korisnici" (`listAllJobs`); obična galerija ih nema.
  ownerEmail?: string;
  provider?: string;
};

/** Sličice ulaza. Video nikad kao goli `<video src>` - `preload="metadata"` sa `#t=0.1`. */
function InputThumbs({ inputThumbs, locale }: { inputThumbs: InputThumbs | undefined; locale: Locale }) {
  const thumbs = inputThumbs?.items ?? [];
  if (thumbs.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wide text-muted">
        {inputsLabel(thumbs.length, inputThumbs?.total ?? thumbs.length, locale)}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {thumbs.map((thumb, index) => (
          <span
            key={thumb.storageId}
            title={slotLabel(thumb.slot, locale)}
            className="surface-media relative size-11 overflow-hidden border-2 border-ink bg-paper"
          >
            {thumb.url === null ? (
              <span className="grid h-full place-items-center text-[9px] font-black text-muted">
                {index + 1}
              </span>
            ) : thumb.slot === "video" ? (
              <video preload="metadata" muted playsInline className="h-full w-full object-cover" src={`${thumb.url}#t=0.1`} />
            ) : thumb.slot === "audio" ? (
              <span className="grid h-full place-items-center text-[9px] font-black text-muted">
                {locale === "sr" ? "zvuk" : "audio"}
              </span>
            ) : (
              <Image
                src={thumb.url}
                alt={slotLabel(thumb.slot, locale)}
                fill
                unoptimized
                sizes="44px"
                className="object-cover"
              />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatDate(timestamp: number, locale: Locale) {
  return new Date(timestamp).toLocaleDateString(locale === "sr" ? "sr-RS" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function GalleryCard({
  job,
  locale,
  modelLabel,
  paramSpec,
  now,
  studioHref,
  selected,
  onToggleSelect,
  onDelete,
  owner,
  onReveal,
}: {
  job: GalleryJob;
  locale: Locale;
  modelLabel: string;
  paramSpec: ParamControl[] | undefined;
  now: number;
  studioHref: string;
  selected: boolean;
  onToggleSelect: (jobId: Id<"generationJobs">) => void;
  onDelete: (jobId: Id<"generationJobs">) => Promise<unknown>;
  /**
   * Vlasnik posla - postoji samo u režimu "Svi korisnici". Tuđi posao se ne
   * briše i ne regeneriše iz galerije (`deleteJob` i `getJobForRegenerate`
   * ionako traže vlasnika), pa kartica tada nosi podatke umesto akcija.
   */
  owner?: { email: string; provider: string };
  /**
   * Otkrivanje prompta i ulaznih sličica JEDNOG tuđeg posla (X4). Postoji samo
   * adminu; moderator dugme ne dobija, a i da ga pozove, `revealJobDetail` bi
   * ga odbila na serveru.
   */
  onReveal?: (jobId: Id<"generationJobs">) => Promise<{ params: string; inputThumbs: InputThumbs }>;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ params: string; inputThumbs: InputThumbs } | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  // Na tuđoj kartici NIŠTA privatno ne stoji dok admin svesno ne klikne - i
  // tada se crta ono što je vratila `revealJobDetail`, ista pozivnica koja je
  // upisala red u `studioAuditLog`. Sopstvena galerija ide starim putem.
  const detail = owner ? revealed : { params: job.params ?? "", inputThumbs: job.inputThumbs };
  const prompt = jobPrompt(detail?.params ?? "");
  const paramSummary = jobParamSummary(detail?.params ?? "", paramSpec, locale);
  const expired = isExpiredOutput(job);
  const badgeDays = expiryBadgeDays(job, now);
  const downloadable = isDownloadable(job);
  const inFlight = job.status === "reserved" || job.status === "running";
  // Playground čita ceo posao po ID-ju i vraća MODEL, REŽIM, PARAMETRE I ULAZE
  // u formu (S7). Metapodatak posla živi i posle isteka fajla, pa link radi i
  // na isteklom redu.
  const regenerateLink = regenerateHref(studioHref, job._id);

  async function handleDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(job._id);
    } catch (thrown) {
      setDeleteError(deleteJobErrorMessage(thrown instanceof Error ? thrown.message : String(thrown), locale));
      setConfirmingDelete(false);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="surface-card flex flex-col gap-3 border-2 border-ink bg-white p-3">
      <div className="surface-media relative aspect-square w-full overflow-hidden border-2 border-ink bg-paper">
        {downloadable && !owner ? (
          <label className="absolute left-2 top-2 z-10 grid size-7 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(job._id)}
              className="sr-only"
              aria-label={locale === "sr" ? "Izaberi za preuzimanje" : "Select for download"}
            />
            {selected ? <CheckSquare className="size-4 text-ink" /> : <Square className="size-4 text-muted" />}
          </label>
        ) : null}

        {job.isMock ? (
          <span className="absolute right-2 top-2 z-10 rounded-full border-2 border-ink bg-white px-2 py-0.5 text-[10px] font-black uppercase text-ink">
            DEMO
          </span>
        ) : null}

        {downloadable && job.kind === "image" ? (
          <Image
            src={job.outputUrl as string}
            alt={prompt || job.modelSlug}
            fill
            unoptimized
            sizes="(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
            className="object-cover"
          />
        ) : downloadable && job.kind === "video" ? (
          // Nikad `<video src>` bez ovoga u mreži - `preload="metadata"` sa
          // `#t=0.1` fragmentom povuče samo zaglavlje i prikaže prvi kadar;
          // ceo fajl se učitava tek kad korisnik klikne play.
          <video
            preload="metadata"
            controls
            muted
            playsInline
            className="h-full w-full object-cover"
            src={`${job.outputUrl}#t=0.1`}
          />
        ) : downloadable && job.kind === "audio" ? (
          <div className="grid h-full place-items-center p-4">
            <audio controls src={job.outputUrl as string} className="w-full" />
          </div>
        ) : expired ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="line-clamp-3 text-sm font-bold text-muted">{prompt || job.modelSlug}</p>
            {owner ? null : (
              <Link href={regenerateLink} className={cn(ACTION, "border-ink bg-yellow text-ink hover:-translate-y-0.5")}>
                <Wand2 className="size-3.5" />
                {regenerateButtonLabel(job.creditCost, locale)}
              </Link>
            )}
          </div>
        ) : (
          <div className="grid h-full place-items-center p-4 text-center">
            <p className="text-sm font-black text-muted">{jobStatusText(job, locale)}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border-2 border-ink bg-yellow px-2.5 py-0.5 text-[11px] font-black text-ink">
          {modelLabel}
        </span>
        <span className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-[11px] font-black text-ink">
          {job.creditCost} {locale === "sr" ? "kr" : "cr"}
        </span>
        {badgeDays !== null ? (
          <span className="rounded-full border-2 border-ink bg-amber-100 px-2.5 py-0.5 text-[11px] font-black text-amber-900">
            {expiryBadgeText(badgeDays, locale)}
          </span>
        ) : null}
        {owner ? (
          <>
            <span className="rounded-full border-2 border-ink bg-paper px-2.5 py-0.5 text-[11px] font-black text-ink">
              {STUDIO_PROVIDER_LABELS[owner.provider as StudioProvider] ?? owner.provider}
            </span>
            <span className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-[11px] font-black text-ink">
              {JOB_STATUS_LABELS[job.status as JobStatus]?.[locale] ?? job.status}
            </span>
          </>
        ) : null}
      </div>

      {owner ? (
        <p className="truncate text-[11px] font-black text-ink" title={owner.email}>
          {owner.email}
        </p>
      ) : null}

      {prompt ? <p className="line-clamp-2 text-xs font-bold text-muted">{prompt}</p> : null}

      <InputThumbs inputThumbs={detail?.inputThumbs} locale={locale} />

      {/* Tiha napomena stoji UZ dugme, pre klika - posle klika je kasno. */}
      {owner && onReveal && revealed === null ? (
        <div>
          <button
            type="button"
            disabled={isRevealing}
            onClick={async () => {
              setIsRevealing(true);
              setRevealError(null);
              try {
                setRevealed(await onReveal(job._id));
              } catch {
                setRevealError(REVEAL_FAILED[locale]);
              } finally {
                setIsRevealing(false);
              }
            }}
            className={cn(ACTION, "border-ink bg-white text-ink hover:-translate-y-0.5")}
          >
            {isRevealing ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
            {REVEAL_DETAILS[locale]}
          </button>
          <p className="mt-1 text-[10px] font-bold text-muted">{REVEAL_AUDIT_NOTE[locale]}</p>
          {revealError ? <p className="mt-1 text-[11px] font-black text-red-700">{revealError}</p> : null}
        </div>
      ) : null}

      {/* Parametri kojima je posao naručen - bez njih kartica ne kaže zašto su
          dve iste generacije koštale različito. */}
      {paramSummary ? <p className="line-clamp-2 text-[11px] font-bold text-muted">{paramSummary}</p> : null}
      <p className="text-[11px] font-bold text-muted">{formatDate(job.createdAt, locale)}</p>

      {confirmingDelete ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-black text-ink">{locale === "sr" ? "Obrisati?" : "Delete?"}</p>
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleDelete}
            className={cn(ACTION, "border-ink bg-ink text-white")}
          >
            {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {locale === "sr" ? "Da, obriši" : "Yes, delete"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            className={cn(ACTION, "border-ink bg-white text-ink")}
          >
            {locale === "sr" ? "Otkaži" : "Cancel"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {downloadable ? (
            <a
              href={job.outputUrl as string}
              download
              target="_blank"
              rel="noreferrer"
              className={cn(ACTION, "border-ink bg-white text-ink hover:-translate-y-0.5")}
            >
              <Download className="size-3.5" />
              {locale === "sr" ? "Preuzmi" : "Download"}
            </a>
          ) : null}
          {!expired && !owner ? (
            <Link href={regenerateLink} className={cn(ACTION, "border-ink bg-white text-ink hover:-translate-y-0.5")}>
              <RefreshCw className="size-3.5" />
              {locale === "sr" ? "Generiši ponovo" : "Generate again"}
            </Link>
          ) : null}
          {owner ? null : (
            <button
              type="button"
              disabled={inFlight}
              title={inFlight ? (locale === "sr" ? "Sačekaj da se posao završi." : "Wait for the job to finish.") : undefined}
              onClick={() => setConfirmingDelete(true)}
              className={cn(ACTION, "ml-auto border-ink bg-white text-ink hover:-translate-y-0.5")}
            >
              <Trash2 className="size-3.5" />
              {locale === "sr" ? "Obriši" : "Delete"}
            </button>
          )}
        </div>
      )}
      {deleteError ? <p className="text-xs font-black text-red-700">{deleteError}</p> : null}
    </div>
  );
}

/**
 * Beskonacan skrol: kad se dno liste priblizi ekranu, ucita se sledeca
 * stranica. Dugme ispod OSTAJE - `IntersectionObserver` ne postoji na svakom
 * uredjaju, a i sa tastature se do sledece stranice mora stici klikom.
 */
function useInfiniteScroll(enabled: boolean, loadMore: () => void) {
  const sentinel = useRef<HTMLDivElement | null>(null);
  const onVisible = useEffectEvent(() => loadMore());

  useEffect(() => {
    const node = sentinel.current;
    if (!enabled || !node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onVisible();
      },
      // Sledeca stranica krece pola ekrana pre dna, da se lista ne trzne.
      { rootMargin: "50% 0px" },
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, [enabled]);

  return sentinel;
}

export function StudioGalleryPage({ locale }: { locale: Locale }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  // Prozor za "ističe za N dana" i za preset opsege datuma - zamrznut na
  // prvom renderu, isti obrazac kao `credits-page.tsx` (`Date.now()` u telu
  // komponente nije dozvoljen, `react-hooks/purity`).
  const [now] = useState(() => Date.now());
  const [kindFilter, setKindFilter] = useState<GalleryKind | null>(null);
  const [modelFilter, setModelFilter] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateRangePreset>("all");
  const [selected, setSelected] = useState<Set<Id<"generationJobs">>>(new Set());
  // Režim "Svi korisnici" i njegova tri filtera (W1). Odvojeni su od filtera
  // obične galerije jer `listAllJobs` prima druge argumente - vrsta, model i
  // datum su pitanja jednog naloga, a vlasnik, status i provajder su pitanja
  // cele platforme.
  const [scope, setScope] = useState<GalleryScope>("mine");
  const [ownerFilter, setOwnerFilter] = useState<Id<"users"> | null>(null);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatus | null>(null);
  const [providerFilter, setProviderFilter] = useState<StudioProvider | null>(null);

  // Uloga stiže sa servera i ovde samo crta prekidač; `listAllJobs` je
  // proverava ponovo, pa sakriveno dugme nije jedina brana.
  const studioState = useQuery(api.studio.getStudioState, isAuthenticated ? {} : "skip");
  const isStaff = studioState?.isStaff === true;
  // Dugme "Prikaži detalje" na tuđoj kartici je samo za admina; `revealJobDetail`
  // istu ulogu traži ponovo, na serveru.
  const isStudioAdmin = studioState?.isStudioAdmin === true;
  const allScope = isStaff && scope === "all";

  const models = useQuery(api.studioModels.listModels, isAuthenticated ? {} : "skip");
  const myJobs = usePaginatedQuery(
    api.studio.listMyJobs,
    isAuthenticated && !allScope
      ? {
          ...(kindFilter ? { kind: kindFilter } : {}),
          ...(modelFilter ? { modelSlug: modelFilter } : {}),
          ...(dateFilter !== "all" ? { createdAfter: dateRangeCutoff(dateFilter, now) } : {}),
        }
      : "skip",
    { initialNumItems: PAGE_SIZE },
  );
  const allJobs = usePaginatedQuery(
    api.studio.listAllJobs,
    allScope
      ? {
          ...(ownerFilter ? { userId: ownerFilter } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(providerFilter ? { provider: providerFilter } : {}),
        }
      : "skip",
    { initialNumItems: PAGE_SIZE },
  );
  const owners = useQuery(api.studio.listJobOwners, allScope ? {} : "skip");
  const jobs = allScope ? allJobs : myJobs;
  const deleteJob = useMutation(api.studio.deleteJob);
  const revealJobDetail = useMutation(api.studio.revealJobDetail);

  const studioHref = withLocale(locale, "/app/studio");
  // Katalog v4 se parsira jednom: kartica iz njega uzima i ime modela i
  // `paramSpec` po kojem ispisuje podešavanja.
  const catalogModels = ((models ?? []) as StudioModelRow[])
    .map((row) => parseStudioModel(row))
    .filter((model): model is StudioModel => model !== null);
  const modelBySlug = new Map(catalogModels.map((model) => [model.slug, model]));
  const jobRows = jobs.results as unknown as GalleryJob[];
  const filtersActive = allScope
    ? ownerFilter !== null || statusFilter !== null || providerFilter !== null
    : kindFilter !== null || modelFilter !== null || dateFilter !== "all";
  const ownerOptions = filterJobOwners(owners ?? [], ownerSearch);

  const sentinelRef = useInfiniteScroll(jobs.status === "CanLoadMore", () => jobs.loadMore(PAGE_SIZE));

  function toggleSelect(jobId: Id<"generationJobs">) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  function resetFilters() {
    setKindFilter(null);
    setModelFilter(null);
    setDateFilter("all");
    setOwnerFilter(null);
    setOwnerSearch("");
    setStatusFilter(null);
    setProviderFilter(null);
  }

  // Izbor za preuzimanje se prazni pri promeni režima: tuđi posao nema
  // kvadratić, pa bi izbor napravljen u "Samo moji" ostao nevidljiv i aktivan.
  function switchScope(next: GalleryScope) {
    setScope(next);
    setSelected(new Set());
  }

  // ZIP se pravi u browseru (fflate) po specifikaciji - ali `fflate` nije
  // zavisnost ovog repoa i uvođenje jedne samo za ovaj korak je preko onoga
  // što zadatak traži (STUDIO-PLAN "Simplicity First"). Umesto toga:
  // sekvencijalno preuzimanje, isti obrazac kao pojedinačno dugme "Preuzmi"
  // (nov tab - Convex storage je druga adresa, pa `download` sam po sebi ne
  // primorava snimanje van istog porekla). Zabeleženo kao ODLUKA u progress fajlu.
  function downloadSelected() {
    for (const job of jobRows) {
      if (selected.has(job._id) && job.outputUrl) {
        window.open(job.outputUrl, "_blank", "noopener,noreferrer");
      }
    }
    setSelected(new Set());
  }

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <SectionHeader
        title={locale === "sr" ? "Galerija" : "Gallery"}
        body={
          locale === "sr"
            ? "Sve tvoje generacije na jednom mestu."
            : "All your generations in one place."
        }
      />
      <Link
        href={studioHref}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-ink bg-white px-5 py-2.5 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5"
      >
        <Wand2 className="size-4" />
        {locale === "sr" ? "Nazad u Studio" : "Back to Studio"}
      </Link>
    </div>
  );

  if (authLoading) {
    return (
      <div className="space-y-6">
        {header}
        <Panel className="flex min-h-32 items-center justify-center p-6">
          <Loader2 className="size-5 animate-spin text-muted" />
        </Panel>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        {header}
        <Panel className="p-6">
          <p className="text-base font-bold text-muted">
            {locale === "sr" ? "Prijavi se da bi video svoju galeriju." : "Sign in to see your gallery."}
          </p>
          <Link
            href={withLocale(locale, "/sign-in")}
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-ink px-5 py-2.5 text-sm font-extrabold text-white shadow-[4px_4px_0_0_#f4be30] transition hover:-translate-y-0.5"
          >
            {locale === "sr" ? "Prijavi se" : "Sign in"}
          </Link>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {/* Filteri: jedan red rounded-full čipova (STUDIO-PLAN A13). */}
      <Panel className="p-4">
        {/* Prekidač vidi samo admin i moderator; obična putanja je netaknuta. */}
        {isStaff ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {GALLERY_SCOPES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => switchScope(option)}
                aria-pressed={scope === option}
                className={cn(CHIP, scope === option ? "bg-yellow text-ink" : "bg-white text-ink hover:-translate-y-0.5")}
              >
                {GALLERY_SCOPE_LABELS[option][locale]}
              </button>
            ))}
          </div>
        ) : null}

        {allScope ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={ownerSearch}
                onChange={(event) => setOwnerSearch(event.target.value)}
                placeholder={locale === "sr" ? "Pretraži vlasnike" : "Search owners"}
                aria-label={locale === "sr" ? "Pretraži korisnike" : "Search users"}
                className="surface-inset min-h-9 border-2 border-ink bg-white px-3 py-1.5 text-xs font-bold text-ink"
              />
              <select
                value={ownerFilter ?? ""}
                onChange={(event) =>
                  setOwnerFilter(event.target.value === "" ? null : (event.target.value as Id<"users">))
                }
                aria-label={locale === "sr" ? "Filter po korisniku" : "Filter by user"}
                className="surface-inset min-h-9 border-2 border-ink bg-white px-3 py-1.5 text-xs font-bold text-ink"
              >
                <option value="">{locale === "sr" ? "Svi korisnici" : "All users"}</option>
                {ownerOptions.map((owner) => (
                  <option key={owner.userId} value={owner.userId}>
                    {`${owner.label} (${owner.jobCount})`}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter(null)}
                aria-pressed={statusFilter === null}
                className={cn(CHIP, statusFilter === null ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5")}
              >
                {locale === "sr" ? "Svi statusi" : "All statuses"}
              </button>
              {JOB_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  aria-pressed={statusFilter === status}
                  className={cn(CHIP, statusFilter === status ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5")}
                >
                  {JOB_STATUS_LABELS[status][locale]}
                </button>
              ))}

              <span className="mx-1 h-6 w-px bg-ink/15" aria-hidden="true" />

              <button
                type="button"
                onClick={() => setProviderFilter(null)}
                aria-pressed={providerFilter === null}
                className={cn(CHIP, providerFilter === null ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5")}
              >
                {locale === "sr" ? "Svi provajderi" : "All providers"}
              </button>
              {STUDIO_PROVIDERS.map((provider) => (
                <button
                  key={provider}
                  type="button"
                  onClick={() => setProviderFilter(provider)}
                  aria-pressed={providerFilter === provider}
                  className={cn(CHIP, providerFilter === provider ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5")}
                >
                  {STUDIO_PROVIDER_LABELS[provider]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setKindFilter(null)}
              aria-pressed={kindFilter === null}
              className={cn(CHIP, kindFilter === null ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5")}
            >
              {locale === "sr" ? "Sve vrste" : "All types"}
            </button>
            {GALLERY_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setKindFilter(kind)}
                aria-pressed={kindFilter === kind}
                className={cn(CHIP, kindFilter === kind ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5")}
              >
                {GALLERY_KIND_LABELS[kind][locale]}
              </button>
            ))}

            <span className="mx-1 h-6 w-px bg-ink/15" aria-hidden="true" />

            <button
              type="button"
              onClick={() => setModelFilter(null)}
              aria-pressed={modelFilter === null}
              className={cn(CHIP, modelFilter === null ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5")}
            >
              {locale === "sr" ? "Svi modeli" : "All models"}
            </button>
            {catalogModels.map((model) => (
              <button
                key={model.slug}
                type="button"
                onClick={() => setModelFilter(model.slug)}
                aria-pressed={modelFilter === model.slug}
                className={cn(
                  CHIP,
                  modelFilter === model.slug ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5",
                )}
              >
                {modelLabel(model, locale)}
              </button>
            ))}

            <span className="mx-1 h-6 w-px bg-ink/15" aria-hidden="true" />

            {DATE_RANGE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDateFilter(preset)}
                aria-pressed={dateFilter === preset}
                className={cn(CHIP, dateFilter === preset ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5")}
              >
                {DATE_RANGE_LABELS[preset][locale]}
              </button>
            ))}
          </div>
        )}
      </Panel>

      {/* Preuzmi izabrano - vidljivo samo dok je nešto izabrano. */}
      {selected.size > 0 ? (
        <div className="surface-inset flex flex-wrap items-center justify-between gap-3 border-2 border-ink bg-paper px-4 py-3">
          <p className="text-sm font-black text-ink">
            {locale === "sr" ? `Izabrano: ${selected.size}` : `Selected: ${selected.size}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-sm font-bold text-muted underline"
            >
              {locale === "sr" ? "Očisti izbor" : "Clear selection"}
            </button>
            <button
              type="button"
              onClick={downloadSelected}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 py-2 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_#0e3158] transition hover:-translate-y-0.5"
            >
              <Download className="size-4" />
              {locale === "sr" ? "Preuzmi izabrano" : "Download selected"}
            </button>
          </div>
        </div>
      ) : null}

      {jobs.status === "LoadingFirstPage" ? (
        <Panel className="flex min-h-48 items-center justify-center p-6">
          <Loader2 className="size-5 animate-spin text-muted" />
        </Panel>
      ) : jobRows.length === 0 ? (
        <Panel className="p-6">
          {filtersActive ? (
            <>
              <p className="text-base font-bold text-muted">{GALLERY_NO_MATCHES.body[locale]}</p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-white px-5 py-2.5 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5"
              >
                {GALLERY_NO_MATCHES.cta[locale]}
              </button>
            </>
          ) : (
            <>
              <p className="inline-flex items-center gap-2 text-base font-black text-ink">
                <Sparkles className="size-4" />
                {GALLERY_NO_GENERATIONS.title[locale]}
              </p>
              <p className="mt-2 text-base font-bold text-muted">{GALLERY_NO_GENERATIONS.body[locale]}</p>
              <Link
                href={studioHref}
                className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 py-2.5 text-sm font-extrabold text-ink shadow-[4px_4px_0_0_#0e3158] transition hover:-translate-y-0.5"
              >
                <Wand2 className="size-4" />
                {GALLERY_NO_GENERATIONS.cta[locale]}
              </Link>
            </>
          )}
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {jobRows.map((job) => (
              <GalleryCard
                key={job._id}
                job={job}
                locale={locale}
                modelLabel={
                  modelBySlug.has(job.modelSlug)
                    ? modelLabel(modelBySlug.get(job.modelSlug) as StudioModel, locale)
                    : job.modelSlug
                }
                paramSpec={modelBySlug.get(job.modelSlug)?.paramSpec}
                now={now}
                studioHref={studioHref}
                selected={selected.has(job._id)}
                onToggleSelect={toggleSelect}
                onDelete={(jobId) => deleteJob({ jobId })}
                onReveal={isStudioAdmin ? (jobId) => revealJobDetail({ jobId }) : undefined}
                owner={
                  job.ownerEmail === undefined
                    ? undefined
                    : { email: job.ownerEmail, provider: job.provider ?? "" }
                }
              />
            ))}
          </div>

          <div ref={sentinelRef} aria-hidden="true" />

          {jobs.status === "CanLoadMore" || jobs.status === "LoadingMore" ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => jobs.loadMore(PAGE_SIZE)}
                disabled={jobs.status === "LoadingMore"}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-white px-5 py-2.5 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {jobs.status === "LoadingMore" ? <Loader2 className="size-4 animate-spin" /> : null}
                {locale === "sr" ? "Učitaj još" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
