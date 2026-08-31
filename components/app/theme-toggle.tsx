"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { THEME_ATTRIBUTE, type ResolvedTheme } from "@/lib/theme";

// Jedno dugme: sunce u svetloj, mesec u tamnoj temi; klik prebacuje svetlo↔tamno.
// Čita razrešenu temu direktno sa `data-theme` na <html> (koji već postavi inline
// skripta pre prve boje), pa se poklapa i kad je izbor "sistem".
function subscribeResolvedTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [THEME_ATTRIBUTE],
  });
  return () => observer.disconnect();
}

function getResolvedTheme(): ResolvedTheme {
  return document.documentElement.getAttribute(THEME_ATTRIBUTE) === "dark" ? "dark" : "light";
}

function getServerResolvedTheme(): ResolvedTheme {
  return "light";
}

export function ThemeToggle({ locale, className }: { locale: Locale; className?: string }) {
  const { setPreference } = useTheme();
  const resolved = useSyncExternalStore(subscribeResolvedTheme, getResolvedTheme, getServerResolvedTheme);
  const isDark = resolved === "dark";
  const label =
    locale === "sr"
      ? isDark
        ? "Prebaci na svetlu temu"
        : "Prebaci na tamnu temu"
      : isDark
        ? "Switch to light theme"
        : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={() => setPreference(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink transition hover:-translate-y-0.5 hover:bg-yellow/25 active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        className,
      )}
    >
      {isDark ? (
        <Moon className="size-4 shrink-0" aria-hidden="true" />
      ) : (
        <Sun className="size-4 shrink-0" aria-hidden="true" />
      )}
    </button>
  );
}
