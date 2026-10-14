"use client";

import { CheckCircle2 } from "lucide-react";
import { useRef } from "react";

import { useStampIn } from "@/components/igra/motion/use-stamp-in";
import { IGRA_ADMIN_COPY } from "@/lib/igra-admin-copy";
import type { Locale } from "@/lib/i18n";

/**
 * Stanje spremnosti stavke u uredniku sadržaja (K22, plan K20 §5.1). Spremna stavka dobija
 * pečat „Spremno" koji udari samo kad `stampKey` (stavka + spremnost) postane nov; inače
 * ostaje ista žuta pilula `x/y` kao do sada. Uz smanjen pokret pečat odmah stoji.
 */
export function ReadyStamp({
  locale,
  ready,
  done,
  total,
  stampKey,
}: {
  locale: Locale;
  ready: boolean;
  done: number;
  total: number;
  stampKey: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useStampIn(ref, { playKey: ready ? stampKey : "" });

  if (!ready) {
    return (
      <span className="rounded-full border-2 border-ink bg-yellow px-4 py-2 type-eyebrow text-ink">
        {done}/{total}
      </span>
    );
  }
  return (
    <span ref={ref} className="igra-stamp min-h-11 gap-2 bg-paper-strong px-4 type-eyebrow">
      <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
      {IGRA_ADMIN_COPY.ready[locale]} · {done}/{total}
    </span>
  );
}
