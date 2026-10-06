import { CreaStamp } from "@/components/crea/game/crea-stamp";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_CARD_COPY } from "@/lib/crea-game-copy";
import { CONDUCT_LABEL, GRADE_LABEL, REPORT_SUBJECTS, type ReportCard } from "@/lib/crea-report-card";
import type { Locale } from "@/lib/i18n";

/**
 * Đačka knjižica (K26, G5) - izgled školske knjižice: predmeti i ocene, vladanje,
 * opšti uspeh i pečat. Čista prezentacija (bez upita), pa je ista u svesci, na
 * profilu i na javnoj stranici za deljenje.
 */
export function CreaReportCardView({
  locale,
  name,
  username,
  card,
  framed = true,
}: {
  locale: Locale;
  name: string;
  username: string;
  card: ReportCard & { streak: number; bestStreak: number };
  /** `false` kad knjižica stoji u sekciji koja već nosi okvir (profil). */
  framed?: boolean;
}) {
  const number = (value: number) => value.toLocaleString(locale === "sr" ? "sr-RS" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <article
      className={
        framed
          ? "surface-card relative overflow-hidden border-2 border-ink bg-paper-strong text-ink shadow-[6px_6px_0_0_var(--shadow-hard-16)]"
          : "surface-inset relative overflow-hidden bg-paper text-ink"
      }
    >
      <header className="border-b border-line bg-surface-b px-5 py-4">
        <p className="text-xs font-black text-muted">{CREA_CARD_COPY.school[locale]}</p>
        <h2 className="mt-0.5 type-h2">{CREA_CARD_COPY.title[locale]}</h2>
        <p className="mt-1 type-body-sm font-bold">
          {CREA_CARD_COPY.student[locale]}: <span className="font-black">{name}</span> <span className="text-muted">@{username}</span>
        </p>
      </header>
      <div className="px-5 py-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs font-black text-muted">
              <th scope="col" className="py-2 pr-3">{CREA_CARD_COPY.subject[locale]}</th>
              <th scope="col" className="py-2 pr-3">{CREA_CARD_COPY.grade[locale]}</th>
              <th scope="col" className="py-2 text-right">{CREA_CARD_COPY.tried[locale]}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {card.subjects.map((subject) => {
              const label = REPORT_SUBJECTS.find((s) => s.id === subject.id)!.label[locale];
              return (
                <tr key={subject.id}>
                  <th scope="row" className="py-2.5 pr-3 font-black">{label}</th>
                  <td className="py-2.5 pr-3">
                    {subject.grade ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="grid size-8 place-items-center rounded-full bg-ink text-base font-black text-paper-strong">{subject.grade}</span>
                        <span className="font-bold">{GRADE_LABEL[subject.grade][locale]}</span>
                      </span>
                    ) : (
                      <span className="font-semibold text-muted">{CREA_CARD_COPY.ungraded[locale]}</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right font-bold tabular-nums text-muted">
                    {subject.done}/{subject.total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <dl className="mt-4 grid gap-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-black text-muted">{CREA_CARD_COPY.conduct[locale]}</dt>
            <dd className="font-black">{CONDUCT_LABEL[card.conduct][locale]}</dd>
          </div>
          <div>
            <dt className="text-xs font-black text-muted">{CREA_CARD_COPY.overall[locale]}</dt>
            <dd className="font-black">
              {card.overall ? `${GRADE_LABEL[card.overall.grade][locale]} (${number(card.overall.average)})` : CREA_CARD_COPY.overallNone[locale]}
            </dd>
          </div>
        </dl>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-muted">
          <span>{fillCopy(CREA_CARD_COPY.streak[locale], { n: card.bestStreak })}</span>
          <span>{fillCopy(CREA_CARD_COPY.stickers[locale], { n: card.stickers })}</span>
        </p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <p className="border-t border-ink/40 pt-1 text-xs font-bold text-muted">{CREA_CARD_COPY.signature[locale]}</p>
          {card.overall?.grade === 5 ? <CreaStamp locale={locale} size="md" /> : null}
        </div>
      </div>
    </article>
  );
}
