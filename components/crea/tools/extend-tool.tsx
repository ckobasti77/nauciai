"use client";

import { useMutation, useQuery } from "convex/react";
import { CircleCheck, Coins, FastForward, Film } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { FieldMic } from "@/components/crea/create/mic-button";
import { usePromptParamState } from "@/components/crea/tools/use-prompt-param";

import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useVideoInput, VideoInput } from "@/components/crea/tools/video-input";
import { useSlotUpload } from "@/components/studio/use-slot-upload";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { isControlVisible } from "@/convex/studioParamSpec";
import { creaShellQuery } from "@/lib/crea-shell";
import { CREA_INPUT_PARAM } from "@/lib/crea-versions";
import { CREA_VIDEO_COPY as T } from "@/lib/crea-video-copy";
import {
  EXTEND_ROUTES,
  extendParams,
  extendRouteProblem,
  type ExtendDirection,
  type ExtendRoute,
} from "@/lib/crea-video-extend";
import { studioErrorMessage } from "@/lib/studio-messages";
import type { StudioModel } from "@/lib/studio-models";
import { buildParams, creditsFor, formatCredits, paramValuesForMode } from "@/lib/studio-params";
import { useCreaCreateJob } from "@/components/crea/game/crea-tool-context";

type Status = { name: "idle" } | { name: "working" } | { name: "sent" } | { name: "error"; message: string };

function durationRange(model: StudioModel, inputMode: string): { min: number; max: number } {
  const control = model.paramSpec.find((entry) => entry.key === "duration" && isControlVisible(entry, inputMode));
  return { min: control?.min ?? 4, max: control?.max ?? 8 };
}

/**
 * „Produži klip" (Crea K18, V5): nastavak posle kraja ili početak pre prvog kadra.
 * Seedance 2.5 (napred i nazad, izvorni video kao referenca 1) i Veo 3.1 (napred,
 * samo Veo klip do 15 MB) - oba postojeći redovi kataloga. Izvor iz galerije ide
 * bez kopije (`adoptOutputAsInput`, alias istog bloba), video sa uređaja kroz
 * običan upload ulaza. Posao je verzija izvora (`produzenje`), cena je na dugmetu.
 */
