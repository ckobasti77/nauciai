import type { FunctionReturnType } from "convex/server";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { IgraArt } from "@/components/igra/igra-art";
import { Odometer } from "@/components/igra/odometer";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/primitives";
import type { api } from "@/convex/_generated/api";
import { contentStatusTone } from "@/lib/admin-content-tree";
import type { IgraArtId } from "@/lib/igra-art";
import { ADMIN_PENDING_CAP } from "@/lib/igra-admin";
import { IGRA_ADMIN_COPY } from "@/lib/igra-admin-copy";
import { t, withLocale, type Locale } from "@/lib/i18n";

export type AdminOverview = FunctionReturnType<typeof api.adminOverview.getAdminOverview>;
type Tally = AdminOverview["tracks"];

/** Isti recept kao stara `StatCard`: papir, školska mreža, tvrda senka; jedan okvir po pločici. */
const TILE =
  "surface-card relative overflow-hidden border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard-12)]";

/**
 * KPI red Kontrolne sobe (K21, plan K20 §2.2): isti brojevi i isti bedževi statusa kao pre,
 * sada sa `admin.*` nalepnicama i odometrom. Tri brojača sadržaja su JEDNA kartica (kolone
 * deli tanka linija, ne drugi okvir). Novac se ovde ne prikazuje, pa nema ni odometra za njega.
 */
export function AdminKpiRow({
  locale,
  overview,
  pending,
}: {
  locale: Locale;
  overview: AdminOverview | undefined;
  /** `notifications.pendingApprovals`; `undefined` dok ne stigne. */
  pending: number | undefined;
}) {
  const contentRows: Array<{ label: string; tally: Tally | undefined }> = [
    { label: t(locale, "Smerovi", "Tracks"), tally: overview?.tracks },
    { label: t(locale, "Kursevi", "Courses"), tally: overview?.courses },
    { label: t(locale, "Lekcije", "Lessons"), tally: overview?.lessons },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article className={cn(TILE, "sm:col-span-2")}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 sketch-grid" />
        <div className="relative">
          <TileHead art="admin.sadrzaj" label={IGRA_ADMIN_COPY.content[locale]} />
          <dl className="mt-3 grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {contentRows.map((row) => (
              <div key={row.label} className="min-w-0 py-3 first:pt-0 last:pb-0 sm:px-4 sm:py-0 sm:first:pl-0 sm:last:pr-0">
                <dt className="type-eyebrow text-muted">{row.label}</dt>
                <dd className="mt-1">
                  {row.tally ? <Odometer value={row.tally.total} locale={locale} size="lg" /> : <Odometer loading locale={locale} size="lg" />}
                </dd>
                {row.tally ? (
                  <dd className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={contentStatusTone("published")} size="sm">{t(locale, "Objavljeno", "Published")} {row.tally.published}</Badge>
                    <Badge tone={contentStatusTone("draft")} size="sm">{t(locale, "Nacrt", "Draft")} {row.tally.draft}</Badge>
                    {row.tally.archived > 0 ? (
                      <Badge tone={contentStatusTone("archived")} size="sm">{t(locale, "Arhiva", "Archive")} {row.tally.archived}</Badge>
                    ) : null}
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
        </div>
      </article>

      <article className={TILE}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 sketch-grid" />
        <div className="relative">
          <TileHead art="admin.korisnici" label={t(locale, "Studenti", "Students")} />
          <p className="mt-3">
            {overview ? (
              <>
                <Odometer value={overview.students.count} locale={locale} size="lg" />
                {overview.students.capped ? <AtLeast /> : null}
              </>
            ) : (
              <Odometer loading locale={locale} size="lg" />
            )}
          </p>
          <p className="mt-3 type-caption font-bold text-muted">
            {t(locale, "Nalozi koji uče: studenti i pro studenti. Admini i moderatori se ne broje.", "Learner accounts: students and pro students. Admins and moderators are not counted.")}
          </p>
        </div>
      </article>

      <article className={TILE}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 sketch-grid" />
        <Link
          href={withLocale(locale, "/app/community/moderation")}
          className="group relative block min-h-11 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
        >
          <TileHead art="admin.zajednica" label={IGRA_ADMIN_COPY.pending[locale]} />
          <span className="mt-3 block">
            {pending === undefined ? (
              <Odometer loading locale={locale} size="lg" />
            ) : pending === 0 ? (
              <span className="inline-flex items-center gap-2 type-h3 text-ink">
                <CheckCircle2 aria-hidden="true" className="size-6 shrink-0" />
                {IGRA_ADMIN_COPY.queueClear[locale]}
              </span>
            ) : (
              <>
                <Odometer value={Math.min(pending, ADMIN_PENDING_CAP)} locale={locale} size="lg" />
                {pending >= ADMIN_PENDING_CAP ? <AtLeast /> : null}
              </>
            )}
          </span>
          <span className="mt-3 block type-caption font-bold text-muted">{IGRA_ADMIN_COPY.pendingHint[locale]}</span>
          <span className="mt-2 inline-flex items-center gap-1 type-caption font-black text-ink">
            {IGRA_ADMIN_COPY.openQueue[locale]}
            <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </span>
        </Link>
      </article>
    </div>
  );
}

/** „+" uz broj koji je donja granica (plafon čitanja), iste veličine kao broj: „2.000+". */
function AtLeast() {
  return <span className="type-h1 font-black text-ink">+</span>;
}

function TileHead({ art, label }: { art: IgraArtId; label: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <IgraArt id={art} size="sm" decorative />
      <p className="type-eyebrow text-muted">{label}</p>
    </div>
  );
}
