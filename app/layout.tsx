import type { Metadata } from "next";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { Geist_Mono, Nunito, Patrick_Hand } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";

import "./globals.css";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
      lang="sr"
      className={`${nunito.variable} ${geistMono.variable} ${patrickHand.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{bodyContent}</body>
    </html>
  );
}
