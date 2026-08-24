"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";

const SOUND_KEY = "nauciai-chat-sound";

export function SoundToggle({ locale, className }: { locale: Locale; className?: string }) {
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    function update() {
      setSoundEnabled(window.localStorage.getItem(SOUND_KEY) !== "off");
    }
    update();
    window.addEventListener("storage", update);
    window.addEventListener("nauciai:sound-change", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("nauciai:sound-change", update);
    };
  }, []);

  function toggle() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    window.localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    window.dispatchEvent(new CustomEvent("nauciai:sound-change", { detail: { enabled: next } }));
  }

  const label = soundEnabled
    ? locale === "sr"
      ? "Isključi zvuk"
      : "Disable sound"
    : locale === "sr"
      ? "Uključi zvuk"
      : "Enable sound";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border-2 border-ink px-2.5 py-1 text-xs font-black transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        soundEnabled
          ? "bg-paper-strong text-ink shadow-[1px_1px_0_0_var(--shadow-hard)]"
          : "bg-paper text-muted/70",
        className,
      )}
    >
      {soundEnabled ? <Volume2 className="size-3.5 shrink-0" /> : <VolumeX className="size-3.5 shrink-0" />}
      <span>{locale === "sr" ? (soundEnabled ? "Zvuk" : "Nemo") : (soundEnabled ? "Sound" : "Mute")}</span>
    </button>
  );
}
