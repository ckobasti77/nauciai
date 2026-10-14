import { IgraArt } from "@/components/igra/igra-art";
import { cn } from "@/components/ui/primitives";
import type { IgraArtId } from "@/lib/igra-art";

/**
 * Naslovnica Crea strane (K17): galerija, izazov i sveska. Korica sveske sa teksturom
 * papira i washi trakom, naslov levo i JEDNA nalepnica desno (plan K14 ODLUKA 15: ove
 * strane nemaju scenu-heroja). Bez okvira: koricu odvaja površina (`bg-surface-b`) i
 * tekstura, a okvir ostaje karticama sadržaja ispod. Nalepnica je medij bez svog okvira.
 */
export function CreaCover({ art, title, subtitle, className }: { art: IgraArtId; title: string; subtitle: string; className?: string }) {
  return (
    <header
      className={cn(
        "igra-paper surface-card relative flex items-center gap-4 bg-surface-b px-4 py-5 text-ink sm:gap-6 sm:px-6",
        className,
      )}
    >
      <span aria-hidden="true" className="igra-tape -top-2.5 left-6" />
      <div className="min-w-0 flex-1">
        <h1 className="type-h1 break-words">{title}</h1>
        <p className="mt-1 type-body type-measure text-muted">{subtitle}</p>
      </div>
      {/* Omotači nose prikaz: `hidden` na samoj slici bi izgubio od njenog `inline-block`. */}
      <span className="block shrink-0 -rotate-6 sm:hidden">
        <IgraArt id={art} size="md" decorative />
      </span>
      <span className="hidden shrink-0 -rotate-6 sm:block">
        <IgraArt id={art} size="lg" decorative />
      </span>
    </header>
  );
}