export default function ExtendTool({ tool, locale, canSave, projectId, source, paid }: CreaToolProps) {
  const video = useVideoInput(source);
  const picked = video.picked;
  const createJob = useCreaCreateJob();
  const adopt = useMutation(api.creaVersions.adoptOutputAsInput);
  const upload = useSlotUpload();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const textId = useId();
  const [routeId, setRouteId] = useState<ExtendRoute["id"]>("seedance");
  const [direction, setDirection] = useState<ExtendDirection>("napred");
  const [seconds, setSeconds] = useState(5);
  const [text, setText] = usePromptParamState();
  const [status, setStatus] = useState<Status>({ name: "idle" });

  const sourceJob = useQuery(api.studio.getJobForDetail, picked?.sourceJobId ? { jobId: picked.sourceJobId } : "skip");
  // Veličina rada iz galerije (Veo prima do 15 MB): `Content-Length` sa storage-a.
  const [remoteBytes, setRemoteBytes] = useState<{ url: string; bytes: number | null } | null>(null);
  const remoteUrl = picked && typeof picked.source === "string" ? picked.source : null;
  useEffect(() => {
    if (!remoteUrl) return;
    let alive = true;
    void fetch(remoteUrl, { method: "HEAD" })
      .then((response) => Number(response.headers.get("content-length")) || null)
      .catch(() => null)
      .then((bytes) => {
        if (alive) setRemoteBytes({ url: remoteUrl, bytes });
      });
    return () => {
      alive = false;
    };
  }, [remoteUrl]);
  const bytes = picked ? (picked.bytes ?? (remoteBytes?.url === remoteUrl ? remoteBytes?.bytes ?? null : null)) : null;
  const sourceInfo = { modelSlug: sourceJob?.modelSlug ?? "", bytes };

  // Ruta se nudi samo za model koji je u katalogu i dostupan (ista odluka kao composer).
  const available = useMemo(
    () =>
      EXTEND_ROUTES.flatMap((route) => {
        const model = paid?.catalog.find((entry) => entry.slug === route.modelSlug);
        if (!model || !model.inputModes.includes(route.inputMode)) return [];
        const keyMissing = paid?.providerStatus?.[model.provider] === false;
        if (keyMissing && paid?.publicEnabled && !paid.isStaff) return [];
        return [{ route, model, demo: keyMissing }];
      }),
    [paid],
  );
  const picks = available.map((entry) => ({ ...entry, problem: picked ? extendRouteProblem(entry.route, sourceInfo) : null }));
  const chosen = picks.find((entry) => entry.route.id === routeId && entry.problem === null) ?? picks.find((entry) => entry.problem === null) ?? null;
  const dir: ExtendDirection = chosen && chosen.route.directions.includes(direction) ? direction : "napred";
  const range = chosen ? durationRange(chosen.model, chosen.route.inputMode) : { min: 4, max: 8 };
  const wantedSeconds = Math.min(range.max, Math.max(range.min, seconds));

  const params = chosen
    ? buildParams(
        chosen.model.paramSpec,
        { ...paramValuesForMode(chosen.model.paramSpec, chosen.route.inputMode), ...extendParams(chosen.route, dir, text, wantedSeconds) },
        chosen.route.inputMode,
      )
    : null;
  const credits = chosen && params ? creditsFor(chosen.model.priceRule, params, chosen.route.inputMode, chosen.model.creditFactor) : null;
  const isDemoSource = sourceJob?.isMock === true;
  const blocker = !picked ? T.needSource[locale] : isDemoSource ? T.demoSource[locale] : !chosen ? T.extendProblems["drugi-model"][locale] : null;
  const busy = status.name === "working";

  async function submit() {
    if (!chosen || !params || !picked || blocker || busy) return;
    setStatus({ name: "working" });
    try {
      let storageId: string;
      if (picked.sourceJobId) {
        storageId = (await adopt({ jobId: picked.sourceJobId })).storageId;
      } else {
        const file = picked.source as File;
        const uploaded = await upload(file, chosen.route.slot, () => undefined);
        if (uploaded.url) URL.revokeObjectURL(uploaded.url);
        if (!uploaded.storageId) throw new Error("UPLOAD_BEZ_ID");
        storageId = uploaded.storageId;
      }
      const result = await createJob({
        modelSlug: chosen.route.modelSlug,
        params: JSON.stringify(params),
        inputMode: chosen.route.inputMode,
        inputs: JSON.stringify({ [chosen.route.slot]: [storageId] }),
        ...(picked.sourceJobId ? { parentJobId: picked.sourceJobId, derivation: "produzenje" as const } : {}),
        ...(projectId ? { projectId } : {}),
      });
      if (result && typeof result === "object" && "moderationBlocked" in result) {
        setStatus({ name: "error", message: studioErrorMessage(`NEISPRAVAN_PROMPT:${result.moderationBlocked.reason}`, locale) });
        return;
      }
      setStatus({ name: "sent" });
    } catch (error) {
      setStatus({ name: "error", message: studioErrorMessage(error instanceof Error ? error.message : String(error), locale) });
    }
  }

  const chainHref = (() => {
    const query = new URLSearchParams(creaShellQuery({ area: "video", mode: "napravi", tool: "video.poslednji-kadar" }, searchParams));
    if (picked?.sourceJobId) query.set(CREA_INPUT_PARAM, picked.sourceJobId);
    return `${pathname}?${query.toString()}`;
  })();

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<FastForward aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <VideoInput locale={locale} input={video} disabled={busy} />
        {picks.length > 0 ? (
          <ChoiceChips<ExtendRoute["id"]>
            legend={T.extendRoute[locale]}
            name="crea-extend-route"
            options={picks.map((entry) => ({
              id: entry.route.id,
              label: entry.route.label[locale],
              ...(entry.problem ? { hint: T.extendProblems[entry.problem][locale] } : {}),
            }))}
            value={chosen?.route.id ?? routeId}
            onChange={setRouteId}
            disabled={busy}
          />
        ) : (
          <p className="type-body-sm font-semibold text-muted">{T.extendAnyModel[locale]}</p>
        )}
        {chosen && chosen.route.directions.length > 1 ? (
          <ChoiceChips<ExtendDirection>
            legend={T.extendDirection[locale]}
            name="crea-extend-direction"
            options={chosen.route.directions.map((id) => ({ id, label: T.directions[id][locale] }))}
            value={dir}
            onChange={setDirection}
            disabled={busy}
          />
        ) : null}
        <label className="block">
          <span className="type-body-sm font-black text-ink">
            {T.extendSeconds[locale]}: <span className="font-mono tabular-nums">{wantedSeconds} s</span>
          </span>
          <input
            type="range"
            min={range.min}
            max={range.max}
            step={1}
            value={wantedSeconds}
            disabled={busy}
            onChange={(event) => setSeconds(Number(event.target.value))}
            className="mt-2 block h-11 w-full accent-ink"
          />
        </label>
        <div>
          <label htmlFor={textId} className="type-body-sm font-black text-ink">
            {T.extendText[locale]}
          </label>
          <textarea
            id={textId}
            value={text}
            rows={2}
            maxLength={600}
            disabled={busy}
            onChange={(event) => setText(event.target.value)}
            placeholder={T.extendPlaceholder[locale]}
            className="surface-inset mt-2 block w-full resize-y border-2 border-ink bg-paper px-3 py-2 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
          <FieldMic locale={locale} value={text} onChange={setText} disabled={busy} maxLength={600} />
        </div>
        <p className="type-body-sm font-semibold text-muted">
          {T.extendAnyModel[locale]}{" "}
          <Link href={chainHref} className="inline-flex items-center gap-1 font-black text-ink underline decoration-yellow decoration-2 underline-offset-4">
            <Film aria-hidden="true" className="size-4" />
            {locale === "sr" ? "Otvori alat" : "Open the tool"}
          </Link>
        </p>
      </div>
      <div className="mt-5 space-y-3 border-t border-line pt-5">
        {!canSave ? (
          <p className="type-body-sm font-semibold text-muted">{T.noAccess[locale]}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void submit()}
              disabled={!chosen || blocker !== null || credits === null}
              loading={busy}
              icon={<FastForward aria-hidden="true" className="size-4" />}
              className="shadow-[4px_4px_0_0_var(--ink)]"
            >
              {T.extendCreate[locale]}
              {credits !== null ? (
                <span className="inline-flex items-center gap-1 font-mono">
                  · <Coins aria-hidden="true" className="size-3.5" />
                  {formatCredits(credits, locale)}
                </span>
              ) : null}
            </Button>
            {blocker && status.name === "idle" ? <p className="type-body-sm font-semibold text-muted">{blocker}</p> : null}
          </div>
        )}
        <div aria-live="polite" className="space-y-2">
          {status.name === "sent" ? (
            <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
              <CircleCheck aria-hidden="true" className="size-4" />
              {T.sent[locale]}
            </p>
          ) : null}
          {status.name === "error" ? (
            <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
              {status.message}
            </p>
          ) : null}
          {chosen?.route.id === "seedance" ? <p className="type-body-sm font-semibold text-muted">{T.extendUnverified[locale]}</p> : null}
          {chosen?.demo ? (
            <p className="type-body-sm font-semibold text-muted">
              {locale === "sr" ? "Ovaj model radi u DEMO režimu - izlaz je probni, ne pravi." : "This model runs in DEMO mode - the output is a sample, not real."}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
