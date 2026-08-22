import type { Metadata, Viewport } from "next";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { Geist_Mono, Nunito, Patrick_Hand } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";
import { normalizeLocale } from "@/lib/i18n";
import { THEME_COLORS, THEME_INIT_SCRIPT } from "@/lib/theme";

import "../globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const patrickHand = Patrick_Hand({
  variable: "--font-patrick-hand",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fakultet za AI",
  description: "Bilingual AI learning and community platform for practical video, audio, and website courses.",
};

// resizes-content makes the on-screen keyboard shrink the layout viewport, so
// dvh-based heights keep the chat composer above the fold; viewport-fit=cover
// is what makes env(safe-area-inset-*) resolve to anything on notched phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  // Browser chrome follows the page background; the inline theme script and
  // ThemeProvider rewrite both entries to the resolved theme when the user picks one.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const content = (
    <AppProviders>
      {children}
    </AppProviders>
  );
  const bodyContent = process.env.NEXT_PUBLIC_CONVEX_URL
    ? await ConvexAuthNextjsServerProvider({ children: content, shouldHandleCode: false })
    : content;

  return (
    <html
      lang={locale}
      className={`${nunito.variable} ${geistMono.variable} ${patrickHand.variable} h-full antialiased`}
      // `data-theme` is written by the inline script below before React runs.
      suppressHydrationWarning
    >
      <head>
        {/* Runs before first paint so no route ever flashes the light theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning className="flex min-h-full flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:flex focus:min-h-11 focus:items-center focus:rounded-full focus:border-2 focus:border-ink focus:bg-yellow focus:px-4 focus:text-sm focus:font-black focus:text-ink"
        >
          {locale === "sr" ? "Preskoči na sadržaj" : "Skip to content"}
        </a>
        {bodyContent}
      </body>
    </html>
  );
}
