import { cn } from "@/components/ui/primitives";
import { columnHeight, stackedShares, type AdminDay } from "@/lib/igra-admin";
import { IGRA_ADMIN_COPY } from "@/lib/igra-admin-copy";
import type { Locale } from "@/lib/i18n";

/**
 * Grafikoni admina u stilu sveske (K21). Samo mastilo i papir iz tokena (obe teme bez
 * posebnog koraka), bez biblioteke i bez pokreta. Pravila (dataviz): jedna osa, nula je dno,
 * tanki oznaci, legenda kad ima više serija, vrednosti uvek i kao tekst (nikad samo boja),
 * tabela za čitač ekrana i `title` na svakoj oznaci za hover.
 */

/** Ispune serija. Nacrt je šrafura, isti znak kao nacrt u navigatoru sadržaja. */
export const INK_FILL = {
  solid: "bg-ink",
  hatch: "igra-chart-hatch",
  soft: "bg-muted",
} as const;
export type InkFill = keyof typeof INK_FILL;

export function InkLegend({ items }: { items: ReadonlyArray<{ key: string; label: string; fill: InkFill }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.key} className="inline-flex items-center gap-1.5 type-caption font-bold text-ink">
          <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-full", INK_FILL[item.fill])} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Složene trake (100 %): po jedan red za svaku vrstu, delovi su udeo u zbiru reda, a zbir i
 * svaki deo stoje i kao tekst. Prazan red je samo traka bez ispune.
 */
export function InkStackedBars({
  rows,
  series,
}: {
  rows: ReadonlyArray<{ key: string; label: string; parts: ReadonlyArray<{ key: string; value: number }> }>;
  series: ReadonlyArray<{ key: string; label: string; fill: InkFill }>;
}) {
  const bySeries = new Map(series.map((item) => [item.key, item]));
  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const { total, parts } = stackedShares(row.parts);
        const visible = parts.filter((part) => part.value > 0);
        const spoken = visible.map((part) => `${bySeries.get(part.key)?.label ?? part.key} ${part.value}`).join(", ");
        return (
          <div key={row.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="type-body-sm font-black text-ink">{row.label}</span>
              <span className="type-body-sm font-black tabular-nums text-ink">{total}</span>
            </div>
            <div
              role="img"
              aria-label={`${row.label}: ${total}${spoken ? `. ${spoken}` : ""}`}
              className="mt-1.5 flex h-4 gap-[2px] overflow-hidden rounded-full bg-igra-track"
            >
              {visible.map((part) => (
                <span
                  key={part.key}
                  title={`${bySeries.get(part.key)?.label ?? part.key}: ${part.value}`}
                  className={cn("h-full min-w-1.5", INK_FILL[bySeries.get(part.key)?.fill ?? "solid"])}
                  style={{ flexGrow: part.share, flexBasis: 0 }}
                />
              ))}
            </div>
            {visible.length ? (
              <p className="mt-1 type-caption font-bold text-muted">
                {visible.map((part) => `${bySeries.get(part.key)?.label ?? part.key} ${part.value}`).join(" · ")}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Vodoravne trake jedne serije (poređenje veličina), dužina prema najvećoj vrednosti. */
export function InkBarList({ rows }: { rows: ReadonlyArray<{ key: string; label: string; value: number }> }) {
  const max = rows.reduce((top, row) => Math.max(top, row.value), 0);
  return (
    <dl className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3">
          <dt className="truncate type-caption font-bold text-ink">{row.label}</dt>
          <dd className="h-3 overflow-hidden rounded-full bg-igra-track" title={`${row.label}: ${row.value}`}>
            {row.value > 0 ? (
              <span className="block h-full min-w-1.5 rounded-full bg-ink" style={{ width: `${columnHeight(row.value, max)}%` }} />
            ) : null}
          </dd>
          <dd className="min-w-8 text-right type-caption font-black tabular-nums text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function dayLabel(day: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn-RS" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

/**
 * Stubići po danu, jedna serija. Danas je pun mastilom, raniji dani blaže; dan koji je samo
 * donja granica (plafon zapisa) je šrafiran, a nepoznat dan je tačkasta linija na dnu, ne nula.
 */
export function InkColumns({
  locale,
  title,
  days,
  max,
}: {
  locale: Locale;
  title: string;
  days: readonly AdminDay[];
  max: number;
}) {
  const c = IGRA_ADMIN_COPY;
  const today = days[days.length - 1];
  const describe = (entry: AdminDay) =>
    entry.count === null
      ? `${dayLabel(entry.day, locale)}: ${c.chartNoData[locale]}`
      : `${dayLabel(entry.day, locale)}: ${entry.partial ? `${c.chartAtLeast[locale]} ` : ""}${entry.count}`;

  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="type-body-sm font-black text-ink">{title}</span>
        <span className="type-caption font-bold tabular-nums text-muted">
          {c.chartMax[locale]} {max}
        </span>
      </figcaption>
      <div aria-hidden="true" className="mt-2 flex h-28 items-end gap-1 border-b-2 border-ink">
        {days.map((entry) => (
          <span key={entry.day} title={describe(entry)} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            {entry.count === null ? (
              <span className="block border-t-2 border-dotted border-muted" />
            ) : (
              <span
                className={cn(
                  "block min-h-[2px] w-full",
                  entry.partial ? INK_FILL.hatch : entry === today ? INK_FILL.solid : "bg-ink/40",
                )}
                style={{ height: `${columnHeight(entry.count, max)}%` }}
              />
            )}
          </span>
        ))}
      </div>
      <div aria-hidden="true" className="mt-1 flex justify-between type-caption font-bold text-muted">
        <span>{days[0] ? dayLabel(days[0].day, locale) : ""}</span>
        <span>{c.chartToday[locale]}</span>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{c.chartDay[locale]}</th>
            <th scope="col">{c.chartCount[locale]}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((entry) => (
            <tr key={entry.day}>
              <td>{dayLabel(entry.day, locale)}</td>
              <td>{entry.count === null ? c.chartNoData[locale] : `${entry.partial ? `${c.chartAtLeast[locale]} ` : ""}${entry.count}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
