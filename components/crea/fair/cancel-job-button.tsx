"use client";

import { useAction } from "convex/react";
import { X } from "lucide-react";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CREA_CANCEL_COPY } from "@/lib/crea-fair-copy";
import type { Locale } from "@/lib/i18n";

/**
 * „Otkaži" na radu koji čeka (K28, U7). Server sam odlučuje sme li (provajder još
 * nije počeo) i vraća kredite postojećim putem (`studio.failJob`), tačno jednom.
 */
export function CancelJobButton({ jobId, locale }: { jobId: string; locale: Locale }) {
  const cancel = useAction(api.creaFair.cancelJob);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleCancel() {
    setBusy(true);
    setMessage(null);
    try {
      const reply = await cancel({ jobId: jobId as Id<"generationJobs"> });
      if (!reply.ok) setMessage(CREA_CANCEL_COPY[reply.reason][locale]);
    } catch {
      setMessage(CREA_CANCEL_COPY.GRESKA[locale]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-x-3 bottom-3 z-10 flex flex-col items-end gap-1.5">
      {message ? (
        <p role="status" className="surface-inset max-w-[260px] bg-paper-strong px-2.5 py-1.5 text-xs font-bold text-ink">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void handleCancel()}
        disabled={busy}
        title={CREA_CANCEL_COPY.cancelTitle[locale]}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <X aria-hidden="true" className="size-3.5" />
        {busy ? CREA_CANCEL_COPY.cancelling[locale] : CREA_CANCEL_COPY.cancel[locale]}
      </button>
    </div>
  );
}
