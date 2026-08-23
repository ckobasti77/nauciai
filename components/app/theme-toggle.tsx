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
// Uvek samo ikone (bez teksta pored njih) da kontrola ostane kompaktna svuda
// gde se koristi; labela ostaje za čitače ekrana preko aria-label na dugmetu.
export function ThemeToggle({ locale, className }: { locale: Locale; className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label={locale === "sr" ? "Tema" : "Theme"}
      className={cn(
        "inline-flex w-fit shrink-0 self-start items-center gap-0.5 rounded-full border-2 border-line bg-paper p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, icon: Icon, sr, en }) => {
        const selected = preference === value;
        const label = locale === "sr" ? sr : en;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              selected ? "bg-yellow text-ink" : "text-muted hover:text-ink",
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
