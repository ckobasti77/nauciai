import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AdminHeroScene } from "@/components/igra/admin/admin-hero-scene";
import { IgraLik } from "@/components/igra/igra-lik";
import { IgraSkeleton } from "@/components/igra/igra-skeleton";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { HandUnderline } from "@/components/ui/primitives";
import type { AdminSignal, AdminTone, adminRobiMood } from "@/lib/igra-admin";
import { IGRA_ADMIN_COPY } from "@/lib/igra-admin-copy";
import { withLocale, type Locale } from "@/lib/i18n";

/** Stanje se nikad ne čita samo iz boje: ton pilule + ikona + reč (plan K20, ODLUKA 11). */
const TONE_BADGE: Record<AdminTone, BadgeTone> = { ok: "neutral", paznja: "ink", problem: "danger" };
const TONE_ICON = { ok: CheckCircle2, paznja: AlertTriangle, problem: XCircle } as const;

/**
 * Heroj admina „Kontrolna soba" (K21): JEDAN okvir, list papira kao `IgraHero`, scena
 * `scena.kontrolna-soba` desno od `lg` (`AdminHeroScene`), levo naslov strane, Robi koji
 * javlja stanje sistema i četiri pilule stanja. Telefon scenu ne preuzima uopšte; LCP admina
 * je naslov.
 */
export function AdminControlHero({
  locale,
  title,
  signals,
  mood,
}: {
  locale: Locale;
  title: string;
  signals: AdminSignal[] | null;
  mood: ReturnType<typeof adminRobiMood>;
}) {
  return (
    <section
      data-igra-hero=""
      data-motion="hero"
      className="paper-island relative overflow-hidden surface-card border-2 border-ink bg-igra-scene-paper shadow-[6px_6px_0_0_var(--shadow-hard-12)]"
    >
      <AdminHeroScene />
      <div data-motion="copy" className="relative p-5 sm:p-6 lg:w-[60%] lg:p-8">
        <p className="type-eyebrow text-muted">{IGRA_ADMIN_COPY.eyebrow[locale]}</p>
        <h1 className="mt-2 font-display type-display text-ink">{title}</h1>
        <HandUnderline size="sm" className="mt-1" />

        <div role="status" className="mt-5 flex min-h-16 items-center">
          {mood ? (
            <IgraLik lik="robi" poza={mood.poza} size="md" decorative bubble={mood.line} />
          ) : (
            <span className="flex items-center gap-3">
              <IgraSkeleton className="size-16 rounded-full" />
              <IgraSkeleton className="h-9 w-40 rounded-full" />
            </span>
          )}
        </div>

        <div className="mt-4">
          <p className="type-eyebrow text-muted">{IGRA_ADMIN_COPY.system[locale]}</p>
          <AdminStatusPills locale={locale} signals={signals} />
        </div>
      </div>
    </section>
  );
}

/** Pilule stanja: svaka je veza na stranu koja to rešava; nijedna ne izvršava akciju. */
export function AdminStatusPills({ locale, signals }: { locale: Locale; signals: AdminSignal[] | null }) {
  if (!signals) {
    return (
      <ul className="mt-1 flex flex-wrap gap-x-2" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <li key={index} className="flex min-h-11 items-center">
            <IgraSkeleton className="h-7 w-32 rounded-full" />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="mt-1 flex flex-wrap gap-x-2">
      {signals.map((signal) => (
        <li key={signal.key}>
          <PillLink href={withLocale(locale, signal.path)}>
            <Badge tone={TONE_BADGE[signal.tone]} icon={<ToneIcon tone={signal.tone} />}>
              {signal.label}
            </Badge>
          </PillLink>
        </li>
      ))}
    </ul>
  );
}

function ToneIcon({ tone }: { tone: AdminTone }) {
  const Icon = TONE_ICON[tone];
  return <Icon aria-hidden="true" className="size-3.5 shrink-0" />;
}

/** Meta dodira je 44 px visine (`min-h-11`), a pilula ostaje sitna. */
function PillLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="igra-press inline-flex min-h-11 items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      {children}
    </Link>
  );
}
