import { ArrowRight, CheckCircle2, PlayCircle, Sparkles } from "lucide-react";
import Link from "next/link";

import { AccountMenu } from "@/components/marketing/account-menu";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { CourseCard } from "@/components/marketing/course-card";
import { LanguageToggle } from "@/components/marketing/language-toggle";
import { HeroCards3d, HeroCardsRow } from "@/components/marketing/hero-cards";
import { HeroLoop } from "@/components/marketing/hero-loop";
import { LoopVideo, StepHoverVideo } from "@/components/marketing/loop-video";
import { HeroMotion } from "@/components/marketing/hero-motion";
import { MarkerHighlight } from "@/components/marketing/marker-highlight";
import { OutcomeMarquee } from "@/components/marketing/outcome-marquee";
import { PlanRobot } from "@/components/marketing/plan-robot";
import { SectionMarginalia } from "@/components/marketing/section-marginalia";
import { SectionWave } from "@/components/marketing/section-wave";
import { Badge } from "@/components/ui/badge";
import { BrandMark, LinkButton, Panel, SectionHeader, SketchIcon } from "@/components/ui/primitives";
import { SmartStickyHeader } from "@/components/ui/smart-sticky";
import { courses, totalLessons } from "@/lib/content";
import type { ViewerProfile } from "@/lib/current-viewer";
import { coursesListingContent, dictionary, marketingContent, type Locale, withLocale } from "@/lib/i18n";
import { STATIC_FALLBACK, type PlatformPricing } from "@/lib/platform-settings";

// Poster koraka (statično stanje = svetla žuto-bela ilustracija, prvi frejm
// hover-in = poslednji frejm hover-out) + hover-in/out video parovi (L4.1).
const STEP_MEDIA = [
  {
    poster: "/images/landing/step-1-mono-poster.webp",
    hoverIn: { webm: "/images/landing/step-1-hover-in.webm", mp4: "/images/landing/step-1-hover-in.mp4" },
    hoverOut: { webm: "/images/landing/step-1-hover-out.webm", mp4: "/images/landing/step-1-hover-out.mp4" },
  },
  {
    poster: "/images/landing/step-2-mono-poster.webp",
    hoverIn: { webm: "/images/landing/step-2-hover-in.webm", mp4: "/images/landing/step-2-hover-in.mp4" },
    hoverOut: { webm: "/images/landing/step-2-hover-out.webm", mp4: "/images/landing/step-2-hover-out.mp4" },
  },
  {
    poster: "/images/landing/step-3-mono-poster.webp",
    hoverIn: { webm: "/images/landing/step-3-hover-in.webm", mp4: "/images/landing/step-3-hover-in.mp4" },
    hoverOut: { webm: "/images/landing/step-3-hover-out.webm", mp4: "/images/landing/step-3-hover-out.mp4" },
  },
];

