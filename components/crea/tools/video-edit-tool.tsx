"use client";

import { useMutation, useQuery } from "convex/react";
import { Replace, WandSparkles } from "lucide-react";
import { useId, useState } from "react";

import { FieldMic } from "@/components/crea/create/mic-button";
import { usePromptParamState } from "@/components/crea/tools/use-prompt-param";

import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { FacePicker, type FaceChoice } from "@/components/crea/tools/face-picker";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { paidModel, PaidSubmit, useLocalVideoSeconds, usePrepareVideo, useUploadInput, type SendStatus } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useVideoInput, VideoInput } from "@/components/crea/tools/video-input";
import { api } from "@/convex/_generated/api";
import { fillCopy } from "@/lib/crea-copy";
import { jobCredits } from "@/lib/crea-job-price";
import {
  editInstruction,
  editParams,
  editPrompt,
  editRouteProblem,
  swapPrompt,
  swapTarget,
  VIDEO_EDIT_EXAMPLES,
  VIDEO_EDIT_ROUTES,
  VIDEO_SWAP_TARGETS,
  type VideoEditRouteId,
} from "@/lib/crea-video-edit";
import { CREA_VIDEO_TOOLS_COPY as T } from "@/lib/crea-video-tools-copy";
import { studioErrorMessage } from "@/lib/studio-messages";

type SwapKind = "predmet" | "lik";
type Resolution = "720p" | "1080p";

const textareaClass =
  "surface-inset mt-2 block w-full resize-y border-2 border-ink bg-paper px-3 py-2 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60";

/**
 * Izmeni video rečima (V13) i Zameni predmet ili lik (V14) - Crea K20. Jedan
 * alat, dva ulaza u registru: izmena (primeri rečenica + svoje reči) i zamena
 * (šta se menja + slika novog predmeta, ili tvoj Lik preko servera). Kling O3
 * izmena (zvuk ostaje, plaća se po sekundi ulaza) ili Seedance 2.5 (bez zvuka,
 * do 10 s). Posao ide kroz postojeći `createJob` i postaje verzija izvornog videa.
 */
