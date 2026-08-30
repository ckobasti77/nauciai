import { CheckCircle2, Heart, Minus, PlayCircle, Plus, ShieldCheck, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { CheckoutButton } from "@/components/app/checkout-button";
import { AccountMenu } from "@/components/marketing/account-menu";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { CourseFavoriteButton } from "@/components/marketing/course-favorite-button";
import { HeroLoop } from "@/components/marketing/hero-loop";
import { HeroMotion } from "@/components/marketing/hero-motion";
import { MarkerHighlight } from "@/components/marketing/marker-highlight";
import { OutcomeMarquee } from "@/components/marketing/outcome-marquee";
import { SectionMarginalia } from "@/components/marketing/section-marginalia";
import { BrandMark, LinkButton, Panel, SectionHeader, SketchIcon } from "@/components/ui/primitives";
import { SmartStickyHeader } from "@/components/ui/smart-sticky";
import { courses, totalLessons } from "@/lib/content";
import type { ViewerProfile } from "@/lib/current-viewer";
import { dictionary, localized, marketingContent, otherLocale, type Locale, withLocale } from "@/lib/i18n";

const STEP_IMAGES = [
  "/images/landing/step-1-watch.png",
  "/images/landing/step-2-create.png",
  "/images/landing/step-3-publish.png",
];

export function MarketingPage({
  locale,
  viewerProfile,
}: {
  locale: Locale;
  viewerProfile?: ViewerProfile;
}) {
  const t = dictionary[locale];
  const m = marketingContent[locale];
  const primaryCourse = courses[0];
  const nextLocale = otherLocale(locale);
  const startLearningHref = withLocale(locale, viewerProfile ? "/app" : "/sign-in");
  const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  const lessonCount = courses.reduce((count, course) => count + totalLessons(course), 0);
  const heroFreeVideoHref = `${withLocale(locale, `/courses/${primaryCourse.slug}`)}#besplatan-video`;

  return (
    <main className="bg-paper text-ink">
      <SmartStickyHeader
        data-marketing-auth={viewerProfile ? "authenticated" : "anonymous"}
        className="top-0 z-40 border-b-2 border-ink bg-paper/95 shadow-[0_8px_18px_-16px_var(--shadow-hard-55)] backdrop-blur"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <BrandMark href={withLocale(locale)} label={t.appName} />
          <nav className="hidden items-center gap-6 text-sm font-extrabold md:flex">
            <a href="#courses">{t.navCourses}</a>
            <a href="#community">{t.navCommunity}</a>
            <a href="#pricing">{t.navPricing}</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle locale={locale} />
            {viewerProfile ? (
              <Link
                href={withLocale(locale, "/app")}
                className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-ink bg-ink px-3 py-2 text-[11px] font-black uppercase text-paper-strong shadow-[3px_3px_0_0_var(--yellow)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--yellow)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink max-[380px]:hidden sm:px-4 sm:text-xs"
              >
                {t.dashboard}
              </Link>
            ) : null}
            <Link
              href={withLocale(nextLocale)}
              aria-label={m.footer.langLabel}
              title={m.footer.switchTo}
              className="inline-flex min-h-11 items-center rounded-[8px] border-2 border-ink bg-paper-strong px-3 py-2 text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {nextLocale.toUpperCase()}
            </Link>
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
          <section data-motion="hero" className="sketch-grid overflow-hidden">
            <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-20">
              <div className="max-w-3xl" data-motion="copy">
                <h1 className="text-4xl font-black leading-[1.03] text-ink sm:text-5xl lg:text-6xl">
                  {m.hero.titleLead}
                  <MarkerHighlight>{m.hero.titleHighlight}</MarkerHighlight>
                </h1>
                <p className="mt-6 max-w-2xl text-lg font-bold leading-8 text-muted sm:text-xl">
                  {m.hero.subhead}
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <LinkButton href={startLearningHref} tone="yellow" size="lg" className="w-full sm:w-auto">
                    <Sparkles className="size-4" />
                    {t.startLearning}
                  </LinkButton>
                  <LinkButton href={heroFreeVideoHref} tone="paper" size="lg" className="w-full sm:w-auto">
                    <PlayCircle className="size-4" />
                    {m.hero.ctaSecondary}
                  </LinkButton>
                </div>
                <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-extrabold text-muted">
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

              <div className="relative">
                <Panel className="sketch-float p-3">
                  <HeroLoop label={m.hero.videoAlt} />
                </Panel>
              </div>
            </div>
          </section>
        </HeroMotion>

        {/* ── MARQUEE ──────────────────────────────────────────────────────── */}
        <OutcomeMarquee items={m.marquee.items} label={m.marquee.label} />

        {/* ── KURSEVI ──────────────────────────────────────────────────────── */}
        <section id="courses" className="border-b-2 border-ink bg-paper-strong px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-7xl">
            <SectionMarginalia
              variant="star"
              className="absolute right-1 top-0 hidden h-12 w-12 text-yellow sm:block"
            />
            <SectionHeader title={m.courses.title} body={m.courses.intro} underline />
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              {courses.map((course) => {
                const courseHref = withLocale(locale, `/courses/${course.slug}`);
                const freeVideoHref = `${courseHref}#besplatan-video`;
                const signInHref = `${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(courseHref)}`;
                const favoriteLabel =
                  locale === "sr"
                    ? `Sačuvaj kurs ${localized(course.title, locale)} u favorite`
                    : `Save ${localized(course.title, locale)} to favorites`;

                return (
                  <article
                    key={course.slug}
                    data-motion="card"
                    className="group relative flex min-h-full flex-col overflow-hidden rounded-[16px] border-2 border-ink bg-paper-strong shadow-[6px_6px_0_0_var(--shadow-hard-16)] transition hover:-translate-y-1 hover:shadow-[9px_9px_0_0_var(--shadow-hard-20)]"
                  >
                    <Link
                      href={courseHref}
                      aria-label={locale === "sr" ? `Otvori kurs ${localized(course.title, locale)}` : `Open ${localized(course.title, locale)}`}
                      className="absolute inset-0 z-0"
                    />

                    <div className="pointer-events-none relative z-10 p-3">
                      <div className="relative aspect-[16/9] overflow-hidden rounded-[8px] border-2 border-ink bg-paper">
                        <Image
                          src={course.image.src}
                          alt={localized(course.image.alt, locale)}
                          fill
                          sizes="(min-width: 1024px) 50vw, 100vw"
                          className="object-cover"
                        />
                        <span className="absolute left-3 top-3 rounded-full border-2 border-ink bg-yellow px-4 py-2 text-sm font-black leading-none text-ink shadow-[3px_3px_0_0_var(--shadow-hard-22)]">
                          {localized(course.priceLabel, locale)}
                        </span>
                        <div className="pointer-events-auto absolute right-3 top-3">
                          {hasConvex ? (
                            <CourseFavoriteButton
                              courseSlug={course.slug}
                              signInHref={signInHref}
                              label={favoriteLabel}
                            />
                          ) : (
                            <Link
                              href={signInHref}
                              aria-label={favoriteLabel}
                              title={favoriteLabel}
                              className="relative z-10 inline-flex size-11 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[3px_3px_0_0_var(--shadow-hard-24)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                            >
                              <Heart className="size-5" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pointer-events-none relative z-10 flex flex-1 flex-col px-6 py-7 sm:px-8">
                      <h3 className="text-3xl font-black leading-tight text-ink">{localized(course.title, locale)}</h3>
                      <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-muted">
                        {m.courses.outcomesLabel}
                      </p>
                      <ul className="mt-3 flex flex-col gap-2 text-base font-bold leading-7 text-muted">
                        {course.detail.outcomes.map((outcome) => (
                          <li key={localized(outcome, locale)} className="flex items-start gap-2">
                            <CheckCircle2 className="mt-1 size-5 shrink-0 text-ink" />
                            <span>{localized(outcome, locale)}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="pointer-events-auto relative z-20 mt-auto flex flex-col gap-3 pt-7 lg:flex-row">
                        <Link
                          href={freeVideoHref}
                          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-5 py-2.5 text-sm font-extrabold text-ink shadow-[4px_4px_0_0_var(--ink)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:flex-1"
                        >
                          <PlayCircle className="size-4" />
                          {m.hero.ctaSecondary}
                        </Link>
                        <CheckoutButton
                          courseSlug={course.slug}
                          locale={locale}
                          label={locale === "sr" ? "Kupi sada" : "Buy now"}
                          tone="ink"
                          fullWidth
                          className="lg:flex-1"
                        />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── KAKO IZGLEDA UČENJE ──────────────────────────────────────────── */}
        <section id="how" className="border-b-2 border-ink bg-paper px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-7xl">
            <SectionMarginalia
              variant="arrow"
              className="absolute right-1 top-0 hidden h-12 w-16 text-ink sm:block"
            />
            <SectionHeader title={m.steps.title} body={m.steps.intro} underline />
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {m.steps.items.map((step, index) => (
                <article
                  key={step.title}
                  data-motion="card"
                  className="flex flex-col rounded-[16px] border-2 border-ink bg-paper-strong p-3 shadow-[6px_6px_0_0_var(--shadow-hard-13)]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden rounded-[8px] border-2 border-ink bg-paper">
                    <Image
                      src={STEP_IMAGES[index]}
                      alt={step.title}
                      fill
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="mt-5 flex items-center gap-3 px-2">
                    <SketchIcon>
                      <span className="text-base font-black">{index + 1}</span>
                    </SketchIcon>
                    <h3 className="text-xl font-black leading-tight text-ink">{step.title}</h3>
                  </div>
                  <p className="mt-3 px-2 pb-2 text-base font-bold leading-7 text-muted">{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── ZAJEDNICA ────────────────────────────────────────────────────── */}
        <section id="community" className="border-b-2 border-ink bg-paper-strong px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <SectionHeader title={m.community.title} body={m.community.body} underline />
              <ul className="mt-8 flex flex-col gap-3 text-base font-extrabold text-ink">
                {m.community.points.map((point) => (
                  <li key={point} className="flex items-center gap-3">
                    <CheckCircle2 className="size-5 shrink-0 text-ink" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <Panel className="p-3">
              <div className="relative aspect-[16/9] overflow-hidden rounded-[8px] border-2 border-ink bg-paper">
                <Image
                  src="/images/landing/community.png"
                  alt={m.community.imageAlt}
                  fill
                  sizes="(min-width: 1024px) 55vw, 100vw"
                  className="object-cover"
                />
              </div>
            </Panel>
          </div>
        </section>

        {/* ── PRETPLATA ────────────────────────────────────────────────────── */}
        <section id="pricing" className="border-b-2 border-ink bg-paper px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-7xl">
            <SectionMarginalia
              variant="spark"
              className="absolute right-1 top-0 hidden h-11 w-11 text-ink sm:block"
            />
            <SectionHeader title={m.pricing.title} body={m.pricing.intro} underline />
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              {courses.map((course) => (
                <Panel key={course.slug} className="flex flex-col p-6 sm:p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-black leading-tight text-ink">{localized(course.title, locale)}</h3>
                      <p className="mt-1 text-sm font-bold text-muted">{localized(course.subtitle, locale)}</p>
                    </div>
                    <ShieldCheck className="size-8 shrink-0 text-ink" />
                  </div>
                  <div className="mt-6 flex items-end gap-2">
                    <span className="text-5xl font-black text-ink">9,99</span>
                    <span className="pb-2 text-base font-extrabold text-muted">
                      EUR / {m.pricing.perMonth}
                    </span>
                  </div>
                  <p className="mt-7 text-xs font-black uppercase tracking-[0.12em] text-muted">
                    {m.pricing.includedHeading}
                  </p>
                  <ul className="mt-3 flex flex-col gap-2 text-base font-bold leading-7 text-muted">
                    {m.pricing.includes.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-1 size-5 shrink-0 text-ink" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-7">
                    <p className="flex items-center gap-2 text-2xl font-black text-ink">
                      <Sparkles className="size-6 text-ink" />
                      {m.pricing.cancel}
                    </p>
                    <CheckoutButton
                      courseSlug={course.slug}
                      locale={locale}
                      label={t.checkout}
                      fullWidth
                      className="mt-4"
                    />
                  </div>
                </Panel>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section id="faq" className="border-b-2 border-ink bg-paper-strong px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-3xl">
            <SectionMarginalia
              variant="star"
              className="absolute right-1 top-0 hidden h-11 w-11 text-yellow sm:block"
            />
            <SectionHeader title={m.faq.title} underline />
            <div className="mt-10 flex flex-col gap-3">
              {m.faq.items.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-[16px] border-2 border-ink bg-paper shadow-[4px_4px_0_0_var(--shadow-hard-13)]"
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-lg font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
                    <span>{item.q}</span>
                    <span className="inline-flex shrink-0 text-ink" aria-hidden="true">
                      <Plus className="faq-icon-closed size-5" />
                      <Minus className="faq-icon-open size-5" />
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-base font-bold leading-7 text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── ZAVRŠNI CTA ──────────────────────────────────────────────────── */}
        <section className="bg-paper px-4 py-20 sm:px-6 lg:px-8">
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
