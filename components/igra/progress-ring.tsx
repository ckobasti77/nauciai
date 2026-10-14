import type { ReactNode } from "react";

import { LevelRing } from "@/components/igra/level-ring";
import { cn } from "@/components/ui/primitives";

/**
 * Prsten napretka (K08): isti SVG kao prsten nivoa, sa kratkim natpisom u sredini
 * („4/9", „33 %"). Za lekciju u kursu i kurs u učionici. `progress` je 0..1; naziv za
 * čitač ekrana daje pozivalac (u sredini je samo skraćenica).
 */
export function ProgressRing({
  progress,
  label,
  size = 56,
  stroke = 5,
  children,
  className,
}: {
  progress: number;
  label: string;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span role="img" aria-label={label} className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <LevelRing progress={progress} size={size} stroke={stroke} />
      {children ? (
        <span aria-hidden="true" className="type-caption font-black tabular-nums text-ink">
          {children}
        </span>
      ) : null}
    </span>
  );
}
