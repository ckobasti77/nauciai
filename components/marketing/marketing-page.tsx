import {
  BookOpen,
  CheckCircle2,
  Download,
  MessageCircle,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { CheckoutButton } from "@/components/app/checkout-button";
import { HeroMotion } from "@/components/marketing/hero-motion";
import { BrandMark, HandUnderline, LinkButton, Panel, SectionHeader, SketchIcon } from "@/components/ui/primitives";
import { courses, primaryCourseSlug } from "@/lib/content";
import { dictionary, localized, otherLocale, type Locale, withLocale } from "@/lib/i18n";

export function MarketingPage({ locale }: { locale: Locale }) {
  const t = dictionary[locale];
  const primaryCourse = courses[0];
  const nextLocale = otherLocale(locale);

  return (
    <main className="bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <BrandMark href={withLocale(locale)} label={t.appName} />
          <nav className="hidden items-center gap-6 text-sm font-extrabold md:flex">
            <a href="#directions">{t.navCourses}</a>
            <a href="#community">{t.navCommunity}</a>
            <a href="#pricing">{t.navPricing}</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href={withLocale(nextLocale)}
              className="rounded-[8px] border-2 border-ink bg-white px-3 py-2 text-sm font-black"
            >
              {nextLocale.toUpperCase()}
            </Link>
            <LinkButton href={withLocale(locale, "/sign-in")} tone="paper" className="hidden sm:inline-flex">
              {t.signIn}
            </LinkButton>
          </div>
        </div>
      </header>

      <HeroMotion>
        <section className="sketch-grid overflow-hidden border-b-2 border-ink">
          <div className="mx-auto grid min-h-[calc(100vh-74px)] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-16">
            <div className="max-w-3xl">
              <h1 className="text-5xl font-black leading-[0.95] text-ink sm:text-6xl lg:text-7xl">
                {locale === "sr" ? "Fakultet za AI sa praktičnim smerovima" : "Faculty for AI with practical tracks"}
              </h1>
              <HandUnderline className="mt-5" />
              <p className="mt-6 max-w-2xl text-lg font-bold leading-8 text-muted sm:text-xl">
                {locale === "sr"
                  ? "Uči AI video, audio, tekst i montažu kroz lekcije, dokumente, zajednicu i mentorisan tempo rada."
                  : "Learn AI video, audio, writing, and editing through lessons, documents, community, and a guided work rhythm."}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <LinkButton href={withLocale(locale, "/sign-in")} tone="yellow">
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
                      {locale === "sr" ? "Prvi smer je otvoren za upis." : "The first track is open for enrollment."}
                    </p>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </section>
      </HeroMotion>

      <section id="directions" className="border-b-2 border-ink bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            title={locale === "sr" ? "Smerovi koji vode do gotovog rada" : "Tracks that lead to finished work"}
            body={
              locale === "sr"
                ? "Svaki smer ima lekcije, dokumente za download, napredak, pristup zajednici i mesečnu pretplatu po smeru."
                : "Each track includes lessons, downloadable documents, progress, community access, and a monthly subscription per track."
            }
          />
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {courses.map((course) => (
              <Panel key={course.slug} className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-3xl font-black text-ink">{localized(course.title, locale)}</h3>
                    <p className="mt-2 text-base font-bold text-muted">{localized(course.subtitle, locale)}</p>
                  </div>
                  <span className="rounded-[8px] border-2 border-ink bg-yellow px-3 py-1 text-sm font-black text-ink">
                    {localized(course.priceLabel, locale)}
                  </span>
                </div>
                <p className="mt-5 text-base leading-7 text-muted">{localized(course.description, locale)}</p>
                <div className="mt-6 flex flex-wrap gap-3 text-sm font-extrabold text-ink">
                  <span className="inline-flex items-center gap-2"><BookOpen className="size-4" />{t.lessons}</span>
                  <span className="inline-flex items-center gap-2"><Download className="size-4" />{t.documents}</span>
                  <span className="inline-flex items-center gap-2"><MessageCircle className="size-4" />{t.community}</span>
                </div>
              </Panel>
            ))}
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
            title={locale === "sr" ? "Mesečna pretplata po smeru" : "Monthly subscription per track"}
            body={
              locale === "sr"
                ? "Stripe Checkout otvara kupovinu za konkretan smer, a webhook sinhronizuje status pretplate u Convex."
                : "Stripe Checkout starts purchase for a specific track, while webhooks sync subscription status in Convex."
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
              <span className="text-5xl font-black text-ink">9.99</span>
              <span className="pb-2 text-base font-extrabold text-muted">{locale === "sr" ? "/ mes" : "/ month"}</span>
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
    </main>
  );
}
