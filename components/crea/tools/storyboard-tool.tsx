/* eslint-disable @next/next/no-img-element -- slike Likova su potpisani Convex URL-ovi. */
"use client";

import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { BookOpen, Check, Film, Pencil, Plus, Save, Sparkles } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useJobQueue } from "@/components/crea/create/use-job-queue";
import { useMyElements } from "@/components/crea/elements/shared";
import { newDraftId, saveDraft } from "@/components/crea/montaza/draft-store";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { paidModel, PaidSubmit, type SendStatus } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { StripPanel, type PanelMedia, type PanelStatus } from "@/components/crea/video/strip/strip-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { StoryboardJobView } from "@/convex/creaStoryboards";
import {
  STORYBOARD_ASPECTS,
  STORYBOARD_LIMITS,
  STORYBOARD_QUALITY_IDS,
  type StoryboardAspect,
  type StoryboardQuality,
  type StoryShot,
} from "@/convex/creaStoryboardsCore";
import { fillCopy } from "@/lib/crea-copy";
import {
  shotImageJob,
  shotVideoJob,
  storyboardCost,
  storyboardTimeline,
  STORYBOARD_QUALITY,
  type StoryElement,
  type StripSceneSource,
} from "@/lib/crea-storyboard";
import { creaShellQuery } from "@/lib/crea-shell";
import { CREA_STYLES, styleById } from "@/lib/crea-styles";
import { serializeTimeline } from "@/lib/crea-timeline";
import { CREA_FLOWS_COPY as T } from "@/lib/crea-video-flows-copy";
import { studioErrorMessage } from "@/lib/studio-messages";
import { formatCredits } from "@/lib/studio-params";

const FIELD =
  "surface-inset mt-2 block w-full border-2 border-ink bg-paper px-3 py-2 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60";

const SHOT_COUNTS = [3, 4, 5, 6, 8] as const;

function jobDone(job: StoryboardJobView | undefined) {
  return job?.status === "done";
}

function jobFailed(job: StoryboardJobView | undefined) {
  return job?.status === "failed" || job?.status === "refunded";
}

/** Stanje kartice iz poslova kadra (video ima prednost nad slikom). */
function panelStatus(shot: StoryShot, jobs: Record<string, StoryboardJobView>): PanelStatus {
  const video = shot.videoJobId ? jobs[shot.videoJobId] : undefined;
  if (shot.videoJobId) {
    if (jobFailed(video)) return "pao";
    return jobDone(video) ? "video" : "ozivljava";
  }
  const image = shot.imageJobId ? jobs[shot.imageJobId] : undefined;
  if (!shot.imageJobId) return "nema";
  if (jobFailed(image)) return "pao";
  return jobDone(image) ? "slika" : "crta";
}

/**
 * Strip → film (Crea K21, V10; plan K17 §4): priča → strip od 3-8 kadrova
 * (besplatno, LLM) → kartice kao stranice sveske koje uče vrste kadrova → „Nacrtaj
 * kadrove" (slika po kadru sa tvojim Likom; kadrovi 2..N dobijaju i prvi kadar kao
 * referencu) → „Oživi sve" (video iz svake slike) → „Spoji u montažu" (pretapanje,
 * naslov, potpisi kao titlovi; izvoz na uređaju, 0 kr). Ukupna cena unapred; strip
 * se čuva u Crei, pa tok preživi zatvaranje strane („Moji stripovi").
 */
