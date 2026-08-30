/*
 * IMPECCABLE direction contract (studio-public F3; brif-pinovan pravac, bez
 * concept tournament-a — svet je zakovan brifom: papir/mastilo/žuta, školski
 * sketch; izvorni komentar umesto emitovanog HTML-a po AGENTS.md surgical
 * pravilu).
 * THESIS: prva strana školske sveske u kojoj je mehanizam već skiciran —
 *   opis → model → uramljen rad sa cenom; odbija generički AI-landing sa
 *   lažnim galerijama.
 * OWN-WORLD: sketch-grid papir, mastilo 2px okviri, tvrde senke, žuta samo za
 *   akciju i cenu, Patrick Hand za rukopis, Nunito za tekst.
 * STORY: posetilac shvati šta Studio pravi i koliko košta, poveruje jer su
 *   cene žive iz baze (ne obećanja), i klikne „Probaj besplatno" (25 kr poklon).
 * FIRST VIEWPORT: levo naslov + rukopisno podvlačenje + CTA red + bonus red;
 *   desno autorska SVG skica mehanizma u dva plutajuća panela.
 * FORM: nasleđena hero gramatika sa marketing home-a (split 1.02/0.98,
 *   sketch-float paneli) — incumbent kompozicija, svesno.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 *   finish review, the verdict, and every shipping raster carrying its
 *   provenance.
 */
import type { Metadata } from "next";
import { ArrowRight, AudioLines, Coins, Image as ImageIcon, Sparkles, Video } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { ThemeToggle } from "@/components/app/theme-toggle";
import { AccountMenu } from "@/components/marketing/account-menu";
import { HeroMotion } from "@/components/marketing/hero-motion";
import {
  BrandMark,
  HandUnderline,
  LinkButton,
  Panel,
  SectionHeader,
  SketchIcon,
  cn,
} from "@/components/ui/primitives";
import { SmartStickyHeader } from "@/components/ui/smart-sticky";
import { getConvexHttpClient, convexQueries } from "@/lib/convex-http";
import {
  formatEur,
  packValueLine,
  referenceCreditCosts,
  type CatalogModelRow,
  type CreditPackRow,
  type ReferenceCosts,
} from "@/lib/credits-value";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { locales, localized, normalizeLocale, otherLocale, withLocale, type Locale } from "@/lib/i18n";
import { STUDIO_EXAMPLES, STUDIO_LANDING } from "@/lib/studio-landing";
import { PRIVACY_POLICY_PATH, STUDIO_TERMS_PATH } from "@/lib/studio-messages";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).locale);
  return {
    title: STUDIO_LANDING.metaTitle[locale],
    description: STUDIO_LANDING.metaDescription[locale],
    alternates: { languages: { sr: "/sr/studio", en: "/en/studio" } },
    openGraph: {
      title: STUDIO_LANDING.metaTitle[locale],
      description: STUDIO_LANDING.metaDescription[locale],
      type: "website",
    },
  };
}

type LandingPack = CreditPackRow & { titleSr: string; titleEn: string; stripePriceId?: string };

async function loadLandingData(): Promise<{ packs: LandingPack[]; reference: ReferenceCosts }> {
  const convex = getConvexHttpClient();
  if (!convex) return { packs: [], reference: { image: null, video: null, audio: null } };
  const [packs, models] = await Promise.all([
    convex.query(convexQueries.listPacks, {}).catch(() => []) as Promise<LandingPack[]>,
    convex.query(convexQueries.listCatalogModels, {}).catch(() => []) as Promise<CatalogModelRow[]>,
  ]);
  return {
    packs: packs.filter((pack) => pack.kind === "pack"),
    reference: referenceCreditCosts(models),
  };
}

/**
 * Autorska skica mehanizma u brend rukopisu (mastilo + žuta): opis → Studio →
 * uramljen rad sa cenom. Ovo je ILUSTRACIJA u sopstvenom sketch jeziku sajta,
 * ne lažni AI izlaz — prave generacije idu u sekciju „Primeri" (manifest).
 */
