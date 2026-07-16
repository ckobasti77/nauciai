"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Check, CircleAlert, Eye, Gavel, Loader2, MessageSquareText, ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

type ReportStatus = "open" | "reviewing" | "resolved" | "dismissed";
type ModerationKind = "remove_message" | "warn" | "suspend_chat" | "recommend_account_suspension";

function labelFor(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr : en;
}

function date(locale: Locale, value: number) {
  return new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function AppealsPanel({ locale }: { locale: Locale }) {
  const appeals = usePaginatedQuery(api.chatModeration.listSuspensionAppealsPage, { status: "pending" }, { initialNumItems: 20 });
  const review = useMutation(api.chatModeration.reviewSuspensionAppeal);
  const [selected, setSelected] = useState<Id<"suspensionAppeals"> | null>(null);
  const [response, setResponse] = useState("");
  const [pending, setPending] = useState(false);

  async function decide(decision: "accepted" | "rejected") {
    if (!selected || response.trim().length < 3) return;
    setPending(true);
    try {
      await review({ appealId: selected, decision, response });
      setSelected(null);
      setResponse("");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[16px] border-2 border-ink bg-white p-4 sm:p-5">
      <h2 className="text-xl font-black">{labelFor(locale, "Žalbe na suspenziju", "Suspension appeals")}</h2>
      <div className="mt-4 space-y-2">
        {appeals.results.map((appeal) => (
          <article key={appeal._id} className={cn("rounded-[16px] border-2 p-3", selected === appeal._id ? "border-ink bg-yellow/20" : "border-line bg-paper")}>
            <button type="button" onClick={() => setSelected(appeal._id)} className="w-full text-left">
              <p className="text-xs font-black uppercase text-muted">{date(locale, appeal.createdAt)}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-6">{appeal.body}</p>
            </button>
          </article>
        ))}
        {appeals.status !== "LoadingFirstPage" && appeals.results.length === 0 ? <p className="rounded-[16px] border-2 border-dashed border-line p-5 text-center text-sm font-bold text-muted">{labelFor(locale, "Nema žalbi na čekanju.", "No pending appeals.")}</p> : null}
      </div>
      {selected ? <div className="mt-4 rounded-[16px] border-2 border-ink bg-paper p-4"><label className="text-sm font-black">{labelFor(locale, "Odgovor korisniku", "Response to the member")}<textarea value={response} onChange={(event) => setResponse(event.target.value)} rows={3} className="mt-2 w-full rounded-[8px] border-2 border-ink bg-white p-3 font-bold" /></label><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={pending || response.trim().length < 3} onClick={() => void decide("accepted")} className="inline-flex min-h-10 items-center gap-1 rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black"><Check className="size-4" />{labelFor(locale, "Prihvati žalbu", "Accept appeal")}</button><button type="button" disabled={pending || response.trim().length < 3} onClick={() => void decide("rejected")} className="inline-flex min-h-10 items-center gap-1 rounded-full border-2 border-ink bg-white px-4 text-xs font-black"><X className="size-4" />{labelFor(locale, "Odbij", "Reject")}</button></div></div> : null}
    </section>
  );
}

type AdminChatsResult = {
  conversations: Array<{
    membership: { conversationId: Id<"chatConversations">; status: string; unreadCount: number };
    conversation: { _id: Id<"chatConversations">; title: string; kind: string; lastMessagePreview?: string } | null;
  }>;
  truncated: boolean;
};

type AuditMessage = {
  _id: Id<"chatMessages">;
  sequence: number;
  senderName: string;
  body?: string;
  deletedAt?: number;
  createdAt: number;
};

function AdminUserChatAudit({ locale, initialUserId }: { locale: Locale; initialUserId?: string }) {
  const openChats = useMutation(api.chatModeration.openAdminUserChats);
  const openConversation = useMutation(api.chatModeration.openAdminConversationAccess);
  const [targetUserId, setTargetUserId] = useState(initialUserId ?? "");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<AdminChatsResult | null>(null);
  const [messages, setMessages] = useState<AuditMessage[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Id<"chatConversations"> | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function inspectUser() {
    if (!targetUserId || reason.trim().length < 3) return;
    setPending(true);
    setError(null);
    try {
      const value = await openChats({ targetUserId: targetUserId as Id<"users">, reason });
      setResult(value as AdminChatsResult);
      setMessages([]);
      setSelectedConversation(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Access failed");
    } finally {
      setPending(false);
    }
  }

  async function inspectConversation(conversationId: Id<"chatConversations">, nextCursor: string | null = null) {
    if (!targetUserId || reason.trim().length < 3) return;
    setPending(true);
    setError(null);
    try {
      const value = await openConversation({
        targetUserId: targetUserId as Id<"users">,
        conversationId,
        reason,
        paginationOpts: { numItems: 50, cursor: nextCursor },
      });
      const page = value.page as AuditMessage[];
      setMessages((current) => nextCursor ? [...current, ...page] : page);
      setSelectedConversation(conversationId);
      setCursor(value.continueCursor || null);
      setDone(value.isDone);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Access failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[16px] border-2 border-red-800 bg-red-50 p-4 sm:p-5">
      <p className="text-xs font-black uppercase text-red-800">{labelFor(locale, "Admin pristup sa auditom", "Audited Admin access")}</p>
      <h2 className="mt-1 text-xl font-black">{labelFor(locale, "Pogledaj sve korisnikove chatove", "Inspect a member's chats")}</h2>
      <p className="mt-1 text-sm font-bold text-red-950/75">{labelFor(locale, "Razlog je obavezan. Svako otvaranje liste i razgovora ostaje trajno zabeleženo.", "A reason is required. Opening the list or a conversation creates a permanent audit entry.")}</p>
      <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(180px,0.55fr)_minmax(260px,1fr)_auto]">
        <input value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} placeholder="User ID" className="h-11 rounded-[8px] border-2 border-ink bg-white px-3 font-mono text-xs font-bold" />
        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1_000} placeholder={labelFor(locale, "Obavezan razlog pristupa", "Required access reason")} className="h-11 rounded-[8px] border-2 border-ink bg-white px-3 font-bold" />
        <button type="button" disabled={pending || !targetUserId || reason.trim().length < 3} onClick={() => void inspectUser()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black disabled:opacity-50"><Eye className="size-4" />{labelFor(locale, "Otvori listu", "Open list")}</button>
      </div>
      {result ? <div className="mt-4 grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]"><div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">{result.conversations.map(({ membership, conversation }) => conversation ? <button key={conversation._id} type="button" onClick={() => void inspectConversation(conversation._id)} className={cn("w-full rounded-[16px] border-2 p-3 text-left", selectedConversation === conversation._id ? "border-ink bg-yellow/25" : "border-line bg-white")}><p className="truncate font-black">{conversation.title}</p><p className="mt-1 truncate text-xs font-bold text-muted">{conversation.kind} · {membership.status} · {conversation.lastMessagePreview || "—"}</p></button> : null)}</div><div className="max-h-[520px] overflow-y-auto rounded-[16px] border-2 border-line bg-white p-3">{messages.map((message) => <article key={message._id} className="border-b border-line py-3 last:border-0"><div className="flex justify-between gap-3 text-xs font-black text-muted"><span>{message.senderName}</span><span>#{message.sequence} · {date(locale, message.createdAt)}</span></div><p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-6">{message.deletedAt ? labelFor(locale, "Poruka je obrisana", "Message deleted") : message.body || "—"}</p></article>)}{selectedConversation && !done ? <button type="button" disabled={pending || !cursor} onClick={() => cursor ? void inspectConversation(selectedConversation, cursor) : undefined} className="mt-3 w-full rounded-full border-2 border-ink bg-white px-4 py-2 text-xs font-black">{labelFor(locale, "Učitaj starije", "Load older")}</button> : null}</div></div> : null}
      {error ? <p role="alert" className="mt-3 text-sm font-black text-red-800">{error}</p> : null}
    </section>
  );
}

export function ChatModerationConsole({ locale, role, initialUserId }: { locale: Locale; role: "admin" | "moderator"; initialUserId?: string }) {
  const [status, setStatus] = useState<ReportStatus>("open");
  const reports = usePaginatedQuery(api.chatModeration.listReportsPage, { status }, { initialNumItems: 20 });
  const [selectedId, setSelectedId] = useState<Id<"chatReports"> | null>(null);
  const report = useQuery(api.chatModeration.getReport, selectedId ? { reportId: selectedId } : "skip");
  const conversation = usePaginatedQuery(api.chatModeration.getReportedConversation, selectedId && report?.report.targetConversationId ? { reportId: selectedId } : "skip", { initialNumItems: 30 });
  const updateStatus = useMutation(api.chatModeration.updateReportStatus);
  const moderate = useMutation(api.chatModeration.moderateReport);
  const suspend = useMutation(api.chatModeration.suspendAccount);
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<ModerationKind>("warn");
  const [duration, setDuration] = useState<"24h" | "7d" | "30d" | "permanent">("24h");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function act() {
    if (!report || reason.trim().length < 3) return;
    setPending(true);
    setNotice(null);
    try {
      await moderate({
        reportId: report.report._id,
        kind,
        reason,
        ...(kind === "suspend_chat" ? { endsAt: Date.now() + 24 * 60 * 60 * 1_000 } : {}),
      });
      setNotice(labelFor(locale, "Moderaciona akcija je sačuvana.", "The moderation action was saved."));
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Action failed");
    } finally {
      setPending(false);
    }
  }

  async function suspendWholeAccount() {
    const userId = report?.report.targetUserId;
    if (!userId || reason.trim().length < 3) return;
    setPending(true);
    try {
      await suspend({ userId, duration, reason });
      setNotice(labelFor(locale, "Nalog je suspendovan.", "The account was suspended."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase text-[#2e6f9f]">{role}</p><h1 className="font-display text-4xl text-ink">{labelFor(locale, "Chat sigurnost", "Chat safety")}</h1><p className="mt-1 text-sm font-bold text-muted">{labelFor(locale, "Prijave, neizmenjivi snapshoti, sankcije i audit pristupa.", "Reports, immutable snapshots, sanctions, and access auditing.")}</p></div><Link href={withLocale(locale, "/app/messages")} className="rounded-full border-2 border-ink bg-white px-4 py-2 text-xs font-black"><MessageSquareText className="mr-2 inline size-4" />{labelFor(locale, "Poruke", "Messages")}</Link></header>

      {role === "admin" ? <AdminUserChatAudit locale={locale} initialUserId={initialUserId} /> : null}

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-[16px] border-2 border-ink bg-white p-4"><div className="flex flex-wrap gap-2">{(["open", "reviewing", "resolved", "dismissed"] as ReportStatus[]).map((value) => <button key={value} type="button" onClick={() => { setStatus(value); setSelectedId(null); }} className={cn("rounded-full border-2 border-ink px-3 py-1.5 text-[10px] font-black uppercase", status === value ? "bg-ink text-white" : "bg-white")}>{value}</button>)}</div><div className="mt-4 max-h-[700px] space-y-2 overflow-y-auto">{reports.results.map((item) => <button key={item._id} type="button" onClick={() => setSelectedId(item._id)} className={cn("w-full rounded-[16px] border-2 p-3 text-left", selectedId === item._id ? "border-ink bg-yellow/20" : "border-line bg-paper")}><p className="text-[10px] font-black uppercase text-red-700">{item.targetType} · {item.status}</p><p className="mt-1 line-clamp-2 text-sm font-black leading-5">{item.reason}</p><p className="mt-2 text-[10px] font-bold text-muted">{date(locale, item.createdAt)}</p></button>)}{reports.status === "CanLoadMore" ? <button type="button" onClick={() => reports.loadMore(20)} className="w-full rounded-full border-2 border-ink px-3 py-2 text-xs font-black">{labelFor(locale, "Učitaj još", "Load more")}</button> : null}</div></aside>

        <section className="min-w-0 rounded-[16px] border-2 border-ink bg-white p-4 sm:p-5">{!selectedId ? <div className="grid min-h-[420px] place-items-center text-center"><div><ShieldAlert className="mx-auto size-10 text-muted" /><p className="mt-3 font-black text-muted">{labelFor(locale, "Izaberi prijavu.", "Select a report.")}</p></div></div> : report === undefined ? <div className="grid min-h-[420px] place-items-center"><Loader2 className="size-7 animate-spin" /></div> : report === null ? <p>{labelFor(locale, "Prijava nije pronađena.", "Report not found.")}</p> : <div><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-red-700">{report.report.targetType} · {report.report.status}</p><h2 className="mt-1 text-2xl font-black">{report.report.reason}</h2><p className="mt-1 text-xs font-bold text-muted">{date(locale, report.report.createdAt)}</p></div><div className="flex gap-2"><button type="button" onClick={() => void updateStatus({ reportId: report.report._id, status: "reviewing" })} className="rounded-full border-2 border-ink bg-yellow px-3 py-2 text-xs font-black">{labelFor(locale, "Preuzmi", "Review")}</button><button type="button" onClick={() => void updateStatus({ reportId: report.report._id, status: "dismissed" })} className="rounded-full border-2 border-ink bg-white px-3 py-2 text-xs font-black">{labelFor(locale, "Odbaci", "Dismiss")}</button></div></div><details className="mt-4 rounded-[16px] border-2 border-line bg-paper p-3"><summary className="cursor-pointer text-xs font-black uppercase text-muted">{labelFor(locale, "Neizmenjivi snapshot", "Immutable snapshot")}</summary><pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs font-bold">{report.report.snapshotJson}</pre></details>{report.report.targetConversationId ? <div className="mt-5"><h3 className="font-black">{labelFor(locale, "Prijavljeni razgovor", "Reported conversation")}</h3><div className="mt-2 max-h-[360px] space-y-2 overflow-y-auto rounded-[16px] border-2 border-line bg-paper p-3">{conversation.results.map((message) => <article key={message._id} className="rounded-[12px] bg-white p-3"><div className="flex justify-between gap-2 text-[10px] font-black text-muted"><span>{message.senderName}</span><span>#{message.sequence}</span></div><p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-6">{message.body || labelFor(locale, "[bez teksta]", "[no text]")}</p></article>)}</div>{conversation.status === "CanLoadMore" ? <button type="button" onClick={() => conversation.loadMore(30)} className="mt-2 rounded-full border-2 border-ink bg-white px-4 py-2 text-xs font-black">{labelFor(locale, "Učitaj još", "Load more")}</button> : null}</div> : null}<div className="mt-5 rounded-[16px] border-2 border-ink bg-paper p-4"><h3 className="flex items-center gap-2 font-black"><Gavel className="size-5" />{labelFor(locale, "Akcija", "Action")}</h3><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder={labelFor(locale, "Obavezan razlog akcije", "Required action reason")} className="mt-3 w-full rounded-[8px] border-2 border-ink bg-white p-3 font-bold" /><div className="mt-3 flex flex-wrap gap-2">{(["warn", "remove_message", "suspend_chat", "recommend_account_suspension"] as ModerationKind[]).map((value) => <button key={value} type="button" disabled={value === "remove_message" && !report.report.targetMessageId} onClick={() => setKind(value)} className={cn("rounded-full border-2 border-ink px-3 py-2 text-xs font-black disabled:opacity-40", kind === value ? "bg-ink text-white" : "bg-white")}>{value}</button>)}</div><button type="button" disabled={pending || reason.trim().length < 3} onClick={() => void act()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black shadow-[3px_3px_0_0_#0e3158] disabled:opacity-50"><CircleAlert className="size-4" />{labelFor(locale, "Primeni akciju", "Apply action")}</button>{role === "admin" && report.report.targetUserId ? <div className="mt-4 border-t-2 border-line pt-4"><p className="text-xs font-black uppercase text-red-700">{labelFor(locale, "Puna suspenzija naloga", "Full account suspension")}</p><div className="mt-2 flex flex-wrap gap-2"><select value={duration} onChange={(event) => setDuration(event.target.value as typeof duration)} className="h-11 rounded-[8px] border-2 border-ink bg-white px-3 text-sm font-black"><option value="24h">24h</option><option value="7d">7d</option><option value="30d">30d</option><option value="permanent">{labelFor(locale, "Trajno", "Permanent")}</option></select><button type="button" disabled={pending || reason.trim().length < 3} onClick={() => void suspendWholeAccount()} className="rounded-full border-2 border-red-800 bg-red-700 px-4 text-xs font-black text-white disabled:opacity-50">{labelFor(locale, "Suspenduj nalog", "Suspend account")}</button></div></div> : null}{notice ? <p role="status" className="mt-3 text-sm font-black">{notice}</p> : null}</div></div>}</section>
      </div>

      {role === "admin" ? <AppealsPanel locale={locale} /> : null}
    </div>
  );
}
