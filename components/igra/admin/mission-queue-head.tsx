import { IgraArt } from "@/components/igra/igra-art";
import { Odometer } from "@/components/igra/odometer";
import { ADMIN_PENDING_CAP } from "@/lib/igra-admin";
import { IGRA_ADMIN_COPY } from "@/lib/igra-admin-copy";
import type { Locale } from "@/lib/i18n";

/**
 * Glava „Red misija" (K22, plan K20 §4.1) na `/app/community/moderation`: nalepnica, naslov i
 * koliko objava čeka. Broj je `notifications.pendingApprovals` (plafon `take(100)` → „100+"),
 * ne broj učitanih redova. Samo izgled: redovi, redosled i akcije ostaju u redu ispod.
 */
export function MissionQueueHead({ locale, pending }: { locale: Locale; pending: number | undefined }) {
  return (
    <header className="flex flex-wrap items-center gap-4">
      <IgraArt id="admin.moderacija" size="md" decorative className="shrink-0" />
      <div className="min-w-0 flex-1 basis-56">
        <h1 className="font-display type-display-sm text-ink">{IGRA_ADMIN_COPY.missionQueue[locale]}</h1>
        <p className="mt-1 max-w-xl type-body-sm font-semibold text-muted">{IGRA_ADMIN_COPY.missionBody[locale]}</p>
      </div>
      <p className="flex items-baseline gap-2">
        {pending === undefined ? (
          <Odometer loading locale={locale} size="lg" />
        ) : (
          <span>
            <Odometer value={Math.min(pending, ADMIN_PENDING_CAP)} locale={locale} size="lg" />
            {pending >= ADMIN_PENDING_CAP ? <span className="type-h1 font-black text-ink">+</span> : null}
          </span>
        )}
        <span className="type-eyebrow text-muted">{IGRA_ADMIN_COPY.queueWaiting[locale]}</span>
      </p>
    </header>
  );
}

/** Redni broj misije u učitanom redu; ne menja ključ, redosled ni visinu reda. */
export function MissionNumber({ locale, index }: { locale: Locale; index: number }) {
  return (
    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-paper type-caption font-black tabular-nums text-ink">
      <span className="sr-only">{IGRA_ADMIN_COPY.mission[locale]} </span>
      {index + 1}
    </span>
  );
}