export default function StoryboardTool({ tool, locale, canSave, projectId, paid }: CreaToolProps) {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const planStoryboard = useAction(api.creaLlm.planStoryboard);
  const updateShots = useMutation(api.creaStoryboards.updateShots);
  const attachJob = useMutation(api.creaStoryboards.attachJob);
  const adopt = useMutation(api.creaVersions.adoptOutputAsInput);
  const saveMontage = useMutation(api.creaMontages.saveMontage);
  const setMontage = useMutation(api.creaStoryboards.setMontage);
  const elements = useMyElements(isAuthenticated);
  const mine = useQuery(api.creaStoryboards.listMine, isAuthenticated ? {} : "skip");

  // ── Unos ──
  const [story, setStory] = useState("");
  const [shotCount, setShotCount] = useState<number>(4);
  const [styleId, setStyleId] = useState<string>("");
  const [aspect, setAspect] = useState<StoryboardAspect>("9:16");
  const [quality, setQuality] = useState<StoryboardQuality>("jeftino");
  const [picked, setPicked] = useState<string[]>([]);
  const [captions, setCaptions] = useState(true);
  const [plan, setPlan] = useState<SendStatus>({ name: "idle" });
  const [demoPlan, setDemoPlan] = useState(false);

  // ── Strip ──
  const [storyboardId, setStoryboardId] = useState<Id<"creaStoryboards"> | null>(null);
  const board = useQuery(api.creaStoryboards.get, storyboardId ? { storyboardId } : "skip");
  const [draft, setDraft] = useState<{ forId: string; synced: string; title: string; shots: StoryShot[]; dirty: boolean } | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [drawPending, setDrawPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  // Server je istina za poslove kadrova; tekst kartica se menja lokalno do „Sačuvaj".
  if (board) {
    const serverShots = JSON.stringify(board.shots);
    if (!draft || draft.forId !== board._id) {
      setDraft({ forId: board._id, synced: serverShots, title: board.title, shots: board.shots, dirty: false });
    } else if (draft.synced !== serverShots) {
      const shots = draft.dirty && draft.shots.length === board.shots.length
        ? draft.shots.map((shot, index) => ({ ...shot, imageJobId: board.shots[index]!.imageJobId, videoJobId: board.shots[index]!.videoJobId }))
        : board.shots;
      setDraft({ ...draft, synced: serverShots, shots, dirty: draft.dirty && draft.shots.length === board.shots.length });
    }
  }

  const onQueueError = useCallback((message: string) => setError(studioErrorMessage(message, locale)), [locale]);
  const { enqueue, waiting } = useJobQueue(onQueueError);

  const settings = board?.settings ?? { styleId: styleId || null, aspect, quality, elementIds: picked };
  const imageChoice = paidModel(paid, STORYBOARD_QUALITY[settings.quality].image.slug, "text");
  const videoChoice = paidModel(paid, STORYBOARD_QUALITY[settings.quality].video.slug, "image");
  const storyElements: StoryElement[] = useMemo(
    () =>
      (elements ?? [])
        .filter((element) => settings.elementIds.includes(element._id))
        .map((element) => ({
          id: element._id,
          kind: element.kind,
          name: element.name,
          handle: element.handle,
          description: element.description,
          images: element.images.map((image) => ({ storageId: image.storageId, mime: image.mime, size: image.size })),
        })),
    [elements, settings.elementIds],
  );
  const liks = (elements ?? []).filter((element) => element.kind === "lik" && element.images.length > 0);

  const shots = draft?.shots ?? [];
  const jobs = useMemo(() => board?.jobs ?? {}, [board]);
  const statuses = shots.map((shot) => panelStatus(shot, jobs));
  const working = statuses.some((status) => status === "crta" || status === "ozivljava") || waiting > 0 || drawPending;
  const catalog = paid?.catalog ?? [];
  const total = storyboardCost(shots, settings.quality, catalog);
  const toDraw = shots.filter((_, index) => statuses[index] === "nema" || (statuses[index] === "pao" && !shots[index]!.videoJobId));
  const drawCost = storyboardCost(toDraw, settings.quality, catalog).images;
  const imageOf = (shot: StoryShot) => (shot.imageJobId ? jobs[shot.imageJobId] : undefined);
  const toAnimate = shots.filter((shot, index) => {
    const image = imageOf(shot);
    return jobDone(image) && !image!.isMock && (statuses[index] === "slika" || (statuses[index] === "pao" && Boolean(shot.videoJobId)));
  });
  const animateCost = storyboardCost(toAnimate, settings.quality, catalog).videos;
  const allDrawn = shots.length > 0 && shots.every((shot) => jobDone(imageOf(shot)));

  async function makePlan() {
    setPlan({ name: "working" });
    setError(null);
    try {
      const reply = await planStoryboard({
        story,
        shots: shotCount,
        ...(styleId ? { styleId } : {}),
        aspect,
        quality,
        elementIds: picked as Id<"creaElements">[],
        locale,
        ...(projectId ? { projectId } : {}),
      });
      if (!reply.ok) {
        setPlan({ name: "error", message: T.llmErrors[reply.reason][locale] });
        return;
      }
      setDemoPlan(reply.demo);
      setDraft(null);
      setStoryboardId(reply.storyboardId);
      setPlan({ name: "idle" });
    } catch (caught) {
      setPlan({ name: "error", message: studioErrorMessage(caught instanceof Error ? caught.message : String(caught), locale) });
    }
  }

  async function saveEdits(): Promise<boolean> {
    if (!draft || !storyboardId || !draft.dirty) return true;
    setSaveState("saving");
    const result = await updateShots({ storyboardId, shots: JSON.stringify(draft.shots), title: draft.title });
    if (!result.ok) {
      setSaveState("idle");
      setError(T.stripMinShots[locale]);
      return false;
    }
    setDraft((current) => (current ? { ...current, dirty: false } : current));
    setSaveState("saved");
    return true;
  }

  const edit = (index: number, patch: Partial<StoryShot>) => {
    setSaveState("idle");
    setDraft((current) => (current ? { ...current, dirty: true, shots: current.shots.map((shot, other) => (other === index ? { ...shot, ...patch } : shot)) } : current));
  };
  const reorder = (index: number, delta: -1 | 1) =>
    setDraft((current) => {
      if (!current) return current;
      const next = [...current.shots];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return { ...current, dirty: true, shots: next };
    });

  /** Posao slike za kadar `index` u red; kadrovi posle prvog dobijaju i prvi kadar kao referencu. */
  const enqueueImage = useCallback(
    async (index: number, firstStorageId: Id<"_storage"> | null) => {
      if (!storyboardId || !draft || !paid) return;
      const shot = draft.shots[index]!;
      const model = paid.catalog.find((entry) => entry.slug === STORYBOARD_QUALITY[settings.quality].image.slug);
      if (!model) return;
      const job = shotImageJob({
        shot,
        quality: settings.quality,
        aspect: settings.aspect,
        styleFragment: styleById(settings.styleId)?.fragment ?? null,
        elements: storyElements,
        model,
        withFirstShot: firstStorageId !== null && index > 0,
      });
      const ids = job.images.map((image) => (image.kind === "prvi-kadar" ? firstStorageId! : image.storageId));
      enqueue([
        {
          args: {
            modelSlug: job.modelSlug,
            params: JSON.stringify(job.params),
            inputMode: job.inputMode,
            inputs: JSON.stringify(ids.length > 0 ? { image: ids } : {}),
            ...(projectId ? { projectId } : {}),
          },
          onCreated: (jobId) => void attachJob({ storyboardId, shotIndex: index, kind: "image", jobId }),
        },
      ]);
    },
    [attachJob, draft, enqueue, paid, projectId, settings.aspect, settings.quality, settings.styleId, storyElements, storyboardId],
  );

  /** Ostali kadrovi, posle prvog: prvi kadar (pravi, ne DEMO) ide kao referenca radi istog izgleda. */
  const drawRest = useCallback(async () => {
    if (!draft) return;
    const first = draft.shots[0];
    const firstJob = first?.imageJobId ? jobs[first.imageJobId] : undefined;
    let firstStorageId: Id<"_storage"> | null = null;
    if (first?.imageJobId && jobDone(firstJob) && !firstJob!.isMock) {
      try {
        firstStorageId = (await adopt({ jobId: first.imageJobId as Id<"generationJobs"> })).storageId;
      } catch {
        firstStorageId = null;
      }
    }
    for (let index = 1; index < draft.shots.length; index += 1) {
      const status = panelStatus(draft.shots[index]!, jobs);
      if (status === "nema" || (status === "pao" && !draft.shots[index]!.videoJobId)) await enqueueImage(index, firstStorageId);
    }
  }, [adopt, draft, enqueueImage, jobs]);

  async function draw() {
    setError(null);
    if (!(await saveEdits()) || !draft) return;
    const status = panelStatus(draft.shots[0]!, jobs);
    if (status === "nema" || status === "pao") {
      await enqueueImage(0, null);
      pendingRef.current = true;
      setDrawPending(true);
    } else if (status === "crta") {
      pendingRef.current = true;
      setDrawPending(true);
    } else {
      await drawRest();
    }
  }

  // Prvi kadar je gotov (ili nije uspeo) - crtaju se ostali.
  const firstStatus = statuses[0];
  const pendingRef = useRef(false);
  useEffect(() => {
    if (!pendingRef.current || firstStatus === "crta" || firstStatus === "nema") return;
    pendingRef.current = false;
    void drawRest().finally(() => setDrawPending(false));
  }, [drawPending, firstStatus, drawRest]);

  async function redraw(index: number) {
    setError(null);
    if (!(await saveEdits()) || !draft) return;
    const first = draft.shots[0];
    const firstJob = first?.imageJobId ? jobs[first.imageJobId] : undefined;
    let firstStorageId: Id<"_storage"> | null = null;
    if (index > 0 && first?.imageJobId && jobDone(firstJob) && !firstJob!.isMock) {
      firstStorageId = (await adopt({ jobId: first.imageJobId as Id<"generationJobs"> })).storageId;
    }
    await enqueueImage(index, firstStorageId);
  }

  async function animate() {
    setError(null);
    if (!(await saveEdits()) || !draft || !storyboardId || !paid) return;
    const model = paid.catalog.find((entry) => entry.slug === STORYBOARD_QUALITY[settings.quality].video.slug);
    if (!model) return;
    for (const [index, shot] of draft.shots.entries()) {
      if (!toAnimate.includes(shot) || !shot.imageJobId) continue;
      try {
        const adopted = await adopt({ jobId: shot.imageJobId as Id<"generationJobs"> });
        const job = shotVideoJob(shot, settings.quality, model);
        enqueue([
          {
            args: {
              modelSlug: job.modelSlug,
              params: JSON.stringify(job.params),
              inputMode: job.inputMode,
              inputs: JSON.stringify({ image: [adopted.storageId] }),
              parentJobId: shot.imageJobId as Id<"generationJobs">,
              derivation: "animacija",
              ...(projectId ? { projectId } : {}),
            },
            onCreated: (jobId) => void attachJob({ storyboardId, shotIndex: index, kind: "video", jobId }),
          },
        ]);
      } catch (caught) {
        setError(studioErrorMessage(caught instanceof Error ? caught.message : String(caught), locale));
      }
    }
  }

  async function join() {
    if (!draft || !board) return;
    setJoining(true);
    try {
      const { probeMedia } = await import("@/components/crea/video/engine/media");
      const sources: Array<{ caption: string; durationS: number; source: StripSceneSource | null }> = [];
      let allReal = true;
      for (const shot of draft.shots) {
        const video = shot.videoJobId ? jobs[shot.videoJobId] : undefined;
        const image = imageOf(shot);
        let source: StripSceneSource | null = null;
        if (video && jobDone(video) && !video.isMock && video.outputUrl) {
          const probed = await probeMedia("video", video.outputUrl);
          source = { kind: "video", ref: { jobId: shot.videoJobId! }, durationS: probed?.durationS ?? shot.durationS };
        } else if (image && jobDone(image)) {
          source = { kind: "image", ref: { jobId: shot.imageJobId! } };
          if (image.isMock) allReal = false;
        }
        sources.push({ caption: shot.caption, durationS: shot.durationS, source });
      }
      const timeline = storyboardTimeline({ title: draft.title, aspect: settings.aspect, shots: sources, captions });
      // Projekat u Crei samo kad su svi radovi pravi (DEMO radovi ne smeju u sačuvan projekat); nacrt uvek.
      let convexId: string | undefined;
      if (allReal) {
        const saved = await saveMontage({ title: draft.title, doc: serializeTimeline(timeline), origin: "strip", ...(projectId ? { projectId } : {}) });
        if (saved.ok) {
          convexId = saved.id;
          await setMontage({ storyboardId: board._id, montageId: saved.id });
        }
      }
      await saveDraft({ id: newDraftId(), title: draft.title, origin: "strip", timeline, updatedAt: Date.now(), ...(convexId ? { convexId } : {}) });
      const query = new URLSearchParams(creaShellQuery({ area: "video", mode: "montaza", tool: "video.montaza" }, searchParams));
      router.push(`${pathname}?${query.toString()}`, { scroll: false });
    } catch (caught) {
      setError(studioErrorMessage(caught instanceof Error ? caught.message : String(caught), locale));
      setJoining(false);
    }
  }

  const unavailable = !imageChoice ? T.sttUnavailable[locale] : null;
  const shotsProblem = shots.length < STORYBOARD_LIMITS.shotsMin ? T.stripMinShots[locale] : null;

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<BookOpen aria-hidden="true" className="size-5" />} />

      {!storyboardId ? (
        <div className="mt-5 space-y-5 border-t border-line pt-5">
          {mine && mine.length > 0 ? (
            <details>
              <summary className="inline-flex min-h-11 cursor-pointer items-center type-body-sm font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                {T.stripMine[locale]} ({mine.length})
              </summary>
              <ul className="mt-2 divide-y divide-line">
                {mine.map((row) => (
                  <li key={row._id} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate type-body-sm font-bold text-ink">
                      {row.title} · {row.shotCount}
                    </span>
                    <Button variant="secondary" onClick={() => setStoryboardId(row._id)}>
                      {T.stripOpen[locale]}
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <label className="block">
            <span className="type-body font-black text-ink">{T.stripStory[locale]}</span>
            <textarea value={story} rows={5} maxLength={STORYBOARD_LIMITS.storyChars} onChange={(event) => setStory(event.target.value)} placeholder={T.stripStoryPlaceholder[locale]} className={`${FIELD} resize-y`} />
            <span className="mt-1 block font-mono text-xs font-bold text-muted">
              {story.length}/{STORYBOARD_LIMITS.storyChars}
            </span>
          </label>

          <ChoiceChips<number> legend={T.stripShots[locale]} name="crea-strip-broj" options={SHOT_COUNTS.map((id) => ({ id, label: String(id) }))} value={shotCount} onChange={setShotCount} />

          <fieldset className="min-w-0">
            <legend className="type-body-sm font-black text-ink">{T.stripCharacters[locale]}</legend>
            {liks.length === 0 ? (
              <p className="mt-2 type-body-sm font-semibold text-muted">{T.stripNoCharacters[locale]}</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {liks.map((element) => {
                  const on = picked.includes(element._id);
                  return (
                    <label
                      key={element._id}
                      className={cn(
                        "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 py-1 pl-1 pr-4 text-sm font-black transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink motion-reduce:transition-none",
                        on ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper text-ink hover:border-ink",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        disabled={!on && picked.length >= STORYBOARD_LIMITS.elementsMax}
                        onChange={() => setPicked((list) => (on ? list.filter((id) => id !== element._id) : [...list, element._id]))}
                      />
                      {element.images[0]?.url ? <img src={element.images[0].url} alt="" className="size-9 rounded-full object-cover" /> : null}
                      @{element.handle}
                      {on ? <Check aria-hidden="true" className="size-4" /> : null}
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="type-body-sm font-black text-ink">{T.stripStyle[locale]}</span>
              <select value={styleId} onChange={(event) => setStyleId(event.target.value)} className={`${FIELD} min-h-11`}>
                <option value="">{T.stripStyleNone[locale]}</option>
                {CREA_STYLES.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.label[locale]}
                  </option>
                ))}
              </select>
            </label>
            <ChoiceChips<StoryboardAspect> legend={T.aspectLegend[locale]} name="crea-strip-oblik" options={STORYBOARD_ASPECTS.map((id) => ({ id, label: T.aspects[id][locale] }))} value={aspect} onChange={setAspect} />
          </div>
          <ChoiceChips<StoryboardQuality>
            legend={T.stripQuality[locale]}
            name="crea-strip-kvalitet"
            options={STORYBOARD_QUALITY_IDS.map((id) => ({ id, label: STORYBOARD_QUALITY[id].label[locale], hint: STORYBOARD_QUALITY[id].hint[locale] }))}
            value={quality}
            onChange={setQuality}
          />
          <div className="space-y-2">
            <Button onClick={() => void makePlan()} loading={plan.name === "working"} disabled={!canSave || story.trim().length === 0} icon={<Pencil aria-hidden="true" className="size-4" />}>
              {plan.name === "working" ? T.stripPlanning[locale] : T.stripPlan[locale]}
            </Button>
            {!canSave ? <p className="type-body-sm font-semibold text-muted">{T.noAccess[locale]}</p> : null}
            {plan.name === "error" ? (
              <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
                {plan.message}
              </p>
            ) : null}
          </div>
        </div>
      ) : !board || !draft ? (
        <p className="mt-5 border-t border-line pt-5 type-body-sm font-bold text-muted">{T.working[locale]}</p>
      ) : (
        <div className="mt-5 space-y-5 border-t border-line pt-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 basis-60">
              <span className="type-body-sm font-black text-ink">{T.stripTitle[locale]}</span>
              <input
                value={draft.title}
                maxLength={STORYBOARD_LIMITS.titleChars}
                disabled={working}
                onChange={(event) => {
                  const title = event.target.value;
                  setSaveState("idle");
                  setDraft((current) => (current ? { ...current, title, dirty: true } : current));
                }}
                className={`${FIELD} min-h-11 font-black`}
              />
            </label>
            <Button variant="secondary" onClick={() => void saveEdits()} disabled={!draft.dirty || working} loading={saveState === "saving"} icon={<Save aria-hidden="true" className="size-4" />}>
              {saveState === "saved" && !draft.dirty ? T.stripSaved[locale] : T.stripSave[locale]}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStoryboardId(null);
                setDraft(null);
              }}
              disabled={working}
              icon={<Plus aria-hidden="true" className="size-4" />}
            >
              {T.stripNew[locale]}
            </Button>
          </div>
          {demoPlan ? <p className="type-body-sm font-semibold text-muted">{T.demoPlan[locale]}</p> : null}

          <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={draft.title}>
            {shots.map((shot, index) => {
              const image = imageOf(shot);
              const video = shot.videoJobId ? jobs[shot.videoJobId] : undefined;
              const media: PanelMedia = {
                image: image && jobDone(image) ? { url: image.outputUrl, mock: image.isMock } : null,
                video: video && jobDone(video) ? { url: video.outputUrl, mock: video.isMock } : null,
              };
              return (
                <StripPanel
                  key={`${index}-${shot.imageJobId ?? "x"}`}
                  locale={locale}
                  index={index}
                  count={shots.length}
                  shot={shot}
                  media={media}
                  status={statuses[index]!}
                  disabled={working}
                  onChange={(patch) => edit(index, patch)}
                  onMove={(delta) => reorder(index, delta)}
                  onRemove={() => setDraft((current) => (current ? { ...current, dirty: true, shots: current.shots.filter((_, other) => other !== index) } : current))}
                  onRedraw={shot.imageJobId && !working ? () => void redraw(index) : null}
                />
              );
            })}
          </ol>
          {shots.length < STORYBOARD_LIMITS.shotsMax ? (
            <Button
              variant="secondary"
              disabled={working}
              icon={<Plus aria-hidden="true" className="size-4" />}
              onClick={() =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        dirty: true,
                        shots: [
                          ...current.shots,
                          { caption: "", shotType: "srednji", imagePrompt: "", motionPrompt: "subtle natural motion", move: "staticno", durationS: 5, elements: [] },
                        ],
                      }
                    : current,
                )
              }
            >
              {T.stripAdd[locale]}
            </Button>
          ) : null}

          <div className="space-y-4 border-t border-line pt-5">
            {total.total !== null ? (
              <p className="type-body font-black text-ink">
                {fillCopy(T.stripTotal[locale], { img: formatCredits(total.images!, locale), vid: formatCredits(total.videos!, locale), total: formatCredits(total.total, locale) })}
              </p>
            ) : null}
            <div className="flex flex-wrap items-start gap-6">
              <PaidSubmit
                locale={locale}
                label={T.stripDraw[locale]}
                icon={<Pencil aria-hidden="true" className="size-4" />}
                credits={toDraw.length > 0 ? drawCost : null}
                blocker={!canSave ? T.noAccess[locale] : unavailable ?? shotsProblem ?? (toDraw.length === 0 ? T.done[locale] : working ? T.working[locale] : null)}
                status={{ name: "idle" }}
                demo={imageChoice?.demo ?? false}
                onSubmit={() => void draw()}
              />
              <PaidSubmit
                locale={locale}
                label={T.stripAnimate[locale]}
                icon={<Sparkles aria-hidden="true" className="size-4" />}
                credits={toAnimate.length > 0 ? animateCost : null}
                blocker={!canSave ? T.noAccess[locale] : !videoChoice ? T.sttUnavailable[locale] : toAnimate.length === 0 ? (allDrawn ? T.done[locale] : T.stripNeedDrawings[locale]) : working ? T.working[locale] : null}
                status={{ name: "idle" }}
                demo={videoChoice?.demo ?? false}
                onSubmit={() => void animate()}
              />
            </div>
            {working ? <p className="type-body-sm font-semibold text-muted">{T.keepOpen[locale]}</p> : null}
            {error ? (
              <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
                {error}
              </p>
            ) : null}
          </div>

          <div className="space-y-3 border-t border-line pt-5">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 type-body-sm font-black text-ink">
              <input type="checkbox" checked={captions} onChange={(event) => setCaptions(event.target.checked)} className="size-5 accent-ink" />
              {T.stripCaptions[locale]}
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void join()} loading={joining} disabled={!allDrawn || working} icon={<Film aria-hidden="true" className="size-4" />}>
                {T.stripJoin[locale]}
              </Button>
              <p className="type-body-sm font-semibold text-muted">{allDrawn ? T.stripJoinHint[locale] : T.stripNeedDrawings[locale]}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
