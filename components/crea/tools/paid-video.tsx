"use client";

import { useAction, useMutation } from "convex/react";
import { CircleCheck, Coins } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { CreaPaidContext } from "@/components/crea/tools/types";
import type { PickedVideo } from "@/components/crea/tools/video-input";
import { useSlotUpload } from "@/components/studio/use-slot-upload";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CREA_VIDEO_TOOLS_COPY as T } from "@/lib/crea-video-tools-copy";
import type { Locale } from "@/lib/i18n";
import type { StudioModel } from "@/lib/studio-models";
import { formatCredits } from "@/lib/studio-params";

/**
 * Zajednički delovi plaćenih video alata (Crea K20): da li je model dostupan
 * (ista odluka kao composer), priprema videa kao ulaza (rad iz galerije bez
 * kopije, `adoptOutputAsInput`, ili upload sa uređaja) uz SERVERSKO merenje
 * trajanja (po njemu se naplaćuje), i dugme sa cenom i stanjem slanja.
 */

export type PaidModelChoice = { model: StudioModel; demo: boolean };

/**
 * Model iz kataloga koji sme da se ponudi: javni korisnik ne dobija model bez
 * ključa (server bi ga odbio), osoblje vidi DEMO - ista odluka kao composer.
 */
export function paidModel(paid: CreaPaidContext | null, slug: string, inputMode: string): PaidModelChoice | null {
  if (!paid) return null;
  const model = paid.catalog.find((entry) => entry.slug === slug);
  if (!model || !model.inputModes.includes(inputMode)) return null;
  const keyMissing = paid.providerStatus?.[model.provider] === false;
  if (keyMissing && paid.publicEnabled && !paid.isStaff) return null;
  return { model, demo: keyMissing };
}

/** Trajanje izabranog videa po `<video>` metapodacima - samo za cenu na dugmetu (naplata ide po serveru). */
export function useLocalVideoSeconds(picked: PickedVideo | null): number | null {
  const [state, setState] = useState<{ key: string; seconds: number | null } | null>(null);
  const key = picked?.key ?? null;
  const source = picked?.source ?? null;
  useEffect(() => {
    if (!key || !source) return;
    let alive = true;
    void (async () => {
      const { probeMedia } = await import("@/components/crea/video/engine/media");
      const probed = await probeMedia("video", source);
      if (alive) setState({ key, seconds: probed?.durationS ?? null });
    })();
    return () => {
      alive = false;
    };
  }, [key, source]);
  return state && state.key === key ? state.seconds : null;
}

/**
 * Video kao ulaz posla: rad iz galerije postaje alias (bez kopije), fajl sa
 * uređaja se okači. Oba se mere na serveru; `seconds` je `null` kad merenje ne
 * uspe (posao po trajanju tada ne može da krene).
 */
export function usePrepareVideo() {
  const adopt = useMutation(api.creaVersions.adoptOutputAsInput);
  const measure = useAction(api.studioActions.measureInputUpload);
  const upload = useSlotUpload();
  return useCallback(
    async (picked: PickedVideo, slot = "video"): Promise<{ storageId: Id<"_storage">; seconds: number | null }> => {
      if (picked.sourceJobId) {
        const adopted = await adopt({ jobId: picked.sourceJobId });
        if (adopted.durationS !== null) return { storageId: adopted.storageId, seconds: adopted.durationS };
        const measured = await measure({ storageId: adopted.storageId });
        return { storageId: adopted.storageId, seconds: measured.ok ? measured.seconds : null };
      }
      const file = picked.source instanceof File ? picked.source : new File([picked.source as Blob], "video.mp4", { type: "video/mp4" });
      const uploaded = await upload(file, slot, () => undefined);
      if (uploaded.url) URL.revokeObjectURL(uploaded.url);
      if (!uploaded.storageId) throw new Error("UPLOAD_BEZ_ID");
      return { storageId: uploaded.storageId as Id<"_storage">, seconds: uploaded.measuredSeconds ?? null };
    },
    [adopt, measure, upload],
  );
}

/** Fajl (slika, zvuk) kao ulaz posla; trajanje zvuka meri server. */
export function useUploadInput() {
  const upload = useSlotUpload();
  return useCallback(
    async (file: File, slot: string): Promise<{ storageId: Id<"_storage">; seconds: number | null }> => {
      const uploaded = await upload(file, slot, () => undefined);
      if (uploaded.url) URL.revokeObjectURL(uploaded.url);
      if (!uploaded.storageId) throw new Error("UPLOAD_BEZ_ID");
      return { storageId: uploaded.storageId as Id<"_storage">, seconds: uploaded.measuredSeconds ?? null };
    },
    [upload],
  );
}

export type SendStatus = { name: "idle" } | { name: "working" } | { name: "sent" } | { name: "error"; message: string };

/** Dugme sa cenom, razlog zašto stoji, i stanje slanja (DEMO, greška, poslato). */
export function PaidSubmit({
  locale,
  label,
  icon,
  credits,
  approximate = false,
  blocker,
  status,
  demo,
  onSubmit,
  children,
}: {
  locale: Locale;
  label: string;
  icon: ReactNode;
  credits: number | null;
  approximate?: boolean;
  blocker: string | null;
  status: SendStatus;
  demo: boolean;
  onSubmit: () => void;
  children?: ReactNode;
}) {
  const busy = status.name === "working";
  const priceText = useMemo(() => (credits === null ? null : `${approximate ? "≈ " : ""}${formatCredits(credits, locale)}`), [approximate, credits, locale]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onSubmit}
          disabled={blocker !== null || credits === null}
          loading={busy}
          icon={icon}
          className="shadow-[4px_4px_0_0_var(--ink)]"
        >
          {label}
          {priceText ? (
            <span className="inline-flex items-center gap-1 font-mono">
              · <Coins aria-hidden="true" className="size-3.5" />
              {priceText}
            </span>
          ) : null}
        </Button>
        {blocker && status.name === "idle" ? <p className="type-body-sm font-semibold text-muted">{blocker}</p> : null}
      </div>
      <div aria-live="polite" className="space-y-2">
        {busy ? <p className="type-body-sm font-bold text-ink">{T.working[locale]}</p> : null}
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
        {demo ? <p className="type-body-sm font-semibold text-muted">{T.demoModel[locale]}</p> : null}
        {children}
      </div>
    </div>
  );
}
