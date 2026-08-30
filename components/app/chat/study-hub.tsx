/* eslint-disable @next/next/no-img-element */
"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowRight,
  BellRing,
  BookOpenCheck,
  Check,
  ChevronDown,
  Clock3,
  MessageCircle,
  Plus,
  Search,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  UserRoundPlus,
  UsersRound,
  WifiOff,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { t, withLocale } from "@/lib/i18n";

const FOCUS_RING = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const PRIMARY_BUTTON = cn(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black text-ink",
  "shadow-[3px_3px_0_0_var(--ink)] transition-[transform,box-shadow,opacity] hover:-translate-y-0.5",
  "disabled:pointer-events-none disabled:opacity-45",
  FOCUS_RING,
);
const SECONDARY_BUTTON = cn(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-xs font-black text-ink",
  "transition-[transform,background-color,opacity] hover:-translate-y-0.5 hover:bg-paper disabled:pointer-events-none disabled:opacity-45",
  FOCUS_RING,
);


function courseTitle(locale: Locale, course?: { titleSr: string; titleEn: string } | null) {
  if (!course) return "";
  return locale === "sr" ? course.titleSr : course.titleEn;
}

function zoneLabel(locale: Locale, zone?: string) {
  const normalized = zone?.replace("_", "–") ?? "0–25";
  return t(locale, `Zona ${normalized}%`, `${normalized}% zone`);
}

function studyActionError(locale: Locale, error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalized = message.toLocaleLowerCase();

  if (normalized.includes("chat_blocked") || normalized.includes("blokir")) {
    return t(locale, "Ova akcija nije dostupna zbog blokiranja između naloga.", "This action is unavailable because one of the accounts is blocked.");
  }
  if (normalized.includes("rate_limit") || normalized.includes("previše")) {
    return t(locale, "Previše pokušaja odjednom. Sačekaj malo pa pokušaj ponovo.", "Too many attempts at once. Wait a moment and try again.");
  }
  if (normalized.includes("suspend")) {
    return t(locale, "Akcije zajednice trenutno nisu dostupne na ovom nalogu.", "Community actions are currently unavailable for this account.");
  }
  if (normalized.includes("unauthorized")) {
    return t(locale, "Sesija je istekla. Osveži stranicu i prijavi se ponovo.", "Your session expired. Refresh the page and sign in again.");
  }
  if (normalized.includes("forbidden")) {
    return t(locale, "Nemaš dozvolu za ovu akciju.", "You do not have permission for this action.");
  }
  if (normalized.includes("admin nalozi")) {
    return t(locale, "Admin nalog ne može da učestvuje u povezivanju za učenje.", "Admin accounts cannot join study matching.");
  }
  if (normalized.includes("objavljeni kurs nije pronađen")) {
    return t(locale, "Ovaj kurs više nije dostupan za zajedničko učenje.", "This course is no longer available for studying together.");
  }
  if (normalized.includes("napredak kursa je prevelik")) {
    return t(locale, "Napredak na kursu ne može da se učita. Osveži stranicu; ako i dalje ne radi, pokušaj za koji minut.", "Course progress cannot be loaded. Refresh the page; if it still fails, try again in a minute.");
  }
  if (normalized.includes("oba člana moraju biti aktivna") || normalized.includes("uključi traženje partnera")) {
    return t(locale, "Dostupnost za ovaj kurs više nije aktivna. Osveži predloge pa pokušaj ponovo.", "Availability for this course is no longer active. Refresh the suggestions and try again.");
  }
  if (normalized.includes("istoj zoni napretka")) {
    return t(locale, "Zona napretka se promenila. Osveži predloge da vidiš nova poklapanja.", "The progress zone changed. Refresh the suggestions to see new matches.");
  }
  if (normalized.includes("pozvati sebe")) {
    return t(locale, "Ne možeš poslati poziv sopstvenom nalogu.", "You cannot send an invite to your own account.");
  }
  if (normalized.includes("član nije dostupan")) {
    return t(locale, "Ova osoba više nije dostupna za povezivanje na tom kursu.", "This person is no longer available for matching in that course.");
  }
  if (normalized.includes("partnerstvo već postoji") || normalized.includes("partnerstvo je već prihvaćeno")) {
    return t(locale, "Već ste povezani za učenje na ovom kursu.", "You are already study partners in this course.");
  }
  if (normalized.includes("poziv je već na čekanju")) {
    return t(locale, "Poziv je već poslat i čeka odgovor.", "An invite has already been sent and is awaiting a reply.");
  }
  if (normalized.includes("15 dana")) {
    return t(locale, "Novi poziv možeš poslati 15 dana nakon odbijanja.", "You can send another invite 15 days after it was declined.");
  }
  if (normalized.includes("poziv nije pronađen") || normalized.includes("poziv više nije na čekanju")) {
    return t(locale, "Poziv više nije dostupan. Lista će se automatski osvežiti.", "This invite is no longer available. The list will refresh automatically.");
  }
  if (normalized.includes("naziv grupe")) {
    return t(locale, "Naziv grupe mora imati između 1 i 100 znakova.", "The group name must be between 1 and 100 characters.");
  }
  if (normalized.includes("najmanje dva partnera")) {
    return t(locale, "Izaberi najmanje dva partnera za predlog grupe.", "Choose at least two partners for the group proposal.");
  }
  if (normalized.includes("samo postojećim partnerima")) {
    return t(locale, "Grupu možeš predložiti samo aktivnim partnerima sa izabranog kursa.", "You can only propose a group to active partners in the selected course.");
  }
  if (normalized.includes("grupa nije pronađena") || normalized.includes("poziv za grupu nije pronađen")) {
    return t(locale, "Grupa ili poziv više nisu dostupni.", "This group or invite is no longer available.");
  }

  return t(locale, "Nije uspelo. Proveri internet i pokušaj ponovo.", "That did not work. Check your connection and try again.");
}

function useOnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const syncFrame = window.requestAnimationFrame(() => setOnline(window.navigator.onLine));
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.cancelAnimationFrame(syncFrame);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return online;
}

function StudyPulseAvatar({
  avatarUrl,
  name,
  progressPercent,
  size = "md",
}: {
  avatarUrl?: string | null;
  name: string;
  progressPercent?: number;
  size?: "md" | "lg";
}) {
  const diameter = size === "lg" ? 64 : 52;
  const radius = diameter / 2 - 3;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, progressPercent ?? 0));

  return (
    <span
      data-chat-motion="study-pulse"
      data-chat-motion-new="true"
      className={cn("relative block shrink-0", size === "lg" ? "size-16" : "size-[52px]")}
      title={progressPercent === undefined ? name : `${name} · ${progress}%`}
    >
      <svg aria-hidden="true" viewBox={`0 0 ${diameter} ${diameter}`} className="absolute inset-0 size-full -rotate-90 overflow-visible">
        <circle cx={diameter / 2} cy={diameter / 2} r={radius} fill="none" className="stroke-line" strokeWidth="3" />
        <circle
          data-chat-motion-progress=""
          data-chat-motion-progress-length={circumference}
          data-chat-motion-progress-offset={circumference * (1 - progress / 100)}
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          className="stroke-yellow"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress / 100)}
          strokeLinecap="round"
          strokeWidth="4"
        />
      </svg>
      <span className="absolute inset-[5px] overflow-hidden rounded-full border-2 border-ink bg-[#d7e9f5] dark:bg-ink/15">
        <img src={avatarUrl || "/images/avatars/mythic-mentor.png"} alt={name} className="size-full object-cover" />
      </span>
    </span>
  );
}