export function MarketingPage({
  locale,
  viewerProfile,
  premiumCredits,
  pricing = STATIC_FALLBACK.pricing,
}: {
  locale: Locale;
  viewerProfile?: ViewerProfile;
  /** Broj Studio kredita uz Premium plan, iz baze; `null` ako plan nije definisan. */
  premiumCredits?: number | null;
  /**
   * Cene iz `platformSettings` (N1), već razrešene kroz `resolveSettings`. Kad
   * ruta ne prosledi ništa (test, Storybook), pada na istu statičku rezervu.
   */
  pricing?: PlatformPricing;
}) {
  const t = dictionary[locale];
  const m = marketingContent[locale];
  const primaryCourse = courses[0];
  const startLearningHref = withLocale(locale, viewerProfile ? "/app" : "/sign-in");
  const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  const lessonCount = courses.reduce((count, course) => count + totalLessons(course), 0);
  const heroFreeVideoHref = `${withLocale(locale, `/courses/${primaryCourse.slug}`)}#besplatan-video`;

  // CTA po koraku (#how): svaka kartica vodi na svoju stranicu.
  const stepLinks = [heroFreeVideoHref, withLocale(locale, "/studio"), withLocale(locale, "/community")];

  // Premium „Studio krediti" red: broj iz baze ako postoji, inače tekst bez broja.
  const premiumCreditsLine =
    premiumCredits != null
      ? m.pricing.premium.creditsWithNumber.replace("{n}", String(premiumCredits))
      : m.pricing.premium.creditsNoNumber;
  const premiumFeatures = m.pricing.premium.features.map((item) =>
    item === "%CREDITS%" ? premiumCreditsLine : item,
  );
  const premiumCtaHref = viewerProfile
    ? `${withLocale(locale, "/app/billing")}?plan=premium`
    : `${withLocale(locale, "/sign-in")}?plan=premium`;

  return (
    <main className="overflow-x-clip bg-surface-a text-ink">
      <SmartStickyHeader
        overlay
        scrollBackground
        data-marketing-auth={viewerProfile ? "authenticated" : "anonymous"}
        className="marketing-header top-0 z-40"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:px-8">
          <BrandMark href={withLocale(locale)} label={t.appName} />
          <nav className="hidden items-center gap-6 text-sm font-extrabold md:flex">
            <Link
              href={withLocale(locale, "/courses")}
              className="rounded-[8px] underline-offset-4 transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {t.navCourses}
            </Link>
            <Link
              href={withLocale(locale, "/community")}
              className="rounded-[8px] underline-offset-4 transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {t.navCommunity}
            </Link>
            <Link
              href={withLocale(locale, "/studio")}
              className="rounded-[8px] underline-offset-4 transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {t.navStudio}
            </Link>
            <a
              href="#pricing"
              className="rounded-[8px] underline-offset-4 transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {t.navPricing}
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageToggle locale={locale} />
            <ThemeToggle locale={locale} />
            {viewerProfile ? (
              <Link
                href={withLocale(locale, "/app")}
                className="inline-flex min-h-9 items-center justify-center rounded-full border-2 border-ink bg-ink px-2.5 py-1.5 text-[11px] font-black uppercase text-paper-strong shadow-[3px_3px_0_0_var(--yellow)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--yellow)] active:translate-y-0 active:shadow-[3px_3px_0_0_var(--yellow)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink max-[380px]:hidden sm:px-3 sm:text-xs"
              >
                {t.navDashboard}
              </Link>
            ) : null}
            {viewerProfile ? (
              <AccountMenu locale={locale} profile={viewerProfile} />
            ) : (
              <LinkButton href={withLocale(locale, "/sign-in")} tone="paper" className="hidden sm:inline-flex">
                {t.signIn}
              </LinkButton>
            )}
          </div>
        </div>
      </SmartStickyHeader>

      <div data-motion="page">
        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <HeroMotion>
          <section
            data-motion="hero"
            style={{ backgroundColor: "var(--hero-paper)" }}
            className="hero-paper-island hero-100 relative overflow-hidden border-b-2 border-ink"
          >
            {/* Video: puna visina sekcije (100vh), poravnat desno; prazan prostor
                levo/desno je ista krem bg (izmerena iz postera → `--hero-paper`),
                ivice maskirane → bešavno, bez linija. */}
            <div className="absolute inset-0 z-0">
              <HeroLoop
                label={m.hero.videoAlt}
                variant="cover"
                bg="var(--hero-paper)"
                portrait={{
                  webmSrc: "/images/landing/hero-v2-portrait-loop.webm",
                  mp4Src: "/images/landing/hero-v2-portrait-loop.mp4",
                  posterSrc: "/images/landing/hero-v2-portrait-poster.webp",
                  fallbackSrc: "/images/landing/hero-v2-portrait.png",
                  width: 1064,
                  height: 1920,
                }}
              />
              {/* L3: 3D kartice na listu sveske — isti roditelj i ista geometrija kao video
                  (`.hero-cover-media`); vidljive samo iznad praga (CSS). */}
              <HeroCards3d locale={locale} signedIn={Boolean(viewerProfile)} />
            </div>
            {/* Tekst: levo, vertikalno centriran u prostoru IZNAD trake; `pt` ga drži
                ispod lebdećeg (fixed) navbara, donji padding = visina trake + 24px (+ visina
                snap reda kartica ispod praga). Kontejner propušta klik (kartice na svesci su
                ispod njega u z-redu), a sam tekst-blok ga vraća. U PORTRETU (L3.1) CSS
                (`.hero-copy*`, globals.css) ga diže u gornju praznu zonu portret videa:
                kompaktan h1, kratka kopija podnaslova (`hero-subhead-compact`), CTA u
                jednom redu sa kratkom labelom (`hero-cta-short`); trust lista se ne prikazuje. */}
            <div
              className="hero-copy-wrap pointer-events-none relative z-20 mx-auto flex h-full w-full max-w-7xl items-center px-4 pt-20 sm:px-6 lg:px-8"
              style={{ paddingBottom: "calc(var(--marquee-h) + 24px + var(--hero-cards-row-h))" }}
            >
              <div className="hero-copy pointer-events-auto relative z-10 max-w-md xl:max-w-lg" data-motion="copy">
                <h1 className="text-balance text-4xl font-black leading-[1.03] text-ink sm:text-5xl lg:text-6xl">
                  {m.hero.titleLead}
                  <MarkerHighlight>{m.hero.titleHighlight}</MarkerHighlight>
                </h1>
                <p className="hero-subhead mt-6 text-lg font-bold leading-8 text-muted sm:text-xl">
                  <span className="hero-subhead-full">{m.hero.subhead}</span>
                  <span className="hero-subhead-compact">{m.hero.subheadCompact}</span>
                </p>
                <div className="hero-cta mt-8 flex flex-col gap-3 sm:flex-row">
                  <LinkButton href={startLearningHref} tone="yellow" size="lg" className="w-full sm:w-auto">
                    <Sparkles className="size-4" />
                    {t.startLearning}
                  </LinkButton>
                  <LinkButton href={heroFreeVideoHref} tone="paper" size="lg" className="w-full sm:w-auto">
                    <PlayCircle className="size-4" />
                    <span className="hero-cta-long">{m.hero.ctaSecondary}</span>
                    <span className="hero-cta-short">{m.hero.ctaSecondaryShort}</span>
                  </LinkButton>
                </div>
                <ul className="hero-trust mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-extrabold text-muted">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-ink" />
                    {lessonCount} {m.hero.trustLessons}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-ink" />
                    {m.hero.trustCohort}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-ink" />
                    {m.hero.trustSerbian}
                  </li>
                </ul>
              </div>
            </div>
            {/* L3: ispod praga iste 4 kartice kao snap red tik iznad trake (CSS ga gasi
                iznad praga). */}
            <HeroCardsRow locale={locale} signedIn={Boolean(viewerProfile)} />
            {/* Traka ishoda: usidrena uz donju ivicu heroa, puna širina, deo 100svh
                viewporta (ne dodaje visinu). Donju ivicu daje `border-b-2` sekcije. */}
            <OutcomeMarquee
              items={m.marquee.items}
              label={m.marquee.label}
              hint={m.marquee.hint}
              locale={locale}
            />
          </section>
        </HeroMotion>

        {/* ── KURSEVI (površina B) ─────────────────────────────────────────── */}
        {/* IZUZETAK v3: ispod heroa NEMA talasa (sekao bi logo i traku ishoda). Hero →
            žuta traka → #courses bez razdelnika; traka zadržava svoje ivice. */}
        <section id="courses" className="relative bg-surface-b px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-7xl">
            <SectionMarginalia
              variant="star"
              className="absolute right-1 top-0 hidden h-12 w-12 text-yellow sm:block"
            />
            <SectionHeader
              title={m.courses.title}
              titleLead={m.courses.titleLead}
              titleHighlight={m.courses.titleHighlight}
              body={m.courses.intro}
            />
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              {courses.map((course) => (
                <CourseCard key={course.slug} course={course} locale={locale} hasConvex={hasConvex} level={1} />
              ))}
            </div>
            <div className="mt-8 flex justify-center">
              <LinkButton href={withLocale(locale, "/courses")} tone="paper" size="md">
                {coursesListingContent[locale].viewAll}
              </LinkButton>
            </div>
          </div>
          <SectionWave from={1} to={0} className="section-wave" />
        </section>

        {/* ── KAKO IZGLEDA UČENJE (površina A) ─────────────────────────────── */}
        <section id="how" className="relative bg-surface-a px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-7xl">
            <SectionMarginalia
              variant="star"
              className="absolute right-1 top-0 hidden h-12 w-12 text-yellow sm:block"
            />
            <SectionHeader
              title={m.steps.title}
              titleLead={m.steps.titleLead}
              titleHighlight={m.steps.titleHighlight}
              body={m.steps.intro}
            />
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {m.steps.items.map((step, index) => (
                // Cela kartica je klikabilna (C1 overlay obrazac): `<a>` preko cele
                // površine, sadržaj `pointer-events-none` propušta klik do njega. CTA na
                // dnu je samo tekst + strelica (bez pozadine/bordera/senke), centriran; na
                // hover kartice čita se kao anchor link (podvlačenje + strelica 4px udesno).
                // Sve tranzicije kartice su na 67 % trajanja (v2, `duration-100`).
                <article
                  key={step.title}
                  data-motion="card"
                  className="group relative flex flex-col rounded-[16px] border-2 border-ink bg-surface-b p-3 shadow-[6px_6px_0_0_var(--shadow-hard-13)] transition duration-100 hover:-translate-y-0.5 hover:shadow-[9px_9px_0_0_var(--shadow-hard-20)] has-[>a:focus-visible]:outline has-[>a:focus-visible]:outline-2 has-[>a:focus-visible]:outline-offset-2 has-[>a:focus-visible]:outline-ink"
                >
                  <Link href={stepLinks[index]} aria-label={step.cta} className="absolute inset-0 z-0" />
                  <div className="pointer-events-none relative z-10 flex flex-1 flex-col">
                    <StepHoverVideo
                      posterSrc={STEP_MEDIA[index].poster}
                      hoverIn={STEP_MEDIA[index].hoverIn}
                      hoverOut={STEP_MEDIA[index].hoverOut}
                      label={step.title}
                      className="relative aspect-[4/3] overflow-hidden surface-media border-2 border-ink bg-surface-a"
                    />
                    <div className="mt-5 flex items-center gap-3 px-2">
                      <SketchIcon>
                        <span className="text-base font-black">{index + 1}</span>
                      </SketchIcon>
                      <h3 className="text-xl font-black leading-tight text-ink">{step.title}</h3>
                    </div>
                    <p className="mt-3 px-2 text-base font-bold leading-7 text-muted">{step.body}</p>
                    <div className="mt-auto flex min-h-11 items-center justify-center px-2 pt-6">
                      <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-ink">
                        <span className="decoration-ink decoration-2 underline-offset-4 group-hover:underline">
                          {step.cta}
                        </span>
                        <ArrowRight className="size-4 transition-transform duration-[160ms] ease-[var(--ease-studio-out)] group-hover:translate-x-1" />
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <SectionWave from={0} to={1} className="section-wave" />
        </section>

        {/* ── ZAJEDNICA (površina B) ───────────────────────────────────────── */}
        <section id="community" className="relative bg-surface-b px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <SectionHeader
                title={m.community.title}
                titleLead={m.community.titleLead}
                titleHighlight={m.community.titleHighlight}
                body={m.community.body}
              />
              <ul className="mt-8 flex flex-col gap-3 text-base font-extrabold text-ink">
                {m.community.points.map((point) => (
                  <li key={point} className="flex items-center gap-3">
                    <CheckCircle2 className="size-5 shrink-0 text-ink" />
                    {point}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <LinkButton href={withLocale(locale, "/community")} tone="paper" size="md">
                  <Sparkles className="size-4" />
                  {m.community.cta}
                </LinkButton>
              </div>
            </div>
            <Panel level={0} className="p-3">
              <LoopVideo
                webmSrc="/images/landing/community-v2-loop.webm"
                mp4Src="/images/landing/community-v2-loop.mp4"
                posterSrc="/images/landing/community-v2-poster.webp"
                label={m.community.imageAlt}
                className="relative aspect-[16/9] overflow-hidden surface-media border-2 border-ink bg-surface-b"
                sizes="(min-width: 1024px) 55vw, 100vw"
              />
            </Panel>
          </div>
          <SectionWave from={1} to={0} className="section-wave" />
        </section>

        {/* ── PRETPLATA (površina A; kartice planova su B → robot #F4F0E8) ──── */}
        <section id="pricing" className="relative bg-surface-a px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-7xl">
            <SectionMarginalia
              variant="star"
              className="absolute right-1 top-0 hidden h-12 w-12 text-yellow sm:block"
            />
            <SectionHeader
              title={m.pricing.title}
              titleLead={m.pricing.titleLead}
              titleHighlight={m.pricing.titleHighlight}
              titleBreak
              body={m.pricing.intro}
            />
            <div className="mt-10 grid items-stretch gap-6 lg:grid-cols-2">
              {/* BASIC — standardni panel (površina B → robot #F4F0E8 bešavno). CTA vodi na
                  registraciju (ulogovan: /app). Robot lebdi u desnoj trećini; tekst se sklanja
                  levo (`lg:pr-[38%]`), donjih 16% je dugme (van robota). */}
              {/* `paper-island`: kartica ostaje krem (#F4F0E8 = surface-b svetli) i u TAMNOJ temi,
                  jer robot ima UPEČENU #F4F0E8 pozadinu — da ne ostane svetao pravougaonik oko
                  robota na tamnoj kartici. Tekst/tokeni se razrešavaju na svetle (čitljivi). */}
              <Panel level={1} className="paper-island relative flex flex-col p-6 sm:p-8">
                <PlanRobot
                  mp4Src="/images/landing/plan-basic-loop.mp4"
                  posterSrc="/images/landing/plan-basic-poster.webp"
                  phase={0}
                  className="right-[1cm] top-3 h-[132px] w-[100px] lg:right-[1cm] lg:top-0 lg:bottom-[16%] lg:h-auto lg:w-[36%]"
                />
                <h3 className="pr-24 text-2xl font-black leading-tight text-ink lg:pr-[calc(38%_+_1cm)]">{m.pricing.basic.name}</h3>
                <div className="mt-6 flex items-end gap-2 pr-24 lg:pr-[calc(38%_+_1cm)]">
                  <span className="text-5xl font-black tabular-nums text-ink">{pricing.basicEur}</span>
                  <span className="pb-2 text-base font-extrabold text-muted">EUR / {m.pricing.perMonth}</span>
                </div>
                <ul className="mt-7 flex flex-col gap-2 text-base font-bold leading-7 text-muted lg:pr-[calc(38%_+_1cm)]">
                  {m.pricing.basic.features.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-1 size-5 shrink-0 text-ink" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-7">
                  <LinkButton href={startLearningHref} tone="paper" size="lg" className="w-full">
                    {m.pricing.basic.cta}
                    <ArrowRight className="size-4" />
                  </LinkButton>
                </div>
              </Panel>

              {/* PREMIUM — istaknut: „Najpopularnije" badge, žuto ostrvo za cenu, jača senka.
                  Placeholder cena (PRICING.premium) i CTA na registraciju/billing sa ?plan=premium. */}
              <Panel level={1} className="paper-island relative flex flex-col p-6 shadow-[8px_8px_0_0_var(--shadow-hard-20)] sm:p-8">
                {/* Robot pre bedža u DOM-u → bedž se crta IZNAD njega. Pomeren malo naviše
                    (−0.5cm) i vraćen udesno (net 1.2cm od desne ivice) po dopuni. */}
                <PlanRobot
                  mp4Src="/images/landing/plan-premium-loop.mp4"
                  posterSrc="/images/landing/plan-premium-poster.webp"
                  phase={0.7}
                  className="right-[1.2cm] top-[calc(2rem_-_0.5cm)] h-[132px] w-[100px] lg:right-[1.2cm] lg:top-[calc(2.5rem_-_0.5cm)] lg:bottom-[16%] lg:h-auto lg:w-[36%]"
                />
                <Badge
                  tone="yellow"
                  icon={<Sparkles className="size-3.5" />}
                  className="absolute -top-3 right-6 z-10 shadow-[2px_2px_0_0_var(--ink)]"
                >
                  {m.pricing.popular}
                </Badge>
                <h3 className="pr-24 text-2xl font-black leading-tight text-ink lg:pr-[calc(38%_+_1.2cm)]">{m.pricing.premium.name}</h3>
                <div className="mt-6 inline-flex w-fit items-end gap-2 rounded-[12px] border-2 border-ink bg-yellow px-4 py-2 shadow-[3px_3px_0_0_var(--ink)]">
                  <span className="text-5xl font-black tabular-nums text-ink">{pricing.premiumEur}</span>
                  <span className="pb-1 text-base font-extrabold text-ink">EUR / {m.pricing.perMonth}</span>
                </div>
                <ul className="mt-7 flex flex-col gap-2 text-base font-bold leading-7 text-muted lg:pr-[calc(38%_+_1.2cm)]">
                  {premiumFeatures.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-1 size-5 shrink-0 text-ink" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-7">
                  <LinkButton href={premiumCtaHref} tone="yellow" size="lg" className="w-full">
                    {m.pricing.premium.cta}
                    <ArrowRight className="size-4" />
                  </LinkButton>
                </div>
              </Panel>
            </div>
            {/* Napomena uz cenu iz admin ekrana (N1); prazno polje ne prikazuje red. */}
            {pricing.currencyNote ? (
              <p className="mx-auto mt-6 max-w-2xl text-center text-sm font-bold text-muted">
                {pricing.currencyNote}
              </p>
            ) : null}
            {/* Sitan red: naplata još ne postoji — vlasnik menja ovaj tekst (i18n `pricing.soon`). */}
            <p className="mx-auto mt-6 max-w-2xl text-center text-sm font-bold text-muted">
              {m.pricing.soon}
            </p>
          </div>
          <SectionWave from={0} to={1} className="section-wave" />
        </section>

        {/* ── FAQ (površina B) ─────────────────────────────────────────────── */}
        <section id="faq" className="relative bg-surface-b px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-3xl">
            <SectionMarginalia
              variant="star"
              className="absolute right-1 top-0 hidden h-12 w-12 text-yellow sm:block"
            />
            <SectionHeader
              title={m.faq.title}
              titleLead={m.faq.titleLead}
              titleHighlight={m.faq.titleHighlight}
            />
            <div className="mt-10 flex flex-col gap-3">
              {m.faq.items.map((item) => (
                // Nezavisni akordeoni (svaki svoj <details> → otvaranje jednog ne zatvara druge).
                // <details>/<summary> ostaje zbog pristupačnosti; otvaranje se animira preko
                // `.faq-answer` (grid-template-rows 0fr→1fr) — vidi globals.css. Kartica na hover
                // dobija blagi lift kao ostale kartice.
                <details
                  key={item.q}
                  // Ekskluzivni akordeon: isti `name` → otvaranje jednog browser sam zatvori
                  // prethodni (nikad više od 1 otvoren). Native, bez JS-a.
                  name="nauci-faq"
                  className="group rounded-[16px] border-2 border-ink bg-surface-a shadow-[4px_4px_0_0_var(--shadow-hard-13)] transition-[transform,box-shadow] duration-[260ms] ease-[var(--ease-studio-out)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--shadow-hard-20)]"
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-lg font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
                    <span>{item.q}</span>
                    {/* +/− indikator: dve prečke; vertikalna se rotira 90° pri otvaranju i
                        poklopi horizontalnu → „plus" glatko postaje „minus". */}
                    <span className="faq-icon shrink-0 text-ink" aria-hidden="true">
                      <span className="faq-icon-bar faq-icon-bar-h" />
                      <span className="faq-icon-bar faq-icon-bar-v" />
                    </span>
                  </summary>
                  <div className="faq-answer">
                    <div className="faq-answer-inner">
                      <p className="px-5 pb-5 text-base font-bold leading-7 text-muted">{item.a}</p>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
          <SectionWave from={1} to={0} className="section-wave" />
        </section>

        {/* ── ZAVRŠNI CTA (površina A; footer crta talas A→B) ──────────────── */}
        <section className="bg-surface-a px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div
              data-motion="card"
              className="ink-dots relative overflow-hidden rounded-[16px] border-2 border-ink bg-ink px-6 py-14 text-center shadow-[8px_8px_0_0_var(--shadow-hard-16)] sm:px-10"
            >
              <p className="font-display text-4xl leading-tight text-paper-strong sm:text-5xl">
                {m.finalCta.title}
              </p>
              <p className="mx-auto mt-4 max-w-xl text-lg font-bold text-paper-strong/80">
                {m.finalCta.body}
              </p>
              <div className="mt-8 flex justify-center">
                <LinkButton href={startLearningHref} tone="yellow" size="lg">
                  <Sparkles className="size-4" />
                  {t.startLearning}
                </LinkButton>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