export default function VideoEditTool({ tool, locale, canSave, projectId, source, paid }: CreaToolProps) {
  const isSwap = tool.id === "video.zameni";
  const video = useVideoInput(source);
  const picked = video.picked;
  const localSeconds = useLocalVideoSeconds(picked);
  const refs = useImageInput();
  const createJob = useMutation(api.studio.createJob);
  const startVideoSwap = useMutation(api.creaFaceJobs.startVideoSwap);
  const prepareVideo = usePrepareVideo();
  const uploadInput = useUploadInput();
  const textId = useId();
  const sourceJob = useQuery(api.studio.getJobForDetail, picked?.sourceJobId ? { jobId: picked.sourceJobId } : "skip");

  const [routeId, setRouteId] = useState<VideoEditRouteId>("kling");
  const [example, setExample] = useState<string | null>(null);
  const [text, setText] = usePromptParamState();
  const [swapKind, setSwapKind] = useState<SwapKind>("predmet");
  const [targetId, setTargetId] = useState<string | null>(VIDEO_SWAP_TARGETS[0]!.id);
  const [face, setFace] = useState<FaceChoice | null>(null);
  const [consent, setConsent] = useState(false);
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [status, setStatus] = useState<SendStatus>({ name: "idle" });

  const likSwap = isSwap && swapKind === "lik";
  const routes = VIDEO_EDIT_ROUTES.filter((route) => !likSwap || route.id === "kling").flatMap((route) => {
    const choice = paidModel(paid, route.modelSlug, route.inputMode);
    return choice ? [{ route, ...choice, problem: editRouteProblem(route, localSeconds) }] : [];
  });
  const chosen = routes.find((entry) => entry.route.id === routeId && entry.problem === null) ?? routes.find((entry) => entry.problem === null) ?? null;
  const refCount = refs.picked ? 1 : 0;
  const instruction = isSwap ? swapTarget(targetId, text) : editInstruction(example, text);
  const prompt = chosen ? (isSwap ? swapPrompt(chosen.route, instruction, Math.max(1, refCount)) : editPrompt(chosen.route, instruction, refCount)) : "";
  const seconds = localSeconds ?? chosen?.route.minS ?? 5;
  const params = chosen ? editParams(chosen.route, prompt, seconds, resolution) : null;
  const credits =
    chosen && params && paid
      ? jobCredits({ modelSlug: chosen.route.modelSlug, inputMode: chosen.route.inputMode, params, measured: { duration: seconds } }, paid.catalog)
      : null;

  const blocker = !picked
    ? T.needVideo[locale]
    : sourceJob?.isMock
      ? T.demoSource[locale]
      : !chosen
        ? routes.length === 0
          ? T.unavailable[locale]
          : fillCopy(T.editRouteProblems.predugo[locale], { max: Math.max(...routes.map((entry) => entry.route.maxS)) })
        : likSwap
          ? face?.kind !== "lik"
            ? T.needFace[locale]
            : !consent
              ? T.needConsent[locale]
              : null
          : isSwap
            ? !refs.picked || !instruction
              ? T.swapNeedObject[locale]
              : null
            : !instruction
              ? T.editNeedText[locale]
              : null;

  async function submit() {
    if (!chosen || !params || !picked || blocker || status.name === "working") return;
    setStatus({ name: "working" });
    try {
      const videoInput = await prepareVideo(picked);
      if (likSwap && face?.kind === "lik") {
        await startVideoSwap({
          elementId: face.elementId,
          videoStorageId: videoInput.storageId,
          resolution,
          consent: true,
          ...(projectId ? { projectId } : {}),
          ...(picked.sourceJobId ? { parentJobId: picked.sourceJobId } : {}),
        });
      } else {
        const images = refs.picked ? [(await uploadInput(refs.picked.file, "image")).storageId] : [];
        const finalParams = editParams(chosen.route, prompt, videoInput.seconds ?? seconds, resolution);
        const result = await createJob({
          modelSlug: chosen.route.modelSlug,
          params: JSON.stringify(finalParams),
          inputMode: chosen.route.inputMode,
          inputs: JSON.stringify({ video: [videoInput.storageId], ...(images.length > 0 ? { image: images } : {}) }),
          ...(picked.sourceJobId ? { parentJobId: picked.sourceJobId, derivation: "izmena" as const } : {}),
          ...(projectId ? { projectId } : {}),
        });
        if (result && typeof result === "object" && "moderationBlocked" in result) {
          setStatus({ name: "error", message: studioErrorMessage(`NEISPRAVAN_PROMPT:${result.moderationBlocked.reason}`, locale) });
          return;
        }
      }
      setStatus({ name: "sent" });
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const faceError = Object.keys(T.faceErrors).find((code) => raw.includes(code)) as keyof typeof T.faceErrors | undefined;
      setStatus({ name: "error", message: faceError ? T.faceErrors[faceError][locale] : studioErrorMessage(raw, locale) });
    }
  }

  const busy = status.name === "working";
  const icon = isSwap ? <Replace aria-hidden="true" className="size-5" /> : <WandSparkles aria-hidden="true" className="size-5" />;

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={icon} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <VideoInput locale={locale} input={video} disabled={busy} />

        {isSwap ? (
          <ChoiceChips<SwapKind>
            legend={T.swapWhat[locale]}
            name="crea-video-swap-kind"
            options={(["predmet", "lik"] as const).map((id) => ({ id, label: T.swapKinds[id][locale] }))}
            value={swapKind}
            onChange={(kind) => {
              setSwapKind(kind);
              setStatus({ name: "idle" });
            }}
            disabled={busy}
          />
        ) : null}

        {routes.length > 1 ? (
          <ChoiceChips<VideoEditRouteId>
            legend={T.editRoute[locale]}
            name="crea-video-edit-route"
            options={routes.map((entry) => ({
              id: entry.route.id,
              label: entry.route.label[locale],
              ...(entry.problem ? { hint: fillCopy(T.editRouteProblems[entry.problem][locale], { min: entry.route.minS, max: entry.route.maxS }) } : {}),
            }))}
            value={chosen?.route.id ?? routeId}
            onChange={setRouteId}
            disabled={busy}
          />
        ) : null}

        {likSwap ? (
          <div className="space-y-3">
            <p className="type-body-sm font-semibold text-muted">{T.swapLikNote[locale]}</p>
            <FacePicker locale={locale} kind="image" value={face} onChange={(choice) => setFace(choice.kind === "lik" ? choice : null)} disabled={busy} />
            <label className="flex min-h-11 items-start gap-3 type-body-sm font-bold text-ink">
              <input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} className="mt-1 size-5 shrink-0 accent-ink" />
              {T.consent[locale]}
            </label>
          </div>
        ) : isSwap ? (
          <div className="space-y-4">
            <ChoiceChips<string>
              legend={T.swapWhat[locale]}
              name="crea-video-swap-target"
              options={VIDEO_SWAP_TARGETS.map((target) => ({ id: target.id, label: target.label[locale] }))}
              value={text.trim() ? "" : targetId ?? ""}
              onChange={(id) => {
                setTargetId(id);
                setText("");
              }}
              disabled={busy}
            />
            <div>
              <label htmlFor={textId} className="type-body-sm font-black text-ink">
                {T.swapTargetText[locale]}
              </label>
              <input
                id={textId}
                value={text}
                maxLength={200}
                disabled={busy}
                onChange={(event) => setText(event.target.value)}
                placeholder={T.swapTargetPlaceholder[locale]}
                className={`${textareaClass} min-h-11`}
              />
            </div>
            <div className="space-y-2">
              <p className="type-body-sm font-black text-ink">{T.swapNewObject[locale]}</p>
              <ImageInput locale={locale} input={refs} disabled={busy} fullScreenDrop={false} />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <fieldset disabled={busy} className="min-w-0">
              <legend className="type-body-sm font-black text-ink">{T.editExamples[locale]}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {VIDEO_EDIT_EXAMPLES.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={example === entry.id}
                    onClick={() => setExample((current) => (current === entry.id ? null : entry.id))}
                    className={
                      example === entry.id
                        ? "inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-ink px-4 text-sm font-black text-paper-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        : "inline-flex min-h-11 items-center rounded-full border-2 border-ink/25 bg-paper px-4 text-sm font-black text-ink hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    }
                  >
                    {entry.label[locale]}
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor={textId} className="type-body-sm font-black text-ink">
                {T.editText[locale]}
              </label>
              <textarea
                id={textId}
                value={text}
                rows={2}
                maxLength={600}
                disabled={busy}
                onChange={(event) => setText(event.target.value)}
                placeholder={T.editPlaceholder[locale]}
                className={textareaClass}
              />
              <FieldMic locale={locale} value={text} onChange={setText} disabled={busy} maxLength={600} />
            </div>
            <div className="space-y-2">
              <p className="type-body-sm font-black text-ink">{fillCopy(T.editRefs[locale], { n: 1 })}</p>
              <ImageInput locale={locale} input={refs} disabled={busy} fullScreenDrop={false} />
            </div>
          </div>
        )}

        {chosen?.route.id === "kling" || likSwap ? (
          <ChoiceChips<Resolution>
            legend={T.quality[locale]}
            name="crea-video-edit-quality"
            options={(["720p", "1080p"] as const).map((id) => ({ id, label: id }))}
            value={resolution}
            onChange={setResolution}
            disabled={busy}
          />
        ) : null}
        {chosen?.route.id === "seedance" ? <p className="type-body-sm font-semibold text-muted">{T.editSeedanceNote[locale]}</p> : null}
      </div>

      <div className="mt-5 border-t border-line pt-5">
        {!canSave ? (
          <p className="type-body-sm font-semibold text-muted">{T.noAccess[locale]}</p>
        ) : (
          <PaidSubmit
            locale={locale}
            label={isSwap ? T.swapRun[locale] : T.editRun[locale]}
            icon={icon}
            credits={credits}
            approximate={localSeconds === null}
            blocker={blocker}
            status={status}
            demo={chosen?.demo ?? false}
            onSubmit={() => void submit()}
          >
            <p className="type-body-sm font-semibold text-muted">{T.perSecond[locale]}</p>
          </PaidSubmit>
        )}
      </div>
    </section>
  );
}
