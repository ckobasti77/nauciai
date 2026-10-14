/* eslint-disable @next/next/no-img-element */
"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  BookOpen,
  AtSign,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ExternalLink,
  GraduationCap,
  Link2,
  MessageCircle,
  UserPlus,
  PlaySquare,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { IgraState } from "@/components/igra/igra-state";
import { openChatDock } from "@/components/app/chat/chat-dock";
import { useMemberIgra } from "@/components/app/member-profile-igra";
import { CreaReportCardPanel } from "@/components/crea/game/crea-report-card-panel";
import { IgraArt } from "@/components/igra/igra-art";
import { useIgraProgress } from "@/components/igra/igra-progress-context";
import { BannerPicker } from "@/components/igra/profile/banner-picker";
import { PlayerStats } from "@/components/igra/profile/player-stats";
import { ProfileActivity } from "@/components/igra/profile/profile-activity";
import { ProfileBanner } from "@/components/igra/profile/profile-banner";
import { TrophyShelf } from "@/components/igra/trophy-shelf";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/field";
import { LinkButton, cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import type { IgraBannerKey } from "@/lib/igra-banners";
import { IGRA_PROFILE_COPY } from "@/lib/igra-copy";
import { levelFromXp } from "@/lib/igra-level";
import { profileBannerKey, profileShelfBadges, profileWorks } from "@/lib/igra-profile";
import type { Locale } from "@/lib/i18n";
import { t, withLocale } from "@/lib/i18n";

type FollowListKind = "followers" | "following";
type ContributionFilter = "all" | "threads" | "comments";

function roleLabel(locale: Locale, role: string) {
  const labels: Record<string, [string, string]> = {
    student: ["Lite", "Lite"],
    pro_student: ["Pro", "Pro"],
    moderator: ["Moderator", "Moderator"],
    admin: ["Admin", "Admin"],
  };
  const value = labels[role] ?? [role, role];
  return locale === "sr" ? value[0] : value[1];
}

function relativeTime(locale: Locale, timestamp?: number, activeNow?: boolean) {
  if (!timestamp) return t(locale, "Aktivnost nije zabeležena", "No activity recorded");
  if (activeNow) return t(locale, "Aktivan sada", "Active now");
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return t(locale, `pre ${minutes} min`, `${minutes}m ago`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(locale, `pre ${hours} h`, `${hours}h ago`);
  const days = Math.floor(hours / 24);
  return t(locale, `pre ${days} dana`, `${days}d ago`);
}

function FollowersDialog({ kind, userId, username, locale, owner, onClose }: { kind: FollowListKind; userId: Id<"users">; username: string; locale: Locale; owner: boolean; onClose: () => void }) {
  return owner
    ? <ViewerConnectionsList kind={kind} username={username} locale={locale} onClose={onClose} />
    : <StaffConnectionsList kind={kind} userId={userId} username={username} locale={locale} onClose={onClose} />;
}

function FollowDialogShell({ title, username, rows, status, loadMore, locale, onClose }: { title: string; username: string; rows: Array<{ userId: Id<"users">; name: string; username?: string; avatarUrl?: string; role: string }>; status: string; loadMore: (count: number) => void; locale: Locale; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} align="sheet" title={title} description={`@${username}`} closeLabel={t(locale, "Zatvori", "Close")} contentClassName="space-y-2">
      {rows.map((row) => row.username ? (
        <Link key={row.userId} href={withLocale(locale, `/app/members/${row.username}`)} onClick={onClose} className="surface-inset flex items-center gap-3 border border-line bg-paper-strong p-3 transition hover:border-ink">
          <img src={row.avatarUrl || "/images/avatars/mythic-mentor.png"} alt="" className="size-11 rounded-full border-2 border-ink object-cover" />
          <span className="min-w-0 flex-1"><span className="block truncate font-black text-ink">{row.name}</span><span className="block truncate text-xs font-bold text-muted">@{row.username}</span></span>
          <span className="rounded-full bg-yellow px-2.5 py-1 type-eyebrow-sm text-ink">{roleLabel(locale, row.role)}</span>
        </Link>
      ) : null)}
      {rows.length === 0 && status !== "LoadingFirstPage" ? <p className="py-10 text-center text-sm font-bold text-muted">{t(locale, "Lista je prazna.", "The list is empty.")}</p> : null}
      {status === "CanLoadMore" ? <button type="button" onClick={() => loadMore(20)} className="w-full rounded-full border-2 border-ink bg-paper-strong px-4 py-3 text-sm font-black">{t(locale, "Učitaj još", "Load more")}</button> : null}
    </Dialog>
  );
}

function ViewerConnectionsList(props: { kind: FollowListKind; username: string; locale: Locale; onClose: () => void }) {
  const data = usePaginatedQuery(api.publicProfiles.listViewerConnectionsPage, { kind: props.kind }, { initialNumItems: 20 });
  return <FollowDialogShell title={props.kind === "followers" ? t(props.locale, "Pratioci", "Followers") : t(props.locale, "Pratim", "Following")} username={props.username} rows={data.results} status={data.status} loadMore={data.loadMore} locale={props.locale} onClose={props.onClose} />;
}

function StaffConnectionsList(props: { kind: FollowListKind; userId: Id<"users">; username: string; locale: Locale; onClose: () => void }) {
  const data = usePaginatedQuery(api.publicProfiles.listProfileConnectionsForStaff, { userId: props.userId, kind: props.kind }, { initialNumItems: 20 });
  return <FollowDialogShell title={props.kind === "followers" ? t(props.locale, "Pratioci · staff", "Followers · staff") : t(props.locale, "Pratim · staff", "Following · staff")} username={props.username} rows={data.results} status={data.status} loadMore={data.loadMore} locale={props.locale} onClose={props.onClose} />;
}

export function MemberProfile({ locale, username }: { locale: Locale; username: string }) {
  const router = useRouter();
  const profile = useQuery(api.publicProfiles.getPublicProfile, { username });
  const toggleFollow = useMutation(api.publicProfiles.toggleFollow);
  const createOrGetDirect = useMutation(api.chat.createOrGetDirect);
  const inviteStudyPartner = useMutation(api.study.createPartnerInvite);
  const reportContent = useMutation(api.chatModeration.reportContent);
  const setProfileRole = useMutation(api.profiles.setProfileRole);
  const ownerStatus = useQuery(api.profiles.getViewerProfileStatus, profile?.viewer.isOwner ? {} : "skip");
  // IGRA (K13): napredak vlasnika već drži ljuska; za profil jedan upit po strani.
  const { progress: myProgress } = useIgraProgress();
  const { member, todayKey, setBanner } = useMemberIgra(username);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [bannerPending, setBannerPending] = useState<IgraBannerKey | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [followPending, setFollowPending] = useState(false);
  const [messagePending, setMessagePending] = useState(false);
  const [profileActionNotice, setProfileActionNotice] = useState<string>();
  const [studyOpen, setStudyOpen] = useState(false);
  const [studyPendingCourseId, setStudyPendingCourseId] = useState<Id<"courses">>();
  const [studyNotice, setStudyNotice] = useState<string>();
  const [rolePending, setRolePending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportPending, setReportPending] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [followList, setFollowList] = useState<FollowListKind | null>(null);
  const [filter, setFilter] = useState<ContributionFilter>("all");
  const [courseId, setCourseId] = useState<string>("");
  const commonStudyCourses = usePaginatedQuery(
    api.study.listCommonStudyCoursesPage,
    profile && studyOpen && !profile.viewer.isOwner ? { userId: profile.identity.userId } : "skip",
    { initialNumItems: 12 },
  );
  const contributions = usePaginatedQuery(api.publicProfiles.listProfileContributionsPage, profile ? {
    username,
    filter,
    ...(courseId ? { courseId: courseId as Id<"courses"> } : {}),
  } : "skip", { initialNumItems: 10 });

  if (profile === undefined) return <div className="grid min-h-[60vh] place-items-center"><Spinner size="xl" className="text-ink" label={t(locale, "Učitavanje", "Loading")} /></div>;
  if (profile === null) return (
    <div className="mx-auto max-w-2xl">
      <IgraState
        page
        variant="404"
        locale={locale}
        title={t(locale, "Profil nije pronađen", "Profile not found")}
        body={t(locale, "Korisnik je uklonjen, spojen ili još nema korisničko ime.", "This member was removed, merged, or does not have a username yet.")}
        action={<LinkButton href={withLocale(locale, "/app/community/members")} tone="yellow">{t(locale, "Nazad na članove", "Back to members")}</LinkButton>}
      />
    </div>
  );

  const { identity } = profile;
  const isOwner = profile.viewer.isOwner;
  // Nivo iz istog XP-a koji profil već čita (osoblje ga nema, kao i danas).
  const level = levelFromXp(profile.progress?.xp ?? 0);
  const shelf = profileShelfBadges({ isOwner, mine: myProgress, member });
  const bannerKey = profileBannerKey({ isOwner, mine: myProgress, member });
  const ownBanner = myProgress?.banner ?? member?.banner ?? null;
  const canPickBanner = isOwner && Boolean(myProgress || member);
  const links = [
    { key: "website", href: identity.links.website, icon: Link2, label: "Website" },
    { key: "instagram", href: identity.links.instagram, icon: AtSign, label: "Instagram" },
    { key: "linkedin", href: identity.links.linkedin, icon: BriefcaseBusiness, label: "LinkedIn" },
    { key: "youtube", href: identity.links.youtube, icon: PlaySquare, label: "YouTube" },
  ].filter((item) => item.href);

  async function follow() {
    setFollowPending(true);
    setProfileActionNotice(undefined);
    try {
      await toggleFollow({ userId: identity.userId });
    } catch {
      setProfileActionNotice(t(locale, "Praćenje trenutno nije izmenjeno. Pokušaj ponovo.", "Following could not be updated. Try again."));
    } finally {
      setFollowPending(false);
    }
  }

  async function message(support = false) {
    setMessagePending(true);
    setProfileActionNotice(undefined);
    try {
      const result = await createOrGetDirect({ recipientId: identity.userId, ...(support ? { support: true } : {}) });
      if (window.matchMedia("(min-width: 1024px)").matches) openChatDock(result.conversationId);
      else router.push(withLocale(locale, `/app/messages/${result.conversationId}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setProfileActionNotice(
        message.includes("CHAT_BLOCKED")
          ? t(locale, "Razgovor nije dostupan zbog blokiranja.", "This conversation is unavailable because of a block.")
          : message.includes("DM_PRIVACY")
            ? t(locale, "Ova osoba trenutno ne prima nove poruke.", "This person is not accepting new messages right now.")
            : t(locale, "Razgovor trenutno nije moguće otvoriti. Pokušaj ponovo.", "The conversation could not be opened. Try again."),
      );
    } finally {
      setMessagePending(false);
    }
  }

  async function inviteToStudy(course: { courseId: Id<"courses">; slug: string }) {
    setStudyPendingCourseId(course.courseId);
    setStudyNotice(undefined);
    try {
      await inviteStudyPartner({ recipientId: identity.userId, courseId: course.courseId });
      router.push(`${withLocale(locale, "/app/messages")}?view=study&course=${encodeURIComponent(course.slug)}`);
    } catch {
      setStudyNotice(t(locale, "Poziv nije poslat. Proveri dostupnost i zonu napretka u Uči zajedno.", "The invite was not sent. Check availability and progress zone in Study together."));
    } finally {
      setStudyPendingCourseId(undefined);
    }
  }

  async function chooseBanner(banner: IgraBannerKey) {
    setBannerPending(banner);
    setBannerError(null);
    try {
      await setBanner({ banner });
    } catch {
      setBannerError(IGRA_PROFILE_COPY.bannerError[locale]);
    } finally {
      setBannerPending(null);
    }
  }

  function resetPagination(nextFilter = filter, nextCourse = courseId) {
    setFilter(nextFilter);
    setCourseId(nextCourse);
  }

  const profileCard = (
    <aside className="surface-card border-2 border-ink bg-paper-strong p-6 shadow-[6px_6px_0_0_var(--yellow)] xl:sticky xl:top-8">
      {/* Karta igrača (K13): ime, avatar i nivo su u zaglavlju sa banerom. */}
      {profile.progress ? <PlayerStats xp={profile.progress.xp} streak={isOwner && myProgress ? myProgress.streak : null} locale={locale} className="border-b-2 border-line pb-5" /> : null}
      <div>
        {identity.bio ? <p className="mt-4 whitespace-pre-wrap type-body-sm font-bold text-ink/80">{identity.bio}</p> : <p className="mt-4 text-sm font-bold text-muted">{t(locale, "Biografija još nije dodata.", "No bio yet.")}</p>}
        {links.length ? <div className="mt-4 flex gap-2">{links.map(({ key, href, icon: Icon, label }) => <a key={key} href={href} target="_blank" rel="noreferrer" aria-label={label} className="grid size-10 place-items-center rounded-full border-2 border-ink bg-paper-strong transition hover:bg-yellow"><Icon className="size-5" /></a>)}</div> : null}
        {profile.help?.status ? <div className="surface-inset mt-4 border border-line bg-paper p-3 text-left"><p className="type-eyebrow-sm text-blue-mid dark:text-muted">{profile.help.status === "seeking" ? t(locale, "Tražim pomoć", "Looking for help") : profile.help.status === "offering" ? t(locale, "Mogu da pomognem", "I can help") : t(locale, "Tražim i nudim pomoć", "Looking for and offering help")}</p>{profile.help.topics.length ? <div className="mt-2 flex flex-wrap gap-1.5">{profile.help.topics.map((topic) => <span key={topic.topicId} className="rounded-full border border-ink bg-paper-strong px-2.5 py-1 type-caption font-black">{topic.name}</span>)}</div> : null}</div> : null}
      </div>
      <div className="mt-5 space-y-2 border-y-2 border-line py-4 text-sm font-bold text-ink/80">
        <p className="flex items-center gap-2"><span className={cn("size-2.5 rounded-full", profile.presence?.activeNow ? "bg-emerald-500" : "bg-line")} />{relativeTime(locale, profile.presence?.lastSeenAt, profile.presence?.activeNow)}</p>
        <p className="flex items-center gap-2"><CalendarDays className="size-4" />{t(locale, "Član od", "Joined")} {new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : "en", { month: "long", year: "numeric" }).format(new Date(identity.joinedAt))}</p>
      </div>
      <div className="grid grid-cols-3 divide-x-2 divide-line py-5 text-center">
        <div><p className="type-h2">{profile.stats.contributions}</p><p className="type-caption font-black text-muted">{t(locale, "Doprinosi", "Contributions")}</p></div>
        {profile.viewer.canViewFullConnections ? <button type="button" onClick={() => setFollowList("followers")} className="px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><p className="type-h2">{profile.stats.followers}</p><p className="type-caption font-black text-muted">{t(locale, "Pratioci", "Followers")}</p></button> : <div className="px-1"><p className="type-h2">{profile.stats.followers}</p><p className="type-caption font-black text-muted">{t(locale, "Pratioci", "Followers")}</p></div>}
        {profile.viewer.canViewFullConnections ? <button type="button" onClick={() => setFollowList("following")} className="px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><p className="type-h2">{profile.stats.following}</p><p className="type-caption font-black text-muted">{t(locale, "Pratim", "Following")}</p></button> : <div className="px-1"><p className="type-h2">{profile.stats.following}</p><p className="type-caption font-black text-muted">{t(locale, "Pratim", "Following")}</p></div>}
      </div>
      {profile.viewer.isOwner && (profile.connections.followersPreview.length || profile.connections.followingPreview.length) ? <div className="surface-inset mb-4 space-y-3 border border-line bg-paper p-3">
        {profile.connections.followersPreview.length ? <div><p className="type-eyebrow-sm text-muted">{t(locale, "Novi pratioci", "Recent followers")}</p><div className="mt-2 flex -space-x-2">{profile.connections.followersPreview.map((person) => person.username ? <Link key={person.userId} href={withLocale(locale, `/app/members/${person.username}`)} title={person.name} className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><img src={person.avatarUrl || "/images/avatars/mythic-mentor.png"} alt={person.name} className="size-9 rounded-full border-2 border-paper-strong object-cover" /></Link> : null)}</div></div> : null}
        {profile.connections.followingPreview.length ? <div><p className="type-eyebrow-sm text-muted">{t(locale, "Nedavno pratiš", "Recently following")}</p><div className="mt-2 flex -space-x-2">{profile.connections.followingPreview.map((person) => person.username ? <Link key={person.userId} href={withLocale(locale, `/app/members/${person.username}`)} title={person.name} className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><img src={person.avatarUrl || "/images/avatars/mythic-mentor.png"} alt={person.name} className="size-9 rounded-full border-2 border-paper-strong object-cover" /></Link> : null)}</div></div> : null}
      </div> : null}
      {!profile.viewer.isOwner && profile.connections.commonPeople.length ? <div className="surface-inset mb-4 border border-line bg-paper p-3">
        <p className="type-eyebrow-sm text-muted">{t(locale, "Zajednički ljudi", "People in common")}</p>
        <div className="mt-2 space-y-2">{profile.connections.commonPeople.map((person) => person.username ? <Link key={person.userId} href={withLocale(locale, `/app/members/${person.username}`)} className="flex items-center gap-2 rounded-[12px] bg-paper-strong p-2"><img src={person.avatarUrl || "/images/avatars/mythic-mentor.png"} alt="" className="size-8 rounded-full border border-ink object-cover" /><span className="min-w-0 flex-1 truncate text-xs font-black">{person.name}</span><span className="rounded-full border border-line px-2 py-0.5 type-eyebrow-sm text-muted">{person.connectionKinds.includes("followed_by_both") ? t(locale, "Prati vas oboje", "Follows you both") : t(locale, "Oboje pratite", "Followed by both")}</span></Link> : null)}</div>
      </div> : null}
      {profile.viewer.isOwner ? <div className="space-y-2"><Link href={`${withLocale(locale, "/app/profile")}#public-profile`} className="flex min-h-12 w-full items-center justify-center rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black shadow-[3px_3px_0_0_var(--ink)]">{t(locale, "Uredi javni profil", "Edit public profile")}</Link><Link href={`${withLocale(locale, "/app/profile")}#account-settings`} className="flex min-h-11 w-full items-center justify-center rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black">{t(locale, "Podešavanja naloga", "Account settings")}</Link>{ownerStatus?.complete === false || ownerStatus?.advisories?.emailVerification || ownerStatus?.advisories?.password ? <div className="rounded-[16px] border-2 border-amber-400 bg-amber-50 p-3 text-left text-xs font-black text-amber-950">{ownerStatus?.complete === false ? <p>{t(locale, "Dovrši korisničko ime i profil.", "Complete your username and profile.")}</p> : null}{ownerStatus?.advisories?.emailVerification ? <p>{t(locale, "Potvrdi email za pristup kursevima.", "Verify email for course access.")}</p> : null}{ownerStatus?.advisories?.password ? <p>{t(locale, "Možeš dodati opcionu lozinku.", "You can add an optional password.")}</p> : null}</div> : null}</div> : (
        <div className="space-y-2">
          {profileActionNotice ? <p role="alert" className="rounded-[8px] border border-red-300 bg-red-50 px-3 py-2 text-xs font-black text-red-800">{profileActionNotice}</p> : null}
          {profile.viewer.canFollow ? <button type="button" onClick={follow} disabled={followPending} className={cn("flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-ink px-4 text-sm font-black shadow-[3px_3px_0_0_var(--ink)]", profile.viewer.isFollowing ? "bg-paper-strong" : "bg-yellow")}>
            {followPending ? <Spinner /> : profile.viewer.isFollowing ? <Check className="size-4" /> : <UserPlus className="size-4" />}
            {profile.viewer.isMutual ? t(locale, "Pratite se", "You follow each other") : profile.viewer.isFollowing ? t(locale, "Pratiš", "Following") : t(locale, "Zaprati", "Follow")}
          </button> : null}
          {profile.viewer.canMessage ? <button type="button" onClick={() => void message()} disabled={messagePending} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">{messagePending ? <Spinner /> : <MessageCircle className="size-4" />}{t(locale, "Poruka", "Message")}</button> : null}
          {(profile.viewer.canFollow || profile.viewer.canMessage) ? <button type="button" onClick={() => { setStudyOpen(true); setStudyNotice(undefined); }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-[#d7e9f5] dark:bg-ink/15 px-4 text-sm font-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><GraduationCap className="size-4" />{t(locale, "Uči zajedno", "Study together")}</button> : null}
          <button type="button" onClick={() => { setReportOpen(true); setReportSent(false); }} className="w-full rounded-full px-4 py-2 text-xs font-black text-red-700 underline-offset-2 hover:underline">{t(locale, "Prijavi profil", "Report profile")}</button>
        </div>
      )}
      {profile.viewer.canManageRole ? <div className="surface-inset mt-5 space-y-3 border border-line bg-paper p-3"><label className="type-eyebrow text-muted">{t(locale, "Admin · uloga", "Admin · role")}<select value={identity.role === "admin" ? "student" : identity.role} disabled={rolePending} onChange={async (event) => { setRolePending(true); try { await setProfileRole({ profileId: identity.userId, role: event.target.value as "student" | "pro_student" | "moderator" }); } finally { setRolePending(false); } }} className="mt-2 h-10 w-full rounded-[8px] border-2 border-ink bg-paper-strong px-3 font-bold normal-case text-ink"><option value="student">Lite</option><option value="pro_student">Pro</option><option value="moderator">Moderator</option></select></label><button type="button" onClick={() => void message(true)} disabled={messagePending} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-3 text-xs font-black disabled:opacity-50">{messagePending ? <Spinner /> : <MessageCircle className="size-4" />}{t(locale, "Pokreni support razgovor", "Start support chat")}</button><Link href={`${withLocale(locale, "/app/admin/chat")}?userId=${identity.userId}`} className="flex min-h-10 items-center justify-center rounded-full border-2 border-red-800 bg-paper-strong px-3 text-center type-eyebrow-sm text-red-800">{t(locale, "Pogledaj sve korisnikove chatove", "Inspect all member chats")}</Link></div> : null}
    </aside>
  );

  return (
    <div className="mx-auto min-w-0 max-w-[1380px] space-y-6">
      <ProfileBanner
        banner={bannerKey}
        name={identity.name}
        username={identity.username}
        avatarUrl={identity.avatarUrl}
        roleLabel={roleLabel(locale, identity.role)}
        level={profile.progress ? level.level : null}
        levelProgress={level.progress}
        locale={locale}
        onEditBanner={canPickBanner ? () => { setBannerError(null); setBannerOpen(true); } : undefined}
      />
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="order-2 min-w-0 space-y-6 xl:order-1">
          {/* Trofejna polica (K13): svih 24; vlasniku sa uslovima, drugima samo osvojeno. */}
          {shelf !== null ? (
            <section className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard-13)] sm:p-6">
              {shelf === undefined ? <TrophyShelf loading variant="grid" filter title={IGRA_PROFILE_COPY.shelfTitle[locale]} locale={locale} /> : <TrophyShelf badges={shelf} variant="grid" filter title={IGRA_PROFILE_COPY.shelfTitle[locale]} locale={locale} />}
            </section>
          ) : null}
          <ProfileActivity days={profile.activity.days} works={profileWorks(isOwner, member)} todayKey={todayKey} recent={isOwner ? myProgress?.streak.recent : undefined} isOwner={isOwner} locale={locale} />
          {/* Đačka knjižica Cree (K26, G5): vlasniku uvek, drugima samo kad je javna. */}
          <CreaReportCardPanel
            locale={locale}
            username={identity.username}
            variant="profile"
            notebookHref={`${withLocale(locale, "/app/studio/sveska")}?deo=knjizica`}
          />
          <section className="surface-card border-2 border-line bg-paper-strong p-4 sm:p-6">
            <div className="flex items-center gap-2"><BookOpen className="size-5" /><h2 className="font-display type-display-sm">{t(locale, "Kursevi koje pohađa", "Courses")}</h2></div>
            {profile.courses.length ? <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{profile.courses.map((course) => <article key={course.courseId} className="surface-inset border border-line bg-paper p-3"><div className="surface-media aspect-[16/9] overflow-hidden bg-ink/5 dark:bg-ink/10">{course.coverUrl ? <img src={course.coverUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><BookOpen className="size-8 text-muted" /></div>}</div><p className="mt-3 type-eyebrow text-blue-mid dark:text-muted">{locale === "sr" ? course.trackTitleSr : course.trackTitleEn}</p><h3 className="mt-1 type-h4 text-ink">{locale === "sr" ? course.titleSr : course.titleEn}</h3><div className="mt-3 h-2 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-yellow" style={{ width: `${course.percent}%` }} /></div><div className="mt-2 flex justify-between text-xs font-black text-muted"><span>{course.completedLessons}/{course.totalLessons} {t(locale, "lekcija", "lessons")}</span><span>{course.percent}%</span></div></article>)}</div> : <p className="surface-card mt-4 border border-dashed border-line p-6 text-center text-sm font-bold text-muted">{t(locale, "Još nema aktivnih kurseva ni zabeleženog napretka.", "No active courses or progress yet.")}</p>}
          </section>
          <section className="surface-card border-2 border-line bg-paper-strong p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="font-display type-display-sm">{t(locale, "Doprinosi", "Contributions")}</h2><div className="flex flex-wrap gap-2">{(["all", "threads", "comments"] as ContributionFilter[]).map((value) => <button key={value} type="button" onClick={() => resetPagination(value, courseId)} className={cn("rounded-full border-2 border-ink px-4 py-2 text-xs font-black", filter === value ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink")}>{value === "all" ? t(locale, "Sve", "All") : value === "threads" ? t(locale, "Threadovi", "Threads") : t(locale, "Komentari", "Comments")}</button>)}</div></div>
            {profile.courses.length > 1 ? <select value={courseId} onChange={(event) => resetPagination(filter, event.target.value)} className="mt-4 h-11 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black"><option value="">{t(locale, "Svi kursevi", "All courses")}</option>{profile.courses.map((course) => <option key={course.courseId} value={course.courseId}>{locale === "sr" ? course.titleSr : course.titleEn}</option>)}</select> : null}
            <div className="mt-4 space-y-3">{contributions.status === "LoadingFirstPage" ? <div className="grid py-10 place-items-center"><Spinner size="lg" /></div> : contributions.results.length ? contributions.results.map((group) => <article key={group.post.id} className="surface-card border border-line bg-paper p-4"><div className="flex items-start justify-between gap-4"><div><p className="type-eyebrow-sm text-blue-mid dark:text-muted">{group.hasThread ? t(locale, "Thread", "Thread") : t(locale, "Komentar", "Comment")}{group.post.course ? ` · ${locale === "sr" ? group.post.course.titleSr : group.post.course.titleEn}` : ""}</p><Link href={withLocale(locale, `/app/community/${group.post.id}`)} className="mt-1 block type-h3 text-ink hover:underline">{group.post.title}</Link><p className="mt-2 line-clamp-2 type-body-sm font-bold text-muted">{group.post.body}</p></div><ExternalLink className="size-4 shrink-0 text-muted" /></div>{group.comments.length ? <div className="mt-4 space-y-2 border-t-2 border-line pt-3">{group.comments.map((comment) => <div key={comment.id} className="surface-inset bg-paper-strong p-3"><p className="type-body-sm font-bold text-ink/85">{comment.body}</p><p className="mt-1 type-caption font-black text-muted">{relativeTime(locale, comment.createdAt)}</p></div>)}{group.moreComments ? <p className="text-xs font-black text-blue-mid dark:text-muted">+{group.moreComments} {t(locale, "još", "more")}</p> : null}</div> : null}</article>) : <p className="surface-card border border-dashed border-line p-8 text-center text-sm font-bold text-muted">{t(locale, "Nema doprinosa za ovaj filter.", "No contributions for this filter.")}</p>}</div>
            {contributions.status === "CanLoadMore" ? <button type="button" onClick={() => contributions.loadMore(10)} className="mt-4 w-full rounded-full border-2 border-ink bg-yellow px-4 py-2.5 text-xs font-black">{t(locale, "Učitaj još", "Load more")}</button> : null}
          </section>
        </div>
        <div className="order-1 min-w-0 xl:order-2">{profileCard}</div>
      </div>
      {canPickBanner ? (
        <BannerPicker
          open={bannerOpen}
          onClose={() => setBannerOpen(false)}
          level={myProgress?.level.level ?? level.level}
          selected={ownBanner}
          pending={bannerPending}
          error={bannerError}
          onSelect={(banner) => void chooseBanner(banner)}
          locale={locale}
        />
      ) : null}
      {followList ? <FollowersDialog kind={followList} userId={identity.userId} username={identity.username} locale={locale} owner={profile.viewer.isOwner} onClose={() => setFollowList(null)} /> : null}
      <Dialog
        open={studyOpen}
        onClose={() => setStudyOpen(false)}
        align="sheet"
        eyebrow={t(locale, "Zajednički kurs", "Shared course")}
        title={t(locale, `Uči sa ${identity.name}`, `Study with ${identity.name}`)}
        closeLabel={t(locale, "Zatvori", "Close")}
        contentClassName="space-y-2"
      >
        {studyNotice ? <p role="alert" className="rounded-[8px] border border-red-300 bg-red-50 p-3 text-xs font-black text-red-800">{studyNotice}</p> : null}
        {commonStudyCourses.status === "LoadingFirstPage" ? <div className="grid min-h-36 place-items-center"><Spinner size="lg" label={t(locale, "Učitavanje…", "Loading…")} /></div> : null}
        {commonStudyCourses.results.map((course) => (
          <article key={course.courseId} className="surface-inset border border-line bg-paper p-3">
            <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full border-2 border-ink bg-[#d7e9f5] dark:bg-ink/15"><BookOpen className="size-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{locale === "sr" ? course.titleSr : course.titleEn}</span><span className="block type-caption font-bold text-muted">{course.matchingAvailable ? t(locale, "Ista zona napretka · spremno za poziv", "Same progress zone · ready to invite") : t(locale, "Prvo uskladi dostupnost", "Set matching availability first")}</span></span></div>
            {course.matchingAvailable
              ? <Button size="sm" loading={studyPendingCourseId === course.courseId} disabled={Boolean(studyPendingCourseId)} icon={<GraduationCap className="size-4" />} onClick={() => void inviteToStudy(course)} className="mt-3 w-full">{t(locale, "Pošalji poziv", "Send invite")}</Button>
              : <Button size="sm" variant="secondary" onClick={() => router.push(`${withLocale(locale, "/app/messages")}?view=study&course=${encodeURIComponent(course.slug)}`)} className="mt-3 w-full">{t(locale, "Podesi u Uči zajedno", "Set up in Study together")}</Button>}
          </article>
        ))}
        {commonStudyCourses.status === "CanLoadMore" || commonStudyCourses.status === "LoadingMore" ? <Button size="sm" variant="secondary" loading={commonStudyCourses.status === "LoadingMore"} onClick={() => commonStudyCourses.loadMore(12)} className="w-full">{commonStudyCourses.status === "LoadingMore" ? t(locale, "Učitavanje…", "Loading…") : t(locale, "Učitaj još", "Load more")}</Button> : null}
        {!commonStudyCourses.results.length && commonStudyCourses.status === "Exhausted" ? <EmptyState icon={BookOpen} art={<IgraArt id="prazno.par" size="lg" decorative />} title={t(locale, "Nemate zajednički aktivan kurs.", "You do not share an active course.")} body={t(locale, "Kad oboje krenete isti kurs, ovde se pojavi dugme za poziv na zajedničko učenje.", "Once you both start the same course, an invite button appears here.")} /> : null}
      </Dialog>
      <Dialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        size="sm"
        eyebrow={t(locale, "Prijava", "Report")}
        title={identity.name}
        closeLabel={t(locale, "Zatvori", "Close")}
      >
        {reportSent ? <p role="status" className="surface-inset border border-line bg-paper p-4 text-sm font-black">{t(locale, "Prijava je poslata timu za sigurnost.", "The report was sent to the safety team.")}</p> : (
          <>
            <Field label={t(locale, "Razlog", "Reason")}>
              {(field) => <Textarea {...field} value={reportReason} onChange={(event) => setReportReason(event.target.value)} rows={4} maxLength={1_000} />}
            </Field>
            <Button
              className="mt-3"
              loading={reportPending}
              disabled={reportReason.trim().length < 3}
              onClick={async () => { setReportPending(true); try { await reportContent({ targetType: "profile", targetUserId: identity.userId, reason: reportReason }); setReportSent(true); setReportReason(""); } finally { setReportPending(false); } }}
            >
              {t(locale, "Pošalji prijavu", "Send report")}
            </Button>
          </>
        )}
      </Dialog>
    </div>
  );
}
