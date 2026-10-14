"use client";

import Link from "next/link";
import { useState } from "react";

import { BannerPicker } from "@/components/igra/profile/banner-picker";
import { PlayerStats } from "@/components/igra/profile/player-stats";
import { ProfileActivity } from "@/components/igra/profile/profile-activity";
import { ProfileBanner } from "@/components/igra/profile/profile-banner";
import { TrophyShelf } from "@/components/igra/trophy-shelf";
import { cn } from "@/components/ui/primitives";
import { isBannerUnlocked, type IgraBannerKey } from "@/lib/igra-banners";
import { IGRA_PROFILE_COPY } from "@/lib/igra-copy";
import {
  IGRA_FIXTURE_IDS,
  IGRA_FIXTURE_LABEL,
  IGRA_FIXTURE_TODAY,
  IGRA_FIXTURES,
  memberProgressFixture,
  PROFILE_FIXTURES,
  type IgraFixtureId,
} from "@/lib/igra-fixtures";
import { profileBannerKey, profileShelfBadges, profileWorks } from "@/lib/igra-profile";
import { t, withLocale, type Locale } from "@/lib/i18n";

/**
 * Izlog, deo „profil" (K13): IGRA delovi profila člana nad test podacima, bez prijave i
 * bez upita - zaglavlje sa banerom, karta igrača, trofejna polica sa filterom, brojači i
 * kalendar godine, izbor banera. Raspored je isti kao na stranici (`member-profile.tsx`);
 * kursevi, doprinosi, knjižica i dugmad praćenja su postojeći kod i ovde ih nema.
 * Prekidači: moj ili tuđi profil, javna knjižica, nalog tima, učitavanje.
 */

const CHIP =
  "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const on = (active: boolean) => (active ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper");

const BIO: Record<IgraFixtureId, { sr: string; en: string }> = {
  novi: { sr: "Tek počinjem. Zanima me kako AI može da mi pomogne u poslu.", en: "Just getting started. Curious how AI can help at work." },
  aktivan: { sr: "Grafički dizajner iz Novog Sada. Učim promptove i pravim kratke video klipove.", en: "Graphic designer from Novi Sad. Learning prompts and making short video clips." },
  legenda: { sr: "Profesorka informatike. Rado pomažem u zajednici, pitaj slobodno.", en: "Computer science teacher. Happy to help in the community, just ask." },
};

