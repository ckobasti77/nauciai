import type { Metadata } from "next";
import Link from "next/link";

import { ThemeToggle } from "@/components/app/theme-toggle";
import { SignInPanel } from "@/components/app/sign-in-panel";
import { SectionMarginalia } from "@/components/marketing/section-marginalia";
import { BrandMark, HandUnderline } from "@/components/ui/primitives";
import { dictionary, locales, normalizeLocale, publicMeta, type Locale, withLocale } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).locale);
  // Auth-utility strana: smislen naslov/opis za oba jezika, ali van indeksa
  // (već je i u robots.ts disallow).
  return {
    title: publicMeta.signIn.title[locale],
    description: publicMeta.signIn.description[locale],
    robots: { index: false, follow: false },
  };
}

function SignInCopy({ locale }: { locale: Locale }) {
  return (
    <div data-motion="copy">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <BrandMark href={withLocale(locale)} label={dictionary[locale].appName} />
        <ThemeToggle locale={locale} />
      </div>
      <div className="relative mt-10 max-w-xl">
        <SectionMarginalia
          variant="spark"
          className="pointer-events-none absolute -right-4 -top-8 hidden h-10 w-10 text-yellow sm:block"
        />
        <h1 className="text-5xl font-black leading-tight text-ink md:text-6xl">
          {locale === "sr" ? "Dobrodošao nazad" : "Welcome back"}
        </h1>
      </div>
      <HandUnderline className="mt-5" />
      <p className="mt-6 max-w-xl text-lg font-bold leading-8 text-muted">
        {locale === "sr"
          ? "Prijavi se i nastavi tamo gde si stao — kursevi, napredak i zajednica te čekaju."
          : "Sign in and pick up right where you left off — your courses, progress, and community are waiting."}
      </p>
      <Link
        href={withLocale(locale)}
        className="mt-8 inline-flex min-h-11 items-center text-sm font-extrabold text-ink underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {locale === "sr" ? "Nazad na početnu" : "Back home"}
      </Link>
    </div>
  );
}

function safeRedirectTo(locale: Locale, value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const fallback = withLocale(locale, "/app");

  if (!candidate || candidate.startsWith("//")) {
    return fallback;
  }

  if (candidate === withLocale(locale) || candidate.startsWith(`${withLocale(locale)}/`)) {
    return candidate;
  }

  return fallback;
}

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: localeParam } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const locale = normalizeLocale(localeParam);
  const mode = Array.isArray(resolvedSearchParams.mode) ? resolvedSearchParams.mode[0] : resolvedSearchParams.mode;
  const email = Array.isArray(resolvedSearchParams.email) ? resolvedSearchParams.email[0] : resolvedSearchParams.email;
  const code = Array.isArray(resolvedSearchParams.code) ? resolvedSearchParams.code[0] : resolvedSearchParams.code;
  const redirectTo = safeRedirectTo(locale, resolvedSearchParams.next);
  const initialFlow =
    mode === "reset-confirm" ? "resetVerification" : mode === "reset" ? "reset" : undefined;

  return (
    <main data-motion="page" className="sketch-grid min-h-screen bg-paper px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <SignInCopy locale={locale} />
        <SignInPanel
          locale={locale}
          hasConvex={Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)}
          initialFlow={initialFlow}
          initialEmail={email}
          initialCode={code}
          redirectTo={redirectTo}
        />
      </div>
    </main>
  );
}
