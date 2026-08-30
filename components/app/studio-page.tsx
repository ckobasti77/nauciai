"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { Coins, Wand2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppIntroPanel } from "@/components/app/intro-panel";
import { StudioMediaDetail } from "@/components/app/studio-media-detail";
import { StudioMediaGrid } from "@/components/app/studio-media-grid";
import type { StudioTileJob } from "@/components/app/studio-media-tile";
import { StudioModerationGrid } from "@/components/app/studio-moderation-grid";
import { CreditIcon } from "@/components/studio/credit-icon";
import { StudioComposer, type JobPayload, type RegenerateSeed } from "@/components/studio/studio-composer";
import { ProjectPicker } from "@/components/studio/project-picker";
import { StudioFilterBar } from "@/components/studio/studio-filter-bar";
import { Button } from "@/components/ui/button";
import { LinkButton, Panel } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { clampBoundsToViewport } from "@/lib/floating-bounds";
import { t, withLocale, type Locale } from "@/lib/i18n";
import { jobPrompt } from "@/lib/studio-form";
import { type GalleryScope } from "@/lib/studio-gallery";
import { parseStudioModel, type StudioModel, type StudioModelRow } from "@/lib/studio-models";
import {
  PRIVACY_POLICY_PATH,
  STUDIO_NOT_ENROLLED,
  STUDIO_PAUSED,
  STUDIO_TERMS_GATE,
  STUDIO_TERMS_PATH,
} from "@/lib/studio-messages";
import type { StudioSectionKind } from "@/lib/studio-sections";
import type { SlotFiles } from "@/lib/studio-slots";
import { formatCreditsLong, type ParamValues } from "@/lib/studio-params";

/**
 * Kapija pred prvom generacijom: jedna kvačica i jedno dugme.
 */
