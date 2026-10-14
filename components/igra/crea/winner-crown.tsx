"use client";

import { useEffect, useRef, useState } from "react";

import { IgraArt } from "@/components/igra/igra-art";
import { useStampIn } from "@/components/igra/motion/use-stamp-in";

/**
 * Kruna pobednika izazova (K17): nalepnica `rang.kruna` koja jednom „udari" kao pečat kad
 * kartica pobednika uđe u vidno polje. Samo izgled nad postojećim pobednikom; uz smanjen
 * pokret kruna odmah stoji. Tekst „Pobednik" već nosi kartica, pa je kruna ukras.
 */
export function WinnerCrown({ workId }: { workId: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || seen || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
      },
      { threshold: 0.6 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [seen]);

  useStampIn(ref, { playKey: seen ? workId : "" });

  return (
    <span ref={ref} className="block">
      <IgraArt id="rang.kruna" size="sm" decorative />
    </span>
  );
}
