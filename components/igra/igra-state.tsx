import { Inbox, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import { IgraArt } from "@/components/igra/igra-art";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton, cn } from "@/components/ui/primitives";
import { withLocale, type Locale } from "@/lib/i18n";
import type { IgraArtId } from "@/lib/igra-art";
import { igraStateArt, igraStateBody, igraStateCta, igraStateRole, igraStateTitle, type IgraStateVariant } from "@/lib/igra-state";

/**
 * Jedno stanje unutar aplikacije (K23, plan §6.10): prazno, greška, 404, učitavanje,
 * offline, zaključano, uskoro. Ilustracija, naslov, jedna kratka rečenica i najviše jedno
 * dugme, sve preko `EmptyState` da se okvir i razmaci ne razilaze od ostatka aplikacije.
 *
 * Tekst se podrazumeva po varijanti (`IGRA_STATE_COPY`); strana koja zna više od
 * podrazumevanog prosleđuje svoj `title`/`body`/`art`. Dugme: `action` ako ga strana daje,
 * inače „Pokušaj ponovo" za grešku i offline kad postoji `onRetry`, a 404 vraća na tablu.
 */
export function IgraState({
  variant,
  locale,
  title,
  body,
  art,
  action,
  onRetry,
  page = false,
  compact = false,
  className,
}: {
  variant: IgraStateVariant;
  locale: Locale;
  title?: string;
  body?: string;
  /** Slika po ID-ju; podrazumevana je ona iz `lib/igra-state.ts`. */
  art?: IgraArtId;
  /** Dugme; `null` gasi podrazumevano (404 bez povratka na tablu). */
  action?: ReactNode;
  onRetry?: () => void;
  /** Stanje koje je ceo ekran (granica greške, 404): visina da ne izgleda zalutalo. */
  page?: boolean;
  /**
   * Unutar liste, dijaloga ili uskog panela: bez okvira, mala slika, a rečenica koju strana
   * da (`title`) je jedini tekst. `body` se crta samo ako ga strana prosledi.
   */
  compact?: boolean;
  className?: string;
}) {
  const cta = igraStateCta(variant, locale);
  const defaultAction =
    variant === "404" && cta ? (
      <LinkButton href={withLocale(locale, "/app")} tone="yellow">
        {cta}
      </LinkButton>
    ) : onRetry && cta ? (
      <Button icon={<RotateCcw className="size-4" aria-hidden="true" />} onClick={onRetry}>
        {cta}
      </Button>
    ) : undefined;

  if (compact) {
    return (
      <div role={igraStateRole(variant)} data-igra-state={variant} className={cn("grid justify-items-center gap-2 px-3 py-4 text-center", className)}>
        <IgraArt id={art ?? igraStateArt(variant)} size="md" decorative />
        <p className="type-body-sm font-bold text-ink">{title ?? igraStateTitle(variant, locale)}</p>
        {body ? <p className="type-caption font-semibold text-muted">{body}</p> : null}
        {action === null ? null : (action ?? defaultAction)}
      </div>
    );
  }

  return (
    <div role={igraStateRole(variant)} data-igra-state={variant}>
      <EmptyState
        className={cn(page && "min-h-80 content-center", className)}
        icon={Inbox}
        art={<IgraArt id={art ?? igraStateArt(variant)} size={page ? 140 : "lg"} decorative />}
        title={title ?? igraStateTitle(variant, locale)}
        body={body ?? igraStateBody(variant, locale)}
        action={action === null ? undefined : (action ?? defaultAction)}
      />
    </div>
  );
}
