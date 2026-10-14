import { IgraLik } from "@/components/igra/igra-lik";
import { cn } from "@/components/ui/primitives";
import { creaLikForArea } from "@/lib/igra-crea";
import type { CreaArea } from "@/lib/crea-shell";

/**
 * Zaglavlje radionice (K15, plan K14 §2): lik oblasti sa kratkim savetom u oblačiću,
 * između izbora oblasti i izbora režima. Bez okvira (oblačić je tanka linija iz
 * `IgraLik`); lik je ukras, savet je običan tekst koji čitač ekrana pročita.
 */
export function CreaAreaHeader({ area, help, className }: { area: CreaArea; help: string; className?: string }) {
  const lik = creaLikForArea(area);
  return (
    <div className={cn("flex min-w-0 items-center", className)}>
      {/* Omotači nose prikaz: `hidden` na samom liku bi izgubio od njegovog `inline-flex`. */}
      <span className="block min-w-0 sm:hidden">
        <IgraLik lik={lik} poza="mase" size="sm" decorative bubble={help} />
      </span>
      <span className="hidden min-w-0 max-w-2xl sm:block">
        <IgraLik lik={lik} poza="mase" size="md" decorative bubble={help} />
      </span>
    </div>
  );
}
