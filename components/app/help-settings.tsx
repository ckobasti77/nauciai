"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Check, HandHeart, Loader2, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { t, type Locale } from "@/lib/i18n";

type HelpMode = "seeking" | "offering" | "both";
type HelpTopicDraft = {
  topicId: Id<"helpTopics">;
  name: string;
  courseId?: Id<"courses">;
  mode: HelpMode;
};

function modeLabel(locale: Locale, mode: HelpMode) {
  if (mode === "seeking") return t(locale, "Tražim pomoć", "Looking for help");
  if (mode === "offering") return t(locale, "Mogu da pomognem", "I can help");
  return t(locale, "Oboje", "Both");
}

function PendingTopicRow({
  locale,
  suggestion,
}: {
  locale: Locale;
  suggestion: { _id: Id<"helpTopicSuggestions">; name: string; courseId?: Id<"courses"> };
}) {
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
        <span className="min-w-0 flex-1"><span className="block truncate font-black text-ink">{suggestion.name}</span><span className="block text-xs font-bold text-muted">{suggestion.courseId ? t(locale, "Tema kursa", "Course topic") : t(locale, "Globalna tema", "Global topic")}</span></span>
        <button type="button" disabled={pending} onClick={() => void decide("approve")} className="inline-flex min-h-10 items-center gap-1 rounded-full border-2 border-ink bg-yellow px-3 text-xs font-black disabled:opacity-50"><Check className="size-4" />{t(locale, "Odobri", "Approve")}</button>
        <button type="button" disabled={pending} onClick={() => void decide("reject")} className="inline-flex min-h-10 items-center gap-1 rounded-full border-2 border-ink bg-white px-3 text-xs font-black disabled:opacity-50"><X className="size-4" />{t(locale, "Odbij", "Reject")}</button>
      </div>
      {sameScopeTopics.length ? <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3"><select value={mergeTopicId} onChange={(event) => setMergeTopicId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-[8px] border-2 border-ink bg-white px-2 text-xs font-black"><option value="">{t(locale, "Spoji sa postojećom…", "Merge into existing…")}</option>{sameScopeTopics.map((topic) => <option key={topic.topicId} value={topic.topicId}>{topic.name}</option>)}</select><button type="button" disabled={pending || !mergeTopicId} onClick={() => void decide("merge")} className="rounded-full border-2 border-ink bg-white px-4 text-xs font-black disabled:opacity-50">{t(locale, "Spoji", "Merge")}</button></div> : null}
    </article>
  );
}

function HelpTopicModeration({ locale }: { locale: Locale }) {
  const suggestions = usePaginatedQuery(api.helpTopics.listPendingSuggestions, {}, { initialNumItems: 10 });
  return (
    <section className="rounded-[16px] border-2 border-ink bg-white p-4 shadow-[4px_4px_0_0_rgba(14,49,88,0.1)] sm:p-5">
      <p className="text-xs font-black uppercase text-[#2e6f9f]">Admin</p>
      <h3 className="mt-1 text-xl font-black text-ink">{t(locale, "Predlozi tema na čekanju", "Pending topic suggestions")}</h3>
      <div className="mt-4 space-y-2">
        {suggestions.results.map((suggestion) => <PendingTopicRow key={suggestion._id} locale={locale} suggestion={suggestion} />)}
        {suggestions.status !== "LoadingFirstPage" && suggestions.results.length === 0 ? <p className="rounded-[16px] border-2 border-dashed border-line p-5 text-center text-sm font-bold text-muted">{t(locale, "Nema predloga na čekanju.", "No pending suggestions.")}</p> : null}
        {suggestions.status === "CanLoadMore" ? <button type="button" onClick={() => suggestions.loadMore(10)} className="w-full rounded-full border-2 border-ink bg-white px-4 py-2 text-xs font-black">{t(locale, "Učitaj još", "Load more")}</button> : null}
      </div>
    </section>
  );
}