function MechanismSketch({ locale }: { locale: Locale }) {
  const promptText = locale === "sr" ? "„lisica u snegu, akvarel”" : "“a fox in snow, watercolor”";
  const priceText = locale === "sr" ? "20 kredita" : "20 credits";
  return (
    <svg
      viewBox="0 0 420 300"
      role="img"
      aria-label={
        locale === "sr"
          ? "Skica: opis se pretvara u uramljenu sliku sa cenom u kreditima"
          : "Sketch: a description turns into a framed picture with a credit price"
      }
      className="h-auto w-full text-ink"
    >
      {/* Kartica sa promptom */}
      <g>
        <rect x="10" y="18" width="188" height="74" rx="10" fill="var(--paper-strong)" stroke="currentColor" strokeWidth="3" />
        <text x="24" y="50" className="font-display" fontSize="21" fill="currentColor">
          {promptText}
        </text>
        <path d="M24 66 q 40 8 78 2 t 76 -2" fill="none" stroke="var(--yellow)" strokeWidth="5" strokeLinecap="round" />
      </g>
      {/* Strelica rukom */}
      <path
        d="M200 92 C 236 128 226 152 202 178"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="1 9"
      />
      <path d="M212 168 L 200 182 L 218 184" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Uramljen rad */}
      <g>
        <rect x="176" y="186" width="176" height="104" rx="12" fill="var(--paper-strong)" stroke="currentColor" strokeWidth="3.5" />
        <rect x="190" y="198" width="148" height="80" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
        {/* Skica lisice: brdo, mesec, lisica od tri poteza */}
        <path d="M192 262 q 30 -26 62 -6 t 82 -4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="316" cy="214" r="9" fill="var(--yellow)" stroke="currentColor" strokeWidth="2" />
        <path d="M228 252 q 8 -18 24 -10 q 4 -10 12 -2 q 14 -4 10 12 q 6 8 -8 8 l -30 0 q -12 -2 -8 -8 Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M240 240 l 4 -8 l 6 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      {/* Cena na žutoj piluli */}
      <g>
        <rect x="238" y="278" width="106" height="30" rx="15" fill="var(--yellow)" stroke="currentColor" strokeWidth="3" transform="rotate(-3 291 293)" />
        <text x="291" y="298" textAnchor="middle" fontSize="15" fontWeight="900" fill="currentColor" transform="rotate(-3 291 293)">
          {priceText}
        </text>
      </g>
      {/* Filmska traka i talas — nagoveštaj videa i zvuka */}
      <g stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round">
        <rect x="24" y="130" width="118" height="44" rx="8" fill="var(--paper-strong)" strokeWidth="3" />
        <path d="M36 130 v 44 M52 130 v 44" strokeWidth="2" opacity="0.55" />
        <path d="M66 142 l 24 10 l -24 10 Z" fill="var(--yellow)" strokeLinejoin="round" />
        <path d="M104 152 h 26" opacity="0.55" />
        <path d="M30 214 q 6 -18 12 0 t 12 0 t 12 0 t 12 0 t 12 0 t 12 0" strokeWidth="3" />
      </g>
    </svg>
  );
}

