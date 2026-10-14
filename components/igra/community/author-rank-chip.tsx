import { GraduationCap } from "lucide-react";

import { cn } from "@/components/ui/primitives";
import { authorRankView } from "@/lib/igra-community";
import type { Locale } from "@/lib/i18n";

/**
 * Čip autora na temi i komentaru (K11): koliko je lekcija autor završio. Podatak je već
 * u redu (`authorRank`), pa čip ne košta nijedan upit. Mirna podloga, bez žute: žuto je
 * za novo i za prvo mesto.
 */
export function AuthorRankChip({
  rank,
  locale,
  className,
}: {
  rank: { completedLessons: number } | null | undefined;
  locale: Locale;
  className?: string;
}) {
  const view = authorRankView(rank, locale);
  if (!view) return null;

  return (
    <span className={cn("inline-flex min-h-6 shrink-0 items-center gap-1 rounded-full bg-igra-track px-2 type-caption font-black tabular-nums text-ink", className)}>
      <GraduationCap className="size-3.5" aria-hidden="true" />
      <span aria-hidden="true">{view.text}</span>
      <span className="sr-only">{view.label}</span>
    </span>
  );
}
