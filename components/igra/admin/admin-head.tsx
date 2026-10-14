import type { ReactNode } from "react";

import { IgraArt } from "@/components/igra/igra-art";
import { HandUnderline } from "@/components/ui/primitives";
import type { IgraArtId } from "@/lib/igra-art";

/**
 * Zaglavlje admin strana (K21, plan K20): `admin.*` nalepnica uz isti naslov koji su strane
 * i do sada imale (eyebrow, `h1` u display fontu, školski potez). Bez okvira i bez pokreta:
 * igra je u nalepnici, gustina ostaje.
 */
export function AdminHead({
  art,
  eyebrow,
  title,
  children,
}: {
  art: IgraArtId;
  eyebrow: string;
  title: string;
  /** Sadržaj ispod naslova (npr. podnaslov ili dugme), ostaje u istoj koloni. */
  children?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-4">
      <IgraArt id={art} size="md" decorative className="shrink-0" />
      <div className="min-w-0">
        <p className="type-eyebrow text-muted">{eyebrow}</p>
        <h1 className="mt-2 font-display type-display text-ink">{title}</h1>
        <HandUnderline size="sm" className="mt-1" />
        {children}
      </div>
    </header>
  );
}
