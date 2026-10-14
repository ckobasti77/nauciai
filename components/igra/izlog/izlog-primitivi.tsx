"use client";

import Link from "next/link";
import { useState } from "react";

import { BadgeSticker } from "@/components/igra/badge-sticker";
import { IgraLik } from "@/components/igra/igra-lik";
import { IzlogDemo, IzlogSection } from "@/components/igra/izlog/izlog-kit";
import { Izlog3d, IzlogSlavlja } from "@/components/igra/izlog/izlog-pokret";
import { LevelStamp } from "@/components/igra/level-stamp";
import { Odometer } from "@/components/igra/odometer";
import { ProgressCard } from "@/components/igra/progress-card";
import { RankChip } from "@/components/igra/rank-chip";
import { StreakFlame } from "@/components/igra/streak-flame";
import { TrophyShelf } from "@/components/igra/trophy-shelf";
import { XpBar } from "@/components/igra/xp-bar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { formatXp, levelLabel } from "@/lib/igra-a11y";
import { IGRA_LIKOVI, IGRA_POZE } from "@/lib/igra-art";
import { IGRA_FIXTURE_IDS, IGRA_FIXTURE_LABEL, IGRA_FIXTURES, type IgraFixtureId } from "@/lib/igra-fixtures";
import { IGRA_LEVELS } from "@/lib/igra-level";
import { t, withLocale, type Locale } from "@/lib/i18n";

/**
 * Izlog, deo „primitivi" (K05): svaki primitiv iz `docs/IGRA-PLAN.md` §2.3 sa test
 * podacima (`lib/igra-fixtures.ts`) i u svim stanjima - prazno, učitava se, zaključano,
 * sve veličine. Korisnik se bira gore (`?stanje=`); smanjen pokret i teme se proveravaju
 * sistemskim podešavanjem i prekidačem teme. Bez upita i bez prijave.
 */

const XP_SAMPLES = [0, 99, 1890, 19990, 23480];
const RANK_SAMPLES = [1, 2, 3, 7, 42, 1280, null];

function StampDemo({ locale, level }: { locale: Locale; level: number }) {
  const [hits, setHits] = useState(0);
  return (
    <IzlogDemo label="stampKey">
      <div className="flex flex-wrap items-center gap-5">
        <LevelStamp level={level} size="lg" showName stampKey={hits} locale={locale} />
        <Button size="sm" variant="secondary" onClick={() => setHits((value) => value + 1)}>
          {t(locale, "Udari pečat", "Stamp it")}
        </Button>
      </div>
    </IzlogDemo>
  );
}

function XpDemo({ locale, start }: { locale: Locale; start: number }) {
  const [xp, setXp] = useState(start);
  return (
    <IzlogDemo label={t(locale, "uživo: XP raste", "live: XP grows")}>
      <Odometer value={xp} size="lg" suffix="XP" locale={locale} />
      <XpBar xp={xp} locale={locale} className="mt-2" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setXp((value) => value + 100)}>
          +{formatXp(100, locale)}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setXp((value) => value + 1250)}>
          +{formatXp(1250, locale)}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setXp(start)}>
          {t(locale, "Vrati", "Reset")}
        </Button>
      </div>
    </IzlogDemo>
  );
}

