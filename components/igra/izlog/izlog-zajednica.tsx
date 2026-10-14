"use client";

import Link from "next/link";
import { useState } from "react";

import { CommunityBadgeRow, LevelMeter } from "@/components/app/community-member-progress";
import { CommunityAvatar, formatCommunityTime } from "@/components/app/community-identity";
import { MemberCardView } from "@/components/app/community-v2/community-members";
import { NotificationFeed } from "@/components/app/community-v2/community-mentions";
import { EmptyCommunityState, ThreadCard } from "@/components/app/community-v2/community-shared";
import { COMMUNITY_HERO_COPY } from "@/components/app/community-v2/community-shell";
import type { CommunityMentionEvent } from "@/components/app/community-v2/community-types";
import { AuthorRankChip } from "@/components/igra/community/author-rank-chip";
import { CommunityHero } from "@/components/igra/community/community-hero";
import { IzlogDemo, IzlogSection } from "@/components/igra/izlog/izlog-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { COMMUNITY_SECTIONS, communitySectionLabel } from "@/lib/community-sections";
import { communityHeroCall, newestCreatedAt } from "@/lib/igra-community";
import { COMMUNITY_FIXTURES, IGRA_FIXTURE_IDS, IGRA_FIXTURE_LABEL, IGRA_FIXTURES, type IgraFixtureId } from "@/lib/igra-fixtures";
import { t, withLocale, type Locale } from "@/lib/i18n";

/**
 * Izlog, deo „zajednica" (K11): PRAVE komponente zajednice nad test podacima, bez prijave
 * i bez upita - heroj po sekciji, kartice tema, kartice članova i lista obaveštenja.
 * Komentar nije prava komponenta (`CommentsSection` čita bazu), pa je red komentara ovde
 * sklopljen od istih delova (avatar, čip autora). Dugme „Stiglo je novo" radi ono što u
 * aplikaciji radi Convex: doda red dok je lista otvorena.
 */

const CHIP =
  "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

function Obavestenja({ locale, initial }: { locale: Locale; initial: CommunityMentionEvent[] }) {
  const [notifications, setNotifications] = useState(initial);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [arrivals, setArrivals] = useState(0);
  const shown = unreadOnly ? notifications.filter((notification) => !notification.readAt) : notifications;

  function arrive() {
    setArrivals((count) => count + 1);
    // Test podaci žive u „danas" izloga (može biti posle sata uređaja), pa novi red mora
    // biti noviji od najnovijeg zatečenog, kao kad ga upiše server.
    setNotifications((current) => {
      const createdAt = Math.max(Date.now(), newestCreatedAt(current) + 60_000);
      return [
      {
        _id: `fixture-notification-arrival-${createdAt}`,
        createdAt,
        kind: "comment_reply",
        senderName: "Vesna Radović",
        senderUsername: "vesna.radovic",
        authorRole: "pro_student",
        excerpt: t(locale, "Odlično pitanje. Evo kako sam ja to rešila.", "Great question. Here is how I solved it."),
        postId: "preview-prompt-uloga",
        postTitle: t(locale, "Kako da prompt uvek dobije isti ton?", "How do I keep a prompt in the same tone?"),
      },
      ...current,
      ];
    });
  }

  async function markRead(id: string) {
    setNotifications((current) => current.map((notification) => (notification._id === id ? { ...notification, readAt: Date.now() } : notification)));
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={arrive}>
          {t(locale, "Stiglo je novo", "A new one arrives")}
        </Button>
        <Button size="sm" variant="secondary" aria-pressed={unreadOnly} onClick={() => setUnreadOnly((value) => !value)}>
          {unreadOnly ? t(locale, "Prikaži sva", "Show all") : t(locale, "Samo nepročitana", "Unread only")}
        </Button>
        <span className="type-caption font-black tabular-nums text-muted">
          {t(locale, `pristiglo: ${arrivals}`, `arrived: ${arrivals}`)}
        </span>
      </div>
      <section data-izlog-obavestenja="" className="max-w-3xl space-y-4" aria-live="polite">
        <NotificationFeed key={String(unreadOnly)} locale={locale} notifications={shown} unreadOnly={unreadOnly} onMarkRead={markRead} />
      </section>
    </>
  );
}

