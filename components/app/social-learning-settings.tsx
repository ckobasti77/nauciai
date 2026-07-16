/* eslint-disable @next/next/no-img-element */
"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  BookOpenCheck,
  Check,
  HandHeart,
  Loader2,
  MessageCircle,
  Plus,
  Search,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { openChatDock } from "@/components/app/chat/chat-dock";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

type HelpMode = "seeking" | "offering" | "both";
type HelpTopicDraft = {
  topicId: Id<"helpTopics">;
  name: string;
  courseId?: Id<"courses">;
  mode: HelpMode;
};

function labelFor(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr : en;
}

function modeLabel(locale: Locale, mode: HelpMode) {
  if (mode === "seeking") return labelFor(locale, "Tražim pomoć", "Looking for help");
  if (mode === "offering") return labelFor(locale, "Mogu da pomognem", "I can help");
  return labelFor(locale, "Oboje", "Both");
}

function avatar(src?: string, name?: string) {
  return (
    <img
      src={src || "/images/avatars/mythic-mentor.png"}
      alt=""
      className="size-11 shrink-0 rounded-full border-2 border-ink object-cover"
      title={name}
    />
  );
}

function PendingTopicRow({ locale, suggestion }: { locale: Locale; suggestion: { _id: Id<"helpTopicSuggestions">; name: string; courseId?: Id<"courses"> } }) {
  const review = useMutation(api.helpTopics.reviewSuggestion);
  const topics = useQuery(api.helpTopics.listActiveTopics, suggestion.courseId ? { courseId: suggestion.courseId } : {});
  const [pending, setPending] = useState(false);
  const [mergeTopicId, setMergeTopicId] = useState("");
  const sameScopeTopics = (topics ?? []).filter((topic) => topic.courseId === suggestion.courseId);

  async function decide(decision: "approve" | "reject" | "merge") {
    setPending(true);
    try {
      await review({
        suggestionId: suggestion._id,
        decision,
        ...(decision === "merge" ? { topicId: mergeTopicId as Id<"helpTopics"> } : {}),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="rounded-[16px] border-2 border-line bg-paper p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1"><span className="block truncate font-black text-ink">{suggestion.name}</span><span className="block text-xs font-bold text-muted">{suggestion.courseId ? labelFor(locale, "Tema kursa", "Course topic") : labelFor(locale, "Globalna tema", "Global topic")}</span></span>
        <button type="button" disabled={pending} onClick={() => void decide("approve")} className="inline-flex min-h-10 items-center gap-1 rounded-full border-2 border-ink bg-yellow px-3 text-xs font-black disabled:opacity-50"><Check className="size-4" />{labelFor(locale, "Odobri", "Approve")}</button>
        <button type="button" disabled={pending} onClick={() => void decide("reject")} className="inline-flex min-h-10 items-center gap-1 rounded-full border-2 border-ink bg-white px-3 text-xs font-black disabled:opacity-50"><X className="size-4" />{labelFor(locale, "Odbij", "Reject")}</button>
      </div>
      {sameScopeTopics.length ? <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3"><select value={mergeTopicId} onChange={(event) => setMergeTopicId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-[8px] border-2 border-ink bg-white px-2 text-xs font-black"><option value="">{labelFor(locale, "Spoji sa postojećom…", "Merge into existing…")}</option>{sameScopeTopics.map((topic) => <option key={topic.topicId} value={topic.topicId}>{topic.name}</option>)}</select><button type="button" disabled={pending || !mergeTopicId} onClick={() => void decide("merge")} className="rounded-full border-2 border-ink bg-white px-4 text-xs font-black disabled:opacity-50">{labelFor(locale, "Spoji", "Merge")}</button></div> : null}
    </article>
  );
}

function HelpTopicModeration({ locale }: { locale: Locale }) {
  const suggestions = usePaginatedQuery(api.helpTopics.listPendingSuggestions, {}, { initialNumItems: 10 });

  return (
    <section className="rounded-[16px] border-2 border-ink bg-white p-4 shadow-[4px_4px_0_0_rgba(14,49,88,0.1)] sm:p-5">
      <p className="text-xs font-black uppercase text-[#2e6f9f]">Admin</p>
      <h3 className="mt-1 text-xl font-black text-ink">
        {labelFor(locale, "Predlozi tema na čekanju", "Pending topic suggestions")}
      </h3>
      <div className="mt-4 space-y-2">
        {suggestions.results.map((suggestion) => <PendingTopicRow key={suggestion._id} locale={locale} suggestion={suggestion} />)}
        {suggestions.status !== "LoadingFirstPage" && suggestions.results.length === 0 ? (
          <p className="rounded-[16px] border-2 border-dashed border-line p-5 text-center text-sm font-bold text-muted">
            {labelFor(locale, "Nema predloga na čekanju.", "No pending suggestions.")}
          </p>
        ) : null}
        {suggestions.status === "CanLoadMore" ? (
          <button type="button" onClick={() => suggestions.loadMore(10)} className="w-full rounded-full border-2 border-ink bg-white px-4 py-2 text-xs font-black">
            {labelFor(locale, "Učitaj još", "Load more")}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function HelpSettings({ locale, isAdmin }: { locale: Locale; isAdmin: boolean }) {
  const courses = useQuery(api.courses.listPublishedCourses, {});
  const profile = useQuery(api.helpTopics.getViewerHelpProfile, {});
  const [scopeCourseId, setScopeCourseId] = useState("");
  const activeTopics = useQuery(api.helpTopics.listActiveTopics, scopeCourseId ? { courseId: scopeCourseId as Id<"courses"> } : {});
  const saveProfile = useMutation(api.helpTopics.setViewerHelpProfile);
  const proposeTopic = useMutation(api.helpTopics.proposeTopic);
  const [draft, setDraft] = useState<{ status: HelpMode | null; topics: HelpTopicDraft[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [proposal, setProposal] = useState("");
  const [proposing, setProposing] = useState(false);

  const current = draft ?? (profile ? { status: profile.status, topics: profile.topics as HelpTopicDraft[] } : { status: null, topics: [] });
  const visibleTopics = useMemo(() => {
    const byId = new Map<string, HelpTopicDraft>();
    for (const topic of current.topics) byId.set(String(topic.topicId), topic);
    for (const topic of activeTopics ?? []) {
      const existing = byId.get(String(topic.topicId));
      byId.set(String(topic.topicId), existing ?? { ...topic, mode: current.status ?? "both" });
    }
    return [...byId.values()];
  }, [activeTopics, current.status, current.topics]);

  function selected(topicId: Id<"helpTopics">) {
    return current.topics.some((topic) => topic.topicId === topicId);
  }

  function toggleTopic(topic: HelpTopicDraft) {
    setNotice(null);
    if (selected(topic.topicId)) {
      setDraft({ ...current, topics: current.topics.filter((item) => item.topicId !== topic.topicId) });
      return;
    }
    if (current.topics.length >= 5) {
      setNotice(labelFor(locale, "Možeš izabrati najviše pet aktivnih tema.", "You can select up to five active topics."));
      return;
    }
    const status = current.status ?? "both";
    setDraft({ status, topics: [...current.topics, { ...topic, mode: status }] });
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      await saveProfile({
        status: current.status,
        topics: current.topics.map((topic) => ({ topicId: topic.topicId, mode: topic.mode })),
      });
      setDraft({ status: current.status, topics: current.topics });
      setNotice(labelFor(locale, "Status i teme su sačuvani.", "Your status and topics were saved."));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : labelFor(locale, "Čuvanje nije uspelo.", "Saving failed."));
    } finally {
      setSaving(false);
    }
  }

  async function propose() {
    if (!proposal.trim()) return;
    setProposing(true);
    setNotice(null);
    try {
      const result = await proposeTopic({
        name: proposal,
        ...(scopeCourseId ? { courseId: scopeCourseId as Id<"courses"> } : {}),
      });
      setProposal("");
      setNotice(
        result.status === "existing"
          ? labelFor(locale, "Tema već postoji i možeš je izabrati.", "That topic already exists and can be selected.")
          : labelFor(locale, "Predlog je poslat Adminu. Neće biti javan dok ne bude odobren.", "The suggestion was sent to an Admin and stays private until approved."),
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : labelFor(locale, "Predlog nije poslat.", "The suggestion was not sent."));
    } finally {
      setProposing(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[16px] border-2 border-ink bg-white p-4 shadow-[5px_5px_0_0_rgba(244,190,48,0.7)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow"><HandHeart className="size-5" /></span>
          <div>
            <h2 className="text-2xl font-black text-ink">{labelFor(locale, "Pomoć zajednice", "Community help")}</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-muted">{labelFor(locale, "Izaberi status i do pet odobrenih tema. Predložene teme ostaju privatne do Admin odluke.", "Choose a status and up to five approved topics. Suggestions remain private until an Admin reviews them.")}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label={labelFor(locale, "Status pomoći", "Help status")}>
          {(["seeking", "offering", "both"] as HelpMode[]).map((mode) => (
            <button key={mode} type="button" onClick={() => setDraft({ status: mode, topics: current.topics })} className={cn("rounded-full border-2 border-ink px-4 py-2 text-xs font-black", current.status === mode ? "bg-ink text-white" : "bg-white text-ink")}>
              {modeLabel(locale, mode)}
            </button>
          ))}
          <button type="button" onClick={() => setDraft({ status: null, topics: [] })} className={cn("rounded-full border-2 border-ink px-4 py-2 text-xs font-black", current.status === null ? "bg-ink text-white" : "bg-white text-ink")}>
            {labelFor(locale, "Isključeno", "Off")}
          </button>
        </div>

        <label className="mt-5 block text-sm font-black text-ink">
          {labelFor(locale, "Prikaži teme", "Show topics")}
          <select value={scopeCourseId} onChange={(event) => setScopeCourseId(event.target.value)} className="mt-2 h-11 w-full rounded-[8px] border-2 border-ink bg-white px-3 font-bold sm:max-w-md">
            <option value="">{labelFor(locale, "Globalne teme", "Global topics")}</option>
            {(courses ?? []).map((course) => <option key={course._id} value={course._id}>{locale === "sr" ? course.titleSr : course.titleEn}</option>)}
          </select>
        </label>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {visibleTopics.map((topic) => {
            const checked = selected(topic.topicId);
            const selectedTopic = current.topics.find((item) => item.topicId === topic.topicId);
            return (
              <div key={topic.topicId} className={cn("rounded-[16px] border-2 p-3", checked ? "border-ink bg-yellow/20" : "border-line bg-paper")}>
                <button type="button" onClick={() => toggleTopic(topic)} className="flex w-full items-center gap-3 text-left">
                  <span className={cn("grid size-6 place-items-center rounded-full border-2 border-ink", checked ? "bg-yellow" : "bg-white")}>{checked ? <Check className="size-4" /> : null}</span>
                  <span className="min-w-0 flex-1 truncate font-black text-ink">{topic.name}</span>
                </button>
                {checked && selectedTopic ? (
                  <select value={selectedTopic.mode} onChange={(event) => setDraft({ ...current, topics: current.topics.map((item) => item.topicId === topic.topicId ? { ...item, mode: event.target.value as HelpMode } : item) })} className="mt-3 h-9 w-full rounded-[8px] border-2 border-ink bg-white px-2 text-xs font-black">
                    <option value="seeking">{modeLabel(locale, "seeking")}</option>
                    <option value="offering">{modeLabel(locale, "offering")}</option>
                    <option value="both">{modeLabel(locale, "both")}</option>
                  </select>
                ) : null}
              </div>
            );
          })}
          {activeTopics !== undefined && visibleTopics.length === 0 ? <p className="rounded-[16px] border-2 border-dashed border-line p-5 text-sm font-bold text-muted">{labelFor(locale, "Još nema odobrenih tema u ovom opsegu.", "There are no approved topics in this scope yet.")}</p> : null}
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input value={proposal} onChange={(event) => setProposal(event.target.value)} maxLength={80} placeholder={labelFor(locale, "Predloži novu temu…", "Suggest a new topic…")} className="h-11 rounded-[8px] border-2 border-ink bg-white px-3 font-bold" />
          <button type="button" disabled={proposing || !proposal.trim()} onClick={() => void propose()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-white px-4 text-xs font-black disabled:opacity-50">
            {proposing ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {labelFor(locale, "Pošalji predlog", "Send suggestion")}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={saving || profile === undefined} onClick={() => void save()} className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black shadow-[3px_3px_0_0_#0e3158] disabled:opacity-50">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {labelFor(locale, "Sačuvaj status", "Save status")}
          </button>
          {notice ? <p role="status" className="text-sm font-black text-ink">{notice}</p> : null}
        </div>
      </section>
      {isAdmin ? <HelpTopicModeration locale={locale} /> : null}
    </div>
  );
}

function StudySettings({ locale }: { locale: Locale }) {
  const router = useRouter();
  const courses = useQuery(api.courses.listPublishedCourses, {});
  const availability = useQuery(api.study.getViewerAvailability, {});
  const partnerships = useQuery(api.study.listViewerPartnerships, {});
  const groups = useQuery(api.study.listViewerStudyGroups, {});
  const [selectedCourse, setSelectedCourse] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<Array<Id<"users">>>([]);

  const courseId = selectedCourse ? selectedCourse as Id<"courses"> : undefined;
  const activeAvailability = courseId ? availability?.find((row) => row.courseId === courseId) : undefined;
  const suggestions = usePaginatedQuery(api.study.listPartnerSuggestions, courseId && activeAvailability?.active ? { courseId } : "skip", { initialNumItems: 12 });
  const incoming = usePaginatedQuery(api.study.listViewerPartnerInvites, { direction: "incoming", status: "pending" }, { initialNumItems: 10 });
  const outgoing = usePaginatedQuery(api.study.listViewerPartnerInvites, { direction: "outgoing", status: "pending" }, { initialNumItems: 10 });
  const groupInvites = usePaginatedQuery(api.study.listViewerStudyGroupInvites, { status: "pending" }, { initialNumItems: 10 });
  const setAvailability = useMutation(api.study.setViewerAvailability);
  const invitePartner = useMutation(api.study.createPartnerInvite);
  const respondPartner = useMutation(api.study.respondToPartnerInvite);
  const cancelPartner = useMutation(api.study.cancelPartnerInvite);
  const respondGroup = useMutation(api.study.respondToStudyGroupInvite);
  const createGroup = useMutation(api.study.createStudyGroupProposal);

  const selectedPartnerships = (partnerships ?? []).filter((row) => !courseId || row.courseId === courseId);

  function openConversation(conversationId?: Id<"chatConversations"> | null) {
    if (!conversationId) return;
    if (window.matchMedia("(min-width: 1024px)").matches) openChatDock(conversationId);
    else router.push(withLocale(locale, `/app/messages/${conversationId}`));
  }

  async function perform(key: string, action: () => Promise<unknown>) {
    setPendingKey(key);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : labelFor(locale, "Akcija nije uspela.", "The action failed."));
    } finally {
      setPendingKey(null);
    }
  }

  async function submitGroup() {
    if (!courseId || groupMembers.length < 2 || !groupName.trim()) return;
    await perform("new-group", async () => {
      await createGroup({ courseId, name: groupName, memberIds: groupMembers });
      setGroupName("");
      setGroupMembers([]);
      setNotice(labelFor(locale, "Grupni predlog je poslat partnerima.", "The group proposal was sent to your partners."));
    });
  }

  return (
    <section className="rounded-[16px] border-2 border-ink bg-white p-4 shadow-[5px_5px_0_0_rgba(112,167,207,0.55)] sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-[#d7e9f5]"><BookOpenCheck className="size-5" /></span>
        <div>
          <h2 className="text-2xl font-black text-ink">{labelFor(locale, "Partneri za učenje", "Study partners")}</h2>
          <p className="mt-1 text-sm font-bold leading-6 text-muted">{labelFor(locale, "Uključi se posebno za svaki kurs. Predlozi su samo članovi iz iste zone napretka.", "Opt in separately for each course. Suggestions only include members in your progress zone.")}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="text-sm font-black text-ink">
          {labelFor(locale, "Kurs", "Course")}
          <select value={selectedCourse} onChange={(event) => { setSelectedCourse(event.target.value); setGroupMembers([]); }} className="mt-2 h-11 w-full rounded-[8px] border-2 border-ink bg-white px-3 font-bold">
            <option value="">{labelFor(locale, "Izaberi kurs", "Choose a course")}</option>
            {(courses ?? []).map((course) => <option key={course._id} value={course._id}>{locale === "sr" ? course.titleSr : course.titleEn}</option>)}
          </select>
        </label>
        <button type="button" disabled={!courseId || pendingKey === "availability"} onClick={() => courseId ? void perform("availability", () => setAvailability({ courseId, active: !activeAvailability?.active })) : undefined} className={cn("mt-auto min-h-11 rounded-full border-2 border-ink px-5 text-sm font-black disabled:opacity-50", activeAvailability?.active ? "bg-ink text-white" : "bg-yellow text-ink")}>
          {activeAvailability?.active ? labelFor(locale, "Traženje uključeno", "Matching on") : labelFor(locale, "Uključi traženje", "Enable matching")}
        </button>
      </div>
      {activeAvailability?.active ? <p className="mt-2 text-xs font-black text-[#2e6f9f]">{labelFor(locale, "Tvoja zona", "Your zone")}: {activeAvailability.progressZone.replace("_", "–")}% · {activeAvailability.progressPercent}%</p> : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-black text-ink"><Search className="size-5" />{labelFor(locale, "Predlozi partnera", "Partner suggestions")}</h3>
          <div className="mt-3 space-y-2">
            {suggestions.results.map((person) => (
              <article key={person.userId} className="flex items-center gap-3 rounded-[16px] border-2 border-line bg-paper p-3">
                <Link href={withLocale(locale, `/app/members/${person.username}`)}>{avatar(person.avatarUrl, person.name)}</Link>
                <span className="min-w-0 flex-1"><Link href={withLocale(locale, `/app/members/${person.username}`)} className="block truncate font-black text-ink hover:underline">{person.name}</Link><span className="text-xs font-bold text-muted">@{person.username} · {person.progressPercent}%</span></span>
                <button type="button" disabled={pendingKey === `invite-${person.userId}`} onClick={() => courseId ? void perform(`invite-${person.userId}`, () => invitePartner({ recipientId: person.userId, courseId })) : undefined} className="grid size-10 place-items-center rounded-full border-2 border-ink bg-yellow disabled:opacity-50" aria-label={labelFor(locale, `Pozovi ${person.name}`, `Invite ${person.name}`)}><UserRoundPlus className="size-4" /></button>
              </article>
            ))}
            {!courseId || !activeAvailability?.active ? <p className="rounded-[16px] border-2 border-dashed border-line p-5 text-sm font-bold text-muted">{labelFor(locale, "Izaberi kurs i uključi traženje da vidiš predloge.", "Choose a course and enable matching to see suggestions.")}</p> : suggestions.status !== "LoadingFirstPage" && suggestions.results.length === 0 ? <p className="rounded-[16px] border-2 border-dashed border-line p-5 text-sm font-bold text-muted">{labelFor(locale, "Trenutno nema članova u istoj zoni.", "No members are currently in the same zone.")}</p> : null}
            {suggestions.status === "CanLoadMore" ? <button type="button" onClick={() => suggestions.loadMore(12)} className="w-full rounded-full border-2 border-ink bg-white px-4 py-2 text-xs font-black">{labelFor(locale, "Učitaj još", "Load more")}</button> : null}
          </div>
        </div>

        <div>
          <h3 className="flex items-center gap-2 text-lg font-black text-ink"><UserRoundPlus className="size-5" />{labelFor(locale, "Pozivi", "Invites")}</h3>
          <div className="mt-3 space-y-2">
            {incoming.results.map((invite) => <article key={invite.inviteId} className="rounded-[16px] border-2 border-line bg-paper p-3"><div className="flex items-center gap-3">{avatar(invite.counterpart.avatarUrl, invite.counterpart.name)}<span className="min-w-0 flex-1"><span className="block truncate font-black">{invite.counterpart.name}</span><span className="text-xs font-bold text-muted">{locale === "sr" ? invite.course.titleSr : invite.course.titleEn}</span></span></div><div className="mt-3 flex gap-2"><button type="button" disabled={pendingKey === String(invite.inviteId)} onClick={() => void perform(String(invite.inviteId), async () => { const result = await respondPartner({ inviteId: invite.inviteId, decision: "accept" }); openConversation(result.conversationId); })} className="flex-1 rounded-full border-2 border-ink bg-yellow px-3 py-2 text-xs font-black">{labelFor(locale, "Prihvati", "Accept")}</button><button type="button" disabled={pendingKey === String(invite.inviteId)} onClick={() => void perform(String(invite.inviteId), () => respondPartner({ inviteId: invite.inviteId, decision: "decline" }))} className="flex-1 rounded-full border-2 border-ink bg-white px-3 py-2 text-xs font-black">{labelFor(locale, "Odbij", "Decline")}</button></div></article>)}
            {outgoing.results.map((invite) => <article key={invite.inviteId} className="flex items-center gap-3 rounded-[16px] border-2 border-line bg-white p-3">{avatar(invite.counterpart.avatarUrl, invite.counterpart.name)}<span className="min-w-0 flex-1"><span className="block truncate font-black">{invite.counterpart.name}</span><span className="text-xs font-bold text-muted">{labelFor(locale, "Poziv poslat", "Invite sent")} · {locale === "sr" ? invite.course.titleSr : invite.course.titleEn}</span></span><button type="button" disabled={pendingKey === String(invite.inviteId)} onClick={() => void perform(String(invite.inviteId), () => cancelPartner({ inviteId: invite.inviteId }))} className="rounded-full border-2 border-ink bg-white px-3 py-2 text-[10px] font-black">{labelFor(locale, "Otkaži", "Cancel")}</button></article>)}
            {groupInvites.results.map((invite) => <article key={invite.inviteId} className="rounded-[16px] border-2 border-[#70a7cf] bg-[#eef6fb] p-3"><p className="text-xs font-black uppercase text-[#2e6f9f]">{labelFor(locale, "Grupni poziv", "Group invite")}</p><p className="mt-1 font-black">{invite.group.name}</p><p className="text-xs font-bold text-muted">{invite.inviter.name} · {locale === "sr" ? invite.course.titleSr : invite.course.titleEn}</p><div className="mt-3 flex gap-2"><button type="button" disabled={pendingKey === String(invite.inviteId)} onClick={() => void perform(String(invite.inviteId), async () => { const result = await respondGroup({ inviteId: invite.inviteId, decision: "accept" }); openConversation(result.conversationId); })} className="flex-1 rounded-full border-2 border-ink bg-yellow px-3 py-2 text-xs font-black">{labelFor(locale, "Prihvati", "Accept")}</button><button type="button" disabled={pendingKey === String(invite.inviteId)} onClick={() => void perform(String(invite.inviteId), () => respondGroup({ inviteId: invite.inviteId, decision: "decline" }))} className="flex-1 rounded-full border-2 border-ink bg-white px-3 py-2 text-xs font-black">{labelFor(locale, "Odbij", "Decline")}</button></div></article>)}
            {incoming.status !== "LoadingFirstPage" && outgoing.status !== "LoadingFirstPage" && groupInvites.status !== "LoadingFirstPage" && incoming.results.length + outgoing.results.length + groupInvites.results.length === 0 ? <p className="rounded-[16px] border-2 border-dashed border-line p-5 text-sm font-bold text-muted">{labelFor(locale, "Nema novih poziva.", "No new invites.")}</p> : null}
          </div>
        </div>
      </div>

      <div className="mt-6 border-t-2 border-line pt-5">
        <h3 className="flex items-center gap-2 text-lg font-black text-ink"><MessageCircle className="size-5" />{labelFor(locale, "Moji partneri", "My partners")}</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {selectedPartnerships.map((partnership) => <article key={partnership.partnershipId} className="flex items-center gap-3 rounded-[16px] border-2 border-line bg-paper p-3">{avatar(partnership.partner.avatarUrl, partnership.partner.name)}<span className="min-w-0 flex-1"><Link href={withLocale(locale, `/app/members/${partnership.partner.username}`)} className="block truncate font-black hover:underline">{partnership.partner.name}</Link><span className="text-xs font-bold text-muted">@{partnership.partner.username}</span></span><button type="button" onClick={() => openConversation(partnership.conversationId)} className="grid size-10 place-items-center rounded-full border-2 border-ink bg-white" aria-label={labelFor(locale, "Otvori razgovor", "Open chat")}><MessageCircle className="size-4" /></button></article>)}
          {partnerships !== undefined && selectedPartnerships.length === 0 ? <p className="rounded-[16px] border-2 border-dashed border-line p-5 text-sm font-bold text-muted">{labelFor(locale, "Još nema partnerstava za izabrani kurs.", "No partnerships for the selected course yet.")}</p> : null}
        </div>
      </div>

      {courseId && selectedPartnerships.length >= 2 ? <div className="mt-6 rounded-[16px] border-2 border-ink bg-yellow/15 p-4"><h3 className="flex items-center gap-2 text-lg font-black"><UsersRound className="size-5" />{labelFor(locale, "Predloži grupu", "Propose a group")}</h3><p className="mt-1 text-xs font-bold text-muted">{labelFor(locale, "Izaberi najmanje dva postojeća partnera. Grupa i grupni chat nastaju kada vas bude najmanje troje.", "Choose at least two existing partners. The group and group chat activate once at least three people accept.")}</p><input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={100} placeholder={labelFor(locale, "Naziv grupe", "Group name")} className="mt-3 h-11 w-full rounded-[8px] border-2 border-ink bg-white px-3 font-bold" /><div className="mt-3 flex flex-wrap gap-2">{selectedPartnerships.map((partnership) => { const selected = groupMembers.includes(partnership.partner.userId); return <button key={partnership.partnershipId} type="button" onClick={() => setGroupMembers(selected ? groupMembers.filter((id) => id !== partnership.partner.userId) : [...groupMembers, partnership.partner.userId])} className={cn("rounded-full border-2 border-ink px-3 py-2 text-xs font-black", selected ? "bg-ink text-white" : "bg-white")}>{selected ? "✓ " : "+ "}{partnership.partner.name}</button>; })}</div><button type="button" disabled={pendingKey === "new-group" || groupMembers.length < 2 || !groupName.trim()} onClick={() => void submitGroup()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black shadow-[3px_3px_0_0_#0e3158] disabled:opacity-50"><Plus className="size-4" />{labelFor(locale, "Pošalji grupni predlog", "Send group proposal")}</button></div> : null}

      <div className="mt-6 border-t-2 border-line pt-5"><h3 className="flex items-center gap-2 text-lg font-black"><UsersRound className="size-5" />{labelFor(locale, "Studijske grupe", "Study groups")}</h3><div className="mt-3 grid gap-2 md:grid-cols-2">{(groups ?? []).map((group) => <article key={group.groupId} className="flex items-center gap-3 rounded-[16px] border-2 border-line bg-paper p-3"><span className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-[#d7e9f5]"><UsersRound className="size-5" /></span><span className="min-w-0 flex-1"><span className="block truncate font-black">{group.name}</span><span className="text-xs font-bold text-muted">{group.activeMemberCount} {labelFor(locale, "članova", "members")} · {group.status === "active" ? labelFor(locale, "Aktivna", "Active") : labelFor(locale, "Čeka prihvatanja", "Awaiting responses")}</span></span>{group.conversationId ? <button type="button" onClick={() => openConversation(group.conversationId)} className="grid size-10 place-items-center rounded-full border-2 border-ink bg-white" aria-label={labelFor(locale, "Otvori grupni chat", "Open group chat")}><MessageCircle className="size-4" /></button> : null}</article>)}</div></div>
      {notice ? <p role="status" className="mt-4 rounded-[16px] border-2 border-line bg-paper p-3 text-sm font-black text-ink">{notice}</p> : null}
    </section>
  );
}

export function SocialLearningSettings({ locale, role }: { locale: Locale; role: string }) {
  return (
    <div id="social-learning" className="mt-6 scroll-mt-6 space-y-6">
      <HelpSettings locale={locale} isAdmin={role === "admin"} />
      {role !== "admin" ? <StudySettings locale={locale} /> : null}
    </div>
  );
}
