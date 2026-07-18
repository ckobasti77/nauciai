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
  Loader2,
  MessageCircle,
  UserPlus,
  Users,
  PlaySquare,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { openChatDock } from "@/components/app/chat/chat-dock";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

type FollowListKind = "followers" | "following";
type ContributionFilter = "all" | "threads" | "comments";

function labelFor(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr : en;
}

function useModalFocus(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(
        '[autofocus], button:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      (first ?? dialogRef.current)?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.offsetParent !== null);
      if (!controls.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  return dialogRef;
}

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
  if (!timestamp) return labelFor(locale, "Aktivnost nije zabeležena", "No activity recorded");
  if (activeNow) return labelFor(locale, "Aktivan sada", "Active now");
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return labelFor(locale, `pre ${minutes} min`, `${minutes}m ago`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return labelFor(locale, `pre ${hours} h`, `${hours}h ago`);
  const days = Math.floor(hours / 24);
  return labelFor(locale, `pre ${days} dana`, `${days}d ago`);
}

function dayKey(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function ActivityHeatmap({ activity, locale }: { activity: { days: Array<{ dayKey: string; lessons: number; tasks: number; threads: number; comments: number; total: number }>; max: number }; locale: Locale }) {
  const [todayTimestamp] = useState(() => Date.now());
  const cells = useMemo(() => {
    const values = new Map(activity.days.map((day) => [day.dayKey, day]));
    const today = new Date(todayTimestamp);
    return Array.from({ length: 365 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (364 - index));
      const key = dayKey(date.getTime());
      return { key, value: values.get(key) };
    });
  }, [activity.days, todayTimestamp]);
  const todayKey = dayKey(todayTimestamp);
  const shades = ["bg-[#edf3f8]", "bg-[#b9d3e8]", "bg-[#70a7cf]", "bg-[#2e6f9f]", "bg-ink"];

  return (
    <section className="rounded-[16px] border-2 border-line bg-white p-4 shadow-[4px_4px_0_0_rgba(14,49,88,0.08)] sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-display text-2xl text-ink">{labelFor(locale, "Aktivnost", "Activity")}</p>
          <p className="mt-1 text-sm font-bold text-muted">{labelFor(locale, "Poslednjih 365 dana", "Last 365 days")}</p>
        </div>
        <div className="hidden items-center gap-1 text-[11px] font-black text-muted sm:flex">
          <span>{labelFor(locale, "Manje", "Less")}</span>
          {shades.map((shade) => <span key={shade} className={cn("size-3 rounded-[3px]", shade)} />)}
          <span>{labelFor(locale, "Više", "More")}</span>
        </div>
      </div>
      <div className="mt-5 overflow-x-auto pb-2">
        <div className="grid min-w-[580px] grid-flow-col grid-rows-7 gap-[2px]">
          {cells.map(({ key, value }) => {
            const intensity = value?.total ? Math.min(4, Math.max(1, Math.ceil((value.total / activity.max) * 4))) : 0;
            const title = value
              ? `${key}: ${value.total} · ${value.lessons} lekcija · ${value.tasks} zadataka · ${value.threads} threadova · ${value.comments} komentara`
              : `${key}: 0`;
            return <span key={key} title={title} className={cn("size-[9px] rounded-[3px]", shades[intensity], key === todayKey && "ring-2 ring-yellow ring-offset-1")} />;
          })}
        </div>
      </div>
    </section>
  );
}

function FollowersDialog({ kind, userId, username, locale, owner, onClose }: { kind: FollowListKind; userId: Id<"users">; username: string; locale: Locale; owner: boolean; onClose: () => void }) {
  return owner
    ? <ViewerConnectionsList kind={kind} username={username} locale={locale} onClose={onClose} />
    : <StaffConnectionsList kind={kind} userId={userId} username={username} locale={locale} onClose={onClose} />;
}

function FollowDialogShell({ title, username, rows, status, loadMore, locale, onClose }: { title: string; username: string; rows: Array<{ userId: Id<"users">; name: string; username?: string; avatarUrl?: string; role: string }>; status: string; loadMore: (count: number) => void; locale: Locale; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/45 p-0 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div ref={dialogRef} className="max-h-[82vh] w-full overflow-hidden rounded-t-[16px] border-2 border-ink bg-paper shadow-2xl sm:max-w-lg sm:rounded-[16px]">
        <div className="flex items-center justify-between border-b-2 border-line bg-white px-5 py-4">
          <div><p className="text-lg font-black text-ink">{title}</p><p className="text-xs font-bold text-muted">@{username}</p></div>
          <button type="button" autoFocus onClick={onClose} className="grid size-10 place-items-center rounded-full border-2 border-ink bg-white" aria-label={labelFor(locale, "Zatvori", "Close")}><X className="size-5" /></button>
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
          {rows.map((row) => row.username ? (
            <Link key={row.userId} href={withLocale(locale, `/app/members/${row.username}`)} onClick={onClose} className="flex items-center gap-3 rounded-[16px] border-2 border-line bg-white p-3 transition hover:border-ink">
              <img src={row.avatarUrl || "/images/avatars/mythic-mentor.png"} alt="" className="size-11 rounded-full border-2 border-ink object-cover" />
              <span className="min-w-0 flex-1"><span className="block truncate font-black text-ink">{row.name}</span><span className="block truncate text-xs font-bold text-muted">@{row.username}</span></span>
              <span className="rounded-full bg-yellow px-2.5 py-1 text-[10px] font-black uppercase text-ink">{roleLabel(locale, row.role)}</span>
            </Link>
          ) : null)}
          {rows.length === 0 && status !== "LoadingFirstPage" ? <p className="py-10 text-center text-sm font-bold text-muted">{labelFor(locale, "Lista je prazna.", "The list is empty.")}</p> : null}
          {status === "CanLoadMore" ? <button type="button" onClick={() => loadMore(20)} className="w-full rounded-full border-2 border-ink bg-white px-4 py-3 text-sm font-black">{labelFor(locale, "Učitaj još", "Load more")}</button> : null}
        </div>
      </div>
    </div>
  );
}

function ViewerConnectionsList(props: { kind: FollowListKind; username: string; locale: Locale; onClose: () => void }) {
  const data = usePaginatedQuery(api.publicProfiles.listViewerConnectionsPage, { kind: props.kind }, { initialNumItems: 20 });
  return <FollowDialogShell title={props.kind === "followers" ? labelFor(props.locale, "Pratioci", "Followers") : labelFor(props.locale, "Pratim", "Following")} username={props.username} rows={data.results} status={data.status} loadMore={data.loadMore} locale={props.locale} onClose={props.onClose} />;
}

function StaffConnectionsList(props: { kind: FollowListKind; userId: Id<"users">; username: string; locale: Locale; onClose: () => void }) {
  const data = usePaginatedQuery(api.publicProfiles.listProfileConnectionsForStaff, { userId: props.userId, kind: props.kind }, { initialNumItems: 20 });
  return <FollowDialogShell title={props.kind === "followers" ? labelFor(props.locale, "Pratioci · staff", "Followers · staff") : labelFor(props.locale, "Pratim · staff", "Following · staff")} username={props.username} rows={data.results} status={data.status} loadMore={data.loadMore} locale={props.locale} onClose={props.onClose} />;
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
  const studyDialogRef = useModalFocus(studyOpen, () => setStudyOpen(false));
  const reportDialogRef = useModalFocus(reportOpen, () => setReportOpen(false));
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

  if (profile === undefined) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-8 animate-spin text-ink" aria-label={labelFor(locale, "Učitavanje", "Loading")} /></div>;
  if (profile === null) return (
    <div className="mx-auto max-w-2xl rounded-[16px] border-2 border-ink bg-white p-8 text-center shadow-[6px_6px_0_0_#f4be30]">
      <Users className="mx-auto size-10 text-ink" />
      <h1 className="mt-4 text-2xl font-black text-ink">{labelFor(locale, "Profil nije pronađen", "Profile not found")}</h1>
      <p className="mt-2 font-bold text-muted">{labelFor(locale, "Korisnik je uklonjen, spojen ili još nema korisničko ime.", "This member was removed, merged, or does not have a username yet.")}</p>
      <Link href={withLocale(locale, "/app/community/members")} className="mt-5 inline-flex rounded-full border-2 border-ink bg-yellow px-5 py-3 text-sm font-black">{labelFor(locale, "Nazad na članove", "Back to members")}</Link>
    </div>
  );

  const { identity } = profile;
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
      setProfileActionNotice(labelFor(locale, "Praćenje trenutno nije izmenjeno. Pokušaj ponovo.", "Following could not be updated. Try again."));
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
          ? labelFor(locale, "Razgovor nije dostupan zbog blokiranja.", "This conversation is unavailable because of a block.")
          : message.includes("DM_PRIVACY")
            ? labelFor(locale, "Ova osoba trenutno ne prima nove poruke.", "This person is not accepting new messages right now.")
            : labelFor(locale, "Razgovor trenutno nije moguće otvoriti. Pokušaj ponovo.", "The conversation could not be opened. Try again."),
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
      setStudyNotice(labelFor(locale, "Poziv nije poslat. Proveri dostupnost i zonu napretka u Uči zajedno.", "The invite was not sent. Check availability and progress zone in Study together."));
    } finally {
      setStudyPendingCourseId(undefined);
    }
  }

  function resetPagination(nextFilter = filter, nextCourse = courseId) {
    setFilter(nextFilter);
    setCourseId(nextCourse);
  }

  const profileCard = (
    <aside className="rounded-[16px] border-2 border-ink bg-white p-5 shadow-[6px_6px_0_0_rgba(244,190,48,0.75)] xl:sticky xl:top-8">
      <div className="mx-auto w-fit">
        <div className="relative rounded-full border-[3px] border-ink p-1.5 ring-[7px] ring-yellow/70">
          <img src={identity.avatarUrl || "/images/avatars/mythic-mentor.png"} alt={identity.name} className="size-28 rounded-full object-cover sm:size-32" />
          {profile.progress ? <span className="absolute -bottom-2 -right-2 grid size-11 place-items-center rounded-full border-[3px] border-white bg-ink text-lg font-black text-white">{profile.progress.level}</span> : null}
        </div>
      </div>
      <div className="mt-6 text-center">
        <span className="inline-flex rounded-full border-2 border-ink bg-yellow px-3 py-1 text-xs font-black uppercase">{roleLabel(locale, identity.role)}</span>
        <h1 className="mt-3 text-3xl font-black leading-tight text-ink">{identity.name}</h1>
        <p className="mt-1 font-mono text-sm font-bold text-muted">@{identity.username}</p>
        {profile.progress ? <p className="mt-2 text-xs font-black text-[#2e6f9f]">{profile.progress.xp.toLocaleString()} XP · {labelFor(locale, `Nivo ${profile.progress.level}`, `Level ${profile.progress.level}`)}</p> : null}
        {identity.bio ? <p className="mt-4 whitespace-pre-wrap text-sm font-bold leading-6 text-ink/80">{identity.bio}</p> : <p className="mt-4 text-sm font-bold text-muted">{labelFor(locale, "Biografija još nije dodata.", "No bio yet.")}</p>}
        {links.length ? <div className="mt-4 flex justify-center gap-2">{links.map(({ key, href, icon: Icon, label }) => <a key={key} href={href} target="_blank" rel="noreferrer" aria-label={label} className="grid size-10 place-items-center rounded-full border-2 border-ink bg-white transition hover:bg-yellow"><Icon className="size-5" /></a>)}</div> : null}
        {profile.help?.status ? <div className="mt-4 rounded-[16px] border-2 border-line bg-paper p-3 text-left"><p className="text-[10px] font-black uppercase text-[#2e6f9f]">{profile.help.status === "seeking" ? labelFor(locale, "Tražim pomoć", "Looking for help") : profile.help.status === "offering" ? labelFor(locale, "Mogu da pomognem", "I can help") : labelFor(locale, "Tražim i nudim pomoć", "Looking for and offering help")}</p>{profile.help.topics.length ? <div className="mt-2 flex flex-wrap gap-1.5">{profile.help.topics.map((topic) => <span key={topic.topicId} className="rounded-full border border-ink bg-white px-2.5 py-1 text-[10px] font-black">{topic.name}</span>)}</div> : null}</div> : null}
      </div>
      <div className="mt-5 space-y-2 border-y-2 border-line py-4 text-sm font-bold text-ink/80">
        <p className="flex items-center gap-2"><span className={cn("size-2.5 rounded-full", profile.presence?.activeNow ? "bg-emerald-500" : "bg-line")} />{relativeTime(locale, profile.presence?.lastSeenAt, profile.presence?.activeNow)}</p>
        <p className="flex items-center gap-2"><CalendarDays className="size-4" />{labelFor(locale, "Član od", "Joined")} {new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : "en", { month: "long", year: "numeric" }).format(new Date(identity.joinedAt))}</p>
      </div>
      <div className="grid grid-cols-3 divide-x-2 divide-line py-5 text-center">
        <div><p className="text-2xl font-black">{profile.stats.contributions}</p><p className="text-[11px] font-black text-muted">{labelFor(locale, "Doprinosi", "Contributions")}</p></div>
        {profile.viewer.canViewFullConnections ? <button type="button" onClick={() => setFollowList("followers")} className="px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><p className="text-2xl font-black">{profile.stats.followers}</p><p className="text-[11px] font-black text-muted">{labelFor(locale, "Pratioci", "Followers")}</p></button> : <div className="px-1"><p className="text-2xl font-black">{profile.stats.followers}</p><p className="text-[11px] font-black text-muted">{labelFor(locale, "Pratioci", "Followers")}</p></div>}
        {profile.viewer.canViewFullConnections ? <button type="button" onClick={() => setFollowList("following")} className="px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><p className="text-2xl font-black">{profile.stats.following}</p><p className="text-[11px] font-black text-muted">{labelFor(locale, "Pratim", "Following")}</p></button> : <div className="px-1"><p className="text-2xl font-black">{profile.stats.following}</p><p className="text-[11px] font-black text-muted">{labelFor(locale, "Pratim", "Following")}</p></div>}
      </div>
      {profile.viewer.isOwner && (profile.connections.followersPreview.length || profile.connections.followingPreview.length) ? <div className="mb-4 space-y-3 rounded-[16px] border-2 border-line bg-paper p-3">
        {profile.connections.followersPreview.length ? <div><p className="text-[10px] font-black uppercase text-muted">{labelFor(locale, "Novi pratioci", "Recent followers")}</p><div className="mt-2 flex -space-x-2">{profile.connections.followersPreview.map((person) => person.username ? <Link key={person.userId} href={withLocale(locale, `/app/members/${person.username}`)} title={person.name} className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><img src={person.avatarUrl || "/images/avatars/mythic-mentor.png"} alt={person.name} className="size-9 rounded-full border-2 border-white object-cover" /></Link> : null)}</div></div> : null}
        {profile.connections.followingPreview.length ? <div><p className="text-[10px] font-black uppercase text-muted">{labelFor(locale, "Nedavno pratiš", "Recently following")}</p><div className="mt-2 flex -space-x-2">{profile.connections.followingPreview.map((person) => person.username ? <Link key={person.userId} href={withLocale(locale, `/app/members/${person.username}`)} title={person.name} className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><img src={person.avatarUrl || "/images/avatars/mythic-mentor.png"} alt={person.name} className="size-9 rounded-full border-2 border-white object-cover" /></Link> : null)}</div></div> : null}
      </div> : null}
      {!profile.viewer.isOwner && profile.connections.commonPeople.length ? <div className="mb-4 rounded-[16px] border-2 border-line bg-paper p-3">
        <p className="text-[10px] font-black uppercase text-muted">{labelFor(locale, "Zajednički ljudi", "People in common")}</p>
        <div className="mt-2 space-y-2">{profile.connections.commonPeople.map((person) => person.username ? <Link key={person.userId} href={withLocale(locale, `/app/members/${person.username}`)} className="flex items-center gap-2 rounded-[12px] bg-white p-2"><img src={person.avatarUrl || "/images/avatars/mythic-mentor.png"} alt="" className="size-8 rounded-full border border-ink object-cover" /><span className="min-w-0 flex-1 truncate text-xs font-black">{person.name}</span><span className="rounded-full border border-line px-2 py-0.5 text-[8px] font-black uppercase text-muted">{person.connectionKinds.includes("followed_by_both") ? labelFor(locale, "Prati vas oboje", "Follows you both") : labelFor(locale, "Oboje pratite", "Followed by both")}</span></Link> : null)}</div>
      </div> : null}
      {profile.viewer.isOwner ? <div className="space-y-2"><Link href={`${withLocale(locale, "/app/profile")}#public-profile`} className="flex min-h-12 w-full items-center justify-center rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black shadow-[3px_3px_0_0_#0e3158]">{labelFor(locale, "Uredi javni profil", "Edit public profile")}</Link><Link href={`${withLocale(locale, "/app/profile")}#account-settings`} className="flex min-h-11 w-full items-center justify-center rounded-full border-2 border-ink bg-white px-4 text-sm font-black">{labelFor(locale, "Podešavanja naloga", "Account settings")}</Link>{ownerStatus?.complete === false || ownerStatus?.advisories?.emailVerification || ownerStatus?.advisories?.password ? <div className="rounded-[16px] border-2 border-amber-400 bg-amber-50 p-3 text-left text-xs font-black text-amber-950">{ownerStatus?.complete === false ? <p>{labelFor(locale, "Dovrši korisničko ime i profil.", "Complete your username and profile.")}</p> : null}{ownerStatus?.advisories?.emailVerification ? <p>{labelFor(locale, "Potvrdi email za pristup kursevima.", "Verify email for course access.")}</p> : null}{ownerStatus?.advisories?.password ? <p>{labelFor(locale, "Možeš dodati opcionu lozinku.", "You can add an optional password.")}</p> : null}</div> : null}</div> : (
        <div className="space-y-2">
          {profileActionNotice ? <p role="alert" className="rounded-[8px] border border-red-300 bg-red-50 px-3 py-2 text-xs font-black text-red-800">{profileActionNotice}</p> : null}
          {profile.viewer.canFollow ? <button type="button" onClick={follow} disabled={followPending} className={cn("flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-ink px-4 text-sm font-black shadow-[3px_3px_0_0_#0e3158]", profile.viewer.isFollowing ? "bg-white" : "bg-yellow")}>
            {followPending ? <Loader2 className="size-4 animate-spin" /> : profile.viewer.isFollowing ? <Check className="size-4" /> : <UserPlus className="size-4" />}
            {profile.viewer.isMutual ? labelFor(locale, "Pratite se", "You follow each other") : profile.viewer.isFollowing ? labelFor(locale, "Pratiš", "Following") : labelFor(locale, "Zaprati", "Follow")}
          </button> : null}
          {profile.viewer.canMessage ? <button type="button" onClick={() => void message()} disabled={messagePending} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-white px-4 text-sm font-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">{messagePending ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}{labelFor(locale, "Poruka", "Message")}</button> : null}
          {(profile.viewer.canFollow || profile.viewer.canMessage) ? <button type="button" onClick={() => { setStudyOpen(true); setStudyNotice(undefined); }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-[#d7e9f5] px-4 text-sm font-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><GraduationCap className="size-4" />{labelFor(locale, "Uči zajedno", "Study together")}</button> : null}
          <button type="button" onClick={() => { setReportOpen(true); setReportSent(false); }} className="w-full rounded-full px-4 py-2 text-xs font-black text-red-700 underline-offset-2 hover:underline">{labelFor(locale, "Prijavi profil", "Report profile")}</button>
        </div>
      )}
      {profile.viewer.canManageRole ? <div className="mt-5 space-y-3 rounded-[16px] border-2 border-line bg-paper p-3"><label className="text-xs font-black uppercase text-muted">{labelFor(locale, "Admin · uloga", "Admin · role")}<select value={identity.role === "admin" ? "student" : identity.role} disabled={rolePending} onChange={async (event) => { setRolePending(true); try { await setProfileRole({ profileId: identity.userId, role: event.target.value as "student" | "pro_student" | "moderator" }); } finally { setRolePending(false); } }} className="mt-2 h-10 w-full rounded-[8px] border-2 border-ink bg-white px-3 font-bold normal-case text-ink"><option value="student">Lite</option><option value="pro_student">Pro</option><option value="moderator">Moderator</option></select></label><button type="button" onClick={() => void message(true)} disabled={messagePending} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-3 text-xs font-black disabled:opacity-50">{messagePending ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}{labelFor(locale, "Pokreni support razgovor", "Start support chat")}</button><Link href={`${withLocale(locale, "/app/admin/chat")}?userId=${identity.userId}`} className="flex min-h-10 items-center justify-center rounded-full border-2 border-red-800 bg-white px-3 text-center text-[10px] font-black uppercase text-red-800">{labelFor(locale, "Pogledaj sve korisnikove chatove", "Inspect all member chats")}</Link></div> : null}
    </aside>
  );

  return (
    <div className="mx-auto min-w-0 max-w-[1380px]">
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="order-2 min-w-0 space-y-6 xl:order-1">
          <ActivityHeatmap activity={profile.activity} locale={locale} />
          <section className="rounded-[16px] border-2 border-line bg-white p-4 sm:p-5">
            <div className="flex items-center gap-2"><BookOpen className="size-5" /><h2 className="font-display text-2xl">{labelFor(locale, "Kursevi koje pohađa", "Courses")}</h2></div>
            {profile.courses.length ? <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{profile.courses.map((course) => <article key={course.courseId} className="rounded-[16px] border-2 border-line bg-paper p-3"><div className="aspect-[16/9] overflow-hidden rounded-[8px] border-2 border-ink bg-[#e8f0f6]">{course.coverUrl ? <img src={course.coverUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><BookOpen className="size-8 text-muted" /></div>}</div><p className="mt-3 text-xs font-black uppercase text-[#2e6f9f]">{locale === "sr" ? course.trackTitleSr : course.trackTitleEn}</p><h3 className="mt-1 font-black text-ink">{locale === "sr" ? course.titleSr : course.titleEn}</h3><div className="mt-3 h-2 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-yellow" style={{ width: `${course.percent}%` }} /></div><div className="mt-2 flex justify-between text-xs font-black text-muted"><span>{course.completedLessons}/{course.totalLessons} {labelFor(locale, "lekcija", "lessons")}</span><span>{course.percent}%</span></div></article>)}</div> : <p className="mt-4 rounded-[16px] border-2 border-dashed border-line p-6 text-center text-sm font-bold text-muted">{labelFor(locale, "Još nema aktivnih kurseva ni zabeleženog napretka.", "No active courses or progress yet.")}</p>}
          </section>
          <section className="rounded-[16px] border-2 border-line bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="font-display text-2xl">{labelFor(locale, "Doprinosi", "Contributions")}</h2><div className="flex flex-wrap gap-2">{(["all", "threads", "comments"] as ContributionFilter[]).map((value) => <button key={value} type="button" onClick={() => resetPagination(value, courseId)} className={cn("rounded-full border-2 border-ink px-4 py-2 text-xs font-black", filter === value ? "bg-ink text-white" : "bg-white text-ink")}>{value === "all" ? labelFor(locale, "Sve", "All") : value === "threads" ? labelFor(locale, "Threadovi", "Threads") : labelFor(locale, "Komentari", "Comments")}</button>)}</div></div>
            {profile.courses.length > 1 ? <select value={courseId} onChange={(event) => resetPagination(filter, event.target.value)} className="mt-4 h-11 rounded-full border-2 border-ink bg-white px-4 text-sm font-black"><option value="">{labelFor(locale, "Svi kursevi", "All courses")}</option>{profile.courses.map((course) => <option key={course.courseId} value={course.courseId}>{locale === "sr" ? course.titleSr : course.titleEn}</option>)}</select> : null}
            <div className="mt-4 space-y-3">{contributions.status === "LoadingFirstPage" ? <div className="grid py-10 place-items-center"><Loader2 className="size-6 animate-spin" /></div> : contributions.results.length ? contributions.results.map((group) => <article key={group.post.id} className="rounded-[16px] border-2 border-line bg-paper p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase text-[#2e6f9f]">{group.hasThread ? labelFor(locale, "Thread", "Thread") : labelFor(locale, "Komentar", "Comment")}{group.post.course ? ` · ${locale === "sr" ? group.post.course.titleSr : group.post.course.titleEn}` : ""}</p><Link href={withLocale(locale, `/app/community/${group.post.id}`)} className="mt-1 block text-lg font-black text-ink hover:underline">{group.post.title}</Link><p className="mt-2 line-clamp-2 text-sm font-bold leading-6 text-muted">{group.post.body}</p></div><ExternalLink className="size-4 shrink-0 text-muted" /></div>{group.comments.length ? <div className="mt-4 space-y-2 border-t-2 border-line pt-3">{group.comments.map((comment) => <div key={comment.id} className="rounded-[12px] border border-line bg-white p-3"><p className="text-sm font-bold leading-6 text-ink/85">{comment.body}</p><p className="mt-1 text-[10px] font-black text-muted">{relativeTime(locale, comment.createdAt)}</p></div>)}{group.moreComments ? <p className="text-xs font-black text-[#2e6f9f]">+{group.moreComments} {labelFor(locale, "još", "more")}</p> : null}</div> : null}</article>) : <p className="rounded-[16px] border-2 border-dashed border-line p-8 text-center text-sm font-bold text-muted">{labelFor(locale, "Nema doprinosa za ovaj filter.", "No contributions for this filter.")}</p>}</div>
            {contributions.status === "CanLoadMore" ? <button type="button" onClick={() => contributions.loadMore(10)} className="mt-4 w-full rounded-full border-2 border-ink bg-yellow px-4 py-2.5 text-xs font-black">{labelFor(locale, "Učitaj još", "Load more")}</button> : null}
          </section>
        </div>
        <div className="order-1 min-w-0 xl:order-2">{profileCard}</div>
      </div>
      {followList ? <FollowersDialog kind={followList} userId={identity.userId} username={identity.username} locale={locale} owner={profile.viewer.isOwner} onClose={() => setFollowList(null)} /> : null}
      {studyOpen ? (
        <div className="fixed inset-0 z-[95] grid place-items-end bg-ink/50 p-0 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="study-invite-title">
          <div ref={studyDialogRef} tabIndex={-1} className="max-h-[82dvh] w-full overflow-hidden rounded-t-[16px] border-2 border-ink bg-white shadow-2xl sm:max-w-lg sm:rounded-[16px]">
            <div className="flex items-start justify-between gap-3 border-b-2 border-ink p-4">
              <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#2e6f9f]">{labelFor(locale, "Zajednički kurs", "Shared course")}</p><h2 id="study-invite-title" className="mt-1 text-xl font-black">{labelFor(locale, `Uči sa ${identity.name}`, `Study with ${identity.name}`)}</h2></div>
              <button type="button" autoFocus onClick={() => setStudyOpen(false)} className="grid size-10 place-items-center rounded-full border-2 border-ink" aria-label={labelFor(locale, "Zatvori", "Close")}><X className="size-4" /></button>
            </div>
            <div className="max-h-[62dvh] space-y-2 overflow-y-auto p-4">
              {studyNotice ? <p role="alert" className="rounded-[8px] border border-red-300 bg-red-50 p-3 text-xs font-black text-red-800">{studyNotice}</p> : null}
              {commonStudyCourses.status === "LoadingFirstPage" ? <div className="grid min-h-36 place-items-center"><Loader2 className="size-6 animate-spin" /></div> : null}
              {commonStudyCourses.results.map((course) => (
                <article key={course.courseId} className="rounded-[16px] border-2 border-line bg-paper p-3">
                  <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full border-2 border-ink bg-[#d7e9f5]"><BookOpen className="size-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{locale === "sr" ? course.titleSr : course.titleEn}</span><span className="block text-[10px] font-bold text-muted">{course.matchingAvailable ? labelFor(locale, "Ista zona napretka · spremno za poziv", "Same progress zone · ready to invite") : labelFor(locale, "Prvo uskladi dostupnost", "Set matching availability first")}</span></span></div>
                  {course.matchingAvailable ? <button type="button" disabled={Boolean(studyPendingCourseId)} onClick={() => void inviteToStudy(course)} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black disabled:opacity-50">{studyPendingCourseId === course.courseId ? <Loader2 className="size-4 animate-spin" /> : <GraduationCap className="size-4" />}{labelFor(locale, "Pošalji poziv", "Send invite")}</button> : <button type="button" onClick={() => router.push(`${withLocale(locale, "/app/messages")}?view=study&course=${encodeURIComponent(course.slug)}`)} className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-full border-2 border-ink bg-white px-4 text-xs font-black">{labelFor(locale, "Podesi u Uči zajedno", "Set up in Study together")}</button>}
                </article>
              ))}
              {commonStudyCourses.status === "CanLoadMore" || commonStudyCourses.status === "LoadingMore" ? <button type="button" disabled={commonStudyCourses.status === "LoadingMore"} onClick={() => commonStudyCourses.loadMore(12)} className="w-full rounded-full border-2 border-ink bg-white px-4 py-2.5 text-xs font-black disabled:opacity-60">{commonStudyCourses.status === "LoadingMore" ? labelFor(locale, "Učitavanje…", "Loading…") : labelFor(locale, "Učitaj još", "Load more")}</button> : null}
              {!commonStudyCourses.results.length && commonStudyCourses.status === "Exhausted" ? <div className="rounded-[16px] border-2 border-dashed border-line p-7 text-center"><BookOpen className="mx-auto size-8 text-muted" /><p className="mt-3 text-sm font-black">{labelFor(locale, "Nemate zajednički aktivan kurs.", "You do not share an active course.")}</p></div> : null}
            </div>
          </div>
        </div>
      ) : null}
      {reportOpen ? <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="profile-report-title"><div ref={reportDialogRef} tabIndex={-1} className="w-full max-w-md rounded-[16px] border-2 border-ink bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-red-700">{labelFor(locale, "Prijava", "Report")}</p><h2 id="profile-report-title" className="mt-1 text-xl font-black">{identity.name}</h2></div><button type="button" autoFocus onClick={() => setReportOpen(false)} className="grid size-10 place-items-center rounded-full border-2 border-ink" aria-label={labelFor(locale, "Zatvori", "Close")}><X className="size-4" /></button></div>{reportSent ? <p role="status" className="mt-4 rounded-[16px] border-2 border-line bg-paper p-4 text-sm font-black">{labelFor(locale, "Prijava je poslata timu za sigurnost.", "The report was sent to the safety team.")}</p> : <><label className="mt-4 block text-sm font-black">{labelFor(locale, "Razlog", "Reason")}<textarea value={reportReason} onChange={(event) => setReportReason(event.target.value)} rows={4} maxLength={1_000} className="mt-2 w-full rounded-[8px] border-2 border-ink bg-white p-3 font-bold" /></label><button type="button" disabled={reportPending || reportReason.trim().length < 3} onClick={async () => { setReportPending(true); try { await reportContent({ targetType: "profile", targetUserId: identity.userId, reason: reportReason }); setReportSent(true); setReportReason(""); } finally { setReportPending(false); } }} className="mt-3 inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black disabled:opacity-50">{reportPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}{labelFor(locale, "Pošalji prijavu", "Send report")}</button></>}</div></div> : null}
    </div>
  );
}