export function HelpSettings({ locale, role }: { locale: Locale; role: string }) {
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
      setNotice(t(locale, "Možeš izabrati najviše pet aktivnih tema.", "You can select up to five active topics."));
      return;
    }
    const status = current.status ?? "both";
    setDraft({ status, topics: [...current.topics, { ...topic, mode: status }] });
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      await saveProfile({ status: current.status, topics: current.topics.map((topic) => ({ topicId: topic.topicId, mode: topic.mode })) });
      setDraft({ status: current.status, topics: current.topics });
      setNotice(t(locale, "Status i teme su sačuvani.", "Your status and topics were saved."));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t(locale, "Čuvanje nije uspelo.", "Saving failed."));
    } finally {
      setSaving(false);
    }
  }

  async function propose() {
    if (!proposal.trim()) return;
    setProposing(true);
    setNotice(null);
    try {
      const result = await proposeTopic({ name: proposal, ...(scopeCourseId ? { courseId: scopeCourseId as Id<"courses"> } : {}) });
      setProposal("");
      setNotice(result.status === "existing" ? t(locale, "Tema već postoji i možeš je izabrati.", "That topic already exists and can be selected.") : t(locale, "Predlog je poslat Adminu. Neće biti javan dok ne bude odobren.", "The suggestion was sent to an Admin and stays private until approved."));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t(locale, "Predlog nije poslat.", "The suggestion was not sent."));
    } finally {
      setProposing(false);
    }
  }

  return (
    <div id="community-help" className="mt-6 scroll-mt-6 space-y-6">
      <section className="rounded-[16px] border-2 border-ink bg-white p-4 shadow-[5px_5px_0_0_rgba(244,190,48,0.7)] sm:p-6">
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow"><HandHeart className="size-5" /></span><div><h2 className="text-2xl font-black text-ink">{t(locale, "Pomoć zajednice", "Community help")}</h2><p className="mt-1 text-sm font-bold leading-6 text-muted">{t(locale, "Izaberi status i do pet odobrenih tema. Partnerstva za učenje sada su u Porukama.", "Choose a status and up to five approved topics. Study partnerships now live in Messages.")}</p></div></div>
        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label={t(locale, "Status pomoći", "Help status")}>{(["seeking", "offering", "both"] as HelpMode[]).map((mode) => <button key={mode} type="button" onClick={() => setDraft({ status: mode, topics: current.topics })} className={cn("rounded-full border-2 border-ink px-4 py-2 text-xs font-black", current.status === mode ? "bg-ink text-white" : "bg-white text-ink")}>{modeLabel(locale, mode)}</button>)}<button type="button" onClick={() => setDraft({ status: null, topics: [] })} className={cn("rounded-full border-2 border-ink px-4 py-2 text-xs font-black", current.status === null ? "bg-ink text-white" : "bg-white text-ink")}>{t(locale, "Isključeno", "Off")}</button></div>
        <label className="mt-5 block text-sm font-black text-ink">{t(locale, "Prikaži teme", "Show topics")}<select value={scopeCourseId} onChange={(event) => setScopeCourseId(event.target.value)} className="mt-2 h-11 w-full rounded-[8px] border-2 border-ink bg-white px-3 font-bold sm:max-w-md"><option value="">{t(locale, "Globalne teme", "Global topics")}</option>{(courses ?? []).map((course) => <option key={course._id} value={course._id}>{locale === "sr" ? course.titleSr : course.titleEn}</option>)}</select></label>
        <div className="mt-4 grid gap-2 md:grid-cols-2">{visibleTopics.map((topic) => { const checked = selected(topic.topicId); const selectedTopic = current.topics.find((item) => item.topicId === topic.topicId); return <div key={topic.topicId} className={cn("rounded-[16px] border-2 p-3", checked ? "border-ink bg-yellow/20" : "border-line bg-paper")}><button type="button" onClick={() => toggleTopic(topic)} className="flex w-full items-center gap-3 text-left"><span className={cn("grid size-6 place-items-center rounded-full border-2 border-ink", checked ? "bg-yellow" : "bg-white")}>{checked ? <Check className="size-4" /> : null}</span><span className="min-w-0 flex-1 truncate font-black text-ink">{topic.name}</span></button>{checked && selectedTopic ? <select value={selectedTopic.mode} onChange={(event) => setDraft({ ...current, topics: current.topics.map((item) => item.topicId === topic.topicId ? { ...item, mode: event.target.value as HelpMode } : item) })} className="mt-3 h-9 w-full rounded-[8px] border-2 border-ink bg-white px-2 text-xs font-black"><option value="seeking">{modeLabel(locale, "seeking")}</option><option value="offering">{modeLabel(locale, "offering")}</option><option value="both">{modeLabel(locale, "both")}</option></select> : null}</div>; })}{activeTopics !== undefined && visibleTopics.length === 0 ? <p className="rounded-[16px] border-2 border-dashed border-line p-5 text-sm font-bold text-muted">{t(locale, "Još nema odobrenih tema u ovom opsegu.", "There are no approved topics in this scope yet.")}</p> : null}</div>
        <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><input value={proposal} onChange={(event) => setProposal(event.target.value)} maxLength={80} placeholder={t(locale, "Predloži novu temu…", "Suggest a new topic…")} className="h-11 rounded-[8px] border-2 border-ink bg-white px-3 font-bold" /><button type="button" disabled={proposing || !proposal.trim()} onClick={() => void propose()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-white px-4 text-xs font-black disabled:opacity-50">{proposing ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{t(locale, "Pošalji predlog", "Send suggestion")}</button></div>
        <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={saving || profile === undefined} onClick={() => void save()} className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black shadow-[3px_3px_0_0_#0e3158] disabled:opacity-50">{saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{t(locale, "Sačuvaj status", "Save status")}</button>{notice ? <p role="status" className="text-sm font-black text-ink">{notice}</p> : null}</div>
      </section>
      {role === "admin" ? <HelpTopicModeration locale={locale} /> : null}
    </div>
  );
}
