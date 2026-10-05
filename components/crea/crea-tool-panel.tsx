import type { ReactNode } from "react";

import { CREA_ICONS } from "@/components/crea/crea-icons";
import type { CreaModeDef } from "@/lib/crea-shell";
import type { Locale } from "@/lib/i18n";

/**
 * Levi panel radionice: naziv režima, jedna rečenica šta radi i alat ispod
 * (danas composer; od K04 i lokalni alati). Bez sopstvenog okvira - okvir nosi
 * kartica composera (jedan okvir po grupi).
 */
export function CreaToolPanel({
  locale,
  mode,
  children,
}: {
  locale: Locale;
  mode: CreaModeDef;
  children: ReactNode;
}) {
  const Icon = CREA_ICONS[mode.icon];
  return (
    <section aria-labelledby="crea-tool-panel-title" className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="paper-island grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="crea-tool-panel-title" className="type-h3 text-ink">
            {mode.label[locale]}
          </h2>
          <p className="mt-0.5 type-body-sm font-semibold text-muted">{mode.blurb[locale]}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
