"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: Array<{ value: ThemePreference; icon: LucideIcon; sr: string; en: string }> = [
  { value: "light", icon: Sun, sr: "Svetla", en: "Light" },
  { value: "dark", icon: Moon, sr: "Tamna", en: "Dark" },
  { value: "system", icon: Monitor, sr: "Sistem", en: "System" },
];

// Tri stanja kao segmentirana kontrola u jeziku sidebara (isti obrazac kao
// kursevi/lekcije tabovi): pilula sa okvirom, izabrano polje zuto sa mastilom.
// `compact` (javna zaglavlja): ispod `sm` ostaju samo ikone, tekst ide u sr-only.
export function ThemeToggle({
  locale,
  className,
  compact = false,
}: {
  locale: Locale;
  className?: string;
  compact?: boolean;
}) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label={locale === "sr" ? "Tema" : "Theme"}
      className={cn("flex items-center gap-1 rounded-full border-2 border-line bg-paper p-1", className)}
    >
      {OPTIONS.map(({ value, icon: Icon, sr, en }) => {
        const selected = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setPreference(value)}
            className={cn(
              "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[11px] font-black uppercase tracking-[0.06em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              compact ? "px-2.5 sm:px-2" : "px-2",
              selected ? "bg-yellow text-ink" : "text-muted hover:text-ink",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className={compact ? "sr-only sm:not-sr-only" : undefined}>{locale === "sr" ? sr : en}</span>
          </button>
        );
      })}
    </div>
  );
}