function Preview({
  locale,
  stanje,
  owner,
  creaPublic,
  staff,
  loading,
}: {
  locale: Locale;
  stanje: IgraFixtureId;
  owner: boolean;
  creaPublic: boolean;
  staff: boolean;
  loading: boolean;
}) {
  const person = PROFILE_FIXTURES[stanje];
  const [banner, setBanner] = useState<IgraBannerKey | null>(IGRA_FIXTURES[stanje].banner);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<IgraBannerKey | null>(null);
  const [failNext, setFailNext] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Isti oblici kao upiti: napredak vlasnika iz ljuske i `igra:getMemberProgress`.
  const mine = loading ? undefined : { ...IGRA_FIXTURES[stanje], banner };
  const member = loading ? undefined : { ...memberProgressFixture(stanje, { owner, creaPublic, staff: !owner && staff }), banner };
  const xp = !owner && staff ? null : IGRA_FIXTURES[stanje].xp;
  const level = IGRA_FIXTURES[stanje].level;
  const shelf = profileShelfBadges({ isOwner: owner, mine, member });

  // Radi ono što radi `igra:setBanner`: kratko čekanje, pa upis ili greška.
  function choose(next: IgraBannerKey) {
    setPending(next);
    setError(null);
    window.setTimeout(() => {
      if (failNext || !isBannerUnlocked(next, level.level)) setError(IGRA_PROFILE_COPY.bannerError[locale]);
      else setBanner(next);
      setFailNext(false);
      setPending(null);
    }, 500);
  }

  return (
    <div className="space-y-6">
      {owner ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={failNext} onClick={() => setFailNext((value) => !value)} className={cn(CHIP, on(failNext))}>
            {t(locale, "Sledeći izbor banera ne uspe", "Next banner pick fails")}
          </button>
        </div>
      ) : null}

      <ProfileBanner
        banner={profileBannerKey({ isOwner: owner, mine, member })}
        name={person.name}
        username={person.username}
        avatarUrl={person.avatarUrl}
        roleLabel={!owner && staff ? "Moderator" : person.role === "pro_student" ? "Pro" : "Lite"}
        level={xp === null ? null : level.level}
        levelProgress={level.progress}
        locale={locale}
        onEditBanner={owner && !loading ? () => { setError(null); setPickerOpen(true); } : undefined}
      />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="order-2 min-w-0 space-y-6 xl:order-1">
          {shelf !== null ? (
            <section className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard-13)] sm:p-6">
              {shelf === undefined ? <TrophyShelf loading variant="grid" filter title={IGRA_PROFILE_COPY.shelfTitle[locale]} locale={locale} /> : <TrophyShelf badges={shelf} variant="grid" filter title={IGRA_PROFILE_COPY.shelfTitle[locale]} locale={locale} />}
            </section>
          ) : null}
          <ProfileActivity
            days={person.days}
            works={profileWorks(owner, member)}
            todayKey={IGRA_FIXTURE_TODAY}
            recent={owner ? IGRA_FIXTURES[stanje].streak.recent : undefined}
            isOwner={owner}
            locale={locale}
          />
        </div>
        <div className="order-1 min-w-0 xl:order-2">
          <aside className="surface-card border-2 border-ink bg-paper-strong p-6 shadow-[6px_6px_0_0_var(--yellow)]">
            {xp !== null ? <PlayerStats xp={xp} streak={owner ? IGRA_FIXTURES[stanje].streak : null} locale={locale} className="border-b-2 border-line pb-5" /> : null}
            <p className="mt-4 whitespace-pre-wrap type-body-sm font-bold text-ink/80">{BIO[stanje][locale]}</p>
          </aside>
        </div>
      </div>

      {owner ? (
        <BannerPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          level={level.level}
          selected={banner}
          pending={pending}
          error={error}
          onSelect={choose}
          locale={locale}
        />
      ) : null}
    </div>
  );
}

export function IzlogProfil({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const [owner, setOwner] = useState(true);
  const [creaPublic, setCreaPublic] = useState(false);
  const [staff, setStaff] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {IGRA_FIXTURE_IDS.map((id) => (
          <Link
            key={id}
            href={`${withLocale(locale, "/igra-izlog")}?deo=profil&stanje=${id}`}
            aria-current={id === stanje ? "page" : undefined}
            className={cn(CHIP, on(id === stanje))}
          >
            {IGRA_FIXTURE_LABEL[id][locale]}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={owner} onClick={() => setOwner(true)} className={cn(CHIP, on(owner))}>
          {t(locale, "Moj profil", "My profile")}
        </button>
        <button type="button" aria-pressed={!owner} onClick={() => setOwner(false)} className={cn(CHIP, on(!owner))}>
          {t(locale, "Tuđi profil", "Someone else's profile")}
        </button>
        {!owner ? (
          <>
            <button type="button" aria-pressed={creaPublic} onClick={() => setCreaPublic((value) => !value)} className={cn(CHIP, on(creaPublic))}>
              {t(locale, "Javna knjižica", "Public report card")}
            </button>
            <button type="button" aria-pressed={staff} onClick={() => setStaff((value) => !value)} className={cn(CHIP, on(staff))}>
              {t(locale, "Nalog tima", "Team account")}
            </button>
          </>
        ) : null}
        <button type="button" aria-pressed={loading} onClick={() => setLoading((value) => !value)} className={cn(CHIP, on(loading))}>
          {t(locale, "Učitava se", "Loading")}
        </button>
      </div>
      <Preview key={`${stanje}-${owner}`} locale={locale} stanje={stanje} owner={owner} creaPublic={creaPublic} staff={staff} loading={loading} />
    </div>
  );
}
