import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/components/ui/primitives";

/**
 * Callout: kratka, uokvirena poruka (ikona + naslov + tekst) za stanje o kome
 * korisnik treba da zna, a koje nije ni prazno stanje (`EmptyState`) ni toast.
 *
 * Ton prati ostatak app-a: `bg-paper-strong` povrsina na `card` radijusu, ikona
 * u zutom ostrvu (isto kao `EmptyState`). Sve preko tokena, pa prati temu; nema
 * novih status boja (crvena/amber/emerald su i dalje neotokenizovane).
 */
export function Callout({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon?: LucideIcon;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="note"
      className={cn(
        "surface-card flex items-start gap-3 border-2 border-ink bg-paper-strong px-4 py-3 shadow-[4px_4px_0_0_var(--shadow-hard-12)]",
        className,
      )}
    >
      {Icon ? (
        <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
          <Icon aria-hidden="true" className="size-4" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="type-h4 text-ink">{title}</p> : null}
        <div className={cn("type-body-sm font-semibold text-muted", title && "mt-1")}>{children}</div>
      </div>
    </div>
  );
}