export function IzlogZajednica({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const [section, setSection] = useState("discussions");
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const fixture = COMMUNITY_FIXTURES[stanje];
  const heroCopy = COMMUNITY_HERO_COPY[section] ?? COMMUNITY_HERO_COPY.discussions!;
  const comments = fixture.posts.slice(0, 3);

  return (
    <div className="space-y-8">
      <nav aria-label={t(locale, "Test korisnik", "Test user")} className="flex flex-wrap items-center gap-2">
        <span className="mr-1 type-eyebrow text-muted">{t(locale, "Test korisnik", "Test user")}</span>
        {IGRA_FIXTURE_IDS.map((id) => (
          <Link
            key={id}
            href={`${withLocale(locale, "/igra-izlog")}?deo=zajednica&stanje=${id}`}
            aria-current={id === stanje ? "page" : undefined}
            className={cn(CHIP, id === stanje ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper")}
          >
            {IGRA_FIXTURE_LABEL[id][locale]}
          </Link>
        ))}
      </nav>

      {/* Širina sadržaja zajednice u aplikaciji (`max-w-[1180px]` u `CommunityShellView`). */}
      <div className="mx-auto max-w-[1180px] space-y-8">
        <div className="space-y-3">
          <div role="group" aria-label={t(locale, "Sekcija zajednice", "Community section")} className="flex flex-wrap items-center gap-2">
            <span className="mr-1 type-eyebrow text-muted">{t(locale, "Sekcija", "Section")}</span>
            {COMMUNITY_SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === section}
                onClick={() => setSection(item.id)}
                className={cn(CHIP, item.id === section ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper")}
              >
                {communitySectionLabel(item, locale)}
              </button>
            ))}
          </div>
          <CommunityHero
            locale={locale}
            title={locale === "sr" ? heroCopy.titleSr : heroCopy.titleEn}
            subtitle={locale === "sr" ? heroCopy.subtitleSr : heroCopy.subtitleEn}
            call={communityHeroCall(section, locale)}
          />
        </div>

        <IzlogSection
          id="teme"
          title={t(locale, "Teme", "Topics")}
          note={t(
            locale,
            "Čip autora je broj završenih lekcija iz reda teme (authorRank). Nalog tima i autor bez lekcija nemaju čip.",
            "The author chip is the completed-lesson count from the topic row (authorRank). Team accounts and authors with no lessons have no chip.",
          )}
        >
          <div data-izlog-teme="" className="space-y-4">
            {fixture.posts.length ? (
              fixture.posts.map((post) => (
                <ThreadCard
                  key={post._id}
                  locale={locale}
                  post={post}
                  track={locale === "sr" ? post.trackTitleSr : post.trackTitleEn}
                  course={locale === "sr" ? post.courseTitleSr : post.courseTitleEn}
                  highlighted={Boolean(post.isPinned)}
                />
              ))
            ) : (
              <EmptyCommunityState
                locale={locale}
                art="prazno.objave"
                title={t(locale, "Nema nijedne teme za ovaj izbor", "No topics match this selection")}
                body={t(
                  locale,
                  "Obriši reč iz pretrage ili izaberi drugi kurs iznad. Ako je ovo baš tvoj kurs, ti otvori prvu temu.",
                  "Clear the search word or pick a different course above. If this is your course, be the one to open the first topic.",
                )}
              />
            )}
          </div>
        </IzlogSection>

        {comments.length ? (
          <IzlogSection
            id="komentari"
            title={t(locale, "Komentari", "Comments")}
            note={t(locale, "Zaglavlje komentara: isti avatar i isti čip kao u aplikaciji.", "Comment header: the same avatar and the same chip as in the app.")}
          >
            <div data-izlog-komentari="" className="surface-card border border-line bg-paper-strong p-4 md:p-6">
              {comments.map((post) => (
                <div key={post._id} className="flex items-start gap-3 border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
                  <CommunityAvatar name={post.authorName} avatarUrl={post.authorAvatarUrl} role={post.authorRole} locale={locale} size="sm" showRank={false} className="pt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-xs font-black text-ink">{post.authorUsername ? `@${post.authorUsername}` : post.authorName}</span>
                      {post.authorUsername ? <span className="truncate type-caption font-semibold text-muted">{post.authorName}</span> : null}
                      <AuthorRankChip rank={post.authorRank} locale={locale} />
                      <span className="type-caption font-bold text-ink/50">{formatCommunityTime(post.createdAt, locale)}</span>
                    </div>
                    <p className="mt-2 type-body-sm font-semibold text-ink/80">{post.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </IzlogSection>
        ) : null}

        <IzlogSection
          id="clanovi"
          title={t(locale, "Članovi", "Members")}
          note={t(
            locale,
            "Nalepnica nivoa i traka se računaju iz XP-a koji red liste već nosi. Nalozi tima nemaju nivo.",
            "The level sticker and bar come from the XP the list row already carries. Team accounts have no level.",
          )}
        >
          {fixture.members.length ? (
            <div data-izlog-clanovi="" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {fixture.members.map((member) => {
                const isFollowing = following[member._id] ?? Boolean(member.isFollowing);
                return (
                  <MemberCardView
                    key={member._id}
                    locale={locale}
                    member={member}
                    following={isFollowing}
                    mutual={isFollowing && Boolean(member.isMutual)}
                    onFollow={() => setFollowing((current) => ({ ...current, [member._id]: !isFollowing }))}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyCommunityState
              locale={locale}
              art="prazno.pretraga"
              title={t(locale, "Nijedan član ne odgovara ovom izboru", "No member matches this selection")}
              body={t(locale, "Obriši reč iz pretrage ili izaberi drugi kurs i ulogu iznad.", "Clear the search word, or pick a different course and role above.")}
            />
          )}
        </IzlogSection>

        <IzlogSection
          id="obavestenja"
          title={t(locale, "Obaveštenja", "Notifications")}
          note={t(
            locale,
            "Dugme dodaje red dok je lista otvorena: red doleti odozgo, nosi marker „Upravo stiglo”, a iznad se javi Iskra. Uz smanjen pokret red je odmah na mestu.",
            "The button adds a row while the list is open: it drops in from the top with a “Just in” marker and Iskra pops up above. With reduced motion the row is simply there.",
          )}
        >
          <Obavestenja key={stanje} locale={locale} initial={fixture.notifications} />
        </IzlogSection>

        <IzlogSection
          id="profil"
          title={t(locale, "Nivo i značke člana", "Member level and badges")}
          note={t(
            locale,
            "LevelMeter i CommunityBadgeRow kako ih crta profil člana: nivo iz XP-a test korisnika, sve četiri značke zajednice.",
            "LevelMeter and CommunityBadgeRow as the member profile draws them: level from the test user's XP, all four community badges.",
          )}
        >
          <div className="grid gap-6 md:grid-cols-2">
            <IzlogDemo label="LevelMeter">
              <LevelMeter locale={locale} xp={IGRA_FIXTURES[stanje].xp} className="max-w-sm" />
            </IzlogDemo>
            <IzlogDemo label="CommunityBadgeRow">
              <CommunityBadgeRow locale={locale} badges={["first_thread", "ten_comments", "first_helpful", "week_streak"]} />
            </IzlogDemo>
          </div>
        </IzlogSection>
      </div>
    </div>
  );
}
