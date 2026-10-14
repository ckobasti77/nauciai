import { IgraArt } from "@/components/igra/igra-art";
import { IGRA_STATE_COPY } from "@/lib/igra-copy";
import type { Locale } from "@/lib/i18n";

/** Telo trake bez veze (K23). Odvojeno od `IgraOfflineNotice` da ne ulazi u početni JS ljuske. */
export function IgraOfflineBar({ locale }: { locale: Locale }) {
  const copy = IGRA_STATE_COPY.offline;
  return (
    <div role="status" className="surface-inset mb-4 flex items-center gap-3 border border-line bg-paper-strong px-3 py-2">
      <IgraArt id="prazno.offline" size="sm" decorative />
      <p className="min-w-0 type-body-sm font-bold text-ink">
        {copy.title[locale]}. <span className="font-semibold text-muted">{copy.body[locale]}</span>
      </p>
    </div>
  );
}
