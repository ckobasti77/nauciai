"use client";

import { CircleAlert, MessagesSquare, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AppIntroPanel } from "@/components/app/intro-panel";
import { SmartStickyRegion } from "@/components/ui/smart-sticky";
import { activeCommunitySection } from "@/lib/community-sections";
import type { Locale } from "@/lib/i18n";
import { t, withLocale } from "@/lib/i18n";

import { fallbackCommunityFilters, useCommunityFilters } from "./community-data";
import type { CommunityFilters } from "./community-types";

type CommunityHeroCopy = {
  badgeSr: string;
  badgeEn: string;
  titleSr: string;
  titleEn: string;
  subtitleSr: string;
  subtitleEn: string;
};

const COMMUNITY_HERO_COPY: Record<string, CommunityHeroCopy> = {
  discussions: {
    badgeSr: "AI Studio Commons",
    badgeEn: "AI Studio Commons",
    titleSr: "Uči javno. Napreduj zajedno.",
    titleEn: "Learn in public. Grow together.",
    subtitleSr: "Postavi pitanje, pokaži kako si nešto uradio/la i poveži svaku temu sa smerom i kursom na kom radiš.",
    subtitleEn: "Ask a question, show how you did something, and connect every topic to the track and course you are working on.",
  },
  "my-threads": {
    badgeSr: "Moj rad na platformi",
    badgeEn: "My work on the platform",
    titleEn: "My ideas become real discussions.",
    titleSr: "Moje ideje postaju stvarne diskusije.",
    subtitleSr: "Pratim svoje objave, čuvam važne razgovore i vraćam se pitanjima koja pomeraju moje projekte.",
    subtitleEn: "Follow my posts, save useful conversations, and return to questions that move my projects forward.",
  },
  mentions: {
    badgeSr: "Moja aktivnost",
    badgeEn: "My activity",
    titleEn: "Everything important for my next step.",
    titleSr: "Sve važno za moj sledeći korak.",
    subtitleSr: "Pratim odgovore, glasove i pominjanja koja mi pomažu da učim i napredujem.",
    subtitleEn: "Follow replies, votes, and mentions that help me learn and grow.",
  },
  notifications: {
    badgeSr: "Moja aktivnost",
    badgeEn: "My activity",
    titleEn: "Everything important for my next step.",
    titleSr: "Sve važno za moj sledeći korak.",
    subtitleSr: "Pratim odgovore, glasove i pominjanja koja mi pomažu da učim i napredujem.",
    subtitleEn: "Follow replies, votes, and mentions that help me learn and grow.",
  },
  members: {
    badgeSr: "Moja studentska zajednica",
    badgeEn: "My student community",
    titleEn: "I learn alongside people building their ideas.",
    titleSr: "Učim uz ljude koji grade svoje ideje.",
    subtitleSr: "Pronađi članove po smeru i kursu, razmeni iskustvo i upoznaj svoju platformu.",
    subtitleEn: "Find members by track and course, share experience, and meet your learning community.",
  },
  leaderboard: {
    badgeSr: "Moj napredak",
    badgeEn: "My progress",
    titleEn: "Every completed step builds my path.",
    titleSr: "Svaki završeni korak gradi moj put.",
    subtitleSr: "Pratim napredak kroz lekcije, zadatke i korisne odgovore na svojoj platformi.",
    subtitleEn: "Track progress through lessons, tasks, and helpful replies on the platform.",
  },
  moderation: {
    badgeSr: "Moja platforma",
    badgeEn: "My platform",
    titleEn: "Together we keep conversations useful.",
    titleSr: "Zajedno čuvamo kvalitet razgovora.",
    subtitleSr: "Pregledamo pitanja i ideje kako bi svaka diskusija bila korisna za učenje.",
    subtitleEn: "Review questions and ideas so every discussion supports learning.",
  },
};

export function CommunityShell({
  locale,
  hasConvex,
  children,
}: {
  locale: Locale;
  hasConvex: boolean;
  children: ReactNode;
}) {
  if (hasConvex) {
    return <LiveCommunityShell locale={locale}>{children}</LiveCommunityShell>;
  }

  return (
    <CommunityShellView locale={locale} filters={fallbackCommunityFilters} isLoading={false}>
      {children}
    </CommunityShellView>
  );
}

function LiveCommunityShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const { filters, isLoading } = useCommunityFilters(true);

  return (
    <CommunityShellView locale={locale} filters={filters} isLoading={isLoading}>
      {children}
    </CommunityShellView>
  );
}

