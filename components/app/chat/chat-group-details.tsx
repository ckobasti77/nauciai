/* eslint-disable @next/next/no-img-element -- Convex storage URLs are signed and dynamic. */
"use client";

import { ImagePlus, Loader2, Search, UploadCloud, UserPlus, X } from "lucide-react";
import { useAction, useMutation, usePaginatedQuery } from "convex/react";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import {
  Avatar,
  type CommunityMember,
  type ConversationData,
  type ConversationMember,
  label,
} from "@/components/app/chat/chat-shared";
import { useModalFocus } from "@/components/ui/dialog";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";

async function fileSha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function ConversationDetailsDialog({
  locale,
  conversation,
  onClose,
  onExit,
}: {
  locale: Locale;
  conversation: ConversationData;
  onClose: () => void;
  onExit: () => void;
}) {
  const conversationId = conversation.conversation.id;
  const isGroup = conversation.conversation.kind === "group";
  const isOwner = conversation.viewer.role === "owner" && conversation.conversation.ownerId === conversation.viewer.userId;
  const isStudyManaged = Boolean((conversation.conversation as ConversationData["conversation"] & { studyGroupId?: Id<"studyGroups"> }).studyGroupId);
  const [name, setName] = useState(conversation.conversation.title ?? "");
  const [inviteSearch, setInviteSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [draggingAvatar, setDraggingAvatar] = useState(false);
  const [confirmMemberAction, setConfirmMemberAction] = useState<{ kind: "remove" | "transfer"; userId: Id<"users"> }>();
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const media = usePaginatedQuery(api.chat.listConversationMediaPage, { conversationId }, { initialNumItems: 18 });
  const members = usePaginatedQuery(api.chat.listConversationMembersPage, isGroup ? { conversationId } : "skip", { initialNumItems: 30 });
  const invites = usePaginatedQuery(api.chat.listConversationInvitesPage, isGroup ? { conversationId } : "skip", { initialNumItems: 30 });
  const candidates = usePaginatedQuery(
    api.community.listMembersPage,
    isGroup && isOwner && !isStudyManaged ? (inviteSearch.trim() ? { search: inviteSearch.trim() } : {}) : "skip",
    { initialNumItems: 20 },
  );
  const updateGroup = useMutation(api.chat.updateGroup);
  const createGroupAvatarUpload = useMutation(api.chat.createGroupAvatarUpload);
  const prepareGroupAvatar = useAction(api.chatMedia.prepareGroupAvatar);
  const inviteGroupMember = useMutation(api.chat.inviteGroupMember);
  const removeGroupMember = useMutation(api.chat.removeGroupMember);
  const transferGroupOwnership = useMutation(api.chat.transferGroupOwnership);
  const leaveGroup = useMutation(api.chat.leaveGroup);
  // Panel se montira samo dok je otvoren, pa je `open` ovde konstantno `true`.
  const dialogRef = useModalFocus(true, onClose);
  const memberIds = new Set(
    [...members.results, ...invites.results].map((member) => String(member.userId)),
  );
  const inviteCandidates = candidates.results.filter(
    (member): member is CommunityMember & { userId: Id<"users"> } => Boolean(member.userId && member.role !== "admin" && member.canFollow && !memberIds.has(String(member.userId))),
  );

  const uploadAvatar = useCallback(async (file: File) => {
    if (!isOwner || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      setNotice(label(locale, "Izaberi sliku do 5 MB.", "Choose an image up to 5 MB."));
      return;
    }
    setBusyKey("avatar");
    setNotice(undefined);
    try {
      const sha256 = await fileSha256(file);
      const { uploadId, uploadUrl } = await createGroupAvatarUpload({
        conversationId,
        sha256,
        byteSize: file.size,
        contentType: file.type.toLowerCase(),
      });
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error("Upload failed");
      const { storageId } = await response.json() as { storageId: Id<"_storage"> };
      await prepareGroupAvatar({ conversationId, uploadId, storageId });
      setNotice(label(locale, "Avatar grupe je sačuvan.", "Group avatar saved."));
    } catch {
      setNotice(label(locale, "Avatar nije sačuvan.", "Avatar was not saved."));
    } finally {
      setBusyKey(undefined);
    }
  }, [conversationId, createGroupAvatarUpload, isOwner, locale, prepareGroupAvatar]);

  useEffect(() => {
    if (!isOwner) return;
    const isImageDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const onDragEnter = (event: DragEvent) => { if (!isImageDrag(event)) return; event.preventDefault(); setDraggingAvatar(true); };
    const onDragOver = (event: DragEvent) => { if (!isImageDrag(event)) return; event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"; };
    const onDragLeave = (event: DragEvent) => { if (!event.relatedTarget) setDraggingAvatar(false); };
    const onDrop = (event: DragEvent) => {
      if (!isImageDrag(event)) return;
      event.preventDefault();
      setDraggingAvatar(false);
      const image = Array.from(event.dataTransfer?.files ?? []).find((file) => file.type.startsWith("image/"));
      if (image) void uploadAvatar(image);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [isOwner, uploadAvatar]);

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) return;
    setBusyKey("rename");
    setNotice(undefined);
    try {
      await updateGroup({ conversationId, name: name.trim() });
      setNotice(label(locale, "Naziv je sačuvan.", "Name saved."));
    } catch {
      setNotice(label(locale, "Naziv nije sačuvan.", "Name was not saved."));
    } finally {
      setBusyKey(undefined);
    }
  }

  async function invite(userId: Id<"users">) {
    setBusyKey(`invite:${userId}`);
    setNotice(undefined);
    try {
      await inviteGroupMember({ conversationId, userId });
      setNotice(label(locale, "Poziv je poslat.", "Invite sent."));
    } catch {
      setNotice(label(locale, "Poziv nije poslat.", "Invite was not sent."));
    } finally {
      setBusyKey(undefined);
    }
  }

  async function manageMember(kind: "remove" | "transfer", userId: Id<"users">) {
    if (confirmMemberAction?.kind !== kind || confirmMemberAction.userId !== userId) {
      setConfirmMemberAction({ kind, userId });
      return;
    }
    setBusyKey(`${kind}:${userId}`);
    setNotice(undefined);
    try {
      if (kind === "remove") await removeGroupMember({ conversationId, userId });
      else await transferGroupOwnership({ conversationId, newOwnerId: userId });
      setConfirmMemberAction(undefined);
      setNotice(kind === "remove" ? label(locale, "Član je uklonjen.", "Member removed.") : label(locale, "Vlasništvo je preneto.", "Ownership transferred."));
    } catch {
      setNotice(label(locale, "Akcija nije uspela.", "The action failed."));
    } finally {
      setBusyKey(undefined);
    }
  }

  async function leave() {
    if (!leaveConfirm) {
      setLeaveConfirm(true);
      return;
    }
    setBusyKey("leave");
    try {
      await leaveGroup({ conversationId });
      onExit();
    } catch {
      setNotice(label(locale, "Pre izlaska prenesi vlasništvo drugom članu.", "Transfer ownership before leaving."));
      setBusyKey(undefined);
    }
  }

  return (
    <div className="fixed inset-0 z-[105] flex justify-end p-0 sm:p-3">
      <button type="button" tabIndex={-1} onClick={onClose} aria-label={label(locale, "Zatvori detalje razgovora", "Close conversation details")} className="absolute inset-0 rounded-none border-0 bg-scrim/55 p-0 backdrop-blur-[2px]" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="conversation-details-title" tabIndex={-1} data-chat-motion-surface="panel" className="relative flex h-full w-[min(460px,100%)] flex-col overflow-hidden rounded-l-[16px] border-[3px] border-ink bg-paper-strong shadow-[-9px_0_24px_var(--shadow-hard-20)] sm:rounded-[16px]">
        {draggingAvatar ? <div data-chat-motion="drag-overlay" data-chat-motion-new="true" className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-scrim/80 p-5 text-center text-white"><div className="rounded-[16px] border-2 border-paper-strong bg-ink p-6 shadow-[6px_6px_0_0_var(--yellow)]"><UploadCloud className="mx-auto size-9" /><p className="mt-3 text-lg font-black">{label(locale, "Pusti avatar grupe", "Drop the group avatar")}</p><p className="mt-1 text-xs font-bold text-paper-strong/70">{label(locale, "Slika do 5 MB", "Image up to 5 MB")}</p></div></div> : null}
        <div className="flex items-center justify-between gap-3 border-b-2 border-ink p-4"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#2e6f9f] dark:text-muted">{isGroup ? label(locale, "Grupa", "Group") : label(locale, "Razgovor", "Conversation")}</p><h2 id="conversation-details-title" className="font-display text-2xl">{label(locale, "Detalji razgovora", "Conversation details")}</h2></div><button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full border-2 border-ink" aria-label={label(locale, "Zatvori", "Close")}><X className="size-4" /></button></div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {notice ? <p role="status" className="rounded-[8px] border border-line bg-paper px-3 py-2 text-xs font-black">{notice}</p> : null}
          <section className="rounded-[16px] border-2 border-line p-3" aria-labelledby="conversation-media-title">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted">{label(locale, "Zajednički sadržaj", "Shared content")}</p><h3 id="conversation-media-title" className="text-sm font-black">{label(locale, "Mediji", "Media")}</h3></div><ImagePlus className="size-5 text-[#2e6f9f] dark:text-muted" /></div>
            {media.results.length ? <div className="mt-3 grid grid-cols-3 gap-2">{media.results.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="group relative aspect-square overflow-hidden rounded-[8px] border-2 border-ink bg-paper"><img src={item.url} alt={item.fileName || ""} className="h-full w-full object-cover transition group-hover:scale-[1.03] motion-reduce:transition-none" /><span className="absolute inset-x-0 bottom-0 truncate bg-scrim/75 px-1.5 py-1 font-mono text-[8px] font-bold text-white">{new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : "en", { day: "2-digit", month: "2-digit" }).format(new Date(item.createdAt))}</span></a>)}</div> : null}
            {media.status === "LoadingFirstPage" ? <div className="grid min-h-24 place-items-center"><Loader2 className="size-5 animate-spin" /></div> : null}
            {!media.results.length && media.status === "Exhausted" ? <p className="mt-3 rounded-[12px] border border-dashed border-line bg-paper p-4 text-center text-xs font-bold text-muted">{label(locale, "Još nema deljenih slika.", "No shared images yet.")}</p> : null}
            {media.status === "CanLoadMore" ? <button type="button" onClick={() => media.loadMore(18)} className="mt-3 w-full rounded-full border border-ink bg-paper-strong px-3 py-2 text-[10px] font-black">{label(locale, "Učitaj još medija", "Load more media")}</button> : null}
          </section>
          {isGroup ? <>
          {isOwner ? <form onSubmit={rename} className="rounded-[16px] border-2 border-line p-3"><div className="mb-4 flex items-center gap-3"><Avatar src={conversation.conversation.imageUrl} name={name || label(locale, "Grupa", "Group")} size="lg" /><div className="min-w-0 flex-1"><p className="text-xs font-black">{label(locale, "Avatar grupe", "Group avatar")}</p><div className="mt-2 flex flex-wrap gap-2"><label className="cursor-pointer rounded-full border-2 border-ink bg-paper-strong px-3 py-1.5 text-[10px] font-black"><input type="file" accept="image/*" className="hidden" disabled={busyKey === "avatar"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.currentTarget.value = ""; }} />{busyKey === "avatar" ? label(locale, "Otpremanje…", "Uploading…") : label(locale, "Promeni", "Change")}</label>{conversation.conversation.imageUrl ? <button type="button" disabled={Boolean(busyKey)} onClick={() => void updateGroup({ conversationId, removeImage: true })} className="rounded-full px-3 py-1.5 text-[10px] font-black text-red-700">{label(locale, "Ukloni", "Remove")}</button> : null}</div></div></div><label className="text-xs font-black">{label(locale, "Naziv grupe", "Group name")}<span className="mt-2 flex gap-2"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className="h-10 min-w-0 flex-1 rounded-[10px] border-2 border-ink px-3 text-sm font-bold outline-none" /><button type="submit" disabled={busyKey === "rename" || name.trim().length < 2} className="rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black disabled:opacity-40">{label(locale, "Sačuvaj", "Save")}</button></span></label></form> : null}
          {isOwner && !isStudyManaged ? <div className="rounded-[16px] border-2 border-line p-3"><p className="text-xs font-black">{label(locale, "Pozovi člana", "Invite a member")}</p><label className="mt-2 flex h-10 items-center gap-2 rounded-full border-2 border-line bg-paper px-3"><Search className="size-4" /><span className="sr-only">{label(locale, "Pretraži članove", "Search members")}</span><input value={inviteSearch} onChange={(event) => setInviteSearch(event.target.value)} placeholder={label(locale, "Ime ili @username", "Name or @username")} className="min-w-0 flex-1 bg-transparent text-xs font-bold outline-none" /></label><div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">{inviteCandidates.map((member) => <button key={member.userId} type="button" onClick={() => void invite(member.userId)} disabled={Boolean(busyKey)} className="flex w-full items-center gap-2 rounded-[12px] border border-line p-2 text-left hover:border-ink disabled:opacity-50"><Avatar src={member.avatarUrl} name={member.name} size="sm" /><span className="min-w-0 flex-1 truncate text-xs font-black">{member.name}</span>{busyKey === `invite:${member.userId}` ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}</button>)}{candidates.status === "LoadingFirstPage" ? <Loader2 className="mx-auto my-4 size-5 animate-spin" /> : null}{candidates.status === "CanLoadMore" ? <button type="button" onClick={() => candidates.loadMore(20)} className="w-full rounded-full border border-ink bg-paper-strong px-3 py-2 text-[10px] font-black">{label(locale, "Učitaj još", "Load more")}</button> : null}</div></div> : null}
          {isStudyManaged ? <p className="rounded-[12px] border border-line bg-paper p-3 text-[10px] font-bold text-muted">{label(locale, "Članstvo ove grupe prati Uči zajedno; pozive i uklanjanja menjaj u tom pogledu.", "This membership follows Study together; manage invites and removals in that view.")}</p> : null}
          {invites.results.length || invites.status === "CanLoadMore" ? <div><div className="flex items-center justify-between"><p className="text-xs font-black">{label(locale, "Pozvani", "Invited")}</p><span className="font-mono text-[10px] font-bold text-muted">{invites.results.length}{invites.status === "CanLoadMore" ? "+" : ""}</span></div><div className="mt-2 space-y-2">{invites.results.map((member) => {
            if (!member.userId) return null;
            const invitedUserId = member.userId;
            const confirmingCancellation = confirmMemberAction?.kind === "remove" && confirmMemberAction.userId === invitedUserId;
            return <div key={invitedUserId} data-chat-motion="member" data-chat-motion-new="true" className="flex items-center gap-2 rounded-[12px] border border-dashed border-line bg-paper p-2"><Avatar src={member.avatarUrl} name={member.name ?? label(locale, "Član", "Member")} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{member.name}</span><span className="text-[9px] font-bold uppercase text-muted">{label(locale, "Čeka odgovor", "Awaiting response")}</span></span>{isOwner && !isStudyManaged ? <button type="button" onClick={() => void manageMember("remove", invitedUserId)} disabled={Boolean(busyKey)} className={cn("rounded-full border border-red-500 px-2 py-1 text-[9px] font-black text-red-700", confirmingCancellation && "bg-red-50")}>{confirmingCancellation ? label(locale, "Potvrdi otkazivanje", "Confirm cancellation") : label(locale, "Otkaži poziv", "Cancel invite")}</button> : null}</div>;
          })}</div>{invites.status === "CanLoadMore" ? <button type="button" onClick={() => invites.loadMore(30)} className="mt-2 w-full rounded-full border border-ink px-3 py-2 text-[10px] font-black">{label(locale, "Učitaj još", "Load more")}</button> : null}</div> : null}
          <div><div className="flex items-center justify-between"><p className="text-xs font-black">{label(locale, "Članovi", "Members")}</p><span className="font-mono text-[10px] font-bold text-muted">{members.results.length}{members.status === "CanLoadMore" ? "+" : ""}</span></div><div className="mt-2 space-y-2">{members.results.map((member: ConversationMember) => {
            if (!member.userId) return null;
            const isViewer = member.userId === conversation.viewer.userId;
            const confirmingRemove = confirmMemberAction?.kind === "remove" && confirmMemberAction.userId === member.userId;
            const confirmingTransfer = confirmMemberAction?.kind === "transfer" && confirmMemberAction.userId === member.userId;
            return <div key={member.userId} data-chat-motion="member" data-chat-motion-new="true" className="flex items-center gap-2 rounded-[12px] border border-line p-2"><Avatar src={member.avatarUrl} name={member.name ?? label(locale, "Član", "Member")} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{member.name}</span><span className="text-[9px] font-bold uppercase text-muted">{member.membershipRole === "owner" ? label(locale, "Vlasnik", "Owner") : label(locale, "Član", "Member")}</span></span>{isOwner && !isViewer ? <span className="flex flex-wrap justify-end gap-1"><button type="button" onClick={() => void manageMember("transfer", member.userId!)} disabled={Boolean(busyKey)} className={cn("rounded-full border border-ink px-2 py-1 text-[9px] font-black", confirmingTransfer ? "bg-yellow" : "bg-paper-strong")}>{confirmingTransfer ? label(locale, "Potvrdi prenos", "Confirm transfer") : label(locale, "Prenesi", "Transfer")}</button>{!isStudyManaged ? <button type="button" onClick={() => void manageMember("remove", member.userId!)} disabled={Boolean(busyKey)} className={cn("rounded-full border border-red-500 px-2 py-1 text-[9px] font-black text-red-700", confirmingRemove && "bg-red-50")}>{confirmingRemove ? label(locale, "Potvrdi uklanjanje", "Confirm removal") : label(locale, "Ukloni", "Remove")}</button> : null}</span> : null}</div>;
          })}</div>{members.status === "CanLoadMore" ? <button type="button" onClick={() => members.loadMore(30)} className="mt-2 w-full rounded-full border border-ink px-3 py-2 text-[10px] font-black">{label(locale, "Učitaj još", "Load more")}</button> : null}</div>
          {conversation.viewer.status === "active" ? <div className="rounded-[16px] border-2 border-red-300 bg-red-50 p-3"><button type="button" onClick={() => void leave()} disabled={isOwner || busyKey === "leave"} className="w-full rounded-full border-2 border-red-600 bg-paper-strong px-4 py-2 text-xs font-black text-red-700 disabled:opacity-45">{busyKey === "leave" ? <Loader2 className="mr-2 inline size-3.5 animate-spin" /> : null}{leaveConfirm ? label(locale, "Potvrdi izlazak", "Confirm leaving") : label(locale, "Napusti grupu", "Leave group")}</button>{isOwner ? <p className="mt-2 text-center text-[10px] font-bold text-red-800">{label(locale, "Vlasnik prvo mora da prenese vlasništvo.", "The owner must transfer ownership first.")}</p> : null}</div> : null}
          </> : null}
        </div>
      </div>
    </div>
  );
}
