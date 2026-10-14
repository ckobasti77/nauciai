"use client";

import { Clock3 } from "lucide-react";
import { useSyncExternalStore } from "react";

import { cn } from "@/components/ui/primitives";
import { belgradeWeekKey } from "@/convex/leaderboardCore";
import { weekCountdown } from "@/lib/igra-leaderboard";
import type { Locale } from "@/lib/i18n";

const MINUTE_MS = 60_000;

/** Kuca jednom u minuti, poravnato na pun minut (tekst je na minut, bez sekundi). */
function subscribeMinute(onTick: () => void) {
  let interval: number | undefined;
  const timeout = window.setTimeout(() => {
    onTick();
    interval = window.setInterval(onTick, MINUTE_MS);
  }, MINUTE_MS - (Date.now() % MINUTE_MS));
  return () => {
    window.clearTimeout(timeout);
    window.clearInterval(interval);
  };
}

const currentMinute = () => Math.floor(Date.now() / MINUTE_MS);
const serverMinute = () => null;

/**
 * „Nedelja se završava za 2 dana i 5 sati · u ponedeljak u 00:00" (K12). Kraj je stvaran,
 * iz `weekKey` liste (ponedeljak 00:00 po Beogradu); tekst je na minut, miran i bez boje
 * hitnosti (O9). Dok ključ liste ne stigne, nedelja se računa po istom pravilu
 * (`belgradeWeekKey`) iz sata pregledača. Na serveru se ne crta (satovi se razlikuju), pa
 * nema nepoklapanja pri hidrataciji; mesto reda je rezervisano da se ništa ne pomeri.
 */
export function WeekCountdown({ weekKey, locale, className }: { weekKey?: string; locale: Locale; className?: string }) {
  const minute = useSyncExternalStore(subscribeMinute, currentMinute, serverMinute);
  // Kraj tekućeg minuta: preostalo vreme se nikad ne prikaže duže nego što jeste.
  const countdown =
    minute === null ? null : weekCountdown(weekKey ?? belgradeWeekKey(minute * MINUTE_MS), (minute + 1) * MINUTE_MS, locale);
  return (
    <p className={cn("flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 type-body-sm font-bold text-muted", className)}>
      {countdown ? (
        <>
          <Clock3 className="size-4 shrink-0" aria-hidden="true" />
          <span className="text-ink">{countdown.text}</span>
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <span className="basis-full pl-6 sm:basis-auto sm:pl-0">{countdown.endsAtLabel}</span>
        </>
      ) : null}
    </p>
  );
}
