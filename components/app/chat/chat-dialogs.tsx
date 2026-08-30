"use client";

import { ArrowLeft, Check, Flag, MessageCircle, Search, UserPlus, Users, X } from "lucide-react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Avatar,
  type CommunityMember,
  type ReportTarget,
  creationError,
  label,
} from "@/components/app/chat/chat-shared";
import { useModalFocus } from "@/components/ui/dialog";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

export function NewConversationDialog({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [step, setStep] = useState<1 | 2>(1);
  const [search, setSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Array<Id<"users">>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [creatingUserId, setCreatingUserId] = useState<Id<"users">>();
  const [error, setError] = useState<string>();
  const memberArgs = search.trim() ? { search: search.trim() } : {};
  const members = usePaginatedQuery(api.community.listMembersPage, memberArgs, { initialNumItems: 30 });
  const createDirect = useMutation(api.chat.createOrGetDirect);
  const createGroup = useMutation(api.chat.createGroup);
  const dialogRef = useModalFocus(true, onClose);
  const availableMembers = members.results.filter(
    (member): member is CommunityMember & { userId: Id<"users"> } => Boolean(member.userId && member.role !== "admin" && member.canFollow),
  );

  async function startDirect(recipientId: Id<"users">) {
    setCreatingUserId(recipientId);
    setError(undefined);
    try {
      const result = await createDirect({ recipientId });
      onClose();
      router.push(withLocale(locale, `/app/messages/${result.conversationId}`));
    } catch (caught) {
      setError(creationError(locale, caught));
    } finally {
      setCreatingUserId(undefined);
    }
  }

  async function submitGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (groupName.trim().length < 2 || selectedIds.length < 1 || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await createGroup({ name: groupName.trim(), memberIds: selectedIds });
      onClose();
      router.push(withLocale(locale, `/app/messages/${result.conversationId}`));
    } catch (caught) {
      setError(creationError(locale, caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-end p-0 sm:place-items-center sm:p-4">
      <button type="button" tabIndex={-1} onClick={onClose} aria-label={label(locale, "Zatvori novi razgovor", "Close new conversation")} className="absolute inset-0 rounded-none border-0 bg-scrim/55 p-0 backdrop-blur-[2px]" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="new-conversation-title" tabIndex={-1} data-chat-motion-surface="sheet" className="relative flex max-h-[min(760px,92dvh)] w-full flex-col overflow-hidden rounded-t-[16px] border-[3px] border-ink bg-paper-strong shadow-[9px_9px_0_0_var(--shadow-hard-24)] sm:w-[min(560px,100%)] sm:rounded-[16px]">
        <div className="flex items-center justify-between gap-3 border-b-2 border-ink p-4">
          <div><p className="type-eyebrow-sm text-blue-mid dark:text-muted">{label(locale, `Korak ${step} od 2`, `Step ${step} of 2`)}</p><h2 id="new-conversation-title" className="font-display type-display-sm">{label(locale, "Novi razgovor", "New conversation")}</h2></div>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full border-2 border-ink" aria-label={label(locale, "Zatvori", "Close")}><X className="size-4" /></button>
        </div>
        {step === 1 ? <div className="grid gap-3 p-4 sm:grid-cols-2">
          <button type="button" autoFocus onClick={() => { setMode("direct"); setStep(2); }} className="rounded-[16px] border-2 border-ink bg-yellow/20 p-6 text-left transition hover:-translate-y-0.5 hover:bg-yellow/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            <MessageCircle className="size-6" /><span className="mt-4 block type-h4">{label(locale, "Jedan na jedan", "One to one")}</span><span className="mt-1 block type-caption font-bold text-muted">{label(locale, "Izaberi osobu i odmah otvori razgovor.", "Choose a person and open the conversation immediately.")}</span>
          </button>
          <button type="button" onClick={() => { setMode("group"); setStep(2); }} className="rounded-[16px] border-2 border-ink bg-[#d7e9f5] dark:bg-ink/15 p-6 text-left transition hover:-translate-y-0.5 hover:bg-[#c9dfed] dark:hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            <Users className="size-6" /><span className="mt-4 block type-h4">{label(locale, "Grupa", "Group")}</span><span className="mt-1 block type-caption font-bold text-muted">{label(locale, "Dodaj naziv i članove, pa kreiraj grupu.", "Add a name and members, then create the group.")}</span>
          </button>
        </div> : <>
          <div className="border-b border-line p-4">
            <button type="button" onClick={() => setStep(1)} className="mb-3 inline-flex items-center gap-2 rounded-full border border-ink bg-paper-strong px-3 py-1.5 type-caption font-black"><ArrowLeft className="size-3.5" />{label(locale, "Promeni vrstu", "Change type")}</button>
            <p className="text-sm font-black">{mode === "group" ? label(locale, "Nova grupa", "New group") : label(locale, "Izaberi osobu", "Choose a person")}</p>
            {mode === "group" ? <label className="mt-3 block text-xs font-black">{label(locale, "Naziv grupe", "Group name")}<input autoFocus value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={100} className="mt-1 h-11 w-full rounded-[12px] border-2 border-ink px-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" placeholder={label(locale, "npr. AI ekipa za učenje", "e.g. AI study group")} /></label> : null}
            <label className="mt-3 flex h-11 items-center gap-2 rounded-full border-2 border-line bg-paper px-4 focus-within:border-ink"><Search className="size-4 text-muted" /><span className="sr-only">{label(locale, "Pretraži članove", "Search members")}</span><input autoFocus={mode === "direct"} value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" placeholder={label(locale, "Ime ili korisničko ime", "Name or username")} /></label>
            {mode === "group" ? <p className="mt-2 font-mono type-caption font-black text-muted">{label(locale, `Izabrano: ${selectedIds.length}`, `Selected: ${selectedIds.length}`)}</p> : null}
            {error ? <p role="alert" className="mt-3 rounded-[8px] border border-red-400 bg-red-50 px-3 py-2 text-xs font-black text-red-800">{error}</p> : null}
          </div>
          <div role="listbox" aria-multiselectable={mode === "group"} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {availableMembers.map((member) => {
              const selected = selectedIds.includes(member.userId);
              return <button key={member.userId} type="button" role="option" aria-selected={mode === "group" ? selected : undefined} disabled={Boolean(creatingUserId)} onClick={() => mode === "direct" ? void startDirect(member.userId) : setSelectedIds((current) => selected ? current.filter((id) => id !== member.userId) : [...current, member.userId])} className={cn("flex w-full items-center gap-3 rounded-[16px] border-2 p-3 text-left transition disabled:opacity-60", selected ? "border-ink bg-yellow/25" : "border-line bg-paper-strong hover:border-ink")}>
                <Avatar src={member.avatarUrl} name={member.name} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{member.name}</span>{member.username ? <span className="block truncate type-caption font-bold text-muted">@{member.username}</span> : null}</span>
                {creatingUserId === member.userId ? <Spinner /> : mode === "group" ? <span className={cn("grid size-6 place-items-center rounded-full border-2 border-ink", selected && "bg-ink text-paper-strong")}>{selected ? <Check className="size-3.5" /> : null}</span> : <UserPlus className="size-4" />}
              </button>;
            })}
            {members.status === "LoadingFirstPage" ? <div className="grid min-h-36 place-items-center"><Spinner size="lg" /></div> : null}
            {!availableMembers.length && members.status !== "LoadingFirstPage" ? <p className="p-8 text-center text-sm font-black text-muted">{label(locale, "Nema dostupnih članova.", "No available members.")}</p> : null}
            {members.status === "CanLoadMore" ? <button type="button" onClick={() => members.loadMore(30)} className="w-full rounded-full border-2 border-ink bg-paper-strong px-4 py-2.5 text-xs font-black">{label(locale, "Učitaj još", "Load more")}</button> : null}
          </div>
          {mode === "group" ? <form onSubmit={submitGroup} className="border-t-2 border-ink p-4"><button type="submit" disabled={submitting || groupName.trim().length < 2 || selectedIds.length < 1} className="flex h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black disabled:opacity-40">{submitting ? <Spinner /> : <Users className="size-4" />}{label(locale, "Kreiraj grupu", "Create group")}</button></form> : null}
        </>}
      </div>
    </div>
  );
}

export function ReportDialog({ locale, target, onClose }: { locale: Locale; target: ReportTarget; onClose: () => void }) {
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string>();
  const reportContent = useMutation(api.chatModeration.reportContent);
  const dialogRef = useModalFocus(true, onClose);
  const reasons = [
    { value: "spam", sr: "Spam ili neželjen sadržaj", en: "Spam or unwanted content" },
    { value: "harassment", sr: "Uznemiravanje ili vređanje", en: "Harassment or abuse" },
    { value: "unsafe", sr: "Opasan ili neprikladan sadržaj", en: "Unsafe or inappropriate content" },
    { value: "other", sr: "Drugi razlog", en: "Another reason" },
  ];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedReason = reasons.find((item) => item.value === reason);
    const base = selectedReason ? (locale === "sr" ? selectedReason.sr : selectedReason.en) : reason;
    const reportReason = `${base}${details.trim() ? `: ${details.trim()}` : ""}`;
    if (reason === "other" && details.trim().length < 3) {
      setError(label(locale, "Dodaj kratko objašnjenje.", "Add a short explanation."));
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      if (target.type === "message") await reportContent({ targetType: "message", targetMessageId: target.messageId, reason: reportReason });
      else await reportContent({ targetType: "group", targetConversationId: target.conversationId, reason: reportReason });
      setSubmitted(true);
    } catch {
      setError(label(locale, "Prijava nije poslata. Proveri internet i pošalji je ponovo.", "The report was not sent. Check your connection and send it again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center p-4">
      <button type="button" tabIndex={-1} onClick={onClose} aria-label={label(locale, "Zatvori prijavu", "Close report")} className="absolute inset-0 rounded-none border-0 bg-scrim/55 p-0 backdrop-blur-[2px]" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="report-dialog-title" tabIndex={-1} data-chat-motion-surface="sheet" className="relative w-[min(440px,100%)] rounded-[16px] border-[3px] border-ink bg-paper-strong p-6 shadow-[8px_8px_0_0_var(--shadow-hard-24)]">
        <div className="flex items-start justify-between gap-3"><div><p className="type-eyebrow-sm text-red-700">{label(locale, "Bezbednost", "Safety")}</p><h2 id="report-dialog-title" className="font-display type-display-sm">{target.type === "message" ? label(locale, "Prijavi poruku", "Report message") : label(locale, "Prijavi grupu", "Report group")}</h2></div><button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full border-2 border-ink" aria-label={label(locale, "Zatvori", "Close")}><X className="size-4" /></button></div>
        {submitted ? <div className="mt-5"><p className="rounded-[12px] border-2 border-ink bg-yellow/25 p-4 text-sm font-black">{label(locale, "Prijava je poslata moderatorskom timu.", "The report was sent to the moderation team.")}</p><button type="button" onClick={onClose} className="mt-4 h-11 w-full rounded-full border-2 border-ink bg-ink px-4 text-sm font-black text-paper-strong">{label(locale, "Gotovo", "Done")}</button></div> : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block text-xs font-black">{label(locale, "Razlog", "Reason")}<select autoFocus value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 h-11 w-full rounded-[12px] border-2 border-ink bg-paper-strong px-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">{reasons.map((item) => <option key={item.value} value={item.value}>{locale === "sr" ? item.sr : item.en}</option>)}</select></label>
            <label className="block text-xs font-black">{label(locale, "Dodatno objašnjenje (opciono)", "Additional details (optional)")}<textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={900} rows={4} className="mt-1 w-full resize-y rounded-[12px] border-2 border-ink px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" /></label>
            {error ? <p role="alert" className="rounded-[8px] border border-red-400 bg-red-50 px-3 py-2 text-xs font-black text-red-800">{error}</p> : null}
            <button type="submit" disabled={submitting} className="flex h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-red-600 px-4 text-sm font-black text-white disabled:opacity-50">{submitting ? <Spinner /> : <Flag className="size-4" />}{label(locale, "Pošalji prijavu", "Send report")}</button>
          </form>
        )}
      </div>
    </div>
  );
}
