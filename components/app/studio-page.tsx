"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { Coins, LibraryBig, Wand2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppIntroPanel } from "@/components/app/intro-panel";
import { StudioMediaDetail } from "@/components/app/studio-media-detail";
import { CreaGameProvider, useCreaGameValue } from "@/components/crea/game/crea-game-context";
import { CreaGameStrip } from "@/components/crea/game/crea-game-strip";
import { CreaStampHost } from "@/components/crea/game/crea-stamp-host";
import { StudioMediaGrid } from "@/components/app/studio-media-grid";
import type { StudioTileJob } from "@/components/app/studio-media-tile";
import { StudioModerationGrid } from "@/components/app/studio-moderation-grid";
import { CreaCacheOffer } from "@/components/crea/crea-cache-offer";
import { CreaComingSoon } from "@/components/crea/crea-coming-soon";
import { useJobQueue } from "@/components/crea/create/use-job-queue";
import { CreaHistory, CreaHistoryEmpty } from "@/components/crea/crea-history";
import { CreaStage } from "@/components/crea/crea-stage";
import { CreaStartScreen } from "@/components/crea/crea-start-screen";
import type { RecipeHrefs } from "@/components/crea/recipes/recipe-stage";
import { CreaToolList } from "@/components/crea/crea-tool-list";
import { CreaToolShortcuts } from "@/components/crea/crea-tool-shortcuts";
import { CreaToolPanel } from "@/components/crea/crea-tool-panel";
import { CreaToolStage } from "@/components/crea/crea-tool-stage";
import { useMyElements } from "@/components/crea/elements/shared";
import { CREA_DOCK_MIN_PX, CreaWorkshop } from "@/components/crea/crea-workshop";
import { NightArrivals } from "@/components/crea/night-arrivals";
import type { QuickActionLink } from "@/components/crea/quick-actions-menu";
import { CreditIcon } from "@/components/studio/credit-icon";
import { StudioComposer, type JobPayload, type RegenerateSeed } from "@/components/studio/studio-composer";
import { StudioVerifyEmailPanel } from "@/components/studio/verify-email-panel";
import { ProjectPicker } from "@/components/studio/project-picker";
import { StudioFilterBar } from "@/components/studio/studio-filter-bar";
import { Button } from "@/components/ui/button";
import { LinkButton, Panel } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { referenceModeOf } from "@/convex/creaElementsCore";
import { CREA_CREATE_COPY } from "@/lib/crea-create-copy";
import { CREA_STAGE_COPY, fillCopy } from "@/lib/crea-copy";
import type { RefineOrder } from "@/lib/crea-draft";
import { creaGoalById } from "@/lib/crea-goals";
import { CREA_LIBRARY_COPY } from "@/lib/crea-library-copy";
import { QUICK_ACTION_LABELS, quickActionQuery, quickActionsFor } from "@/lib/crea-quick-actions";
import { recipeById, SERIES_RECIPE_ID } from "@/lib/crea-recipes";
import {
  CREA_AREA_KIND,
  CREA_LIBRARY_VIEW,
  CREA_PROMPT_PARAM,
  CREA_VIEW_PARAM,
  creaModeDef,
  creaPromptFromParams,
  creaShellQuery,
  inputModeForMode,
  modelsForMode,
  modeOfModel,
  parseCreaShellState,
  type CreaShellState,
} from "@/lib/crea-shell";
import { toolById, toolOfJob } from "@/lib/crea-tools";
import {
  CREA_INPUT_PARAM,
  CREA_RESTORED_PARAM,
  inputModeWithSlot,
  versionInputTarget,
  type VersionIntent,
} from "@/lib/crea-versions";
import { clampBoundsToViewport } from "@/lib/floating-bounds";
import { parsePath } from "@/lib/routes";
import { t, withLocale, type Locale } from "@/lib/i18n";
import {
  readComposerCollapsed,
  writeComposerCollapsed,
  type ComposerBreakpoint,
} from "@/lib/studio-composer-collapse";
import { jobPrompt } from "@/lib/studio-form";
import { isDemoPoster, type GalleryScope } from "@/lib/studio-gallery";
import { parseStudioModel, type StudioModel, type StudioModelRow, withCreditFactors } from "@/lib/studio-models";
import {
  PRIVACY_POLICY_PATH,
  STUDIO_NOT_ENROLLED,
  STUDIO_PAUSED,
  STUDIO_TERMS_GATE,
  STUDIO_TERMS_PATH,
} from "@/lib/studio-messages";
import type { SlotFile, SlotFiles } from "@/lib/studio-slots";
import { creditsFor, formatCreditsLong, type ParamValues } from "@/lib/studio-params";

// Recept i serija (K15) su svoj async chunk: forma vuče alate za sliku (priprema fotke, maske),
// koji ne smeju u početni chunk radionice (`check:bundle`).
const CreaRecipeStage = dynamic(() => import("@/components/crea/recipes/recipe-stage").then((mod) => mod.CreaRecipeStage), {
  ssr: false,
  loading: () => <Spinner size="md" className="text-muted" />,
});
const CreaSeriesStage = dynamic(() => import("@/components/crea/recipes/series-stage").then((mod) => mod.CreaSeriesStage), {
  ssr: false,
  loading: () => <Spinner size="md" className="text-muted" />,
});
// Biblioteka (K16) je svoj chunk: pametna pretraga, duplikati i poređenje trebaju tek kad se otvori.
const CreaLibrary = dynamic(() => import("@/components/crea/crea-library").then((mod) => mod.CreaLibrary), {
  ssr: false,
  loading: () => <Spinner size="md" className="text-muted" />,
});

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
          {locale === "sr" ? "Uslovi korišćenja Cree" : "Crea terms of use"}
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

