"use client";

import { RotateCcw } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect } from "react";

import { normalizeLocale } from "@/lib/i18n";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ locale?: string }>();
  const locale = normalizeLocale(params?.locale);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section
      className="grid min-h-80 place-items-center rounded-[16px] border-2 border-ink bg-white p-6 text-center shadow-[6px_6px_0_rgba(14,49,88,0.12)]"
      role="alert"
    >
      <div className="max-w-md">
        <p className="font-display text-2xl text-ink">
          {locale === "sr" ? "Tabla je nakratko zastala." : "The board paused for a moment."}
        </p>
        <h2 className="mt-2 text-2xl font-black text-ink">
          {locale === "sr" ? "Pregled nije učitan" : "The overview did not load"}
        </h2>
        <p className="mt-3 text-sm font-semibold leading-6 text-muted">
          {locale === "sr"
            ? "Pokušaj ponovo. Tvoj napredak je sačuvan i ništa nije izgubljeno."
            : "Try again. Your progress is saved and nothing was lost."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black text-ink shadow-[3px_3px_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          {locale === "sr" ? "Učitaj ponovo" : "Try again"}
        </button>
      </div>
    </section>
  );
}
