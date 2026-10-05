"use client";

import { useMutation } from "convex/react";
import { CircleCheck, Coins, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { useSlotUpload } from "@/components/studio/use-slot-upload";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CreaPaidContext } from "@/components/crea/tools/types";
import { CREA_PAID_EDIT_COPY as T } from "@/lib/crea-edit-copy";
import { paidEditParams, paidEditPrompt, type CreaPaidRoute } from "@/lib/crea-paid-edit";
import type { Locale } from "@/lib/i18n";
import { studioErrorMessage } from "@/lib/studio-messages";
import type { StudioModel } from "@/lib/studio-models";
import { buildParams, creditsFor, formatCredits, paramValuesForMode } from "@/lib/studio-params";

/** Fajlovi koje ruta šalje (redosled je bitan) i veličina slike, za odnos stranica. */
export type PaidEditFiles = { files: Record<string, Blob[]>; width: number; height: number };

/**
 * K12: alat sam sastavlja parametre posla (opis svetla, mreža uglova, proširenje…).
 * `text` je ono što je korisnik dopisao u polje (može biti prazno), `size` veličina
 * pripremljene slike; cena na dugmetu zove istu funkciju sa `size` 1 × 1.
 */
export type PaidEditRequest = (route: CreaPaidRoute, text: string, size: { width: number; height: number }) => Record<string, string | number>;

/** Polje za opis u plaćenoj izmeni: natpis, primer i da li bez njega dugme ostaje zaključano. */
export type PaidEditTextField = { label: string; placeholder: string; required: boolean };

type Status = { name: "idle" } | { name: "working"; step: "preparing" | "uploading" } | { name: "sent" } | { name: "error"; message: string };

/** Posao koji panel pravi (okačeni ulazi su već `storageId`-jevi). */
export type PaidEditJob = {
  modelSlug: string;
  params: string;
  inputMode: string;
  inputs: Record<string, string[]>;
  parentJobId: Id<"generationJobs"> | null;
  projectId: Id<"studioProjects"> | null;
};

export type PaidEditJobResult = string | { moderationBlocked: { reason: string; category: string } } | null;

const MASK_QUALITIES = ["very_low", "low", "medium", "high"] as const;

/**
 * Plaćena izmena iz alata (K11: četkica S11, veliki predmet S13, AI scena S14).
 * Ide kroz POSTOJEĆI tok: fajlovi se kače kao ulazi (`createInputUploadUrl` →
 * upload → `registerInputUpload`), pa `studio.createJob` - ista cena, limiti,
 * DEMO bez ključa (O3) i stablo verzija (`parentJobId`, K05). Cena na dugmetu
 * se računa istom funkcijom kao na serveru (`creditsFor`).
 */