function StudioTermsGate({ locale }: { locale: Locale }) {
  const acceptTerms = useMutation(api.studio.acceptStudioTerms);
  const [checked, setChecked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function accept() {
    setIsSaving(true);
    setFailed(false);
    try {
      await acceptTerms({});
    } catch {
      setFailed(true);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Panel className="p-6">
      <h3 className="type-h2 text-ink">{STUDIO_TERMS_GATE.title[locale]}</h3>
      <p className="mt-2 type-body type-measure font-bold text-muted">{STUDIO_TERMS_GATE.body[locale]}</p>

      <div className="surface-inset mt-4 flex gap-3 border-2 border-ink bg-paper p-4">
        <input
          id="studio-terms-accept"
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-1 size-5 shrink-0 accent-ink"
        />
        <label htmlFor="studio-terms-accept" className="type-body-sm font-bold text-ink">
          {STUDIO_TERMS_GATE.checkbox[locale]}
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 type-body-sm font-extrabold">
        <Link href={withLocale(locale, STUDIO_TERMS_PATH)} className="text-ink underline">
          {locale === "sr" ? "Uslovi korišćenja Studija" : "Studio terms of use"}
        </Link>
        <Link href={withLocale(locale, PRIVACY_POLICY_PATH)} className="text-ink underline">
          {locale === "sr" ? "Politika privatnosti" : "Privacy policy"}
        </Link>
      </div>

      <Button onClick={accept} disabled={!checked} loading={isSaving} className="mt-4">
        {STUDIO_TERMS_GATE.cta[locale]}
      </Button>

      {failed ? (
        <p className="mt-3 type-body-sm font-bold text-muted">{STUDIO_TERMS_GATE.failed[locale]}</p>
      ) : null}
    </Panel>
  );
}

// Koja je detaljna strana otvorena klikom iz mreze (a ne direktnim linkom).
// Per-tab, prezivljava remount izmedju /app/studio i /app/studio/m/[jobId].
const PUSHED_DETAIL_KEY = "studio:pushed-detail";
const STUDIO_PROJECT_STORAGE_KEY = "nauciai_studio_project_id";

function readPushedDetailId(): string | null {
  try {
    return window.sessionStorage.getItem(PUSHED_DETAIL_KEY);
  } catch {
    return null;
  }
}

function setPushedDetailId(jobId: string | null) {
  try {
    if (jobId) window.sessionStorage.setItem(PUSHED_DETAIL_KEY, jobId);
    else window.sessionStorage.removeItem(PUSHED_DETAIL_KEY);
  } catch {
    // Privatni rezim / blokiran storage: ostajemo na push() ponasanju.
  }
}

export function StudioPage({
  locale,
  initialJobId,
}: {
  locale: Locale;
  initialJobId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const state = useQuery(api.studio.getStudioState, isAuthenticated ? {} : "skip");
  const balance = useQuery(api.credits.getBalance, isAuthenticated ? {} : "skip");
  const models = useQuery(api.studioModels.listModels, isAuthenticated ? {} : "skip");
  const createJob = useMutation(api.studio.createJob);

  const searchParams = useSearchParams();
  const regenerateId = searchParams.get("regenerate");
  const regenerated = useQuery(
    api.studio.getJobForRegenerate,
    regenerateId && isAuthenticated ? { jobId: regenerateId as Id<"generationJobs"> } : "skip",
  );
  const lessonId = searchParams.get("lessonId") as Id<"lessons"> | null;
  const taskId = searchParams.get("taskId") as Id<"lessonTasks"> | null;

  // Projekat (SP2): sinhronizovan sa URL query parametrom (?project=) i localStorage-om
  const projectParam = searchParams.get("project") as Id<"studioProjects"> | null;
  const activeProjectId = projectParam ?? null;

  useEffect(() => {
    if (projectParam) {
      try {
        localStorage.setItem(STUDIO_PROJECT_STORAGE_KEY, projectParam);
      } catch {}
    } else {
      try {
        const saved = localStorage.getItem(STUDIO_PROJECT_STORAGE_KEY);
        if (saved) {
          const params = new URLSearchParams(window.location.search);
          params.set("project", saved);
          router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        }
      } catch {}
    }
  }, [projectParam, pathname, router]);

  function handleSelectProject(nextProjectId: Id<"studioProjects"> | null) {
    try {
      if (nextProjectId) {
        localStorage.setItem(STUDIO_PROJECT_STORAGE_KEY, nextProjectId);
      } else {
        localStorage.removeItem(STUDIO_PROJECT_STORAGE_KEY);
      }
    } catch {}

    const params = new URLSearchParams(searchParams.toString());
    if (nextProjectId) {
      params.set("project", nextProjectId);
    } else {
      params.delete("project");
    }
    const query = params.toString();
    const target = query ? `${pathname}?${query}` : pathname;
    router.replace(target, { scroll: false });
  }

  // Detalj medija i navigacija (sinhronizovano preko Next.js App Router-a)
  const routeDetailMatch = pathname.match(/\/app\/studio\/m\/([^/]+)/);
  const activeJobId = routeDetailMatch ? routeDetailMatch[1] : (initialJobId ?? null);
  const [loadedJobs, setLoadedJobs] = useState<StudioTileJob[]>([]);

  // Taksonomija biblioteke iz URL query parametra (?kind=)
  const kindParam = searchParams.get("kind");
  const activeKind: StudioSectionKind | null =
    kindParam === "image" || kindParam === "video" || kindParam === "audio"
      ? (kindParam as StudioSectionKind)
      : null;

  function handleSelectKind(kind: StudioSectionKind | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (kind) {
      params.set("kind", kind);
    } else {
      params.delete("kind");
    }
    const query = params.toString();
    const target = query ? `${pathname}?${query}` : pathname;
    router.push(target, { scroll: false });
  }

  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => searchParams.get("model"));
  // Moderatorski pregled (H3): "Samo moji" / "Svi korisnici", samo za osoblje.
  const [scope, setScope] = useState<GalleryScope>("mine");
  const [starterPrompt, setStarterPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const creditsHref = withLocale(locale, "/app/credits");

  // Dinamičko merenje stvarne visine lebdećeg composera/panela preko ResizeObserver-a (popravka 1.2)
  const floatingContainerRef = useRef<HTMLDivElement | null>(null);
  const [floatingHeight, setFloatingHeight] = useState<number>(140);
  const [isComposerCollapsed, setIsComposerCollapsed] = useState(false);

  useEffect(() => {
    const el = floatingContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        if (height > 0) {
          setFloatingHeight(height);
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Merenje prostora bez sidebara (Deo A) kako bi lebdeći composer bio tačno centriran
  const studioRootRef = useRef<HTMLDivElement | null>(null);
  const [contentBounds, setContentBounds] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const el = studioRootRef.current;
    if (!el) return;

    function updateBounds() {
      const target = studioRootRef.current;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      // `clientWidth` (a ne `innerWidth`) je širina BEZ vertikalnog scrollbara — mera koja
      // izađe iz nje pravi horizontalni skrol, vidi `lib/floating-bounds.ts`.
      setContentBounds(
        clampBoundsToViewport({ left: rect.left, width: rect.width }, document.documentElement.clientWidth),
      );
    }

    updateBounds();

    const observer = new ResizeObserver(updateBounds);
    observer.observe(el);

    window.addEventListener("resize", updateBounds);
    window.addEventListener("scroll", updateBounds, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
      window.removeEventListener("scroll", updateBounds);
    };
  }, []);

  // Redovi se parsiraju jednom po promeni `models` liste
  const catalog = useMemo(
    () =>
      ((models ?? []) as StudioModelRow[])
        .map((row) => parseStudioModel(row))
        .filter((model): model is StudioModel => model !== null),
    [models],
  );

  const seed: RegenerateSeed | null = useMemo(() => {
    if (!regenerateId || !regenerated) return null;

    const files: SlotFiles = {};
    for (const input of regenerated.inputs) {
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

    let params: ParamValues = {};
    try {
      const parsed: unknown = JSON.parse(regenerated.params);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        params = parsed as ParamValues;
      }
    } catch {
      params = {};
    }

    return {
      id: regenerateId,
      ...(regenerated.inputMode ? { inputMode: regenerated.inputMode } : {}),
      params,
      files,
      ...(regenerated.missingSlots.length > 0 ? { missingSlots: regenerated.missingSlots } : {}),
    };
  }, [regenerateId, regenerated]);

  const recommended = catalog.find((model) => model.badge === "preporuceno");
  const activeModel =
    catalog.find((model) => model.slug === selectedSlug) ??
    (regenerated ? catalog.find((model) => model.slug === regenerated.modelSlug) : undefined) ??
    recommended ??
    catalog[0];

  // H2: detalj otvoren direktnim linkom (posao nije u učitanoj mreži) čita PRAVI
  // izlaz i status kroz `getJobForDetail` - ne fabrikuje izlaz iz prvog ulaza.
  const singleJobQuery = useQuery(
    api.studio.getJobForDetail,
    activeJobId && !loadedJobs.some((j) => j._id === activeJobId) && isAuthenticated
      ? { jobId: activeJobId as Id<"generationJobs"> }
      : "skip",
  );

  const activeJob: StudioTileJob | null = useMemo(() => {
    if (!activeJobId) return null;
    const found = loadedJobs.find((j) => j._id === activeJobId);
    if (found) return found;
    if (singleJobQuery) {
      return {
        _id: singleJobQuery._id,
        modelSlug: singleJobQuery.modelSlug,
        kind: singleJobQuery.kind,
        status: singleJobQuery.status,
        creditCost: singleJobQuery.creditCost,
        params: singleJobQuery.params,
        outputUrl: singleJobQuery.outputUrl,
        isMock: singleJobQuery.isMock,
        createdAt: singleJobQuery.createdAt,
        ...(singleJobQuery.error !== undefined ? { error: singleJobQuery.error } : {}),
        ...(singleJobQuery.expiresAt !== undefined ? { expiresAt: singleJobQuery.expiresAt } : {}),
        ...(singleJobQuery.inputMode ? { inputMode: singleJobQuery.inputMode } : {}),
      };
    }
    return null;
  }, [activeJobId, loadedJobs, singleJobQuery]);

  function handleOpenDetail(job: StudioTileJob) {
    // Belezimo da smo MI gurnuli /app/studio/m/<id> u istoriju, pa zatvaranje sme
    // da bude back() umesto novog push()-a. Bez toga svaki par otvori/zatvori doda
    // DVA unosa u istoriju, pa i "Nazad" u sidebaru i "Nazad" u pregledacu vracaju
    // korisnika u istu generaciju iz koje je upravo izasao.
    // `sessionStorage`, ne `useRef`: /app/studio i /app/studio/m/[jobId] su dve
    // odvojene rute, pa se komponenta remount-uje i ref bi se resetovao.
    setPushedDetailId(job._id);
    router.push(withLocale(locale, `/app/studio/m/${job._id}`), { scroll: false });
  }

  function handleCloseDetail() {
    const prevId = activeJobId;
    const cameFromGrid = Boolean(activeJobId) && readPushedDetailId() === activeJobId;
    setPushedDetailId(null);
    if (cameFromGrid) {
      router.back();
    } else {
      // Direktan link ili refresh na /app/studio/m/<id>: nema cemu da se vracamo.
      const target = kindParam ? `/app/studio?kind=${kindParam}` : `/app/studio`;
      router.push(withLocale(locale, target), { scroll: false });
    }
    setTimeout(() => {
      if (prevId) {
        document.getElementById(`tile-${prevId}`)?.focus();
      }
    }, 60);
  }

  function handleSelectDetailJob(nextJob: StudioTileJob) {
    router.replace(withLocale(locale, `/app/studio/m/${nextJob._id}`), { scroll: false });
  }

  async function generate(payload: JobPayload) {
    if (!activeModel) return;
    setIsPending(true);
    setError(null);
    try {
      await createJob({
        modelSlug: activeModel.slug,
        params: JSON.stringify(payload.params),
        inputMode: payload.inputMode,
        ...(Object.keys(payload.inputs).length > 0
          ? { inputs: JSON.stringify(payload.inputs) }
          : {}),
        ...(payload.sourceJobId ? { sourceJobId: payload.sourceJobId } : {}),
        ...(lessonId ? { lessonId } : {}),
        ...(lessonId && taskId ? { taskId } : {}),
        ...(activeProjectId ? { projectId: activeProjectId } : {}),
      });
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setIsPending(false);
    }
  }

  function handleReuse(job: StudioTileJob) {
    setSelectedSlug(job.modelSlug);
    const p = jobPrompt(job.params);
    if (p) setStarterPrompt(p);
  }

  function handleExtend(job: StudioTileJob) {
    setSelectedSlug(job.modelSlug);
    const p = jobPrompt(job.params);
    if (p) setStarterPrompt(p);
  }

  function handleUseStarterPrompt(prompt: string) {
    setStarterPrompt(prompt);
  }

  function handleResetKind() {
    handleSelectKind(null);
  }

  // Zaglavlje (SP2):
  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ Studio    [filteri ────────────────────────]   [Projekat ▾] [5.000 kr] │
  // └──────────────────────────────────────────────────────────────────────┘
  // Jedna traka u ravni sa naslovom na desktopu, na mobilnom (< 640px) u svom redu ispod.
  const topbar = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {/* Naslov + Traka filtera u istoj ravni */}
        <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-4">
          <h2 className="shrink-0 type-h1 text-ink">Studio</h2>
          {/* `min-w-0`: bez njega ova kolona ne sme da se skupi ispod min-content trake
              filtera, pa traka gura ceo studio preko desne ivice (UX-BOOST-PLAN §5C). */}
          <div className="hidden min-w-0 sm:flex items-center">
            <StudioFilterBar
              locale={locale}
              isStaff={state?.isStaff === true}
              scope={scope}
              onSelectScope={setScope}
              activeKind={activeKind}
              onSelectKind={handleSelectKind}
              catalog={catalog}
            />
          </div>
        </div>

        {/* Prekidač projekta + Balans */}
        <div className="flex shrink-0 items-center gap-3">
          <ProjectPicker
            locale={locale}
            activeProjectId={activeProjectId}
            onSelectProject={handleSelectProject}
          />

          <LinkButton
            href={creditsHref}
            tone="paper"
            aria-label={
              balance === undefined
                ? locale === "sr"
                  ? "Krediti"
                  : "Credits"
                : formatCreditsLong(balance.balance, locale)
            }
            className="shrink-0"
          >
            <CreditIcon className="size-4" />
            <span>
              {balance === undefined
                ? "—"
                : balance.balance.toLocaleString(locale === "sr" ? "sr-RS" : "en-US")}
            </span>
          </LinkButton>
        </div>
      </div>

      {/* Na mobilnom (< 640px): traka filtera ide u svoj red ispod naslova */}
      <div className="flex sm:hidden w-full items-center">
        <StudioFilterBar
          locale={locale}
          isStaff={state?.isStaff === true}
          scope={scope}
          onSelectScope={setScope}
          activeKind={activeKind}
          onSelectKind={handleSelectKind}
          catalog={catalog}
        />
      </div>

      {/* Podnaslov: prikazuje se SAMO kad je cela mreža prazna (0 učitanih poslova) */}
      {loadedJobs.length === 0 ? (
        <p className="type-body-sm type-measure font-bold text-muted">
          {locale === "sr"
            ? "Izaberi alat, opiši šta hoćeš i klikni dugme sa cenom - dobijaš sliku, video ili zvuk."
            : "Pick a tool, describe what you want, and click the button with the price - you get an image, a video or a sound."}
        </p>
      ) : null}
    </div>
  );

  if (authLoading) {
    return (
      <div className="space-y-6">
        {topbar}
        <Panel className="flex min-h-32 items-center justify-center p-6">
          <Spinner size="md" className="text-muted" />
        </Panel>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        {topbar}
        <Panel className="p-4 sm:p-6">
          <p className="type-body type-measure font-bold text-muted">
            {locale === "sr"
              ? "Prijavi se da bi generisao u Studiju."
              : "Sign in to generate in the Studio."}
          </p>
          <LinkButton href={withLocale(locale, "/sign-in")} tone="ink" className="mt-4">
            {locale === "sr" ? "Prijavi se" : "Sign in"}
          </LinkButton>
        </Panel>
      </div>
    );
  }

  const floatingContent = () => {
    if (state !== undefined && !state.enabled) {
      return (
        <div className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard-16)] sm:p-6">
          <h3 className="type-h3 text-ink">{STUDIO_PAUSED.title[locale]}</h3>
          <p className="mt-2 type-body-sm font-bold text-muted">{STUDIO_PAUSED.body[locale]}</p>
          <LinkButton href={creditsHref} tone="paper" className="mt-3">
            <Coins className="size-4" />
            {STUDIO_PAUSED.cta[locale]}
          </LinkButton>
        </div>
      );
    }

    if (state !== undefined && !state.hasStudioAccess) {
      return (
        <div className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard-16)] sm:p-6">
          <h3 className="type-h3 text-ink">{STUDIO_NOT_ENROLLED.title[locale]}</h3>
          <p className="mt-2 type-body-sm font-bold text-muted">{STUDIO_NOT_ENROLLED.body[locale]}</p>
        </div>
      );
    }

    if (state !== undefined && !state.hasAcceptedTerms) {
      return <StudioTermsGate locale={locale} />;
    }

    if (models === undefined) {
      return (
        <div className="surface-card flex min-h-24 items-center justify-center border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard-16)]">
          <Spinner size="md" className="text-muted" />
        </div>
      );
    }

    if (catalog.length === 0) {
      return (
        <p className="surface-card border-2 border-ink bg-paper p-4 type-body-sm font-bold text-muted shadow-[6px_6px_0_0_var(--shadow-hard-16)]">
          {t(
            locale,
            "Nijedan alat za pravljenje sadržaja trenutno nije uključen. Ovo nije do tvog naloga - probaj ponovo kasnije ili se javi podršci.",
            "No content tool is switched on right now. This is not about your account - try again later or contact support.",
          )}
        </p>
      );
    }

    if (!activeModel) return null;

    return (
      <StudioComposer
        models={catalog}
        activeModel={activeModel}
        onSelectModel={(model) => {
          setSelectedSlug(model.slug);
          setStarterPrompt(null);
        }}
        locale={locale}
        studioState={state}
        balance={balance?.balance}
        topUpHref={creditsHref}
        seed={seed && regenerated?.modelSlug === activeModel.slug ? seed : null}
        starterPrompt={starterPrompt}
        isPending={isPending}
        error={error}
        variant="create"
        onGenerate={generate}
        isCollapsed={isComposerCollapsed}
        onToggleCollapse={() => setIsComposerCollapsed((prev) => !prev)}
      />
    );
  };

  const gridBottomPadding = isComposerCollapsed ? 60 : floatingHeight + 28;

  return (
    <div
      ref={studioRootRef}
      className="relative -mx-4 -mt-5 min-h-[calc(100vh-5rem)] bg-studio-canvas px-4 pt-4 text-ink sm:-mx-6 sm:px-6 md:-mx-8 md:-mt-8 md:px-8 md:pt-6"
    >
      <div className="space-y-4">
        {topbar}

        {/* Uvod se pokazuje samo onome ko Studio zaista može da koristi: dok traje
            zatvoreno testiranje, uputstvo za rad bi bilo obećanje bez pokrića. */}
        {state?.hasStudioAccess ? (
          <AppIntroPanel
            id="studio"
            locale={locale}
            icon={Wand2}
            title={t(locale, "Ovo je Studio", "This is the Studio")}
            body={t(
              locale,
              "Ovde od opisa u rečenici dobijaš sliku, video ili zvuk. Svaki posao se plaća kreditima, a tačna cena piše na dugmetu pre nego što klikneš.",
              "Here a sentence you write turns into an image, a video or a sound. Each job is paid in credits, and the exact price is on the button before you click.",
            )}
            steps={[
              t(locale, "Izaberi šta praviš: sliku, video ili zvuk.", "Choose what you are making: an image, a video or a sound."),
              t(locale, "Opiši šta želiš da vidiš, u par rečenica.", "Describe what you want to see, in a couple of sentences."),
              t(locale, "Klikni dugme sa cenom — gotov fajl ostaje ovde.", "Click the button with the price — the finished file stays here."),
            ]}
            action={
              <LinkButton href={creditsHref} tone="paper">
                <Coins className="size-4" aria-hidden="true" />
                {t(locale, "Pogledaj svoje kredite", "See your credits")}
              </LinkButton>
            }
          />
        ) : null}

        {/* Mreža generisanih medija sa dinamičkim donjim paddingom prema izmerenoj visini composera / sklopljene ručice */}
        <div style={{ paddingBottom: `${gridBottomPadding}px` }}>
          {scope === "all" && state?.isStaff ? (
            <StudioModerationGrid
              locale={locale}
              isStudioAdmin={state?.isStudioAdmin === true}
              catalog={catalog}
            />
          ) : (
            <StudioMediaGrid
              locale={locale}
              kind={activeKind}
              projectId={activeProjectId}
              catalog={catalog}
              onReuse={handleReuse}
              onExtend={handleExtend}
              onOpenDetail={handleOpenDetail}
              onLoadedJobsChange={setLoadedJobs}
              onUseStarterPrompt={handleUseStarterPrompt}
              onResetKind={handleResetKind}
            />
          )}
        </div>
      </div>

      {/* Lebdeći kontejner composera (usidren dole po sredini, iznad mreže, centriran u prostoru BEZ sidebara) */}
      <div
        ref={floatingContainerRef}
        className="pointer-events-none fixed bottom-4 z-30 flex justify-center px-4"
        style={
          contentBounds
            ? { left: `${contentBounds.left}px`, width: `${contentBounds.width}px` }
            : { left: 0, width: "100%" }
        }
      >
        <div className="pointer-events-auto w-full max-w-[720px]">
          {floatingContent()}
        </div>
      </div>

      {/* Puni detalj medija / editor */}
      <AnimatePresence>
        {activeJobId && activeJob ? (
          <StudioMediaDetail
            key={activeJob._id}
            job={activeJob}
            jobs={loadedJobs}
            catalog={catalog}
            activeModel={activeModel}
            onSelectModel={(model) => {
              setSelectedSlug(model.slug);
              setStarterPrompt(null);
            }}
            locale={locale}
            studioState={state}
            balance={balance?.balance}
            topUpHref={creditsHref}
            onClose={handleCloseDetail}
            onSelectJob={handleSelectDetailJob}
            onGenerate={generate}
            isPending={isPending}
            error={error}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
