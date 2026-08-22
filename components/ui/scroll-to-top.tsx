"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/components/ui/primitives";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 600);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
      }}
      aria-label="Nazad na vrh"
      className={cn(
        // The sub-md lift clears the fixed bottom tab bar on /app; harmless on marketing pages.
        "fixed bottom-[calc(5rem_+_env(safe-area-inset-bottom))] right-4 z-50 grid size-12 place-items-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[3px_3px_0_var(--shadow-hard)] transition hover:-translate-y-0.5 hover:bg-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:right-6 md:bottom-6",
      )}
    >
      <ArrowUp className="size-5" aria-hidden="true" />
    </button>
  );
}
