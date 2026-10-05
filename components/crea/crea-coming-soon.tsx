import { CREA_ICONS } from "@/components/crea/crea-icons";
import { CREA_SOON_COPY } from "@/lib/crea-copy";
import { CREA_MODES, type CreaArea, type CreaModeDef, type CreaModeId } from "@/lib/crea-shell";
import type { Locale } from "@/lib/i18n";

/**
 * Režim koji još nema sadržaj (K03): nije mrtvo dugme nego list sveske sa jednom
 * rečenicom šta će raditi, i prečicama ka režimima ove radionice koji već rade.
 */
export function CreaComingSoon({
  locale,
  area,
  mode,
  onSelectMode,
}: {
  locale: Locale;
  area: CreaArea;
  mode: CreaModeDef;
  onSelectMode: (mode: CreaModeId) => void;
}) {
  const Icon = CREA_ICONS[mode.icon];
  const ready = CREA_MODES[area].filter((entry) => entry.status === "ready");

  return (
    <section
      aria-labelledby="crea-soon-title"
      className="surface-card sketch-grid border-2 border-ink bg-paper-strong p-5 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-8"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="paper-island grid size-12 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <h2 id="crea-soon-title" className="type-h2 text-ink">
          {mode.label[locale]}
        </h2>
        <span className="rounded-full border-2 border-ink bg-paper px-3 py-1 text-xs font-black text-ink">
          {CREA_SOON_COPY.title[locale]}
        </span>
      </div>
      <p className="mt-4 max-w-xl type-body font-semibold text-ink">{mode.blurb[locale]}</p>

      {ready.length > 0 ? (
        <div className="mt-6 border-t border-line pt-4">
          <p className="type-body-sm font-bold text-muted">{CREA_SOON_COPY.meanwhile[locale]}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ready.map((entry) => {
              const EntryIcon = CREA_ICONS[entry.icon];
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onSelectMode(entry.id)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
                >
                  <EntryIcon aria-hidden="true" className="size-4" />
                  {entry.label[locale]}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
