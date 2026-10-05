import { cn } from "@/components/ui/primitives";
import { CREA_TOOL_COPY } from "@/lib/crea-copy";
import { toolBadges, type CreaTool, type CreaToolBadge } from "@/lib/crea-tools";
import type { Locale } from "@/lib/i18n";

/** Oznake alata: „Besplatno", „Na tvom uređaju", „Krediti", „Uskoro". */
const BADGE_ORDER: CreaToolBadge[] = ["besplatno", "na-uredjaju", "krediti", "uskoro"];

export function ToolBadges({
  tool,
  locale,
  className,
  onInk = false,
}: {
  tool: CreaTool;
  locale: Locale;
  className?: string;
  /** Oznake na tamnoj (izabranoj) podlozi. */
  onInk?: boolean;
}) {
  const badges = toolBadges(tool);
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {BADGE_ORDER.filter((badge) => badges.includes(badge)).map((badge) => (
        <li
          key={badge}
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs font-black",
            badge === "besplatno"
              ? onInk
                ? "border-yellow bg-yellow text-ink"
                : "border-ink bg-ink text-paper-strong"
              : onInk
                ? "border-paper-strong/50 text-paper-strong"
                : "border-ink/30 bg-paper text-ink",
          )}
        >
          {CREA_TOOL_COPY.badges[badge][locale]}
        </li>
      ))}
    </ul>
  );
}
