import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { notFound } from "next/navigation";

import { TrackExperience, type TrackExperienceData } from "@/components/app/track-experience";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { normalizeLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; trackSlug: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Smer", en: "Track" });
}

export default async function TrackPage({ params }: { params: Promise<{ locale: string; trackSlug: string }> }) {
  const { locale: localeParam, trackSlug } = await params;
  const locale = normalizeLocale(localeParam);
  const [token, profile] = await Promise.all([convexAuthNextjsToken(), getCurrentViewerProfile()]);
  const convex = getConvexHttpClient(token);
  const data = convex ? (await convex.query(convexQueries.getTrackPage, { slug: trackSlug }).catch(() => null)) as TrackExperienceData | null : null;
  if (!data) notFound();
  return <TrackExperience data={data} locale={locale} admin={profile?.role === "admin"} profileName={profile?.firstName || profile?.name || "student"} />;
}