export function IzlogPrimitivi({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const progress = IGRA_FIXTURES[stanje];
  const loadingLabel = t(locale, "učitava se", "loading");
  const samples = (["unlocked", "fresh", "locked", "soon"] as const).map((state) => ({
    state,
    badge: progress.badges.find((badge) => badge.state === state) ?? null,
  }));

  return (
    <div className="space-y-10">
      <nav aria-label={t(locale, "Test korisnik", "Test user")} className="flex flex-wrap items-center gap-2">
        <span className="mr-1 type-eyebrow text-muted">{t(locale, "Test korisnik", "Test user")}</span>
        {IGRA_FIXTURE_IDS.map((id) => (
          <Link
            key={id}
            href={`${withLocale(locale, "/igra-izlog")}?deo=primitivi&stanje=${id}`}
            aria-current={id === stanje ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              id === stanje ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper",
            )}
          >
            {IGRA_FIXTURE_LABEL[id][locale]}
          </Link>
        ))}
      </nav>

      <IzlogSection
        id="kartica"
        title={t(locale, "Kartica napretka", "Progress card")}
        note={t(locale, "Nivo, XP i niz dana u jednom okviru. Bez poena ispod stoji poziv na prvi korak.", "Level, XP and streak in one frame. With no points it invites the first step.")}
      >
        <div className="grid gap-6">
          <IzlogDemo label={`full · ${stanje}`}>
            <ProgressCard progress={progress} locale={locale} />
          </IzlogDemo>
          <div className="grid gap-6 lg:grid-cols-2">
            <IzlogDemo label={`compact · ${stanje}`}>
              <ProgressCard progress={progress} variant="compact" locale={locale} />
            </IzlogDemo>
            <IzlogDemo label={`compact · ${loadingLabel}`}>
              <ProgressCard loading variant="compact" locale={locale} />
            </IzlogDemo>
          </div>
          <IzlogDemo label={`full · ${loadingLabel}`}>
            <ProgressCard loading locale={locale} />
          </IzlogDemo>
        </div>
      </IzlogSection>

      <IzlogSection
        id="xp"
        title={t(locale, "XP traka i odometar", "XP bar and odometer")}
        note={t(locale, "Marker se razlije do vrednosti, a broj se vrti. Uz „smanji pokrete\" oba odmah stoje.", "The marker floods to the value and the number rolls. With reduced motion both are instant.")}
      >
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          <XpDemo key={stanje} locale={locale} start={progress.xp} />
          <IzlogDemo label="size: sm · md · lg">
            <div className="grid gap-3">
              <XpBar xp={progress.xp} size="sm" locale={locale} />
              <XpBar xp={progress.xp} size="md" showLabel={false} locale={locale} />
              <XpBar xp={progress.xp} size="lg" showLabel={false} locale={locale} />
            </div>
          </IzlogDemo>
          {XP_SAMPLES.map((xp) => (
            <IzlogDemo key={xp} label={`${formatXp(xp, locale)} · animate=false`}>
              <XpBar xp={xp} animate={false} locale={locale} />
            </IzlogDemo>
          ))}
          <IzlogDemo label={loadingLabel}>
            <XpBar loading locale={locale} />
          </IzlogDemo>
          <IzlogDemo label="Odometer: hero · lg · md">
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
              <Odometer value={progress.xp} size="hero" suffix="XP" locale={locale} />
              <Odometer value={progress.weekXp} size="lg" suffix="XP" locale={locale} />
              <Odometer value={progress.streak.best} size="md" locale={locale} />
            </div>
          </IzlogDemo>
          <IzlogDemo label={`Odometer · ${loadingLabel}`}>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
              <Odometer loading size="hero" locale={locale} />
              <Odometer loading size="lg" locale={locale} />
              <Odometer loading size="md" locale={locale} />
            </div>
          </IzlogDemo>
        </div>
      </IzlogSection>

      <IzlogSection
        id="pecat"
        title={t(locale, "Pečat nivoa", "Level stamp")}
        note={t(locale, "Amblem sa brojem. Pečat udari kad se nivo promeni, ne pri svakom prikazu.", "Emblem with its number. The stamp hits when the level changes, not on every render.")}
      >
        <ul className="grid grid-cols-4 gap-4 sm:grid-cols-6 lg:grid-cols-12">
          {IGRA_LEVELS.map((row) => (
            <li key={row.level} className="flex flex-col items-center text-center">
              <LevelStamp level={row.level} locale={locale} />
              <span aria-hidden="true" className="mt-1.5 type-caption font-bold text-muted">
                {row.name[locale]}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
          <StampDemo locale={locale} level={progress.level.level} />
          <IzlogDemo label="size: xs · sm · md · lg">
            <div className="flex flex-wrap items-end gap-5">
              {(["xs", "sm", "md", "lg"] as const).map((size) => (
                <LevelStamp key={size} level={progress.level.level} size={size} locale={locale} />
              ))}
            </div>
          </IzlogDemo>
          <IzlogDemo label="showName: sm · md">
            <div className="flex flex-wrap items-center gap-8">
              <LevelStamp level={progress.level.level} size="sm" showName locale={locale} />
              <LevelStamp level={progress.level.level} size="md" showName locale={locale} />
            </div>
          </IzlogDemo>
          <IzlogDemo label={loadingLabel}>
            <div className="flex flex-wrap items-center gap-8">
              <LevelStamp loading size="md" locale={locale} />
              <LevelStamp loading size="lg" showName locale={locale} />
            </div>
          </IzlogDemo>
        </div>
      </IzlogSection>

      <IzlogSection
        id="bedz"
        title={t(locale, "Nalepnica bedža", "Badge sticker")}
        note={t(
          locale,
          "Osvojen je u boji, sa sjajem pod mišem. Zaključan je silueta sa uslovom u oblačiću (miš, fokus ili dodir). „Uskoro\" ne otkriva uslov.",
          "Earned is in colour with a shine on hover. Locked is a silhouette with its condition in the tooltip (hover, focus or tap). “Coming soon” hides the condition.",
        )}
      >
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-5">
          {samples.map(({ state, badge }) => (
            <li key={state}>
              <IzlogDemo label={badge ? state : `${state} · ${t(locale, "nema ga ovaj korisnik", "none for this user")}`}>
                {badge ? <BadgeSticker badge={badge.key} state={badge.state} progress={badge.progress} size="lg" locale={locale} /> : <span className="block size-28" />}
              </IzlogDemo>
            </li>
          ))}
          <li>
            <IzlogDemo label={loadingLabel}>
              <BadgeSticker loading size="lg" locale={locale} />
            </IzlogDemo>
          </li>
        </ul>
        <IzlogDemo label="size: sm · md · lg" className="mt-6">
          <div className="flex flex-wrap items-end gap-4">
            {(["sm", "md", "lg"] as const).map((size) => (
              <BadgeSticker key={size} badge="prva-lekcija" state="unlocked" size={size} locale={locale} />
            ))}
            {(["sm", "md", "lg"] as const).map((size) => (
              <BadgeSticker key={size} badge="niz-30" state="locked" progress={{ current: 9, target: 30 }} size={size} locale={locale} />
            ))}
          </div>
        </IzlogDemo>
      </IzlogSection>

      <IzlogSection
        id="polica"
        title={t(locale, "Trofejna polica", "Trophy shelf")}
        note={t(locale, "Red za tablu i panel (novi, poslednji osvojeni, sledeći ciljevi) i mreža svih 24 za profil.", "A row for the dashboard and panel (new, latest earned, next goals) and a grid of all 24 for the profile.")}
      >
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          <IzlogDemo label={`row · max=3 · ${stanje}`}>
            <TrophyShelf badges={progress.badges} moreHref={`${withLocale(locale, "/igra-izlog")}?deo=primitivi&stanje=${stanje}#polica`} locale={locale} />
          </IzlogDemo>
          <IzlogDemo label={`row · ${loadingLabel}`}>
            <TrophyShelf loading locale={locale} />
          </IzlogDemo>
        </div>
        <IzlogDemo label={`grid · ${stanje}`} className="mt-8">
          <TrophyShelf badges={progress.badges} variant="grid" locale={locale} />
        </IzlogDemo>
      </IzlogSection>

      <IzlogSection
        id="plamen"
        title={t(locale, "Plamen niza", "Streak flame")}
        note={t(locale, "Gori kad je danas upisano; inače tinja, uz blag poziv. Nema odbrojavanja ni pretnje.", "Lit when today is logged; otherwise it smoulders with a gentle nudge. No countdown, no threat.")}
      >
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          <IzlogDemo label={stanje}>
            <StreakFlame current={progress.streak.current} todayDone={progress.streak.todayDone} size="lg" locale={locale} />
          </IzlogDemo>
          <IzlogDemo label={t(locale, "tinja (danas još ne)", "smouldering (not yet today)")}>
            <StreakFlame current={5} todayDone={false} size="lg" locale={locale} />
          </IzlogDemo>
          <IzlogDemo label={t(locale, "prazno (nema niza)", "empty (no streak)")}>
            <StreakFlame current={0} todayDone={false} size="lg" locale={locale} />
          </IzlogDemo>
          <IzlogDemo label={loadingLabel}>
            <StreakFlame loading size="lg" locale={locale} />
          </IzlogDemo>
          <IzlogDemo label="size: sm · md">
            <div className="flex flex-wrap items-center gap-6">
              <StreakFlame current={6} todayDone size="sm" locale={locale} />
              <StreakFlame current={6} todayDone={false} size="sm" locale={locale} />
              <StreakFlame current={21} todayDone size="md" locale={locale} />
              <StreakFlame current={21} todayDone={false} size="md" locale={locale} />
            </div>
          </IzlogDemo>
        </div>
      </IzlogSection>

      <IzlogSection
        id="rang"
        title={t(locale, "Rang čip", "Rank chip")}
        note={t(locale, "Medalja za prva tri mesta; žuto je samo prvo.", "A medal for the top three; only first place is yellow.")}
      >
        <div className="grid gap-6">
          <IzlogDemo label={`md · ${stanje}: weekRank`}>
            <div className="flex flex-wrap items-center gap-3">
              <RankChip rank={progress.weekRank} locale={locale} />
              {RANK_SAMPLES.map((rank) => (
                <RankChip key={String(rank)} rank={rank} locale={locale} />
              ))}
              <RankChip loading locale={locale} />
            </div>
          </IzlogDemo>
          <IzlogDemo label="sm">
            <div className="flex flex-wrap items-center gap-3">
              {RANK_SAMPLES.map((rank) => (
                <RankChip key={String(rank)} rank={rank} size="sm" locale={locale} />
              ))}
              <RankChip loading size="sm" locale={locale} />
            </div>
          </IzlogDemo>
        </div>
      </IzlogSection>

      <IzlogSection
        id="lik"
        title={t(locale, "Lik", "Character")}
        note={t(locale, "Sedam likova, četiri poze. Oblačić je površina sa tankom linijom, ne drugi okvir.", "Seven characters, four poses. The speech bubble is a surface with a hairline, not a second frame.")}
      >
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
          <IgraLik lik="robi" poza="mase" bubble={t(locale, `Ćao! Danas si na ${levelLabel(progress.level.level, locale)}.`, `Hi! Today you are ${levelLabel(progress.level.level, locale)}.`)} locale={locale} />
          <IgraLik lik="sova" poza="misli" size="md" bubble={t(locale, "Još jedna lekcija?", "One more lesson?")} locale={locale} />
        </div>
        <ul className="mt-6 grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-7">
          {IGRA_LIKOVI.flatMap((lik) =>
            IGRA_POZE.map((poza) => (
              <li key={`${lik}.${poza}`} className={cn("flex flex-col items-center", poza !== "mase" && "max-sm:hidden")}>
                <IgraLik lik={lik} poza={poza} size="md" locale={locale} />
                <span aria-hidden="true" className="mt-1 font-mono type-caption text-muted">
                  {lik}.{poza}
                </span>
              </li>
            )),
          )}
        </ul>
      </IzlogSection>

      <IzlogSlavlja locale={locale} />
      <Izlog3d locale={locale} />
    </div>
  );
}