function CommunityShellView({
  locale,
  filters,
  isLoading,
  children,
}: {
  locale: Locale;
  filters: CommunityFilters;
  isLoading: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // Community renders a section-aware hero; the sidebar's community context now owns the
  // section navigation itself (scope/track/course/q/sort preserved there).
  const activeSection = activeCommunitySection(pathname);
  const heroCopy = COMMUNITY_HERO_COPY[activeSection] ?? COMMUNITY_HERO_COPY.discussions;

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-5" aria-busy={isLoading}>
      <section data-motion="hero" className="relative overflow-hidden rounded-[16px] border-2 border-ink bg-ink text-paper-strong shadow-[4px_4px_0_rgba(244,190,48,0.55)]">
        <div className="pointer-events-none absolute inset-y-0 left-1/2 right-0 hidden bg-[radial-gradient(circle_at_center,rgba(244,190,48,0.22)_0_2px,transparent_2px)] [background-size:24px_24px] [mask-image:linear-gradient(to_right,transparent_0%,black_50%,black_100%)] md:block" />
        <div className="relative p-3.5 sm:p-4">
          <div className="flex flex-col gap-2">
            <div className="min-w-0 max-w-4xl" data-motion="copy">
              <div className="flex items-center gap-2 text-yellow">
                <Sparkles className="size-4" aria-hidden="true" />
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em]">
                  {locale === "sr" ? heroCopy.badgeSr : heroCopy.badgeEn}
                </p>
              </div>
              <h1 className="mt-1.5 truncate text-[clamp(1.5rem,3vw,2.4rem)] font-black leading-none tracking-[-0.04em] sm:whitespace-nowrap">
                {locale === "sr" ? heroCopy.titleSr : heroCopy.titleEn}
              </h1>
              <p className="mt-1 truncate text-xs font-bold leading-5 text-paper-strong/72 sm:whitespace-nowrap sm:text-sm">
                {locale === "sr"
                  ? heroCopy.subtitleSr
                  : heroCopy.subtitleEn}
              </p>
            </div>
          </div>

        </div>
      </section>

      <AppIntroPanel
        id="community"
        locale={locale}
        icon={MessagesSquare}
        title={t(locale, "Ovo je Zajednica", "This is the Community")}
        body={t(
          locale,
          "Ovde pitaš kad zapneš i pokazuješ šta si uradio/la. Na svako pitanje odgovaraju drugi studenti i predavači — nema glupog pitanja.",
          "This is where you ask when you get stuck and show what you have made. Other students and teachers answer — no question is too basic.",
        )}
        steps={[
          t(
            locale,
            "Otvori temu koja te zanima i pročitaj odgovore.",
            "Open a topic that interests you and read the answers.",
          ),
          t(
            locale,
            "Napiši svoje pitanje: naslov u jednoj rečenici, pa detalji.",
            "Write your own question: a one-sentence title, then the details.",
          ),
          t(
            locale,
            "Vrati se na „Moje teme” da vidiš ko ti je odgovorio.",
            "Come back to “My topics” to see who replied.",
          ),
        ]}
        action={
          <Link
            href={withLocale(locale, "/app/community/new")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink transition hover:bg-yellow/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {t(locale, "Postavi prvo pitanje", "Ask your first question")}
          </Link>
        }
      />

      <SmartStickyRegion
        className="top-16 z-30 overflow-hidden border-b-2 border-line/75 bg-paper/95 shadow-[0_8px_18px_-16px_var(--shadow-hard-55)] backdrop-blur md:top-0"
      >
        <div
          className="p-2 empty:hidden sm:p-3"
          data-community-toolbar-target
        />
      </SmartStickyRegion>

      {filters.counts?.profileIncomplete ? (
        <Link
          href={`${withLocale(locale, "/app/profile")}?returnTo=${encodeURIComponent(withLocale(locale, "/app/community/discussions"))}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border-2 border-ink bg-yellow/25 px-4 py-3 text-sm font-black text-ink shadow-[3px_3px_0_rgba(244,190,48,0.55)]"
        >
          <span className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            {locale === "sr" ? "Izaberi korisničko ime da bi mogao/la da objavljuješ i učestvuješ u razgovoru." : "Set a username to publish and participate in conversations."}
          </span>
          <span className="rounded-full border border-ink bg-yellow px-3 py-2 text-xs underline underline-offset-2">
            {locale === "sr" ? "Otvori Profil" : "Open Profile"}
          </span>
        </Link>
      ) : null}

      <div>{children}</div>
    </div>
  );
}
