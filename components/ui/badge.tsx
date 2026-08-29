import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/components/ui/primitives";

/**
 * Pilula za status, nivo pretplate i brojace. `rounded-full` se ovde pise
 * rucno: podrazumevani radius iz `@layer base` daje pilulu samo dugmadima, a
 * ovo je `<span>` (vidi AGENTS.md, tier "pill").
 */
const badgeTones = {
  neutral: "border-line bg-paper-strong text-ink",
  yellow: "border-ink bg-yellow text-ink",
  ink: "border-ink bg-ink text-paper-strong",
  muted: "border-line bg-paper text-muted",
  danger: "border-red-300 bg-red-50 text-red-800",
} as const;

const badgeSizes = {
  sm: "gap-1 px-2 py-0.5 text-[10px]",
  md: "gap-1.5 px-2.5 py-1 text-[11px]",
} as const;

export type BadgeTone = keyof typeof badgeTones;
export type BadgeSize = keyof typeof badgeSizes;

export function Badge({
  tone = "neutral",
  size = "md",
  icon,
  className,
  children,
  ...props
}: Omit<ComponentProps<"span">, "children"> & {
  tone?: BadgeTone;
  size?: BadgeSize;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center rounded-full border-2 font-black uppercase tracking-[0.08em] whitespace-nowrap",
        badgeSizes[size],
        badgeTones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