export function PaidEditPanel({
  locale,
  routes,
  purpose,
  ready,
  notReadyReason,
  prepare,
  parentJobId,
  projectId,
  canSubmit,
  paid,
  request,
  textField,
  label: labelOverride,
  unavailableText,
  onSent,
  measured,
  create,
  errorMessage = studioErrorMessage,
  extraBlocker = null,
  privacyNote,
}: {
  locale: Locale;
  routes: readonly CreaPaidRoute[];
  purpose: "edit" | "erase" | "scene";
  /** Ulaz je spreman (slika, maska); inače dugme stoji zaključano uz `notReadyReason`. */
  ready: boolean;
  notReadyReason: string | null;
  prepare: (route: CreaPaidRoute) => Promise<PaidEditFiles>;
  parentJobId: Id<"generationJobs"> | null;
  projectId: Id<"studioProjects"> | null;
  /** `hasStudioAccess`; bez njega se plaćena izmena ne nudi. */
  canSubmit: boolean;
  paid: CreaPaidContext | null;
  /** K12: parametri posla iz alata umesto `paidEditPrompt`/`paidEditParams`. */
  request?: PaidEditRequest;
  /** Polje za opis; podrazumevano po `purpose`. `null` = bez polja. */
  textField?: PaidEditTextField | null;
  /** Natpis dugmeta; podrazumevano po `purpose`. */
  label?: string;
  /** Rečenica kad nijedna ruta nije dostupna (npr. „stiže uskoro"). */
  unavailableText?: string;
  /** Posao je napravljen - alat može da prati njegov status (npr. mreža uglova, slojevi). */
  onSent?: (jobId: Id<"generationJobs">) => void;
  /**
   * K13: količine koje server sam meri (npr. `input_images` kod FLUX.2 klein izmene) -
   * samo za cenu na dugmetu, da bude ista kao naplata.
   */
  measured?: (route: CreaPaidRoute) => Record<string, number>;
  /**
   * K14: drugi put do posla umesto `studio.createJob` - „Zameni lik" ide kroz
   * `creaElements.startFaceSwap`, koji sam dodaje slike Lika i opis.
   */
  create?: (job: PaidEditJob) => Promise<PaidEditJobResult>;
  /** Rečenica za grešku (podrazumevano kao `createJob`). */
  errorMessage?: (raw: string, locale: Locale) => string;
  /** Razlog iz alata zbog kojeg dugme stoji (npr. pristanak nije označen). */
  extraBlocker?: string | null;
  /** Napomena o privatnosti ispod dugmeta; `null` = bez nje (posao bez slika, npr. kreator lika). */
  privacyNote?: string | null;
}) {
  const createJob = useMutation(api.studio.createJob);
  const upload = useSlotUpload();
  const [quality, setQuality] = useState<(typeof MASK_QUALITIES)[number]>("low");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ name: "idle" });

  // Ruta se nudi samo za model koji je u katalogu i dostupan: javni korisnik ne dobija
  // model bez ključa (server bi ga odbio), osoblje vidi DEMO - ista odluka kao u composeru.
  const available = useMemo(() => {
    if (!paid) return [];
    return routes.flatMap((route) => {
      const model = paid.catalog.find((entry) => entry.slug === route.modelSlug);
      if (!model || !model.inputModes.includes(route.inputMode)) return [];
      const keyMissing = paid.providerStatus?.[model.provider] === false;
      if (keyMissing && paid.publicEnabled && !paid.isStaff) return [];
      return [{ route, model, demo: keyMissing }];
    });
  }, [paid, routes]);

  const [routeSlug, setRouteSlug] = useState<string | null>(null);
  const picked = available.find((entry) => entry.route.modelSlug === routeSlug) ?? available[0] ?? null;
  const field: PaidEditTextField | null =
    textField !== undefined
      ? textField
      : purpose === "erase"
        ? null
        : purpose === "scene"
          ? { label: T.scenePromptLabel[locale], placeholder: T.scenePromptPlaceholder[locale], required: true }
          : { label: T.promptLabel[locale], placeholder: T.promptPlaceholder[locale], required: true };

  function priceOf(entry: { route: CreaPaidRoute; model: StudioModel }, withQuality = quality): number | null {
    const raw = request
      ? request(entry.route, "x", { width: 1, height: 1 })
      : paidEditParams(entry.route, { prompt: "x", quality: withQuality, width: 1, height: 1 });
    const params = buildParams(
      entry.model.paramSpec,
      { ...paramValuesForMode(entry.model.paramSpec, entry.route.inputMode), ...raw },
      entry.route.inputMode,
      measured?.(entry.route) ?? {},
    );
    return creditsFor(entry.model.priceRule, params, entry.route.inputMode, entry.model.creditFactor);
  }

  const credits = picked ? priceOf(picked) : null;
  const blocker = !ready
    ? notReadyReason
    : extraBlocker
      ? extraBlocker
      : field?.required && text.trim().length === 0
      ? textField
        ? T.needText[locale]
        : (purpose === "scene" ? T.needScene : T.needPrompt)[locale]
      : null;
  const busy = status.name === "working";

  async function submit() {
    if (!picked || blocker || busy) return;
    setStatus({ name: "working", step: "preparing" });
    try {
      const prepared = await prepare(picked.route);
      setStatus({ name: "working", step: "uploading" });
      const inputs: Record<string, string[]> = {};
      for (const [slot, blobs] of Object.entries(prepared.files)) {
        inputs[slot] = [];
        for (const [index, blob] of blobs.entries()) {
          const extension = blob.type === "image/png" ? "png" : "jpg";
          const file = new File([blob], `crea-${slot}-${index + 1}.${extension}`, { type: blob.type });
          const uploaded = await upload(file, slot, () => undefined);
          if (uploaded.url) URL.revokeObjectURL(uploaded.url);
          if (!uploaded.storageId) throw new Error("UPLOAD_BEZ_ID");
          inputs[slot].push(uploaded.storageId);
        }
      }
      const params = request
        ? request(picked.route, text, { width: prepared.width, height: prepared.height })
        : paidEditParams(picked.route, {
            prompt: paidEditPrompt(picked.route, purpose, text, locale),
            quality,
            width: prepared.width,
            height: prepared.height,
          });
      const result: PaidEditJobResult = create
        ? await create({
            modelSlug: picked.route.modelSlug,
            params: JSON.stringify(params),
            inputMode: picked.route.inputMode,
            inputs,
            parentJobId,
            projectId,
          })
        : await createJob({
            modelSlug: picked.route.modelSlug,
            params: JSON.stringify(params),
            inputMode: picked.route.inputMode,
            inputs: JSON.stringify(inputs),
            ...(parentJobId ? { parentJobId, derivation: "izmena" as const } : {}),
            ...(projectId ? { projectId } : {}),
          });
      if (result && typeof result === "object" && "moderationBlocked" in result) {
        setStatus({ name: "error", message: errorMessage(`NEISPRAVAN_PROMPT:${result.moderationBlocked.reason}`, locale) });
        return;
      }
      setStatus({ name: "sent" });
      if (typeof result === "string") onSent?.(result as Id<"generationJobs">);
    } catch (error) {
      setStatus({ name: "error", message: errorMessage(error instanceof Error ? error.message : String(error), locale) });
    }
  }

  if (!canSubmit) return <p className="type-body-sm font-semibold text-muted">{T.noAccess[locale]}</p>;
  if (paid !== null && available.length === 0) {
    return <p className="type-body-sm font-semibold text-muted">{unavailableText ?? T.unavailable[locale]}</p>;
  }

  const label = labelOverride ?? (purpose === "erase" ? T.erase[locale] : purpose === "scene" ? T.scene[locale] : T.edit[locale]);

  return (
    <div className="space-y-4">
      {available.length > 1 ? (
        <ChoiceChips
          legend={T.route[locale]}
          name={`crea-paid-route-${purpose}`}
          options={available.map((entry) => {
            const price = priceOf(entry);
            return {
              id: entry.route.modelSlug,
              label: entry.route.label?.[locale] ?? T.routes[entry.route.kind][locale],
              ...(price !== null ? { hint: formatCredits(price, locale) } : {}),
            };
          })}
          value={picked?.route.modelSlug ?? ""}
          onChange={setRouteSlug}
          disabled={busy}
        />
      ) : null}

      {picked?.route.kind === "mask" ? (
        <ChoiceChips
          legend={T.quality[locale]}
          name={`crea-paid-quality-${purpose}`}
          options={MASK_QUALITIES.map((id) => {
            const price = priceOf(picked, id);
            return { id, label: T.qualities[id][locale], ...(price !== null ? { hint: formatCredits(price, locale) } : {}) };
          })}
          value={quality}
          onChange={setQuality}
          disabled={busy}
        />
      ) : null}

      {field ? (
        <label className="block">
          <span className="type-body-sm font-black text-ink">{field.label}</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={2}
            maxLength={1500}
            disabled={busy}
            placeholder={field.placeholder}
            className="surface-inset mt-2 block w-full resize-y border-2 border-ink bg-paper px-3 py-2 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
          />
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => void submit()}
          disabled={!picked || blocker !== null || credits === null}
          loading={busy}
          icon={<Sparkles aria-hidden="true" className="size-4" />}
          className="shadow-[4px_4px_0_0_var(--ink)]"
        >
          {label}
          {credits !== null ? (
            <span className="inline-flex items-center gap-1 font-mono">
              · <Coins aria-hidden="true" className="size-3.5" />
              {formatCredits(credits, locale)}
            </span>
          ) : null}
        </Button>
        {blocker && status.name === "idle" ? <p className="type-body-sm font-semibold text-muted">{blocker}</p> : null}
      </div>

      <div aria-live="polite" className="space-y-2">
        {status.name === "working" ? (
          <p className="type-body-sm font-bold text-ink">{status.step === "preparing" ? T.preparing[locale] : T.uploading[locale]}</p>
        ) : null}
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
        {picked?.demo ? <p className="type-body-sm font-semibold text-muted">{T.demo[locale]}</p> : null}
        {privacyNote !== null ? <p className="type-body-sm font-semibold text-muted">{privacyNote ?? T.privacy[locale]}</p> : null}
      </div>
    </div>
  );
}
