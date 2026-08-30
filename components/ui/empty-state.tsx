import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/components/ui/primitives";

/**
 * Prazno stanje: ikona, naslov, jedno objasnjenje i (skoro uvek) jedno dugme
 * koje odgovara na pitanje "sta sad da uradim". Ton je skolski i topao, pa
 * `body` treba da bude recenica sa sledecim korakom, a ne samo konstatacija.
 *
 * Naslov je namerno `<p>`, a ne `<h2>`/`<h3>`: prazno stanje se ubacuje na vrlo
 * razlicite dubine (u kartici, u koloni, kao ceo ekran), pa bi fiksiran nivo
 * naslova negde slomio redosled naslova - a to je gora greska od nedostatka
 * jednog naslova.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-[16px] border-2 border-dashed border-line bg-paper/70 px-5 py-8 text-center",
        className,
      )}
    >
      <div className="max-w-md">
        <span className="mx-auto grid size-12 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <p className="mt-4 type-h3 text-ink">{title}</p>
        <p className="mt-2 type-body-sm font-semibold text-muted">{body}</p>
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
