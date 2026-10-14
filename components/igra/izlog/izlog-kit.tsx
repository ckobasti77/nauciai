import type { ReactNode } from "react";

import { cn } from "@/components/ui/primitives";

/**
 * Sitni delovi izloga za delove koji prikazuju gotove primitive i površine (od K05).
 * Sekcija NEMA okvir: kartice koje se u njoj prikazuju nose svoj, a okvir u okviru je
 * upravo ono što AGENTS.md zabranjuje. Sekcije deli tanka linija.
 */
export function IzlogSection({ id, title, note, children }: { id?: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-line pt-6">
      <h2 className="type-h2 text-ink">{title}</h2>
      {note ? <p className="mt-1 type-body-sm font-semibold type-measure text-muted">{note}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Jedan primer sa potpisom (stanje, veličina, prop). */
export function IzlogDemo({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="font-mono type-caption text-muted">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
