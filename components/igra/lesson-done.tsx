"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Odometer } from "@/components/igra/odometer";
import { XpBar } from "@/components/igra/xp-bar";
import { LinkButton, cn } from "@/components/ui/primitives";
import { IGRA_CLASSROOM_COPY } from "@/lib/igra-copy";
import type { Locale } from "@/lib/i18n";

/**
 * Mali kraj lekcije (K09, plan K07 §2.2): u istoj kartici, bez preklopa, konfeta i zvuka.
 * „+N XP" je odometar na markeru i crta se samo kad je porast izmeren (`gain`); traka
 * pokazuje gde je to u tekućem nivou. Prezentaciona: podatke daje pozivalac.
 *
 * Montira se i PRE kraja (`done={false}`): tada je to samo prazan `role="status"`, da
 * čitač ekrana najavi tekst kad stigne.
 */
export function LessonDone({
  done,
  locale,
  gain,
  xp,
  repeat = false,
  next,
  courseDone = false,
  courseHref,
  className,
}: {
  done: boolean;
  locale: Locale;
  /** Izmeren porast XP-a; `null` dok nije stigao ili kad ga nema. */
  gain: number | null;
  /** Ukupan XP za traku nivoa; `null` kad napretka nema. */
  xp: number | null;
  /** Lekcija je već bila završena: potvrda bez broja. */
  repeat?: boolean;
  /** Kuda dalje (adresa već provučena kroz `withLocale`). */
  next?: { title: string; href: string } | null;
  /** U kursu više nema nezavršenih lekcija. */
  courseDone?: boolean;
  courseHref: string;
  className?: string;
}) {
  const copy = IGRA_CLASSROOM_COPY;
  // Lekcija koja je upravo zatvorila kurs ne nudi „sledeću" (sve su završene): tu staje,
  // a slavlje vodi ljuska. Pri ponavljanju gradiva sledeća po redu i dalje vodi napred.
  const closedCourse = courseDone && !repeat;
  const forward = closedCourse ? null : next;
  // Isti `role="status"` element pre i posle kraja: nov element sa gotovim tekstom čitač
  // ekrana ne bi najavio.
  if (!done) {
    return (
      <div>
        <div>
          <p role="status" className="sr-only" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0 lg:max-w-sm lg:flex-1">
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 type-h3 text-ink">
          {repeat ? copy.doneRepeat[locale] : copy.doneTitle[locale]}
          {gain ? (
            <span className="igra-marker bg-yellow py-0.5 text-ink">
              +<Odometer value={gain} locale={locale} /> XP
            </span>
          ) : null}
        </p>
        {xp !== null ? <XpBar xp={xp} locale={locale} size="sm" showLabel className="mt-3" /> : null}
      </div>
      <div className="min-w-0">
        {forward ? (
          <p className="mb-2 truncate type-caption font-bold text-muted">
            <span className="text-ink">{copy.nextEyebrow[locale]}:</span> {forward.title}
          </p>
        ) : closedCourse ? (
          <p className="mb-2 type-caption font-bold text-muted">{copy.courseDone[locale]}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {forward ? (
            <LinkButton href={forward.href} tone="yellow">
              {copy.nextCta[locale]}
              <ArrowRight aria-hidden="true" className="size-4" />
            </LinkButton>
          ) : null}
          <Link
            href={courseHref}
            className="inline-flex min-h-11 items-center text-sm font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {copy.backToCourse[locale]}
          </Link>
        </div>
      </div>
    </div>
  );
}
