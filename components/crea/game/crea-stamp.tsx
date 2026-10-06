import Image from "next/image";

import { cn } from "@/components/ui/primitives";
import { CREA_STAMP_COPY } from "@/lib/crea-game-copy";
import type { Locale } from "@/lib/i18n";

/**
 * Pečat „Odličan 5" (K26, G5): brend pečat Cree (`public/brand/crea/crea-pecat.svg` -
 * prsten „stvaraj · crea" sa znakom) i preko njega traka sa ocenom, kao pečat u
 * svesci. `slam` pušta udarac pečata (CSS, samo uz dozvoljen pokret).
 */
export function CreaStamp({
  locale,
  size = "md",
  slam = false,
  className,
}: {
  locale: Locale;
  size?: "sm" | "md" | "lg";
  slam?: boolean;
  className?: string;
}) {
  const box = size === "lg" ? "size-36" : size === "md" ? "size-20" : "size-12";
  const ribbon = size === "lg" ? "px-3 py-1 text-base" : size === "md" ? "px-2 py-0.5 text-[0.7rem]" : "hidden";
  return (
    <span aria-hidden="true" className={cn("relative inline-grid shrink-0 place-items-center", box, className)}>
      {slam ? <span className="crea-stamp-ink absolute inset-0 rounded-full bg-yellow opacity-0" /> : null}
      <span className={cn("relative grid size-full -rotate-[8deg] place-items-center", slam && "crea-stamp-slam")}>
        <Image src="/brand/crea/crea-pecat.svg" alt="" width={144} height={144} unoptimized className="size-full" />
        <span
          className={cn(
            "absolute bottom-[14%] whitespace-nowrap rounded-full bg-ink font-black leading-none text-paper-strong shadow-[2px_2px_0_0_var(--yellow)]",
            ribbon,
          )}
        >
          {CREA_STAMP_COPY.grade[locale]}
        </span>
      </span>
    </span>
  );
}
