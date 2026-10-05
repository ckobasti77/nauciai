"use client";

import { Info, ShieldCheck } from "lucide-react";

import { cn } from "@/components/ui/primitives";
import { isSafeToPublish, LICENSE_SYNTHID_NOTE, type LicenseTag } from "@/lib/crea-license-tags";
import { CREA_SOUND_COPY as T } from "@/lib/crea-sound-copy";
import type { Locale } from "@/lib/i18n";

/**
 * Oznaka „Sigurno za objavu" (Crea K23, A21): pilula sa ikonom; sa `detail`
 * ispod ide i rečenica zašto, napomena o SynthID-u i izvor (link).
 */
export function LicenseBadge({ tag, locale, detail = false, className }: { tag: LicenseTag | null; locale: Locale; detail?: boolean; className?: string }) {
  if (!tag) return null;
  const safe = isSafeToPublish(tag);
  const Icon = safe ? ShieldCheck : Info;
  return (
    <span className={cn("inline-flex min-w-0 flex-col gap-1", className)}>
      <span
        title={tag.detail[locale]}
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 text-xs font-black",
          safe ? "border-ink bg-yellow text-ink" : "border-ink/40 bg-paper text-ink",
        )}
      >
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        {tag.label[locale]}
      </span>
      {detail ? (
        <span className="type-body-sm font-semibold text-muted">
          {tag.detail[locale]} {tag.synthId ? `${LICENSE_SYNTHID_NOTE[locale]} ` : null}
          <a
            href={tag.source.url}
            target="_blank"
            rel="noreferrer"
            className="font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {T.license.source[locale]}
          </a>
        </span>
      ) : null}
    </span>
  );
}