/** Sat za keš upit (C4): upit ne čita sat sam, pa ga šalje klijent u trenutku klika. */
function clickTime(): number {
  return Date.now();
}

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
  basePath = "/app/studio",
  creditsHref: creditsHrefProp,
  signInHref: signInHrefProp,
}: {
  locale: Locale;
  initialJobId?: string;
  /**
   * Ruta (bez lokala) koja drži OVU instancu Studija (studio-public F3):
   * školski omotač je "/app/studio", samostalni shell "/studio/app". Detalj
   * medija živi na `${basePath}/m/<id>`. Obe poznate vrednosti sadrže samo
   * [a-z/], pa je bezbedno graditi RegExp iz stringa.
   */
  basePath?: string;
  /** Kuda vodi svako "Dopuni kredite" dugme; podrazumevano školski /app/credits. */
  creditsHref?: string;
  /** Kuda vodi "Prijavi se" za neprijavljene; standalone dodaje ?next= nazad na Studio. */
  signInHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const state = useQuery(api.studio.getStudioState, isAuthenticated ? {} : "skip");
  const balance = useQuery(api.credits.getBalance, isAuthenticated ? {} : "skip");
  const models = useQuery(api.studioModels.listModels, isAuthenticated ? {} : "skip");
  // Likovi i elementi (K14) za @pominjanje u opisu; samo uz pristup Crei.
  const myElements = useMyElements(isAuthenticated && state?.hasStudioAccess === true);
  const createJob = useMutation(api.studio.createJob);
  const convex = useConvex();
  // Gejmifikacija (K26): niz, XP, album, otključani alati i besplatne probe - jedan upit
  // za celu radionicu. Sveska stoji uz radionicu: samostalna Crea `/crea/sveska`, školska
  // `/app/studio/sveska`.
  const game = useCreaGameValue(basePath === "/studio/app" ? "/studio/sveska" : "/app/studio/sveska");
  // Keš istih zahteva (C4): ponuda „otvori postojeći / nova varijanta" pre plaćanja.
  const [cacheOffer, setCacheOffer] = useState<{
    jobId: string;
    payload: JobPayload;
    model: StudioModel;
  } | null>(null);
  const claimSignupBonus = useMutation(api.studio.claimSignupBonus);
  const adoptOutputAsInput = useMutation(api.creaVersions.adoptOutputAsInput);
  const toggleFavorite = useMutation(api.creaLibrary.toggleFavorite);
  const measureInputUpload = useAction(api.studioActions.measureInputUpload);

  // Bonus dobrodošlice (studio-public F2.3): server kaže kad ima šta da se
  // uzme; mutacija je idempotentna po korisniku, ref samo štedi ponovljene
  // pozive u istom mount-u. Radi u OBA omotača (školskom i standalone).
  const claimAttempted = useRef(false);
  const bonusClaimable = state?.signupBonus?.claimable === true;
  useEffect(() => {
    if (!bonusClaimable || claimAttempted.current) return;
    claimAttempted.current = true;
    void claimSignupBonus({}).catch(() => {
      // Odbijen/pao claim nije greška UI-ja: balans i state ionako stižu live.
    });
  }, [bonusClaimable, claimSignupBonus]);

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
  // `basePath` je KANONSKI (`/studio/app`), a adresa javna (`/crea/app`, `/en/crea/app`) - poredi se
  // kanonski oblik adrese, pa preimenovanje javnog sluga ne lomi otvaranje detalja (K02).
  const routeDetailMatch = parsePath(pathname).canonicalPath.match(new RegExp(`^${basePath}/m/([^/]+)`));
  const activeJobId = routeDetailMatch ? routeDetailMatch[1] : (initialJobId ?? null);
  const [loadedJobs, setLoadedJobs] = useState<StudioTileJob[]>([]);
  const [jobsLoadingFirst, setJobsLoadingFirst] = useState(true);
  const handleLoadedJobsChange = useCallback((jobs: StudioTileJob[], isLoadingFirst: boolean) => {
    setLoadedJobs(jobs);
    setJobsLoadingFirst(isLoadingFirst);
  }, []);

  // Ljuska Cree (K03): oblast i režim žive u URL-u (`?oblast=&rezim=`, stari `?kind=`
  // znači oblast). Query se nosi i kroz detalj (`/m/<id>`), pa zatvaranje vraća isti ekran.
  const shell = useMemo(() => parseCreaShellState(searchParams), [searchParams]);
  const queryString = searchParams.toString();
  const withQuery = (path: string) => (queryString ? `${path}?${queryString}` : path);

  function navigateShell(next: Partial<CreaShellState>) {
    const query = creaShellQuery(next, searchParams);
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  // Biblioteka (K16, U9): `?prikaz=biblioteka` umesto radionice; izlaz vraća isti ekran radionice.
  const libraryOpen = searchParams.get(CREA_VIEW_PARAM) === CREA_LIBRARY_VIEW;
  const libraryHref = useMemo(() => {
    const query = new URLSearchParams(searchParams.toString());
    query.set(CREA_VIEW_PARAM, CREA_LIBRARY_VIEW);
    return `${withLocale(locale, basePath)}?${query.toString()}`;
  }, [searchParams, locale, basePath]);
  function closeLibrary() {
    const query = new URLSearchParams(searchParams.toString());
    query.delete(CREA_VIEW_PARAM);
    const text = query.toString();
    router.push(withLocale(locale, basePath) + (text ? `?${text}` : ""), { scroll: false });
  }

  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => searchParams.get("model"));
  // `?model=` (kartica „Šta praviš danas?") važi i posle prvog rendera, ne samo na ulazu.
  const modelParam = searchParams.get("model");
  const [prevModelParam, setPrevModelParam] = useState(modelParam);
  if (modelParam !== prevModelParam) {
    setPrevModelParam(modelParam);
    if (modelParam) setSelectedSlug(modelParam);
  }
  // Moderatorski pregled (H3): "Samo moji" / "Svi korisnici", samo za osoblje.
  const [scope, setScope] = useState<GalleryScope>("mine");
  // Cilj sa početnog ekrana popunjava opis; promena cilja (ili izlazak iz njega) ga menja.
  // `?opis=` (K09, npr. paleta boja iz alata) popunjava opis kad nema cilja.
  const goal = creaGoalById(shell.goal);
  const promptParam = creaPromptFromParams(searchParams);
  const [starterPrompt, setStarterPrompt] = useState<string | null>(() => goal?.prompt?.[locale] ?? promptParam);
  const [prevGoalId, setPrevGoalId] = useState(shell.goal);
  const [prevPromptParam, setPrevPromptParam] = useState(promptParam);
  if (shell.goal !== prevGoalId || promptParam !== prevPromptParam) {
    setPrevGoalId(shell.goal);
    setPrevPromptParam(promptParam);
    setStarterPrompt(goal?.prompt?.[locale] ?? promptParam);
  }
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  // Varijacije modela koji ne vraća više slika (K13, S5): ostatak čeka slobodno mesto.
  const variationQueue = useJobQueue(setError);

  const creditsHref = creditsHrefProp ?? withLocale(locale, "/app/credits");

  // Dinamičko merenje stvarne visine lebdećeg composera/panela preko ResizeObserver-a (popravka 1.2).
  // Elementi se mere kroz callback ref (stanje), ne `useRef` + efekat na mount-u: na
  // prvom renderu prijava još traje, pa ti elementi tada ne postoje (K03).
  const [floatingContainerEl, setFloatingContainerEl] = useState<HTMLDivElement | null>(null);
  const [floatingHeight, setFloatingHeight] = useState<number>(140);

  // Sklopljeno/rasklopljeno stanje polja za unos - pamti se odvojeno za mobilni i desktop (N11)
  const [composerBreakpoint, setComposerBreakpoint] = useState<ComposerBreakpoint>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches ? "mobile" : "desktop",
  );
  const [isComposerCollapsed, setIsComposerCollapsed] = useState(() => readComposerCollapsed(composerBreakpoint));

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    function syncBreakpoint() {
      const next: ComposerBreakpoint = mql.matches ? "mobile" : "desktop";
      setComposerBreakpoint(next);
      setIsComposerCollapsed(readComposerCollapsed(next));
    }
    mql.addEventListener("change", syncBreakpoint);
    return () => mql.removeEventListener("change", syncBreakpoint);
  }, []);

  useEffect(() => {
    const el = floatingContainerEl;
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
  }, [floatingContainerEl]);

  // Merenje prostora bez sidebara (Deo A) kako bi lebdeći composer bio tačno centriran
  const [studioRootEl, setStudioRootEl] = useState<HTMLDivElement | null>(null);
  const [contentBounds, setContentBounds] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const el = studioRootEl;
    if (!el) return;

    function updateBounds() {
      const target = el;
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
  }, [studioRootEl]);

  // Širina radionice odlučuje gde stoji composer: u levom panelu (široko) ili kao donja
  // fioka (usko). Do prvog merenja composer se ne crta, da ne bi skočio sa dna u panel.
  const [workshopEl, setWorkshopEl] = useState<HTMLDivElement | null>(null);
  const [workshopWidth, setWorkshopWidth] = useState<number | null>(null);
  useEffect(() => {
    if (!workshopEl) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWorkshopWidth(entry.contentRect.width);
    });
    observer.observe(workshopEl);
    return () => observer.disconnect();
  }, [workshopEl]);
  const composerPlacement: "docked" | "floating" | null =
    workshopWidth === null ? null : workshopWidth >= CREA_DOCK_MIN_PX ? "docked" : "floating";

  // Redovi se parsiraju jednom po promeni `models` liste
  // Cene v2 (Crea C1): sa upaljenim flegom svaki model nosi faktor po kojem ga
  // server naplaćuje; sa ugašenim je niz isti kao do sada.
  const pricingV2 = state?.pricingV2 === true;
  const catalog = useMemo(
    () =>
      withCreditFactors(
        ((models ?? []) as StudioModelRow[])
          .map((row) => parseStudioModel(row))
          .filter((model): model is StudioModel => model !== null),
        pricingV2,
      ),
    [models, pricingV2],
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

  // Oblast i režim. Stari link `?regenerate=<id>` bez oblasti vodi tamo gde je model posla.
  const regeneratedModel = regenerated ? catalog.find((model) => model.slug === regenerated.modelSlug) : undefined;
  const implied = shell.area === null && regeneratedModel ? modeOfModel(regeneratedModel, regenerated?.inputMode) : null;
  const area = shell.area ?? implied?.area ?? null;
  const modeDef = area ? creaModeDef(area, shell.area ? shell.mode : (implied?.mode ?? null)) : null;
  const activeKind = area ? CREA_AREA_KIND[area] : null;

  // Izbor modela nudi samo modele ovog režima (K03); bez oblasti ili u režimu „uskoro" nema composera.
  const modeModels = useMemo(
    () => (area && modeDef?.status === "ready" ? modelsForMode(catalog, area, modeDef.id) : []),
    [catalog, area, modeDef],
  );
  const activeModel: StudioModel | undefined =
    modeModels.find((model) => model.slug === selectedSlug) ??
    (regenerated ? modeModels.find((model) => model.slug === regenerated.modelSlug) : undefined) ??
    modeModels.find((model) => model.badge === "preporuceno") ??
    modeModels[0];

  // Seme forme: „Generiši ponovo" ima prednost, pa parametri cilja (npr. TikTok = 9:16).
  const regenerateSeed = seed && regenerated?.modelSlug === activeModel?.slug ? seed : null;
  const goalSeed: RegenerateSeed | null =
    goal?.params && goal.modelSlug === activeModel?.slug ? { id: `cilj:${goal.id}`, params: goal.params } : null;
  const goalInputMode = goal?.inputMode && goal.modelSlug === activeModel?.slug ? goal.inputMode : undefined;
  // „Koristi kao ulaz" / „Animiraj" / „Vrati" (K05): izlaz rada iz `?ulaz=<id>` postaje ulaz
  // composera. Alias red pravi server (isti blob, bez kopije); video i zvuk se zatim mere kao
  // svaki upload. Roditelja novom poslu upisuje server, jer prepozna alias među ulazima.
  const inputJobId = searchParams.get(CREA_INPUT_PARAM);
  const [adopted, setAdopted] = useState<{ jobId: string; slot: string; file: SlotFile } | null>(null);
  const wantsAdoption = Boolean(inputJobId) && isAuthenticated && shell.tool === null && activeJobId === null;
  useEffect(() => {
    if (!wantsAdoption || !inputJobId) return;
    let alive = true;
    void (async () => {
      try {
        const result = await adoptOutputAsInput({ jobId: inputJobId as Id<"generationJobs"> });
        let measuredSeconds = result.durationS ?? undefined;
        if (result.slot !== "image" && measuredSeconds === undefined) {
          const measured = await measureInputUpload({ storageId: result.storageId }).catch(() => null);
          if (measured?.ok) measuredSeconds = measured.seconds;
        }
        if (!alive) return;
        setAdopted({
          jobId: inputJobId,
          slot: result.slot,
          file: {
            storageId: result.storageId,
            name: result.slot,
            mime: result.mime,
            size: result.size,
            url: result.url,
            ...(measuredSeconds !== undefined ? { measuredSeconds } : {}),
          },
        });
      } catch (thrown) {
        if (alive) setError(thrown instanceof Error ? thrown.message : String(thrown));
      }
    })();
    return () => {
      alive = false;
    };
  }, [wantsAdoption, inputJobId, adoptOutputAsInput, measureInputUpload]);
  // Slot režima, a za sliku u Napravi (K16 „Koristi kao referencu") režim sa referencama modela.
  const adoptedInputMode =
    adopted && activeModel && area && modeDef
      ? (inputModeWithSlot(activeModel, area, modeDef.id, adopted.slot) ??
        (adopted.slot === "image" ? referenceModeOf(activeModel)?.inputMode : undefined))
      : undefined;
  const inputSeed: RegenerateSeed | null =
    adopted && adopted.jobId === inputJobId
      ? {
          id: `${CREA_INPUT_PARAM}:${adopted.jobId}`,
          ...(activeModel && area && modeDef ? { inputMode: adoptedInputMode } : {}),
          files: { [adopted.slot]: [adopted.file] },
        }
      : null;

  // Composer se montira iznova kad stigne seme ponavljanja ili ulaza (forma ga čita samo pri
  // prvom renderu, K01 0.2-8) - ali NE kad korisnik promeni model, da opis i podešavanja ostanu.
  const composerSeed = inputSeed ?? regenerateSeed;
  const [seedEpoch, setSeedEpoch] = useState<string | null>(null);
  if (composerSeed && composerSeed.id !== seedEpoch) setSeedEpoch(composerSeed.id);

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
    router.push(withQuery(withLocale(locale, `${basePath}/m/${job._id}`)), { scroll: false });
  }

  function handleCloseDetail() {
    const prevId = activeJobId;
    const cameFromGrid = Boolean(activeJobId) && readPushedDetailId() === activeJobId;
    setPushedDetailId(null);
    if (cameFromGrid) {
      router.back();
    } else {
      // Direktan link ili refresh na /app/studio/m/<id>: nema cemu da se vracamo.
      router.push(withQuery(withLocale(locale, basePath)), { scroll: false });
    }
    setTimeout(() => {
      if (prevId) {
        (document.getElementById(`tile-${prevId}`) ?? document.getElementById(`stage-${prevId}`))?.focus();
      }
    }, 60);
  }

  function handleSelectDetailJob(nextJob: StudioTileJob) {
    router.replace(withQuery(withLocale(locale, `${basePath}/m/${nextJob._id}`)), { scroll: false });
  }

  // Model stiže od composera koji je poslao formu: detalj gradi formu za model POSLA (K01 0.2-7).
  async function generate(payload: JobPayload, model: StudioModel, opts: { skipCache?: boolean } = {}) {
    // Stablo verzija (K05): detalj šalje svog roditelja; „Generiši ponovo" (`?regenerate=`) je
    // verzija originala. Izlaz kao ulaz roditelja dobija na serveru (alias među ulazima).
    const lineage = payload.parentJobId
      ? { parentJobId: payload.parentJobId, ...(payload.derivation ? { derivation: payload.derivation } : {}) }
      : regenerateSeed && regenerateId && model.slug === regenerated?.modelSlug
        ? { parentJobId: regenerateId as Id<"generationJobs">, derivation: "regeneracija" as const }
        : {};
    setIsPending(true);
    setError(null);
    setCacheOffer(null);
    try {
      // Keš (C4): samo za nov rad iz composera - „Napravi ponovo", izmena i
      // „Usavrši" su svesno nova verzija, pa tu pitanje nema smisla.
      if (!opts.skipCache && !("parentJobId" in lineage)) {
        const hit = await convex
          .query(api.creaCache.findIdenticalJob, {
            modelSlug: model.slug,
            params: JSON.stringify(payload.params),
            inputMode: payload.inputMode,
            ...(Object.keys(payload.inputs).length > 0 ? { inputs: JSON.stringify(payload.inputs) } : {}),
            now: clickTime(),
          })
          .catch(() => null);
        if (hit) {
          setCacheOffer({ jobId: hit.jobId, payload, model });
          return;
        }
      }
      const base = {
        modelSlug: model.slug,
        params: JSON.stringify(payload.params),
        inputMode: payload.inputMode,
        ...(Object.keys(payload.inputs).length > 0
          ? { inputs: JSON.stringify(payload.inputs) }
          : {}),
        ...(payload.sourceJobId ? { sourceJobId: payload.sourceJobId } : {}),
        ...(payload.deliveryMode ? { deliveryMode: payload.deliveryMode } : {}),
        ...(lessonId ? { lessonId } : {}),
        ...(lessonId && taskId ? { taskId } : {}),
        ...(activeProjectId ? { projectId: activeProjectId } : {}),
        ...(payload.creaTechniques ? { creaTechniques: payload.creaTechniques } : {}),
      };
      // Besplatna proba (K26) važi samo za prvi posao, nikad za varijacije iz reda.
      const result = await createJob({
        ...base,
        ...lineage,
        ...(payload.freeTryLessonId ? { freeTryLessonId: payload.freeTryLessonId } : {}),
      });
      // Ostale varijacije (K13, S5) su zasebni poslovi, „varijacija" prvog; idu kroz red jer
      // javni korisnik ima najviše 2 posla u toku.
      if (typeof result === "string" && payload.variations && payload.variations > 1) {
        const parentJobId = result as Id<"generationJobs">;
        variationQueue.enqueue(
          Array.from({ length: payload.variations - 1 }, () => ({
            args: { ...base, parentJobId, derivation: "varijacija" as const },
          })),
        );
      }
      // Pogodak blok liste (studio-public F2.5) stiže kao vrednost, ne kao
      // greška - server tako COMMIT-uje log o odbijanju. Poruka je ista kao
      // za bačeni NEISPRAVAN_PROMPT:ZABRANJEN_POJAM (substring mapiranje u
      // `studioErrorMessage`), pa korisnik ne vidi razliku.
      if (result && typeof result === "object" && "moderationBlocked" in result) {
        setError(`NEISPRAVAN_PROMPT:${result.moderationBlocked.reason}`);
      }
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setIsPending(false);
    }
  }

  // „Usavrši" probu (K07): proba ide kao referenca (alias izlaza, bez kopije) ili se njeni
  // ulazi ponavljaju; seme iste porodice prepisuje server.
  async function handleRefine(
    job: StudioTileJob,
    order: RefineOrder,
    model: StudioModel,
    carried: Record<string, string[]>,
  ) {
    try {
      let inputs: Record<string, string[]> = {};
      if (order.inputs === "reference") {
        const adoptedOutput = await adoptOutputAsInput({ jobId: job._id as Id<"generationJobs"> });
        inputs = { [adoptedOutput.slot]: [adoptedOutput.storageId] };
      } else if (order.inputs === "carry") {
        inputs = carried;
      }
      await generate(
        {
          params: order.params,
          inputMode: order.inputMode,
          inputs,
          parentJobId: job._id as Id<"generationJobs">,
          derivation: order.derivation,
        },
        model,
      );
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    }
  }

  // „Upotrebi ponovo": model posla i njegov opis, u režimu ljuske u kojem taj model radi.
  // Rad lokalnog alata (K04) nema model ni opis - vraća u sam alat; izmena maskom (K11)
  // vraća u četkicu, jer masku crta samo ona.
  function handleReuse(job: StudioTileJob) {
    const tool = toolOfJob(job) ?? (job.inputMode === "mask" ? toolById("slika.cetkica") : undefined);
    if (tool) {
      navigateShell({ area: tool.area, mode: tool.mode, tool: tool.id });
      return;
    }
    setSelectedSlug(job.modelSlug);
    const p = jobPrompt(job.params);
    if (p) setStarterPrompt(p);
    const model = catalog.find((entry) => entry.slug === job.modelSlug);
    const target = model ? modeOfModel(model, job.inputMode) : null;
    if (target && (target.area !== area || target.mode !== modeDef?.id)) {
      navigateShell({ area: target.area, mode: target.mode });
    }
  }

  // Izlaz rada kao ulaz (K05): radionica u režimu koji prima tu vrstu fajla, sa radom u `?ulaz=`.
  function openWithInput(job: StudioTileJob, next: Partial<CreaShellState> & { model?: string | null }) {
    const params = new URLSearchParams(creaShellQuery(next, searchParams));
    params.delete("regenerate");
    params.set(CREA_INPUT_PARAM, job._id);
    if (next.model) setSelectedSlug(next.model);
    setPushedDetailId(null);
    router.push(`${withLocale(locale, basePath)}?${params.toString()}`, { scroll: false });
  }

  function handleUseAsInput(job: StudioTileJob, intent: VersionIntent) {
    const target = versionInputTarget(catalog, job.kind, intent);
    if (target) openWithInput(job, { area: target.area, mode: target.mode, model: target.modelSlug });
  }

  function handleOpenTool(job: StudioTileJob, toolId: string) {
    const tool = toolById(toolId);
    if (tool) openWithInput(job, { area: tool.area, mode: tool.mode, tool: tool.id });
  }

  // „Produži ili animiraj" sa kartice: izlaz ide kao ulaz u video; gde to ne ide, ostaje „Upotrebi ponovo".
  function handleExtend(job: StudioTileJob) {
    if (job.status === "done" && job.outputUrl && !isDemoPoster(job) && versionInputTarget(catalog, job.kind, "animate")) {
      handleUseAsInput(job, "animate");
      return;
    }
    handleReuse(job);
  }

  // Druga verzija iz stabla; „Vrati" otvara roditelja i nudi ga kao ulaz (`?vraceno=`).
  function handleOpenVersion(jobId: string, restored: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (restored) params.set(CREA_RESTORED_PARAM, jobId);
    else params.delete(CREA_RESTORED_PARAM);
    const query = params.toString();
    router.replace(withLocale(locale, `${basePath}/m/${jobId}`) + (query ? `?${query}` : ""), { scroll: false });
  }

  function handleUseStarterPrompt(prompt: string) {
    setStarterPrompt(prompt);
  }

  // Brze akcije (K16, S44): tačan alat ili režim sa popunjenim ulazom/opisom, kao link.
  const workshopPath = withLocale(locale, basePath);
  const quickActionLinks = useCallback(
    (job: StudioTileJob): QuickActionLink[] =>
      quickActionsFor(job, catalog).map((action) => ({
        id: action.id,
        label: QUICK_ACTION_LABELS[action.id][locale],
        href: `${workshopPath}?${quickActionQuery(action.target, searchParams)}`,
      })),
    [catalog, locale, workshopPath, searchParams],
  );
  const handleToggleFavorite = useCallback(
    (job: StudioTileJob) => {
      void toggleFavorite({ jobId: job._id as Id<"generationJobs"> }).catch(() => {});
    },
    [toggleFavorite],
  );

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
          <h2 className="shrink-0 type-h1 text-ink">Crea</h2>
          {/* `min-w-0`: bez njega ova kolona ne sme da se skupi ispod min-content trake
              filtera, pa traka gura ceo studio preko desne ivice (UX-BOOST-PLAN §5C). */}
          <div className="hidden min-w-0 sm:flex items-center gap-2">
            <StudioFilterBar
              locale={locale}
              isStaff={state?.isStaff === true}
              scope={scope}
              onSelectScope={setScope}
              activeKind={activeKind}
              catalog={catalog}
            />
            {isAuthenticated && !libraryOpen ? (
              <Link
                href={libraryHref}
                scroll={false}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 studio-focus-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <LibraryBig aria-hidden="true" className="size-3.5" />
                {CREA_LIBRARY_COPY.open[locale]}
              </Link>
            ) : null}
          </div>
        </div>

        {/* Prekidač projekta + Balans */}
        <div className="flex shrink-0 items-center gap-3">
          <CreaGameStrip locale={locale} />
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
            <span className="tabular-nums">
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

  // Composer ili kapija ispred njega (prijava, pauza, pristup, uslovi). Isti sadržaj stoji u
  // levom panelu radionice (široko) ili u donjoj fioci (usko) - nikad na oba mesta. Gost vidi
  // celu ljusku (ciljeve, radionice, režime), a prijavu tamo gde bi bio composer (K03).
  const composerContent = (placement: "docked" | "floating") => {
    if (!isAuthenticated) {
      return (
        <Panel className="p-4 sm:p-6">
          <p className="type-body type-measure font-bold text-muted">
            {locale === "sr"
              ? "Prijavi se da bi generisao u Crei."
              : "Sign in to generate in Crea."}
          </p>
          <LinkButton href={signInHrefProp ?? withLocale(locale, "/sign-in")} tone="ink" className="mt-4">
            {locale === "sr" ? "Prijavi se" : "Sign in"}
          </LinkButton>
        </Panel>
      );
    }

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
      // Javni režim bez potvrđenog emaila (studio-public F3): korisnik dobija
      // resend panel, ne poruku o zatvorenom testiranju - `accessReason` stiže
      // iz iste odluke koju server sprovodi u createJob.
      if (state.accessReason === "EMAIL_NIJE_POTVRDJEN") {
        return <StudioVerifyEmailPanel locale={locale} />;
      }
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

    if (!area || !modeDef) return null;

    if (!activeModel) {
      return (
        <p className="surface-card border-2 border-ink bg-paper p-4 type-body-sm font-bold text-muted shadow-[6px_6px_0_0_var(--shadow-hard-16)]">
          {CREA_STAGE_COPY.noModels[locale]}
        </p>
      );
    }

    return (
      <>
        {cacheOffer ? (
          <CreaCacheOffer
            locale={locale}
            newCredits={creditsFor(
              cacheOffer.model.priceRule,
              cacheOffer.payload.params,
              cacheOffer.payload.inputMode,
              cacheOffer.model.creditFactor,
            )}
            onOpen={() => {
              const target = cacheOffer.jobId;
              setCacheOffer(null);
              setPushedDetailId(target);
              router.push(withQuery(withLocale(locale, `${basePath}/m/${target}`)), { scroll: false });
            }}
            onNew={() => {
              const offer = cacheOffer;
              setCacheOffer(null);
              void generate(offer.payload, offer.model, { skipCache: true });
            }}
            onDismiss={() => setCacheOffer(null)}
          />
        ) : null}
        <StudioComposer
          key={`${area}:${modeDef.id}:${shell.goal ?? ""}:${seedEpoch ?? ""}`}
          models={modeModels}
          activeModel={activeModel}
          onSelectModel={(model) => {
            setSelectedSlug(model.slug);
            setStarterPrompt(null);
          }}
          locale={locale}
          studioState={state}
          balance={balance?.balance}
          topUpHref={creditsHref}
          seed={composerSeed ?? goalSeed}
          starterPrompt={starterPrompt}
          isPending={isPending}
          error={error}
          variant="create"
          onGenerate={generate}
          freeTries={game.freeTries}
          placement={placement}
          initialInputMode={goalInputMode ?? inputModeForMode(activeModel, area, modeDef.id)}
          lockModelKind
          shellMode={modeDef.id}
          dropDisabled={activeJobId !== null}
          createExtras={area === "slika" && modeDef.id === "napravi"}
          videoExtras={area === "video" && modeDef.id === "napravi"}
          // Video (K18): vidljiv izbor ulaznog režima među onima koje ovaj režim ljuske nudi.
          {...(area === "video" && modeDef.models?.inputModes ? { allowedInputModes: modeDef.models.inputModes } : {})}
          canSaveStyles={state?.hasStudioAccess === true}
          onOpenSheet={(prompt, modelSlug) => {
            // Probni list (S4) je alat Napravi: dobija opis i model iz composera.
            const query = new URLSearchParams(creaShellQuery({ tool: "slika.probni-list" }, searchParams));
            if (prompt.trim()) query.set(CREA_PROMPT_PARAM, prompt.trim());
            query.set("model", modelSlug);
            router.push(`${pathname}?${query.toString()}`, { scroll: false });
          }}
          queueNotice={
            variationQueue.waiting > 0 ? fillCopy(CREA_CREATE_COPY.queueWaiting[locale], { n: variationQueue.waiting }) : null
          }
          // @pominjanje (K14): slika (napravi, izmeni) i video (napravi) primaju likove kao reference.
          {...((area === "slika" && (modeDef.id === "napravi" || modeDef.id === "izmeni")) ||
          (area === "video" && modeDef.id === "napravi")
            ? {
                elements: myElements,
                elementsHref: `${pathname}?${creaShellQuery({ area: "slika", mode: "likovi", tool: null }, searchParams)}`,
              }
            : {})}
          {...(placement === "floating"
            ? {
                isCollapsed: isComposerCollapsed,
                onToggleCollapse: () =>
                  setIsComposerCollapsed((prev) => {
                    const next = !prev;
                    writeComposerCollapsed(composerBreakpoint, next);
                    return next;
                  }),
              }
            : {})}
        />
      </>
    );
  };

  // Režim sa lokalnim alatima (K04) nema composer: levo je spisak alata, u sredini alat.
  // Slika · Izmeni (K11) ima i modele i alate: composer dok alat nije izabran (`?alat=`).
  const hasTools = area !== null && modeDef?.status === "ready" && modeDef.tools === true;
  const isToolsMode = hasTools && (modeDef?.models === undefined || shell.tool !== null);
  // Recept (K15, S37) ili serija (S39): scena je forma recepta, bez composera i levog panela.
  const recipe = area === "slika" && shell.tool === null ? recipeById(shell.recipe) : undefined;
  const isSeries = area === "slika" && shell.tool === null && shell.recipe === SERIES_RECIPE_ID;
  const isRecipe = recipe !== undefined || isSeries;
  const hasComposer = area !== null && modeDef?.status === "ready" && !isToolsMode && !isRecipe;
  const showFloating = hasComposer && composerPlacement === "floating" && !libraryOpen;
  const gridBottomPadding = showFloating ? (isComposerCollapsed ? 60 : floatingHeight + 28) : 0;
  const stageJob = loadedJobs.find((job) => job.kind === activeKind) ?? null;

  const history = (
    <CreaHistory locale={locale} area={area} {...(isAuthenticated ? { libraryHref } : {})}>
      {!isAuthenticated ? (
        <CreaHistoryEmpty locale={locale} area={area} guest />
      ) : (
        <StudioMediaGrid
          locale={locale}
          kind={activeKind}
          projectId={activeProjectId}
          catalog={catalog}
          onReuse={handleReuse}
          onExtend={handleExtend}
          onOpenDetail={handleOpenDetail}
          onLoadedJobsChange={handleLoadedJobsChange}
          onUseStarterPrompt={handleUseStarterPrompt}
          fitToContainer
          emptyState={<CreaHistoryEmpty locale={locale} area={area} />}
          quickActionsFor={quickActionLinks}
        />
      )}
    </CreaHistory>
  );

  const paidContext =
    models !== undefined && state
      ? {
          catalog,
          providerStatus: state.providerStatus,
          publicEnabled: state.publicEnabled === true,
          isStaff: state.isStaff === true,
          pricingV2: state.pricingV2 === true,
          nightProviders: state.nightProviders,
        }
      : null;

  const shellHref = (next: Partial<CreaShellState> & { model?: string | null }, input?: string) => {
    const query = new URLSearchParams(creaShellQuery(next, searchParams));
    if (input) query.set(CREA_INPUT_PARAM, input);
    const text = query.toString();
    return text ? `${pathname}?${text}` : pathname;
  };
  const recipeHrefs: RecipeHrefs = {
    back: shellHref({ area: null, recipe: null, goal: null, tool: null }),
    characters: shellHref({ area: "slika", mode: "likovi", tool: null, recipe: null, goal: null }),
    brandKit: shellHref({ area: "slika", mode: "napravi", tool: "slika.brend-kit", recipe: null, goal: null }),
    advanced: shellHref({ recipe: null }),
    next: (step, jobId) => {
      if (step.kind === "tool") {
        const tool = toolById(step.toolId);
        return tool ? shellHref({ area: tool.area, mode: tool.mode, tool: tool.id, recipe: null, goal: null }, jobId) : pathname;
      }
      const target = versionInputTarget(catalog, "image", "animate");
      return shellHref(
        { area: target?.area ?? "video", mode: target?.mode ?? "napravi", recipe: null, goal: null, tool: null, model: target?.modelSlug ?? null },
        jobId,
      );
    },
    detail: (jobId) => withQuery(withLocale(locale, `${basePath}/m/${jobId}`)),
  };

  const toolList =
    isToolsMode && area && modeDef ? (
      <CreaToolList
        locale={locale}
        area={area}
        mode={modeDef.id}
        activeToolId={shell.tool ?? modeDef.defaultTool ?? null}
        onSelect={(tool) => navigateShell({ tool })}
        {...(modeDef.models ? { onDescribe: () => navigateShell({ tool: null }) } : {})}
      />
    ) : null;

  const stage =
    area === null || modeDef === null ? (
      <CreaStartScreen locale={locale} pathname={pathname} searchParams={searchParams} />
    ) : modeDef.status === "soon" ? (
      <CreaComingSoon
        locale={locale}
        area={area}
        mode={modeDef}
        onSelectMode={(mode) => navigateShell({ mode })}
      />
    ) : recipe ? (
      <CreaRecipeStage
        key={recipe.id}
        locale={locale}
        recipe={recipe}
        paid={paidContext}
        canSave={state?.hasStudioAccess === true}
        guest={!isAuthenticated}
        signInHref={signInHrefProp ?? withLocale(locale, "/sign-in")}
        projectId={activeProjectId}
        hrefs={recipeHrefs}
      />
    ) : isSeries ? (
      <CreaSeriesStage
        locale={locale}
        paid={paidContext}
        canSave={state?.hasStudioAccess === true}
        projectId={activeProjectId}
        backHref={recipeHrefs.back}
      />
    ) : isToolsMode ? (
      <CreaToolStage
        locale={locale}
        toolId={shell.tool ?? modeDef.defaultTool ?? null}
        guest={!isAuthenticated}
        signInHref={signInHrefProp ?? withLocale(locale, "/sign-in")}
        canSave={state?.hasStudioAccess === true}
        projectId={activeProjectId}
        sourceJobId={inputJobId as Id<"generationJobs"> | null}
        paid={paidContext}
        list={composerPlacement === "floating" ? toolList : null}
      />
    ) : (
      <div className="min-w-0 space-y-5">
        {hasTools && area ? (
          <CreaToolShortcuts
            locale={locale}
            area={area}
            mode={modeDef.id}
            onSelect={(tool) => {
              // Slika koja je stigla kao ulaz (`?ulaz=`, K05) ide i u izabran alat.
              const query = new URLSearchParams(creaShellQuery({ tool }, searchParams));
              if (inputJobId) query.set(CREA_INPUT_PARAM, inputJobId);
              router.push(`${pathname}?${query.toString()}`, { scroll: false });
            }}
          />
        ) : null}
        <CreaStage
          locale={locale}
          area={area}
          mode={modeDef}
          job={stageJob}
          history={loadedJobs}
          waitingMore={variationQueue.waiting}
          modelName={(slug) => {
            const model = catalog.find((entry) => entry.slug === slug);
            return model ? (locale === "sr" ? model.labelSr : model.labelEn) : undefined;
          }}
          isLoading={isAuthenticated && jobsLoadingFirst}
          composerDocked={composerPlacement === "docked"}
          guest={!isAuthenticated}
          onOpenDetail={handleOpenDetail}
          onReuse={handleReuse}
          onExtend={handleExtend}
          {...(isAuthenticated ? { onToggleFavorite: handleToggleFavorite, quickActionsFor: quickActionLinks } : {})}
        />
      </div>
    );

  return (
    <CreaGameProvider value={game}>
    <div
      ref={setStudioRootEl}
      className="relative -mx-4 -mt-5 min-h-[calc(100vh-5rem)] bg-studio-canvas px-4 pt-4 text-ink sm:-mx-6 sm:px-6 md:-mx-8 md:-mt-8 md:px-8 md:pt-6"
    >
      <CreaStampHost locale={locale} />
      <div className="space-y-4">
        {topbar}

        {/* Uvod se pokazuje samo onome ko Studio zaista može da koristi: dok traje
            zatvoreno testiranje, uputstvo za rad bi bilo obećanje bez pokrića. */}
        {state?.hasStudioAccess ? (
          <AppIntroPanel
            id="studio"
            locale={locale}
            icon={Wand2}
            title={t(locale, "Ovo je Crea", "This is Crea")}
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

        {/* Radionica sa dinamičkim donjim paddingom prema izmerenoj visini donje fioke / sklopljene ručice */}
        <div style={{ paddingBottom: `${gridBottomPadding}px` }}>
          {scope === "all" && state?.isStaff ? (
            <StudioModerationGrid
              locale={locale}
              isStudioAdmin={state?.isStudioAdmin === true}
              catalog={catalog}
            />
          ) : libraryOpen && isAuthenticated ? (
            <CreaLibrary
              locale={locale}
              catalog={catalog}
              projectId={activeProjectId}
              onBack={closeLibrary}
              onOpenDetail={handleOpenDetail}
              onReuse={handleReuse}
              onExtend={handleExtend}
              onLoadedJobsChange={handleLoadedJobsChange}
              quickActionsFor={quickActionLinks}
            />
          ) : (
            <>
              {/* Jutarnje iznenađenje (K08, G13): radovi iz noćne ture stižu u radionicu Slika. */}
              {isAuthenticated ? (
                <NightArrivals locale={locale} onOpen={() => navigateShell({ area: "slika", mode: null })} />
              ) : null}
              <CreaWorkshop
                locale={locale}
                area={area}
                mode={modeDef?.id ?? null}
                onNavigate={navigateShell}
                containerRef={setWorkshopEl}
                panel={
                  composerPlacement === "docked" && modeDef && (hasComposer || isToolsMode) ? (
                    <CreaToolPanel locale={locale} mode={modeDef}>
                      {isToolsMode ? toolList : composerContent("docked")}
                    </CreaToolPanel>
                  ) : null
                }
                stage={stage}
                history={history}
              />
            </>
          )}
        </div>
      </div>

      {/* Donja fioka composera na uskom ekranu (usidrena dole po sredini, centrirana u prostoru BEZ sidebara) */}
      {showFloating ? (
        <div
          ref={setFloatingContainerEl}
          className="pointer-events-none fixed bottom-4 z-30 flex justify-center px-4"
          style={
            contentBounds
              ? { left: `${contentBounds.left}px`, width: `${contentBounds.width}px` }
              : { left: 0, width: "100%" }
          }
        >
          <div className="pointer-events-auto w-full max-w-[720px]">
            {composerContent("floating")}
          </div>
        </div>
      ) : null}

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
            onOpenVersion={handleOpenVersion}
            onUseAsInput={handleUseAsInput}
            onOpenTool={handleOpenTool}
            quickActions={quickActionLinks(activeJob)}
            onRefine={(job, order, model, carried) => void handleRefine(job, order, model, carried)}
            restored={searchParams.get(CREA_RESTORED_PARAM) === activeJob._id}
            onGenerate={generate}
            isPending={isPending}
            error={error}
          />
        ) : null}
      </AnimatePresence>
    </div>
    </CreaGameProvider>
  );
}