function SectionHeading({
  icon,
  title,
  description,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  badge?: number;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-[#d7e9f5] dark:bg-ink/15 text-ink">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="type-h3 text-ink">{title}</h2>
          {badge ? <span className="rounded-full bg-ink px-2 py-0.5 font-mono type-caption font-black text-paper-strong">{badge}</span> : null}
        </div>
        {description ? <p className="mt-1 type-body-sm font-bold text-muted">{description}</p> : null}
      </div>
    </div>
  );
}

function LoadingCards({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="grid gap-2">
      {[0, 1].map((index) => (
        <div key={index} className="flex animate-pulse items-center gap-3 rounded-[16px] border-2 border-line bg-paper p-3">
          <span className="size-[52px] rounded-full bg-[#d7e9f5] dark:bg-ink/15" />
          <span className="min-w-0 flex-1 space-y-2"><span className="block h-3 w-2/3 rounded-full bg-line" /><span className="block h-2.5 w-1/2 rounded-full bg-line/70" /></span>
        </div>
      ))}
    </div>
  );
}

function LoadMoreButton({ locale, status, onLoadMore }: { locale: Locale; status: string; onLoadMore: () => void }) {
  if (status !== "CanLoadMore" && status !== "LoadingMore") return null;
  return (
    <button type="button" disabled={status === "LoadingMore"} onClick={onLoadMore} className={cn(SECONDARY_BUTTON, "mt-2 w-full")}>
      {status === "LoadingMore" ? <Spinner /> : <ChevronDown className="size-4" />}
      {t(locale, "Učitaj još", "Load more")}
    </button>
  );
}

export type StudyHubProps = {
  locale: Locale;
  courseSlug?: string;
  onCourseSlugChange?: (courseSlug?: string) => void;
  onOpenConversation?: (conversationId: Id<"chatConversations">) => void;
  className?: string;
};

export function StudyHub(props: StudyHubProps) {
  const profile = useQuery(api.profiles.getViewerProfileStatus, {});

  if (profile === undefined) {
    return (
      <section className={cn("grid min-h-[420px] place-items-center rounded-[16px] border-2 border-line bg-paper-strong", props.className)} aria-busy="true">
        <div className="text-center"><Spinner size="lg" className="mx-auto text-ink" /><p className="mt-3 text-sm font-black text-muted">{t(props.locale, "Pripremamo Uči zajedno…", "Preparing Study together…")}</p></div>
      </section>
    );
  }

  if (profile.isAdmin) {
    return (
      <section className={cn("grid min-h-[420px] place-items-center rounded-[16px] border-2 border-line bg-paper-strong p-6 text-center", props.className)}>
        <div className="max-w-md">
          <span className="mx-auto grid size-14 place-items-center rounded-full border-2 border-ink bg-[#d7e9f5] dark:bg-ink/15"><BookOpenCheck className="size-6" /></span>
          <h1 className="mt-4 type-h1 text-ink">{t(props.locale, "Uči zajedno je namenjeno članovima", "Study together is for members")}</h1>
          <p className="mt-2 type-body-sm font-bold text-muted">{t(props.locale, "Admin nalog ostaje van pronalaženja partnera i studijskih grupa, ali poruke podrške i moderacija ostaju dostupne u Razgovorima.", "Admin accounts stay outside partner matching and study groups, while support messages and moderation remain available in Conversations.")}</p>
        </div>
      </section>
    );
  }

  return <StudyHubMember {...props} />;
}

function StudyHubMember({ locale, courseSlug, onCourseSlugChange, onOpenConversation, className }: StudyHubProps) {
  const router = useRouter();
  const online = useOnlineStatus();
  const coursePage = usePaginatedQuery(api.courses.listPublishedCoursesPage, {}, { initialNumItems: 20 });
  const courses = coursePage.results;
  const summary = useQuery(api.study.getStudyHubSummary, {});
  const [localCourseSlug, setLocalCourseSlug] = useState(courseSlug ?? "");
  const [pendingKey, setPendingKey] = useState<string>();
  const mutationLockRef = useRef(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string }>();
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<Array<Id<"users">>>([]);

  const selectedCourseSlug = onCourseSlugChange ? courseSlug ?? "" : localCourseSlug;

  const selectedCourse = useMemo(
    () => courses.find((course) => course.slug === selectedCourseSlug),
    [courses, selectedCourseSlug],
  );
  const courseId = selectedCourse?._id;
  const activeAvailability = useQuery(
    api.study.getViewerCourseAvailability,
    courseId ? { courseId } : "skip",
  );
  const suggestions = usePaginatedQuery(
    api.study.listPartnerSuggestions,
    courseId && activeAvailability?.active ? { courseId } : "skip",
    { initialNumItems: 8 },
  );
  const incoming = usePaginatedQuery(
    api.study.listViewerPartnerInvites,
    { direction: "incoming", status: "pending" },
    { initialNumItems: 6 },
  );
  const outgoing = usePaginatedQuery(
    api.study.listViewerPartnerInvites,
    { direction: "outgoing", status: "pending" },
    { initialNumItems: 6 },
  );
  const groupInvites = usePaginatedQuery(
    api.study.listViewerStudyGroupInvites,
    { status: "pending" },
    { initialNumItems: 6 },
  );
  const partnerships = usePaginatedQuery(
    api.study.listViewerPartnershipsPage,
    courseId ? { courseId } : {},
    { initialNumItems: 12 },
  );
  const groups = usePaginatedQuery(
    api.study.listViewerStudyGroupsPage,
    courseId ? { courseId } : {},
    { initialNumItems: 10 },
  );

  const setAvailability = useMutation(api.study.setViewerAvailability);
  const invitePartner = useMutation(api.study.createPartnerInvite);
  const respondPartner = useMutation(api.study.respondToPartnerInvite);
  const cancelPartner = useMutation(api.study.cancelPartnerInvite);
  const respondGroup = useMutation(api.study.respondToStudyGroupInvite);
  const createGroup = useMutation(api.study.createStudyGroupProposal);

  const courseById = useMemo(() => new Map(courses.map((course) => [String(course._id), course])), [courses]);
  const pendingInviteCount = summary
    ? summary.pendingPartnerInviteCount + summary.pendingStudyGroupInviteCount
    : incoming.results.length + groupInvites.results.length;
  const mutationsLocked = Boolean(pendingKey) || !online;

  useEffect(() => {
    if (!selectedCourseSlug || selectedCourse || coursePage.status !== "CanLoadMore") return;
    coursePage.loadMore(20);
  }, [coursePage, selectedCourse, selectedCourseSlug]);

  function chooseCourse(nextSlug: string) {
    setLocalCourseSlug(nextSlug);
    setGroupMembers([]);
    setGroupName("");
    setNotice(undefined);
    onCourseSlugChange?.(nextSlug || undefined);
  }

  function openConversation(conversationId?: Id<"chatConversations"> | null) {
    if (!conversationId) return;
    if (onOpenConversation) onOpenConversation(conversationId);
    else router.push(withLocale(locale, `/app/messages/${conversationId}`));
  }

  async function perform(key: string, action: () => Promise<unknown>, success?: string) {
    if (mutationLockRef.current) return;
    if (!online || !window.navigator.onLine) {
      setNotice({ tone: "error", text: t(locale, "Nema internet veze. Akcija će biti dostupna kada se ponovo povežeš.", "You are offline. This action will be available when you reconnect.") });
      return;
    }
    mutationLockRef.current = true;
    setPendingKey(key);
    setNotice(undefined);
    try {
      await action();
      if (success) setNotice({ tone: "success", text: success });
    } catch (error) {
      setNotice({ tone: "error", text: studyActionError(locale, error) });
    } finally {
      mutationLockRef.current = false;
      setPendingKey(undefined);
    }
  }

  async function submitGroup() {
    if (!courseId || groupMembers.length < 2 || !groupName.trim()) return;
    await perform(
      "create-group",
      async () => {
        await createGroup({ courseId, name: groupName, memberIds: groupMembers });
        setGroupName("");
        setGroupMembers([]);
      },
      t(locale, "Predlog grupe je poslat partnerima.", "The group proposal was sent to your partners."),
    );
  }

  return (
    <section data-chat-motion-surface="panel" aria-busy={Boolean(pendingKey)} className={cn("h-full min-h-0 overflow-y-auto rounded-[16px] border-2 border-ink bg-paper text-ink", className)}>
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-paper/95 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-ink bg-[#d7e9f5] dark:bg-ink/15 shadow-[3px_3px_0_0_var(--yellow)]"><BookOpenCheck className="size-5" /></span>
            <div className="min-w-0">
              <p className="type-eyebrow text-blue-mid dark:text-muted">{t(locale, "Isti tempo. Zajednički cilj.", "Same pace. Shared goal.")}</p>
              <h1 className="mt-2 type-h1">{t(locale, "Uči zajedno", "Study together")}</h1>
              <p className="mt-1 max-w-2xl type-body-sm font-bold text-muted">{t(locale, "Pronađi osobu u svojoj zoni napretka, prihvati poziv i nastavite u privatnom ili grupnom razgovoru.", "Find a person in your progress zone, accept an invite, and continue in a private or group conversation.")}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2" aria-label={t(locale, "Pregled aktivnosti", "Activity summary")} aria-live="polite">
            <span className="inline-flex items-center gap-2 rounded-full border-2 border-line bg-paper-strong px-3 py-2 text-xs font-black"><UserRoundPlus className="size-4" /><span className="font-mono">{summary?.activePartnershipCount ?? "—"}</span> {t(locale, "partnera", "partners")}</span>
            <span className="inline-flex items-center gap-2 rounded-full border-2 border-line bg-paper-strong px-3 py-2 text-xs font-black"><UsersRound className="size-4" /><span className="font-mono">{summary?.activeStudyGroupCount ?? "—"}</span> {t(locale, "grupa", "groups")}</span>
            <span className="inline-flex items-center gap-2 rounded-full border-2 border-line bg-paper-strong px-3 py-2 text-xs font-black"><BellRing className="size-4" />{pendingInviteCount} {t(locale, "novih poziva", "new invites")}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        {!online ? (
          <div role="status" className="flex items-center gap-3 rounded-[16px] border-2 border-[#b26a00] bg-[#fff4d6] dark:bg-yellow/15 px-4 py-3 text-sm font-black text-[#6d4300]">
            <WifiOff className="size-5 shrink-0" />
            <span>{t(locale, "Van mreže si. Možeš da pregledaš učitane podatke, a akcije će biti dostupne po povratku veze.", "You are offline. You can browse loaded data; actions return when your connection does.")}</span>
          </div>
        ) : null}

        {notice ? (
          <div data-chat-motion="request" data-chat-motion-new="true" role={notice.tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-[16px] border-2 px-4 py-3 text-sm font-black", notice.tone === "error" ? "border-red-500 bg-red-50 text-red-800" : "border-[#4b8560] bg-[#eef9f1] text-[#245436]")}>
            {notice.tone === "error" ? <X className="mt-0.5 size-4 shrink-0" /> : <Check className="mt-0.5 size-4 shrink-0" />}
            <span className="min-w-0 flex-1">{notice.text}</span>
            <button type="button" onClick={() => setNotice(undefined)} aria-label={t(locale, "Zatvori obaveštenje", "Dismiss notice")} className={cn("grid size-7 shrink-0 place-items-center rounded-full", FOCUS_RING)}><X className="size-4" /></button>
          </div>
        ) : null}

        <section className="rounded-[16px] border-2 border-ink bg-paper-strong p-4 shadow-[5px_5px_0_0_rgba(112,167,207,0.45)] sm:p-6">
          <div className="grid items-end gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <label className="block text-sm font-black text-ink">
                {t(locale, "Kurs za zajedničko učenje", "Course to study together")}
                <span className="relative mt-2 block">
                  <select
                    id="study-course-select"
                    value={selectedCourseSlug}
                    onChange={(event) => chooseCourse(event.target.value)}
                    disabled={coursePage.status === "LoadingFirstPage" || Boolean(pendingKey)}
                    className={cn("h-12 w-full appearance-none rounded-[8px] border-2 border-ink bg-paper px-4 pr-11 text-sm font-black text-ink disabled:opacity-50", FOCUS_RING)}
                  >
                    <option value="">{t(locale, "Svi kursevi", "All courses")}</option>
                    {courses.map((course) => <option key={course._id} value={course.slug}>{courseTitle(locale, course)}</option>)}
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2" />
                </span>
              </label>
              {coursePage.status === "CanLoadMore" ? <button type="button" onClick={() => coursePage.loadMore(20)} className={cn("mt-2 min-h-9 rounded-full border border-ink bg-paper-strong px-3 type-caption font-black", FOCUS_RING)}>{t(locale, "Učitaj još kurseva", "Load more courses")}</button> : null}
            </div>

            <button
              type="button"
              aria-pressed={Boolean(activeAvailability?.active)}
              disabled={!courseId || activeAvailability === undefined || mutationsLocked}
              onClick={() => courseId ? void perform(
                "availability",
                () => setAvailability({ courseId, active: !activeAvailability?.active }),
                activeAvailability?.active
                  ? t(locale, "Traženje partnera je isključeno za ovaj kurs.", "Partner matching is off for this course.")
                  : t(locale, "Traženje partnera je uključeno za ovaj kurs.", "Partner matching is on for this course."),
              ) : undefined}
              className={cn(
                "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-ink px-5 text-sm font-black disabled:pointer-events-none disabled:opacity-45",
                activeAvailability?.active ? "bg-ink text-paper-strong" : "bg-yellow text-ink",
                FOCUS_RING,
              )}
            >
              {pendingKey === "availability" ? <Spinner size="md" /> : activeAvailability?.active ? <ToggleRight className="size-5" /> : <ToggleLeft className="size-5" />}
              {activeAvailability?.active ? t(locale, "Dostupnost je uključena", "Availability is on") : t(locale, "Uključi dostupnost", "Turn on availability")}
            </button>
          </div>

          {courseId ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t-2 border-line pt-4">
              {activeAvailability?.active ? (
                <>
                  <span className="rounded-full border-2 border-[#70a7cf] dark:border-line bg-[#d7e9f5] dark:bg-ink/15 px-3 py-1.5 text-xs font-black text-ink">{zoneLabel(locale, activeAvailability.progressZone)}</span>
                  <span className="rounded-full border-2 border-line bg-paper px-3 py-1.5 font-mono text-xs font-black">{activeAvailability.progressPercent}%</span>
                  <p className="text-xs font-bold text-muted">{t(locale, "Predlozi prikazuju samo članove u istoj zoni.", "Suggestions only show members in the same zone.")}</p>
                </>
              ) : (
                <p className="text-xs font-bold text-muted">{t(locale, "Uključi dostupnost kada želiš da se pojaviš osobama iz iste zone napretka.", "Turn on availability when you want people in the same progress zone to find you.")}</p>
              )}
            </div>
          ) : (
            <p className="mt-4 border-t-2 border-line pt-4 text-xs font-bold text-muted">{t(locale, "Izaberi konkretan kurs da uključiš dostupnost i dobiješ predloge partnera.", "Choose a specific course to enable availability and get partner suggestions.")}</p>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(340px,0.88fr)]">
          <section id="study-suggestions" tabIndex={-1} className="scroll-mt-28 rounded-[16px] border-2 border-line bg-paper-strong p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:p-6">
            <SectionHeading icon={<Search className="size-5" />} title={t(locale, "Partneri u tvojoj zoni", "Partners in your zone")} description={t(locale, "Study Pulse prsten pokazuje napredak na kursu za svaku osobu iz tvoje zone.", "The Study Pulse ring shows course progress for each person in your zone.")} />
            <div className="mt-4 grid gap-2">
              {!courseId || !activeAvailability?.active ? (
                <EmptyState
                  icon={Sparkles}
                  title={t(locale, "Prvo izaberi kurs", "Choose a course first")}
                  body={t(locale, "Izaberi kurs i uključi dostupnost da vidiš osobe koje uče sličnim tempom.", "Choose a course and turn on availability to see people learning at a similar pace.")}
                  action={<button type="button" onClick={() => document.getElementById("study-course-select")?.focus()} className={SECONDARY_BUTTON}>{t(locale, "Izaberi kurs", "Choose a course")}</button>}
                />
              ) : suggestions.status === "LoadingFirstPage" ? (
                <LoadingCards label={t(locale, "Učitavanje predloga partnera", "Loading partner suggestions")} />
              ) : suggestions.results.length === 0 ? (
                <EmptyState icon={Search} title={t(locale, "Još nema poklapanja", "No matches yet")} body={t(locale, "Tvoja dostupnost je uključena. Nova poklapanja će se pojaviti kada neko uđe u istu zonu napretka.", "Your availability is on. New matches appear when someone enters the same progress zone.")} />
              ) : suggestions.results.map((person) => (
                <article key={person.userId} data-study-pulse="card" className="group flex items-center gap-3 rounded-[16px] border-2 border-line bg-paper p-3 transition-[border-color,background-color] hover:border-[#70a7cf] dark:hover:border-line hover:bg-paper-strong">
                  <Link href={withLocale(locale, `/app/members/${person.username}`)} className={cn("rounded-full", FOCUS_RING)}><StudyPulseAvatar avatarUrl={person.avatarUrl} name={person.name} progressPercent={person.progressPercent} /></Link>
                  <div className="min-w-0 flex-1">
                    <Link href={withLocale(locale, `/app/members/${person.username}`)} className={cn("block truncate text-sm font-black text-ink hover:underline", FOCUS_RING)}>{person.name}</Link>
                    <p className="truncate text-xs font-bold text-muted">@{person.username} · {zoneLabel(locale, person.progressZone)}</p>
                  </div>
                  <span className="hidden rounded-full border border-line bg-paper-strong px-2 py-1 font-mono type-caption font-black sm:inline-flex">{person.progressPercent}%</span>
                  <button
                    type="button"
                    disabled={mutationsLocked}
                    onClick={() => courseId ? void perform(`invite-${person.userId}`, () => invitePartner({ recipientId: person.userId, courseId }), t(locale, `Poziv za zajedničko učenje je poslat: ${person.name}.`, `Study invite sent to ${person.name}.`)) : undefined}
                    className={cn("grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow disabled:opacity-45", FOCUS_RING)}
                    aria-label={t(locale, `Pozovi ${person.name} da učite zajedno`, `Invite ${person.name} to study together`)}
                  >
                    {pendingKey === `invite-${person.userId}` ? <Spinner /> : <UserRoundPlus className="size-4" />}
                  </button>
                </article>
              ))}
              <LoadMoreButton locale={locale} status={suggestions.status} onLoadMore={() => suggestions.loadMore(8)} />
            </div>
          </section>

          <section className="rounded-[16px] border-2 border-line bg-paper-strong p-4 sm:p-6">
            <SectionHeading icon={<BellRing className="size-5" />} title={t(locale, "Pozivi", "Invites")} description={t(locale, "Odgovori na poziv ili proveri šta je još na čekanju.", "Respond to an invite or review what is still pending.")} badge={pendingInviteCount} />
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="mb-2 type-eyebrow text-blue-mid dark:text-muted">{t(locale, "Dolazni", "Incoming")}</h3>
                <div className="space-y-2">
                  {incoming.status === "LoadingFirstPage" || groupInvites.status === "LoadingFirstPage" ? <LoadingCards label={t(locale, "Učitavanje dolaznih poziva", "Loading incoming invites")} /> : null}
                  {incoming.results.map((invite) => (
                    <article key={invite.inviteId} className="rounded-[16px] border-2 border-line bg-paper p-3">
                      <div className="flex items-center gap-3">
                        <StudyPulseAvatar avatarUrl={invite.counterpart.avatarUrl} name={invite.counterpart.name} />
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{invite.counterpart.name}</p><p className="truncate text-xs font-bold text-muted">{courseTitle(locale, invite.course)}</p></div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" disabled={mutationsLocked} onClick={() => void perform(String(invite.inviteId), async () => { const result = await respondPartner({ inviteId: invite.inviteId, decision: "accept" }); openConversation(result.conversationId); }, t(locale, "Partnerstvo je prihvaćeno.", "Partnership accepted."))} className={cn(PRIMARY_BUTTON, "min-h-10 px-3 text-xs shadow-none")}>{pendingKey === String(invite.inviteId) ? <Spinner /> : <Check className="size-4" />}{t(locale, "Prihvati", "Accept")}</button>
                        <button type="button" disabled={mutationsLocked} onClick={() => void perform(String(invite.inviteId), () => respondPartner({ inviteId: invite.inviteId, decision: "decline" }))} className={SECONDARY_BUTTON}><X className="size-4" />{t(locale, "Odbij", "Decline")}</button>
                      </div>
                    </article>
                  ))}
                  {groupInvites.results.map((invite) => (
                    <article key={invite.inviteId} className="rounded-[16px] border-2 border-[#70a7cf] dark:border-line bg-[#eef6fb] dark:bg-ink/10 p-3">
                      <p className="type-eyebrow-sm text-blue-mid dark:text-muted">{t(locale, "Poziv u studijsku grupu", "Study group invite")}</p>
                      <p className="mt-1 truncate text-sm font-black">{invite.group.name}</p>
                      <p className="mt-0.5 truncate text-xs font-bold text-muted">{invite.inviter.name} · {courseTitle(locale, invite.course)}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" disabled={mutationsLocked} onClick={() => void perform(String(invite.inviteId), async () => { const result = await respondGroup({ inviteId: invite.inviteId, decision: "accept" }); openConversation(result.conversationId); }, t(locale, "Poziv u grupu je prihvaćen.", "Group invite accepted."))} className={cn(PRIMARY_BUTTON, "min-h-10 px-3 text-xs shadow-none")}>{pendingKey === String(invite.inviteId) ? <Spinner /> : <Check className="size-4" />}{t(locale, "Prihvati", "Accept")}</button>
                        <button type="button" disabled={mutationsLocked} onClick={() => void perform(String(invite.inviteId), () => respondGroup({ inviteId: invite.inviteId, decision: "decline" }))} className={SECONDARY_BUTTON}><X className="size-4" />{t(locale, "Odbij", "Decline")}</button>
                      </div>
                    </article>
                  ))}
                  {incoming.status !== "LoadingFirstPage" && groupInvites.status !== "LoadingFirstPage" && incoming.results.length + groupInvites.results.length === 0 ? <EmptyState icon={Check} title={t(locale, "Sve je sređeno", "You’re all caught up")} body={t(locale, "Nema novih poziva za partnerstvo ili studijsku grupu.", "There are no new partnership or study group invites.")} /> : null}
                  <LoadMoreButton locale={locale} status={incoming.status} onLoadMore={() => incoming.loadMore(6)} />
                  <LoadMoreButton locale={locale} status={groupInvites.status} onLoadMore={() => groupInvites.loadMore(6)} />
                </div>
              </div>

              <div className="border-t-2 border-line pt-4">
                <h3 className="mb-2 type-eyebrow text-muted">{t(locale, "Poslati", "Sent")}</h3>
                <div className="space-y-2">
                  {outgoing.results.map((invite) => (
                    <article key={invite.inviteId} className="flex items-center gap-3 rounded-[16px] border-2 border-line bg-paper-strong p-3">
                      <StudyPulseAvatar avatarUrl={invite.counterpart.avatarUrl} name={invite.counterpart.name} />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{invite.counterpart.name}</p><p className="flex items-center gap-1 truncate text-xs font-bold text-muted"><Clock3 className="size-3" />{t(locale, "Čeka odgovor", "Awaiting reply")}</p></div>
                      <button type="button" disabled={mutationsLocked} onClick={() => void perform(String(invite.inviteId), () => cancelPartner({ inviteId: invite.inviteId }), t(locale, "Poziv je otkazan.", "Invite cancelled."))} className={cn(SECONDARY_BUTTON, "min-h-9 px-3")}>{pendingKey === String(invite.inviteId) ? <Spinner /> : null}{t(locale, "Otkaži", "Cancel")}</button>
                    </article>
                  ))}
                  {outgoing.status !== "LoadingFirstPage" && outgoing.results.length === 0 ? <p className="rounded-[16px] bg-paper px-3 py-4 text-center text-xs font-bold text-muted">{t(locale, "Nema poziva koji čekaju odgovor.", "No sent invites are awaiting a reply.")}</p> : null}
                  <LoadMoreButton locale={locale} status={outgoing.status} onLoadMore={() => outgoing.loadMore(6)} />
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-[16px] border-2 border-line bg-paper-strong p-4 sm:p-6">
          <SectionHeading icon={<MessageCircle className="size-5" />} title={t(locale, "Moji partneri", "My partners")} description={t(locale, "Nastavi u razgovoru ili izaberi partnere za novu studijsku grupu.", "Continue in chat or choose partners for a new study group.")} />
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {partnerships.status === "LoadingFirstPage" ? <div className="md:col-span-2 xl:col-span-3"><LoadingCards label={t(locale, "Učitavanje partnerstava", "Loading partnerships")} /></div> : null}
            {partnerships.results.map((partnership) => {
              const relatedCourse = courseById.get(String(partnership.courseId));
              const selected = groupMembers.includes(partnership.partner.userId);
              return (
                <article key={partnership.partnershipId} data-chat-motion="member" data-chat-motion-new="true" className={cn("flex items-center gap-3 rounded-[16px] border-2 p-3", selected ? "border-ink bg-[#eef6fb] dark:bg-ink/10" : "border-line bg-paper")}>
                  <StudyPulseAvatar avatarUrl={partnership.partner.avatarUrl} name={partnership.partner.name} />
                  <div className="min-w-0 flex-1">
                    <Link href={withLocale(locale, `/app/members/${partnership.partner.username}`)} className={cn("block truncate text-sm font-black hover:underline", FOCUS_RING)}>{partnership.partner.name}</Link>
                    <p className="truncate text-xs font-bold text-muted">{courseTitle(locale, relatedCourse) || `@${partnership.partner.username}`}</p>
                  </div>
                  {courseId ? (
                    <button type="button" aria-pressed={selected} onClick={() => setGroupMembers((members) => selected ? members.filter((id) => id !== partnership.partner.userId) : [...members, partnership.partner.userId])} className={cn("grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink", selected ? "bg-ink text-paper-strong" : "bg-paper-strong", FOCUS_RING)} aria-label={selected ? t(locale, `Ukloni ${partnership.partner.name} iz predloga grupe`, `Remove ${partnership.partner.name} from group proposal`) : t(locale, `Dodaj ${partnership.partner.name} u predlog grupe`, `Add ${partnership.partner.name} to group proposal`)}>{selected ? <Check className="size-4" /> : <Plus className="size-4" />}</button>
                  ) : null}
                  <button type="button" onClick={() => openConversation(partnership.conversationId)} disabled={!partnership.conversationId} className={cn("grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow disabled:opacity-40", FOCUS_RING)} aria-label={t(locale, `Otvori razgovor sa ${partnership.partner.name}`, `Open chat with ${partnership.partner.name}`)}><MessageCircle className="size-4" /></button>
                </article>
              );
            })}
            {partnerships.status !== "LoadingFirstPage" && partnerships.results.length === 0 ? <div className="md:col-span-2 xl:col-span-3"><EmptyState icon={UserRoundPlus} title={t(locale, "Još nema partnerstava", "No partnerships yet")} body={t(locale, "Pošalji poziv iz predloga iznad. Kada poziv bude prihvaćen, razgovor se otvara automatski.", "Send an invite from the suggestions above. Once accepted, the conversation opens automatically.")} action={<button type="button" onClick={() => document.getElementById("study-suggestions")?.focus()} className={SECONDARY_BUTTON}><Search className="size-4" />{t(locale, "Pronađi partnera", "Find a partner")}</button>} /></div> : null}
          </div>
          <LoadMoreButton locale={locale} status={partnerships.status} onLoadMore={() => partnerships.loadMore(12)} />

          {courseId && partnerships.results.length >= 2 ? (
            <div className="mt-5 rounded-[16px] border-2 border-ink bg-[#fff8df] dark:bg-yellow/15 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="flex items-center gap-2 type-h4"><UsersRound className="size-5" />{t(locale, "Napravi studijsku grupu", "Create a study group")}</h3><p className="mt-1 max-w-2xl type-caption font-bold text-muted">{t(locale, "Izaberi najmanje dva partnera. Grupni razgovor se aktivira kada vas bude najmanje troje.", "Choose at least two partners. The group conversation activates once at least three people accept.")}</p></div>
                <span className="rounded-full border-2 border-ink bg-paper-strong px-3 py-1.5 font-mono text-xs font-black">{groupMembers.length}/2+</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="block"><span className="sr-only">{t(locale, "Naziv studijske grupe", "Study group name")}</span><input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={100} placeholder={t(locale, "Naziv grupe", "Group name")} className={cn("h-11 w-full rounded-[8px] border-2 border-ink bg-paper-strong px-3 text-sm font-black", FOCUS_RING)} /></label>
                <button type="button" disabled={mutationsLocked || groupMembers.length < 2 || !groupName.trim()} onClick={() => void submitGroup()} className={PRIMARY_BUTTON}>{pendingKey === "create-group" ? <Spinner /> : <ArrowRight className="size-4" />}{t(locale, "Pošalji predlog", "Send proposal")}</button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-[16px] border-2 border-line bg-paper-strong p-4 sm:p-6">
          <SectionHeading icon={<UsersRound className="size-5" />} title={t(locale, "Studijske grupe", "Study groups")} description={t(locale, "Aktivne grupe imaju zajednički razgovor; predlozi čekaju najmanje tri prihvatanja.", "Active groups have a shared conversation; proposals wait for at least three acceptances.")} />
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {groups.status === "LoadingFirstPage" ? <div className="md:col-span-2"><LoadingCards label={t(locale, "Učitavanje studijskih grupa", "Loading study groups")} /></div> : null}
            {groups.results.map((group) => (
              <article key={group.groupId} data-chat-motion="member" data-chat-motion-new="true" className="flex items-center gap-3 rounded-[16px] border-2 border-line bg-paper p-3">
                <span className="grid size-[52px] shrink-0 place-items-center rounded-full border-2 border-ink bg-[#d7e9f5] dark:bg-ink/15"><UsersRound className="size-5" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{group.name}</p><p className="truncate text-xs font-bold text-muted">{courseTitle(locale, group.course)} · <span className="font-mono">{group.activeMemberCount}</span> {t(locale, "članova", "members")}</p></div>
                <span className={cn("hidden rounded-full px-2 py-1 type-caption font-black sm:inline-flex", group.status === "active" ? "bg-[#dcefe1] text-[#245436]" : "bg-[#fff0bd] dark:bg-yellow/15 text-[#6d4300]")}>{group.status === "active" ? t(locale, "Aktivna", "Active") : t(locale, "Formira se", "Forming")}</span>
                {group.conversationId ? <button type="button" onClick={() => openConversation(group.conversationId)} className={cn("grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow", FOCUS_RING)} aria-label={t(locale, `Otvori grupni razgovor ${group.name}`, `Open ${group.name} group chat`)}><MessageCircle className="size-4" /></button> : null}
              </article>
            ))}
            {groups.status !== "LoadingFirstPage" && groups.results.length === 0 ? <div className="md:col-span-2"><EmptyState icon={UsersRound} title={t(locale, "Još nema studijskih grupa", "No study groups yet")} body={t(locale, "Kada imaš najmanje dva partnera na kursu, izaberi ih iznad i pošalji predlog grupe.", "Once you have at least two partners in a course, select them above and send a group proposal.")} /></div> : null}
          </div>
          <LoadMoreButton locale={locale} status={groups.status} onLoadMore={() => groups.loadMore(10)} />
        </section>
      </div>
    </section>
  );
}
