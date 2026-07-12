import {
  CheckCircle2,
  Heart,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { CheckoutButton } from "@/components/app/checkout-button";
import { AccountMenu } from "@/components/marketing/account-menu";
import { CourseFavoriteButton } from "@/components/marketing/course-favorite-button";
import { HeroMotion } from "@/components/marketing/hero-motion";
import { BrandMark, HandUnderline, LinkButton, Panel, SectionHeader, SketchIcon } from "@/components/ui/primitives";
import { courses, primaryCourseSlug } from "@/lib/content";
import type { ViewerProfile } from "@/lib/current-viewer";
import { dictionary, localized, otherLocale, type Locale, withLocale } from "@/lib/i18n";

export function MarketingPage({
  locale,
  viewerProfile,
}: {
  locale: Locale;
  viewerProfile?: ViewerProfile;
}) {
  const t = dictionary[locale];
  const primaryCourse = courses[0];
  const nextLocale = otherLocale(locale);
  const startLearningHref = withLocale(locale, viewerProfile ? "/app" : "/sign-in");
  const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

  return (
    <main className="bg-paper text-ink">
      <header
        data-marketing-auth={viewerProfile ? "authenticated" : "anonymous"}
        className="sticky top-0 z-20 border-b-2 border-ink bg-paper/95 backdrop-blur"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <BrandMark href={withLocale(locale)} label={t.appName} />
          <nav className="hidden items-center gap-6 text-sm font-extrabold md:flex">
            <a href="#courses">{t.navCourses}</a>
            <a href="#community">{t.navCommunity}</a>
            <a href="#pricing">{t.navPricing}</a>
          </nav>
          <div className="flex items-center gap-2">
            {viewerProfile ? (
              <Link
                href={withLocale(locale, "/app")}
                className="inline-flex min-h-9 items-center justify-center rounded-full border-2 border-ink bg-ink px-3 py-2 text-[11px] font-black text-white shadow-[3px_3px_0_0_#f4be30] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_#f4be30] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink max-[380px]:hidden sm:min-h-10 sm:px-4 sm:text-xs"
              >
                DASHBOARD
              </Link>
            ) : null}
            <Link
              href={withLocale(nextLocale)}
              className="rounded-[8px] border-2 border-ink bg-white px-3 py-2 text-sm font-black"
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
      </header>

      <div data-motion="page">
      <HeroMotion>
        <section data-motion="hero" className="sketch-grid overflow-hidden border-b-2 border-ink">
          <div className="mx-auto grid min-h-[calc(100vh-74px)] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-16">
            <div className="max-w-3xl" data-motion="copy">
              <h1 className="text-5xl font-black leading-[0.95] text-ink sm:text-6xl lg:text-7xl">
                {locale === "sr" ? "Fakultet za AI sa praktičnim kursevima" : "Faculty for AI with practical courses"}
              </h1>
              <HandUnderline className="mt-5" />
              <p className="mt-6 max-w-2xl text-lg font-bold leading-8 text-muted sm:text-xl">
                {locale === "sr"
                  ? "Uči AI video, audio, tekst i montažu kroz lekcije, dokumente, zajednicu i mentorisan tempo rada."
                  : "Learn AI video, audio, writing, and editing through lessons, documents, community, and a guided work rhythm."}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <LinkButton href={startLearningHref} tone="yellow">
                  <Sparkles className="size-4" />
                  {t.startLearning}
                </LinkButton>
                <LinkButton href={withLocale(locale, "/app")} tone="paper">
                  <PlayCircle className="size-4" />
                  {t.openApp}
                </LinkButton>
              </div>
            </div>

            <div className="relative min-h-[420px]">
              <Panel className="sketch-float absolute right-0 top-0 w-[88%] p-4">
                <Image
                  src="/images/Proffession Elements.png"
                  alt="Hand-drawn AI video, audio, writing and editor tools"
                  width={1536}
                  height={864}
                  priority
                  className="h-auto w-full rounded-[6px]"
                />
              </Panel>
              <Panel className="sketch-float absolute bottom-0 left-0 w-[62%] bg-white p-5">
                <div className="flex items-start gap-4">
                  <SketchIcon>
                    <Video className="size-5" />
                  </SketchIcon>
                  <div>
                    <p className="font-display text-2xl text-ink">{localized(primaryCourse.title, locale)}</p>
                    <p className="mt-1 text-sm font-bold leading-6 text-muted">
                      {locale === "sr" ? "Prvi kurs je otvoren za upis." : "The first course is open for enrollment."}
                    </p>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </section>
      </HeroMotion>

      <section id="courses" className="border-b-2 border-ink bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            title={locale === "sr" ? "Kursevi koji vode do gotovog rada" : "Courses that lead to finished work"}
            body={
              locale === "sr"
                ? "Za pocetak su tu dva kursa: web sajtovi i video/audio produkcija. Svaki ima cenu, uvodni video i svoju informativnu stranicu."
                : "Start with two courses: websites and video/audio production. Each has pricing, an intro video, and its own information page."
            }
          />
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {courses.map((course) => {
              const courseHref = withLocale(locale, `/courses/${course.slug}`);
              const freeVideoHref = `${courseHref}#besplatan-video`;
              const signInHref = `${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(courseHref)}`;
              const favoriteLabel =
                locale === "sr"
                  ? `Sacuvaj kurs ${localized(course.title, locale)} u favorite`
                  : `Save ${localized(course.title, locale)} to favorites`;

              return (
                <article
                  key={course.slug}
                  data-motion="card"
                  className="group relative flex min-h-full flex-col overflow-hidden rounded-[16px] border-[2px] border-ink bg-white shadow-[6px_6px_0_0_rgba(14,49,88,0.16)] transition hover:-translate-y-1 hover:shadow-[9px_9px_0_0_rgba(14,49,88,0.2)]"
                >
                  <Link
                    href={courseHref}
                    aria-label={locale === "sr" ? `Otvori kurs ${localized(course.title, locale)}` : `Open ${localized(course.title, locale)}`}
                    className="absolute inset-0 z-0"
                  />

                  <div className="pointer-events-none relative z-10 p-3">
                    <div className="relative aspect-[16/9] overflow-hidden rounded-[8px] border-[2px] border-ink bg-paper">
                      <Image
                        src={course.image.src}
                        alt={localized(course.image.alt, locale)}
                        fill
                        sizes="(min-width: 1024px) 50vw, 100vw"
                        className="object-cover"
                      />
                      <span className="absolute left-3 top-3 rounded-full border-2 border-ink bg-yellow px-4 py-2 text-sm font-black leading-none text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.22)]">
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
                            className="relative z-10 inline-flex size-11 items-center justify-center rounded-full border-[2px] border-ink bg-white text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.24)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                          >
                            <Heart className="size-5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pointer-events-none relative z-10 flex flex-1 flex-col px-6 py-7 text-center sm:px-8">
                    <h3 className="text-3xl font-black leading-tight text-ink">{localized(course.title, locale)}</h3>
                    <p className="mx-auto mt-3 max-w-xl text-base font-bold leading-7 text-muted">
                      {localized(course.description, locale)}
                    </p>
                    <div className="pointer-events-auto relative z-20 mt-auto flex flex-col gap-3 pt-7 lg:flex-row">
                      <Link
                        href={freeVideoHref}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-5 py-2.5 text-sm font-extrabold text-ink shadow-[4px_4px_0_0_#0e3158] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:flex-1"
                      >
                        <PlayCircle className="size-4" />
                        {locale === "sr" ? "Odgledaj besplatan video" : "Watch free video"}
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

      <section id="community" className="border-b-2 border-ink bg-paper px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <SectionHeader
              title={locale === "sr" ? "Zajednica nije dodatak, nego radni prostor" : "Community is a working space, not an add-on"}
              body={
                locale === "sr"
                  ? "Studenti dele promptove, komentarišu radove, prate napredak i dobijaju obaveštenja kada se objave nove lekcije."
                  : "Students share prompts, comment on work, track progress, and get notified when new lessons are published."
              }
            />
            <div className="mt-8 grid gap-3 text-base font-extrabold">
              {(locale === "sr"
                ? ["Server provera pristupa", "Potpisan video playback", "Admin po ulogama"]
                : ["Server-side entitlement", "Signed video playback", "Role-based admin"]
              ).map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircle2 className="size-5 text-ink" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <Panel className="bg-white p-4">
            <Image
              src="/images/Budget Graphic.png"
              alt="Hand-drawn budget jar showing subscription planning"
              width={1536}
              height={864}
              loading="eager"
              className="h-auto w-full rounded-[6px]"
            />
          </Panel>
        </div>
      </section>

      <section id="pricing" className="bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeader
            title={locale === "sr" ? "Mesečna pretplata po kursu" : "Monthly subscription per course"}
            body={
              locale === "sr"
                ? "Stripe Checkout otvara kupovinu za konkretan kurs, a webhook sinhronizuje status pretplate u Convex."
                : "Stripe Checkout starts purchase for a specific course, while webhooks sync subscription status in Convex."
            }
          />
          <Panel className="p-6">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="font-display text-3xl text-ink">{localized(primaryCourse.title, locale)}</p>
                <p className="mt-2 text-sm font-bold text-muted">{localized(primaryCourse.description, locale)}</p>
              </div>
              <ShieldCheck className="size-9 text-ink" />
            </div>
            <div className="mt-8 flex items-end gap-2">
              <span className="text-5xl font-black text-ink">9,99</span>
              <span className="pb-2 text-base font-extrabold text-muted">EUR</span>
            </div>
            <CheckoutButton
              courseSlug={primaryCourseSlug}
              locale={locale}
              label={t.checkout}
              className="mt-6"
            />
          </Panel>
        </div>
      </section>
      </div>
    </main>
  );
}
