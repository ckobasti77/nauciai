import { redirect } from "next/navigation";

import { normalizeLocale, withLocale } from "@/lib/i18n";

const LEGACY_TABS: Record<string, string> = {
  discussions: "discussions",
  "my-threads": "my-threads",
  mentions: "mentions",
  members: "members",
  leaderboard: "leaderboard",
  approvals: "moderation",
  moderation: "moderation",
};

type CommunitySearchParams = Record<string, string | string[] | undefined>;

export default async function CommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<CommunitySearchParams>;
}) {
  const [{ locale: localeParam }, incomingSearchParams] = await Promise.all([params, searchParams]);
  const locale = normalizeLocale(localeParam);
  const tab = typeof incomingSearchParams.tab === "string" ? incomingSearchParams.tab : "discussions";
  const destination = LEGACY_TABS[tab] ?? "discussions";
  const nextSearchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(incomingSearchParams)) {
    if (key === "tab" || value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => nextSearchParams.append(key, item));
    } else {
      nextSearchParams.set(key, value);
    }
  }

  const query = nextSearchParams.toString();
  redirect(`${withLocale(locale, `/app/community/${destination}`)}${query ? `?${query}` : ""}`);
}
