import type { Metadata } from "next";
import { ArrowRight, Check, Minus, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { LoopVideo } from "@/components/marketing/loop-video";
import { MarkerHighlight } from "@/components/marketing/marker-highlight";
import { PlanCards } from "@/components/marketing/plan-cards";
import { SectionMarginalia } from "@/components/marketing/section-marginalia";
import { SectionWave } from "@/components/marketing/section-wave";
import { LinkButton, Panel, SectionHeader } from "@/components/ui/primitives";
import { courses } from "@/lib/content";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import {
  dictionary,
  localized,
  marketingContent,
  pricingPageContent,
  publicMeta,
  withLocale,
  type Locale,
} from "@/lib/i18n";
import { PRICING } from "@/lib/pricing";
import { getPlanPricing, getPremiumCredits } from "@/lib/pricing-data";
import { alternatesFor } from "@/lib/routes";
import { nextLevel, surfaceClass } from "@/lib/surface";

// `as const` u `pricingPageContent` daje literalne tipove po jeziku (sr i en labele su
// različiti literali), pa red mora da se opiše ovako široko da bi obe varijante prošle.
type CompareRow = { readonly label: string; readonly basic: boolean; readonly premium: boolean };

/**
 * Metapodaci strane — isti obrazac kao javna lista kurseva (`publicMeta` + kanonski
 * URL iz `NEXT_PUBLIC_SITE_URL`). Obe rute ga zovu, pa `hreflang` par uvek pokazuje
 * na PREVEDENE segmente: sr `/pretplata`, en `/pricing`.
 */
export function buildPricingMetadata(locale: Locale): Metadata {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const alternates = alternatesFor(origin, "/pricing", locale);
  const canonicalUrl = alternates.canonical;
  const title = localized(publicMeta.pricing.title, locale);
  const description = localized(publicMeta.pricing.description, locale);

  return {
    title,
    description,
    alternates,
    robots: { index: true, follow: true },
    openGraph: { type: "website", url: canonicalUrl, title, description },
    twitter: { card: "summary" },
  };
}

/**
 * Kvačica / crtica u tabeli razlika. Ikonica je dekorativna (kružić nosi značenje
 * bojom i oblikom), pa pravu poruku za čitač ekrana daje `sr-only` tekst — bez
 * njega bi red zvučao kao gola labela bez odgovora.
 */
function Mark({ on, yes, no }: { on: boolean; yes: string; no: string }) {
  return (
    <span
      className={`inline-flex size-8 items-center justify-center rounded-full border-2 ${
        on ? "border-ink bg-yellow" : "border-line"
      }`}
    >
      {on ? (
        <Check className="size-4 text-ink" aria-hidden="true" />
      ) : (
        <Minus className="size-4 text-muted" aria-hidden="true" />
      )}
      <span className="sr-only">{on ? yes : no}</span>
    </span>
  );
}

/**
 * Mobilna varijanta tabele razlika: ista mreža podataka, ali kao dve kartice jedna
 * ispod druge. Namerno NIJE horizontalni skrol — kolona koja se krije van ekrana je
 * kolona koju niko ne pročita.
 */
function CompareCard({
  name,
  highlight,
  plan,
  rows,
  yes,
  no,
}: {
  name: string;
  highlight?: boolean;
  plan: "basic" | "premium";
  rows: readonly CompareRow[];
  yes: string;
  no: string;
}) {
  return (
    <Panel level={0} className="p-5">
      <h3 className="text-xl font-black leading-tight text-ink">
        {highlight ? (
          <span className="inline-flex rounded-full border-2 border-ink bg-yellow px-3 py-1">{name}</span>
        ) : (
          name
        )}
      </h3>
      <ul className="mt-4 flex flex-col">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-4 border-b-2 border-line py-3 last:border-b-0 last:pb-0"
          >
            <span className="text-base font-bold leading-6 text-muted">{row.label}</span>
            <Mark on={row[plan]} yes={yes} no={no} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * Javna strana pretplate (N6) — detaljnija verzija sekcije „#pricing" sa landinga:
 * iste kartice planova, pa tabela razlika, pa pojedinačni kursevi sa jednokratnom
 * cenom, pa pitanja o naplati.
 *
 * Površine se smenjuju kao na landingu (A → B → A → B → A) i granicu svuda crta
 * `SectionWave`, nijedan ravan border. Poslednja sekcija je A jer podnožje samo crta
 * talas A→B na svom vrhu.
 *
 * Obe rute (`/pretplata`, `/pricing`) renderuju ovu komponentu, pa se podaci čitaju
 * OVDE, na jednom mestu, umesto dvaput u tankim `page.tsx` fajlovima.
 */
export async function PricingPage({ locale }: { locale: Locale }) {
  const t = dictionary[locale];
  const m = marketingContent[locale];
  const p = pricingPageContent[locale];

  const [viewerProfile, premiumCredits, pricing] = await Promise.all([
    getCurrentViewerProfile(),
    getPremiumCredits(),
    getPlanPricing(),
  ]);

  const startLearningHref = withLocale(locale, viewerProfile ? "/app" : "/sign-in");
  const premiumCtaHref = viewerProfile
    ? `${withLocale(locale, "/app/billing")}?plan=premium`
    : `${withLocale(locale, "/sign-in")}?plan=premium`;

  // Kartice kurseva: sekcija je A (nivo 0) → kartica crta svoju pozadinu (nivo 1),
  // a medijski bunar u njoj još jedan dublje.
  const courseCardLevel = nextLevel(0);
  const courseMediaLevel = nextLevel(courseCardLevel);

  return (
    <main className="overflow-x-clip bg-surface-a text-ink">
      <div data-motion="page">
        {/* ── NASLOV + PLANOVI (površina A; kartice planova su B → robot #F4F0E8) ── */}
        <section className="relative bg-surface-a px-4 pb-16 pt-10 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-7xl">
            <SectionMarginalia
              variant="star"
              className="absolute right-1 top-0 hidden h-12 w-12 text-yellow sm:block"
            />
            <div className="max-w-3xl" data-motion="copy">
              <h1 className="text-balance text-4xl font-black leading-[1.05] text-ink sm:text-5xl lg:text-6xl">
                {p.hero.titleLead}
                <MarkerHighlight>{p.hero.titleHighlight}</MarkerHighlight>
              </h1>
              <p className="mt-6 max-w-2xl text-lg font-bold leading-8 text-muted">{p.hero.subtitle}</p>
            </div>
            {/* `id="pricing"` nije ukras: preko njega `PlanRobot` sinhronizuje početak
                petlje oba robota (isti prag, sačuvan fazni pomak) — isti ugovor kao u
                sekciji cena na landingu. */}
            <div id="pricing" className="mt-12">
              <PlanCards
                locale={locale}
                pricing={pricing}
                premiumCredits={premiumCredits}
                basicFeatures={p.plans.basicFeatures}
                premiumFeatures={p.plans.premiumFeatures}
                basicHref={startLearningHref}
                premiumHref={premiumCtaHref}
              />
            </div>
            {/* Napomena uz cenu iz admin ekrana (N1); prazno polje ne prikazuje red. */}
            {pricing.currencyNote ? (
              <p className="mx-auto mt-6 max-w-2xl text-center text-sm font-bold text-muted">
                {pricing.currencyNote}
              </p>
            ) : null}
            <p className="mx-auto mt-6 max-w-2xl text-center text-sm font-bold text-muted">
              {m.pricing.soon}
            </p>
          </div>
          <SectionWave from={0} to={1} className="section-wave" />
        </section>

        {/* ── TABELA RAZLIKA (površina B) ──────────────────────────────────── */}
        <section className="relative bg-surface-b px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-5xl">
            <SectionHeader
              title={`${p.compare.titleLead}${p.compare.titleHighlight}`}
              titleLead={p.compare.titleLead}
              titleHighlight={p.compare.titleHighlight}
              body={p.compare.intro}
            />

            {/* ≥ md: prava tabela sa zaglavljima redova i kolona. */}
            <Panel level={0} className="mt-10 hidden overflow-hidden md:block">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">
                  {p.compare.titleLead}
                  {p.compare.titleHighlight}
                </caption>
                <thead>
                  <tr className="border-b-2 border-ink">
                    <th
                      scope="col"
                      className="px-6 py-4 text-xs font-black uppercase tracking-[0.12em] text-muted"
                    >
                      {p.compare.featureHeading}
                    </th>
                    <th scope="col" className="px-6 py-4 text-center text-lg font-black text-ink">
                      {m.pricing.basic.name}
                    </th>
                    <th scope="col" className="px-6 py-4 text-center">
                      <span className="inline-flex rounded-full border-2 border-ink bg-yellow px-4 py-1 text-lg font-black text-ink">
                        {m.pricing.premium.name}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.compare.rows.map((row) => (
                    <tr key={row.label} className="border-b-2 border-line last:border-b-0">
                      <th scope="row" className="px-6 py-4 text-base font-extrabold text-ink">
                        {row.label}
                      </th>
                      <td className="px-6 py-4 text-center">
                        <Mark on={row.basic} yes={p.compare.included} no={p.compare.excluded} />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Mark on={row.premium} yes={p.compare.included} no={p.compare.excluded} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            {/* < md: dve kartice jedna ispod druge — bez horizontalnog skrola. */}
            <div className="mt-10 flex flex-col gap-6 md:hidden">
              <CompareCard
                name={m.pricing.basic.name}
                plan="basic"
                rows={p.compare.rows}
                yes={p.compare.included}
                no={p.compare.excluded}
              />
              <CompareCard
                name={m.pricing.premium.name}
                highlight
                plan="premium"
                rows={p.compare.rows}
                yes={p.compare.included}
                no={p.compare.excluded}
              />
            </div>
          </div>
          <SectionWave from={1} to={0} className="section-wave" />
        </section>

        {/* ── POJEDINAČNI KURSEVI (površina A) ─────────────────────────────── */}
        <section className="relative bg-surface-a px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-7xl">
            <SectionMarginalia
              variant="star"
              className="absolute right-1 top-0 hidden h-12 w-12 text-yellow sm:block"
            />
            <SectionHeader
              title={`${p.courses.titleLead}${p.courses.titleHighlight}`}
              titleLead={p.courses.titleLead}
              titleHighlight={p.courses.titleHighlight}
              body={p.courses.intro}
            />
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {courses.map((course) => {
                const courseHref = withLocale(locale, `/courses/${course.slug}`);
                return (
                  // Cela kartica je klikabilna (C1 overlay obrazac): `<a>` preko cele
                  // površine, sadržaj `pointer-events-none` propušta klik do njega.
                  <article
                    key={course.slug}
                    data-motion="card"
                    className={`group relative flex flex-col surface-card border-2 border-ink ${surfaceClass(courseCardLevel)} p-3 shadow-[6px_6px_0_0_var(--shadow-hard-13)] transition duration-100 hover:-translate-y-0.5 hover:shadow-[9px_9px_0_0_var(--shadow-hard-20)] has-[>a:focus-visible]:outline has-[>a:focus-visible]:outline-2 has-[>a:focus-visible]:outline-offset-2 has-[>a:focus-visible]:outline-ink`}
                  >
                    <Link
                      href={courseHref}
                      aria-label={`${m.courses.viewCourse}: ${localized(course.title, locale)}`}
                      className="absolute inset-0 z-0"
                    />
                    <div className="pointer-events-none relative z-10 flex flex-1 flex-col">
                      <div
                        className={`relative aspect-[16/9] overflow-hidden surface-media border-2 border-ink ${surfaceClass(courseMediaLevel)}`}
                      >
                        {course.image.loop ? (
                          <LoopVideo
                            webmSrc={course.image.loop.webm}
                            mp4Src={course.image.loop.mp4}
                            posterSrc={course.image.loop.poster}
                            label={localized(course.image.alt, locale)}
                            className="absolute inset-0"
                            sizes="(min-width: 768px) 50vw, 100vw"
                          />
                        ) : (
                          <Image
                            src={course.image.src}
                            alt={localized(course.image.alt, locale)}
                            fill
                            sizes="(min-width: 768px) 50vw, 100vw"
                            className="object-cover"
                          />
                        )}
                        {/* Jednokratna cena: `platformSettings` (N1) nema polje za cenu
                            kursa, pa se čita iz rezerve u `lib/pricing.ts`. */}
                        <span className="absolute left-3 top-3 inline-flex items-baseline gap-1.5 rounded-full border-2 border-ink bg-yellow px-4 py-2 text-sm font-black leading-none text-ink shadow-[3px_3px_0_0_var(--shadow-hard-22)]">
                          <span className="tabular-nums">{PRICING.course.eur} EUR</span>
                          <span className="text-xs font-extrabold">{p.courses.oneTime}</span>
                        </span>
                      </div>
                      <h3 className="mt-5 px-2 text-2xl font-black leading-tight text-ink">
                        {localized(course.title, locale)}
                      </h3>
                      <p className="mt-3 px-2 text-base font-bold leading-7 text-muted">
                        {localized(course.subtitle, locale)}
                      </p>
                      <div className="mt-auto flex min-h-11 items-center justify-center px-2 pt-6">
                        <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-ink">
                          <span className="decoration-ink decoration-2 underline-offset-4 group-hover:underline">
                            {m.courses.viewCourse}
                          </span>
                          <ArrowRight className="size-4 transition-transform duration-[160ms] ease-[var(--ease-studio-out)] group-hover:translate-x-1" />
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
          <SectionWave from={0} to={1} className="section-wave" />
        </section>

        {/* ── PITANJA O NAPLATI (površina B) ───────────────────────────────── */}
        <section className="relative bg-surface-b px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-3xl">
            <SectionMarginalia
              variant="star"
              className="absolute right-1 top-0 hidden h-12 w-12 text-yellow sm:block"
            />
            <SectionHeader
              title={`${p.faq.titleLead}${p.faq.titleHighlight}`}
              titleLead={p.faq.titleLead}
              titleHighlight={p.faq.titleHighlight}
            />
            <div className="mt-10 flex flex-col gap-3">
              {p.faq.items.map((item) => (
                // Isti akordeon kao FAQ na landingu: <details>/<summary> zbog pristupačnosti,
                // otvaranje animira `.faq-answer` (globals.css). Zaseban `name` da se ne
                // sudara sa landing grupom.
                <details
                  key={item.q}
                  name="nauci-billing-faq"
                  className="group rounded-[16px] border-2 border-ink bg-surface-a shadow-[4px_4px_0_0_var(--shadow-hard-13)] transition-[transform,box-shadow] duration-[260ms] ease-[var(--ease-studio-out)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--shadow-hard-20)]"
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-lg font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
                    <span>{item.q}</span>
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
                {p.finalCta.title}
              </p>
              <p className="mx-auto mt-4 max-w-xl text-lg font-bold text-paper-strong/80">
                {p.finalCta.body}
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
