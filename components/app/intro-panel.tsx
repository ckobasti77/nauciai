"use client";

import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import type { IntroPanelId } from "@/lib/app-intro-panels";
import { readDismissedIntroPanels, writeDismissedIntroPanel } from "@/lib/app-intro-panels";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

/**
 * `localStorage` nema sopstvenu pretplatu unutar istog taba, pa je ovo
 * najmanji mogući izvor promene za `useSyncExternalStore`: jedno zatvaranje
 * panela obavesti sve panele na ekranu.
 */
const dismissalListeners = new Set<() => void>();

function subscribeToDismissals(listener: () => void) {
  dismissalListeners.add(listener);
  return () => {
    dismissalListeners.delete(listener);
  };
}

function notifyDismissalChanged() {
  for (const listener of dismissalListeners) listener();
}

/**
 * Kratak uvod u jedan deo aplikacije: šta je ovo, čemu služi i koji je prvi
 * korak. Stoji na vrhu ekrana dok ga korisnik ne zatvori; zatvaranje se pamti u
 * `localStorage` (`lib/app-intro-panels.ts`), bez ijedne izmene na backendu.
 *
 * Panel se renderuje tek posle montiranja, jer odgovor na pitanje "da li je
 * zatvoren" na serveru ne postoji. Zato bi svaki drugi izbor bio ili
 * neusklađen HTML pri hidraciji, ili panel koji na trenutak zasvetli i onda
 * nestane pred nekim ko ga je odavno zatvorio.
 */
export function AppIntroPanel({
  id,
  locale,
  icon: Icon,
  title,
  body,
  steps,
  action,
  className,
}: {
  id: IntroPanelId;
  locale: Locale;
  icon: LucideIcon;
  title: string;
  body: string;
  /** Tri kratka koraka, redom. Prvi je onaj koji korisnik treba da uradi odmah. */
  steps: readonly string[];
  action?: ReactNode;
  className?: string;
}) {
  const dismissed = useSyncExternalStore(
    subscribeToDismissals,
    () => readDismissedIntroPanels().includes(id),
    // Na serveru odgovor ne postoji, pa je "zatvoren" jedini bezbedan izbor:
    // panel se pojavi tek posle hidracije, umesto da bljesne pa nestane.
    () => true,
  );

  if (dismissed) return null;

  return (
    <section
      className={cn(
        "relative rounded-[16px] border-2 border-ink bg-paper-strong p-4 shadow-[4px_4px_0_0_var(--shadow-hard)] sm:p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3 pr-10">
        <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-black leading-6 text-ink">{title}</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-muted">{body}</p>
        </div>
      </div>

      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step}
            className="flex items-start gap-2 rounded-[12px] border-2 border-line bg-paper px-3 py-2 text-sm font-bold leading-5 text-ink"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper-strong text-xs font-black">
              {index + 1}
            </span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>

      {action ? <div className="mt-4 flex flex-wrap gap-2">{action}</div> : null}

      <Button
        variant="ghost"
        size="sm"
        className="absolute right-2 top-2 size-9 border-2 border-line p-0"
        onClick={() => {
          writeDismissedIntroPanel(id);
          notifyDismissalChanged();
        }}
        aria-label={t(locale, "Zatvori uvod i ne prikazuj ga ponovo", "Close this intro and do not show it again")}
      >
        <X aria-hidden="true" className="size-4" />
      </Button>
    </section>
  );
}
