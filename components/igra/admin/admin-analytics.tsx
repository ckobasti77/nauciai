import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";

import { InkBarList, InkColumns, InkLegend, InkStackedBars, type InkFill } from "@/components/igra/admin/admin-charts";
import type { AdminOverview } from "@/components/igra/admin/admin-kpi";
import { IgraArt } from "@/components/igra/igra-art";
import { IgraSkeleton } from "@/components/igra/igra-skeleton";
import type { api } from "@/convex/_generated/api";
import type { IgraArtId } from "@/lib/igra-art";
import { ADMIN_LOG_LIMIT, dailyCountSeries } from "@/lib/igra-admin";
import { IGRA_ADMIN_COPY } from "@/lib/igra-admin-copy";
import { t, type Locale } from "@/lib/i18n";
import { JOB_STATUSES } from "@/lib/studio-gallery";
import { jobStatusLabel } from "@/lib/studio-admin";

export type AdminUsage = FunctionReturnType<typeof api.studioAdmin.getUsageSummary>;

/** Prozor dnevnih stubića: dve nedelje staju u telefon bez vodoravnog skrola. */
export const ADMIN_CHART_DAYS = 14;

const CARD = "surface-card border-2 border-ink bg-paper-strong p-4 sm:p-5";

/**
 * Analitika (K21): grafikoni iz podataka koje baza VEĆ ima, kroz postojeće admin upite
 * (`getAdminOverview`, `getUsageSummary`, `listPromptLog`, `listModerationEvents`). Ništa se
 * ne izmišlja: posete i izvori saobraćaja ostaju „U pripremi" dok se ne poveže Google
 * Analytics. Prezentaciono: podaci kroz props, pa je ista strana i u izlogu.
 */
export function AdminAnalyticsView({
  locale,
  todayKey,
  overview,
  usage,
  passed,
  refused,
}: {
  locale: Locale;
  /** Današnji dan po Beogradu (`adminTodayKey(now)`). */
  todayKey: string;
  overview: AdminOverview | undefined;
  usage: AdminUsage | undefined;
  /** `createdAt` propuštenih upita (`listPromptLog`); `undefined` dok ne stigne. */
  passed: readonly number[] | undefined;
  /** `createdAt` odbijenih upita (`listModerationEvents`). */
  refused: readonly number[] | undefined;
}) {
  const c = IGRA_ADMIN_COPY;
  const series: Array<{ key: string; label: string; fill: InkFill }> = [
    { key: "published", label: t(locale, "Objavljeno", "Published"), fill: "solid" },
    { key: "draft", label: t(locale, "Nacrt", "Draft"), fill: "hatch" },
    { key: "archived", label: t(locale, "Arhivirano", "Archived"), fill: "soft" },
  ];
  const contentRows = overview
    ? (
        [
          ["tracks", t(locale, "Smerovi", "Tracks"), overview.tracks],
          ["courses", t(locale, "Kursevi", "Courses"), overview.courses],
          ["lessons", t(locale, "Lekcije", "Lessons"), overview.lessons],
        ] as const
      ).map(([key, label, tally]) => ({
        key,
        label,
        parts: [
          { key: "published", value: tally.published },
          { key: "draft", value: tally.draft },
          { key: "archived", value: tally.archived },
        ],
      }))
    : null;

  const capped = (passed?.length ?? 0) >= ADMIN_LOG_LIMIT || (refused?.length ?? 0) >= ADMIN_LOG_LIMIT;
  const passedSeries = passed ? dailyCountSeries(passed, { todayKey, days: ADMIN_CHART_DAYS, capped: passed.length >= ADMIN_LOG_LIMIT }) : null;
  const refusedSeries = refused ? dailyCountSeries(refused, { todayKey, days: ADMIN_CHART_DAYS, capped: refused.length >= ADMIN_LOG_LIMIT }) : null;
  const todayText = (entry: { count: number | null; partial: boolean }) =>
    entry.count === null ? c.chartNoData[locale] : `${entry.partial ? `${c.chartAtLeast[locale]} ` : ""}${entry.count}`;

  return (
    <div className="space-y-4">
      <p className="type-body-sm font-semibold type-measure text-muted">{c.analyticsIntro[locale]}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard id="admin-chart-content" art="admin.sadrzaj" title={c.chartContent[locale]} note={c.chartContentNote[locale]}>
          <InkLegend items={series} />
          <div className="mt-4">{contentRows ? <InkStackedBars rows={contentRows} series={series} /> : <ChartSkeleton rows={3} />}</div>
        </ChartCard>

        <ChartCard
          id="admin-chart-jobs"
          art="admin.generacije"
          title={c.chartJobs[locale]}
          note={usage ? `${c.chartJobsNote[locale]} ${usage.day} (UTC).` : undefined}
        >
          {usage ? (
            <>
              <InkBarList rows={JOB_STATUSES.map((status) => ({ key: status, label: jobStatusLabel(status, locale), value: usage.jobCounts[status] ?? 0 }))} />
              {usage.jobCountsCapped ? <p className="mt-3 type-caption font-bold text-muted">{c.chartJobsCapped[locale]}</p> : null}
            </>
          ) : (
            <ChartSkeleton rows={6} />
          )}
        </ChartCard>

        <ChartCard id="admin-chart-prompts" art="admin.moderacija" title={c.chartPrompts[locale]} note={c.chartPromptsNote[locale]} wide>
          {passedSeries && refusedSeries ? (
            <>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <InkColumns locale={locale} title={c.chartPassed[locale]} days={passedSeries.days} max={passedSeries.max} />
                  <p className="mt-2 type-caption font-bold tabular-nums text-ink">
                    {c.chartTotal[locale]} {passedSeries.total} · {c.chartToday[locale]} {todayText(passedSeries.today)}
                  </p>
                </div>
                <div>
                  <InkColumns locale={locale} title={c.chartRefused[locale]} days={refusedSeries.days} max={refusedSeries.max} />
                  <p className="mt-2 type-caption font-bold tabular-nums text-ink">
                    {c.chartTotal[locale]} {refusedSeries.total} · {c.chartToday[locale]} {todayText(refusedSeries.today)}
                  </p>
                </div>
              </div>
              {capped ? <p className="mt-3 type-caption font-bold text-muted">{c.chartCapped[locale]}</p> : null}
              {passedSeries.total === 0 && refusedSeries.total === 0 ? (
                <p className="mt-3 type-caption font-bold text-muted">{c.chartEmpty[locale]}</p>
              ) : null}
            </>
          ) : (
            <IgraSkeleton className="h-36 w-full surface-inset" />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({
  id,
  art,
  title,
  note,
  wide = false,
  children,
}: {
  id: string;
  art: IgraArtId;
  title: string;
  note?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`${CARD}${wide ? " lg:col-span-2" : ""}`}>
      <div className="flex items-center gap-3">
        <IgraArt id={art} size="sm" decorative />
        <div className="min-w-0">
          <h2 id={id} className="type-h3 text-ink">
            {title}
          </h2>
          {note ? <p className="type-caption font-bold text-muted">{note}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ChartSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <IgraSkeleton key={index} className="h-4 w-full rounded-full" />
      ))}
    </div>
  );
}