export default async function StudioLandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = normalizeLocale((await params).locale);
  const [viewerProfile, { packs, reference }] = await Promise.all([
    getCurrentViewerProfile(),
    loadLandingData(),
  ]);

  const nextLocale = otherLocale(locale);
  const studioAppHref = withLocale(locale, "/studio/app");
  const creditsHref = withLocale(locale, "/studio/krediti");
  const trySignInHref = `${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(studioAppHref)}`;
  const buySignInHref = `${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(creditsHref)}`;
  const primaryHref = viewerProfile ? studioAppHref : trySignInHref;
  const primaryLabel = viewerProfile ? STUDIO_LANDING.ctaOpen[locale] : STUDIO_LANDING.ctaTry[locale];

  const kinds = [
    { key: "image" as const, icon: ImageIcon, price: reference.image },
    { key: "video" as const, icon: Video, price: reference.video },
    { key: "audio" as const, icon: AudioLines, price: reference.audio },
  ];

  return (
    <main className="bg-paper text-ink">
      <SmartStickyHeader className="top-0 z-40 border-b-2 border-ink bg-paper/95 shadow-[0_8px_18px_-16px_var(--shadow-hard-55)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <BrandMark href={withLocale(locale)} />
          <div className="flex items-center gap-2">
            <ThemeToggle locale={locale} />
            <Link
              href={withLocale(nextLocale, "/studio")}
              className="rounded-[8px] border-2 border-ink bg-paper-strong px-3 py-2 text-sm font-black"
            >
              {nextLocale.toUpperCase()}
            </Link>
            {viewerProfile ? (
              <AccountMenu locale={locale} profile={viewerProfile} />
            ) : (
              <LinkButton href={trySignInHref} tone="paper" className="hidden sm:inline-flex">
                {locale === "sr" ? "Prijavi se" : "Sign in"}
              </LinkButton>
            )}
          </div>
        </div>
      </SmartStickyHeader>

      <div data-motion="page">
        <HeroMotion>
          <section data-motion="hero" className="sketch-grid overflow-hidden border-b-2 border-ink">
            <div className="mx-auto grid min-h-[calc(100dvh-74px)] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-16">
              <div className="max-w-3xl" data-motion="copy">
                <h1 className="text-5xl font-black leading-[0.95] text-ink sm:text-6xl lg:text-7xl">
                  {STUDIO_LANDING.heroTitle[locale]}
                </h1>
                <HandUnderline className="mt-5" />
                <p className="mt-6 max-w-2xl text-lg font-bold leading-8 text-muted sm:text-xl">
                  {STUDIO_LANDING.heroBody[locale]}
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <LinkButton href={primaryHref} tone="yellow">
                    <Sparkles className="size-4" />
                    {primaryLabel}
                  </LinkButton>
                  <LinkButton href="#paketi" tone="paper">
                    <Coins className="size-4" />
                    {STUDIO_LANDING.ctaPacks[locale]}
                  </LinkButton>
                </div>
                <p className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-muted">
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border-2 border-ink bg-yellow" />
                  {STUDIO_LANDING.bonusNote[locale]}
                </p>
              </div>

              <div className="relative min-h-[420px]" aria-hidden={false}>
                <Panel className="sketch-float absolute right-0 top-0 w-[88%] p-4">
                  <MechanismSketch locale={locale} />
                </Panel>
                <Panel className="sketch-float absolute bottom-0 left-0 w-[58%] bg-paper-strong p-5">
                  <div className="flex items-start gap-4">
                    <SketchIcon>
                      <Coins className="size-5" />
                    </SketchIcon>
                    <div>
                      <p className="font-display text-2xl text-ink">
                        {locale === "sr" ? "Bez pretplate" : "No subscription"}
                      </p>
                      <p className="mt-1 text-sm font-bold leading-6 text-muted">
                        {locale === "sr"
                          ? "Cena stoji na dugmetu pre svake generacije."
                          : "The price sits on the button before every generation."}
                      </p>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>
          </section>
        </HeroMotion>

        {/* Šta Studio pravi — stepenaste vrste, ne tri jednake kartice. */}
        <section className="border-b-2 border-ink bg-paper-strong px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeader title={STUDIO_LANDING.kindsTitle[locale]} />
            <div className="mt-10 space-y-6">
              {kinds.map(({ key, icon: Icon, price }, index) => (
                <div
                  key={key}
                  className={cn(
                    "max-w-3xl",
                    index === 1 && "lg:ml-24",
                    index === 2 && "lg:ml-48",
                  )}
                >
                  <Panel className="flex flex-wrap items-start gap-4 p-5 sm:flex-nowrap sm:p-6">
                    <SketchIcon>
                      <Icon className="size-5" />
                    </SketchIcon>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-3xl text-ink">
                        {STUDIO_LANDING.kinds[key].title[locale]}
                      </p>
                      <p className="mt-1.5 text-base font-bold leading-7 text-muted">
                        {STUDIO_LANDING.kinds[key].body[locale]}
                      </p>
                    </div>
                    {price !== null ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-ink bg-yellow px-3 py-1.5 text-sm font-black text-ink">
                        {STUDIO_LANDING.priceFrom[locale]} {price} {STUDIO_LANDING.credits[locale]}
                      </span>
                    ) : null}
                  </Panel>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Primeri — SAMO prave generacije; sekcije nema dok je manifest prazan. */}
        {STUDIO_EXAMPLES.length > 0 ? (
          <section className="border-b-2 border-ink px-4 py-16 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
              <SectionHeader title={STUDIO_LANDING.examplesTitle[locale]} />
              <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {STUDIO_EXAMPLES.map((example) => (
                  <Panel key={example.src} className="p-3">
                    <Image
                      src={example.src}
                      alt={localized(example.alt, locale)}
                      width={800}
                      height={600}
                      className="surface-media h-auto w-full border-2 border-ink object-cover"
                    />
                    <p className="mt-2 px-1 text-sm font-bold text-muted">{localized(example.alt, locale)}</p>
                  </Panel>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* Paketi — žive cene iz baze, nikad prepisane u kod. */}
        <section id="paketi" className="sketch-grid border-b-2 border-ink px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeader title={STUDIO_LANDING.packsTitle[locale]} body={STUDIO_LANDING.packsBody[locale]} />
            {packs.length === 0 ? (
              <Panel className="mt-10 max-w-xl p-6">
                <p className="type-body font-bold text-muted">{STUDIO_LANDING.packsEmpty[locale]}</p>
              </Panel>
            ) : (
              <div className="mt-10 grid items-start gap-6 md:grid-cols-3">
                {packs.map((pack, index) => {
                  const emphasized = index === 1;
                  const value = packValueLine(pack.credits, reference, locale);
                  return (
                    <Panel
                      key={pack.slug}
                      className={cn(
                        "flex h-full flex-col p-6",
                        emphasized && "bg-paper-strong shadow-[8px_8px_0_0_var(--yellow)] md:-mt-4",
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-display text-3xl text-ink">
                          {locale === "sr" ? pack.titleSr : pack.titleEn}
                        </p>
                        {pack.bonusPercent > 0 ? (
                          <span className="rounded-full border-2 border-ink bg-yellow px-2.5 py-0.5 text-xs font-black text-ink">
                            +{pack.bonusPercent}%
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-4 text-4xl font-black text-ink">{formatEur(pack.priceEurCents, locale)}</p>
                      <p className="mt-1 text-base font-extrabold text-muted">
                        {pack.credits.toLocaleString(locale === "sr" ? "sr-RS" : "en-GB")}{" "}
                        {STUDIO_LANDING.credits[locale]}
                      </p>
                      {value ? <p className="mt-3 text-sm font-bold leading-6 text-muted">{value}</p> : null}
                      <div className="mt-auto pt-5">
                        <LinkButton
                          href={viewerProfile ? creditsHref : buySignInHref}
                          tone={emphasized ? "yellow" : "paper"}
                          className="w-full justify-center"
                        >
                          {viewerProfile ? STUDIO_LANDING.packsBuy[locale] : STUDIO_LANDING.packsSignIn[locale]}
                          <ArrowRight className="size-4" />
                        </LinkButton>
                      </div>
                    </Panel>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Tihi cross-sell (F5) + pravni podnožni red. */}
        <footer className="px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <Link
              href={`${withLocale(locale)}#courses`}
              className="font-display text-2xl text-ink underline decoration-[var(--yellow)] decoration-4 underline-offset-8 hover:decoration-ink"
            >
              {STUDIO_LANDING.crossSell[locale]}
            </Link>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-extrabold text-muted">
              <Link href={withLocale(locale, STUDIO_TERMS_PATH)} className="hover:text-ink hover:underline">
                {STUDIO_LANDING.legalTerms[locale]}
              </Link>
              <Link href={withLocale(locale, PRIVACY_POLICY_PATH)} className="hover:text-ink hover:underline">
                {STUDIO_LANDING.legalPrivacy[locale]}
              </Link>
              <Link href={withLocale(locale)} className="hover:text-ink hover:underline">
                {STUDIO_LANDING.legalHome[locale]}
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </main>
  );
}
