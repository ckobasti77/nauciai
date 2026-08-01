import Link from "next/link";

import { SignInPanel } from "@/components/app/sign-in-panel";
import { BrandMark, HandUnderline } from "@/components/ui/primitives";
import { dictionary, locales, normalizeLocale, withLocale } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
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
    <main className="sketch-grid min-h-screen bg-paper px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <BrandMark href={withLocale(locale)} label={dictionary[locale].appName} />
          <h1 className="mt-10 text-5xl font-black leading-tight text-ink md:text-6xl">
            {locale === "sr" ? "Postavi novu lozinku" : "Set a new password"}
          </h1>
          <HandUnderline className="mt-5" />
          <p className="mt-6 max-w-xl text-lg font-bold leading-8 text-muted">
            {locale === "sr"
              ? "Stara lozinka ostaje aktivna sve dok ovde ne sačuvaš novu."
              : "Your old password remains active until you save a new one here."}
          </p>
          <Link href={withLocale(locale, "/sign-in")} className="mt-8 inline-flex text-sm font-extrabold text-ink underline">
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
