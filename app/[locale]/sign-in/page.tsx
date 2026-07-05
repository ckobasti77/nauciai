import Link from "next/link";

import { SignInPanel } from "@/components/app/sign-in-panel";
import { BrandMark, HandUnderline } from "@/components/ui/primitives";
import { dictionary, locales, normalizeLocale, type Locale, withLocale } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

function SignInCopy({ locale }: { locale: Locale }) {
  return (
    <div>
      <BrandMark href={withLocale(locale)} label={dictionary[locale].appName} />
      <h1 className="mt-10 text-5xl font-black leading-tight text-ink md:text-6xl">
        {locale === "sr" ? "Uđi u svoj AI smer" : "Enter your AI track"}
      </h1>
      <HandUnderline className="mt-5" />
      <p className="mt-6 max-w-xl text-lg font-bold leading-8 text-muted">
        {locale === "sr"
          ? "Email i Google prijava koriste Convex Auth i čuvaju pristup smerovima na serveru."
          : "Email and Google sign-in use Convex Auth and keep track access checked on the server."}
      </p>
      <Link href={withLocale(locale)} className="mt-8 inline-flex text-sm font-extrabold text-ink underline">
        {locale === "sr" ? "Nazad na početnu" : "Back home"}
      </Link>
    </div>
  );
}

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  return (
    <main className="sketch-grid min-h-screen bg-paper px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <SignInCopy locale={locale} />
        <SignInPanel locale={locale} hasConvex={Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)} />
      </div>
    </main>
  );
}
