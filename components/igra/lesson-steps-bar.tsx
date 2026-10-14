"use client";

import { useEffect, useRef, useState } from "react";

import { useMarkerFill } from "@/components/igra/motion/use-marker-fill";
import { cn } from "@/components/ui/primitives";
import { activeLessonStep, lessonStepsView } from "@/lib/igra-lesson";
import type { Locale } from "@/lib/i18n";

/**
 * Traka koraka kroz lekciju (K09, plan K07 §2.2): „Korak 3 od 5" i marker koji se razlije
 * do tog koraka. Prezentaciona - korak daje pozivalac (`useActiveLessonStep` za blokove
 * Light prikaza, indeks koraka u Pro prikazu). `floating` je lepljiva pilula iznad
 * sadržaja i nosi svoj okvir, jer lebdi; bez toga je red unutar tuđeg okvira.
 */
export function LessonStepsBar({
  step,
  total,
  locale,
  floating = false,
  className,
}: {
  /** Tekući korak, od 1. */
  step: number;
  total: number;
  locale: Locale;
  floating?: boolean;
  className?: string;
}) {
  const view = lessonStepsView(step, total, locale);
  const fillRef = useRef<HTMLSpanElement>(null);
  useMarkerFill(fillRef, view.progress);

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        floating && "rounded-full border-2 border-ink bg-paper-strong px-4 py-2 shadow-[3px_3px_0_0_var(--shadow-hard-12)]",
        className,
      )}
    >
      {/* Isti tekst nosi `aria-valuetext` trake, pa se ovde ne čita drugi put. */}
      <p aria-hidden="true" className="shrink-0 type-eyebrow-sm tabular-nums text-ink">
        {view.label}
      </p>
      <div {...view.a11y} className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-igra-track">
        <span ref={fillRef} className="block h-full origin-left bg-igra-marker" style={{ transform: "scaleX(0)" }} />
      </div>
    </div>
  );
}

/**
 * Indeks bloka do kog je čitalac stigao (od 0); `ids` su DOM id-jevi blokova lekcije redom.
 * Meri se najviše jednom po frejmu dok strana skroluje, a pravilo je čista funkcija
 * `activeLessonStep`. Blokovi se traže pri svakom merenju, pa hook radi i kad ih prikaz
 * lekcije (Light / Pro) skine i vrati.
 */
export function useActiveLessonStep(ids: readonly string[]): number {
  const [active, setActive] = useState(0);
  const key = ids.join("|");

  useEffect(() => {
    const blockIds = key ? key.split("|") : [];
    if (blockIds.length < 2) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const tops = blockIds.flatMap((id) => document.getElementById(id)?.getBoundingClientRect().top ?? []);
      if (tops.length < 2) return;
      const atPageEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setActive(activeLessonStep(tops, window.innerHeight, atPageEnd));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [key]);

  return active;
}
