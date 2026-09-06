import type { Metadata } from "next";
import Link from "next/link";

import { SignInPanel } from "@/components/app/sign-in-panel";
import { SectionMarginalia } from "@/components/marketing/section-marginalia";
import { BrandMark, HandUnderline } from "@/components/ui/primitives";
import { dictionary, locales, normalizeLocale, publicMeta, withLocale } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).locale);
  // Token-gated utility strana — van indeksa, ali sa smislenim naslovom/opisom.
  return {
    title: publicMeta.resetPassword.title[locale],
    description: publicMeta.resetPassword.description[locale],
    robots: { index: false, follow: false },
  };
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = normalizeLocale((await params).locale);
  const query = searchParams ? await searchParams : {};
  const email = Array.isArray(query.email) ? query.email[0] : query.email;
  const code = Array.isArray(query.code) ? query.code[0] : query.code;
  const next = Array.isArray(query.next) ? query.next[0] : query.next;
  const fallback = withLocale(locale, "/app");
  const redirectTo = next && !next.startsWith("//") && (next === withLocale(locale) || next.startsWith(`${withLocale(locale)}/`)) ? next : fallback;

  return (
    <main className="sketch-grid min-h-screen bg-surface-a px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <BrandMark href={withLocale(locale)} label={dictionary[locale].appName} />
          <div className="relative mt-10 max-w-xl">
            <SectionMarginalia
              variant="loop"
              className="pointer-events-none absolute -right-6 -top-8 hidden h-10 w-14 text-ink sm:block"
            />
            <h1 className="text-5xl font-black leading-tight text-ink md:text-6xl">
              {locale === "sr" ? "Postavi novu lozinku" : "Set a new password"}
            </h1>
          </div>
          <HandUnderline className="mt-5" />
          <p className="mt-6 max-w-xl text-lg font-bold leading-8 text-muted">
            {locale === "sr"
              ? "Stara lozinka ostaje aktivna sve dok ovde ne sačuvaš novu — bez brige, niko te ne zaključava napolje."
              : "Your old password stays active until you save a new one here — no need to worry about being locked out."}
          </p>
          <Link
            href={withLocale(locale, "/sign-in")}
            className="mt-8 inline-flex min-h-11 items-center text-sm font-extrabold text-ink underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {locale === "sr" ? "Nazad na prijavu" : "Back to sign in"}
          </Link>
        </div>
        <SignInPanel
          locale={locale}
          hasConvex={Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)}
          initialFlow="resetVerification"
          initialEmail={email}
          initialCode={code}
          redirectTo={redirectTo}
        />
      </div>
    </main>
  );
}
