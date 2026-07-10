"use client";

import { Award, BookOpen, Check, ChevronRight, SearchX, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CommunityAvatar, RoleBadge } from "@/components/app/community-identity";
import type { Locale } from "@/lib/i18n";

import { fallbackCommunityFilters, useCommunityFilters, useCommunityMembers } from "./community-data";
import { CommunityScopeControls, useCommunityQueryParams, useResolvedCommunityScope } from "./community-filters";
import {
  CommunityMetric,
  CommunityPageHeading,
  CommunityRouteSkeleton,
  CommunitySearch,
  EmptyCommunityState,
  LoadMoreButton,
  ScopeTrail,
  sharedIcons,
} from "./community-shared";
import type { CommunityFilters, CommunityMemberRow } from "./community-types";

type MemberRoleFilter = "all" | "student" | "pro_student" | "moderator" | "admin";
type AssignableRole = "student" | "pro_student" | "moderator";

const ROLE_OPTIONS: Array<{ value: MemberRoleFilter; sr: string; en: string }> = [
  { value: "all", sr: "Sve uloge", en: "All roles" },
  { value: "student", sr: "Lite", en: "Lite" },
  { value: "pro_student", sr: "Pro", en: "Pro" },
  { value: "moderator", sr: "Moderatori", en: "Moderators" },
  { value: "admin", sr: "Admini", en: "Admins" },
];

function useMemberControls() {
  const { searchParams, update } = useCommunityQueryParams();
  const currentQuery = searchParams.get("q") ?? "";
  const [search, setSearch] = useState(currentQuery);
  const requestedRole = searchParams.get("role");
  const role: MemberRoleFilter = ROLE_OPTIONS.some((option) => option.value === requestedRole)
    ? (requestedRole as MemberRoleFilter)
    : "all";

  useEffect(() => {
    if (currentQuery === search.trim()) return;
    const timeout = window.setTimeout(() => update({ q: search.trim() || undefined }, "replace"), 320);
    return () => window.clearTimeout(timeout);
  }, [currentQuery, search, update]);

  return {
    search,
    setSearch,
    query: currentQuery.trim(),
    role,
    setRole: (next: MemberRoleFilter) => update({ role: next === "all" ? undefined : next }),
  };
}

export function CommunityMembersPage({ locale }: { locale: Locale }) {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return <LiveMembersPage locale={locale} />;
  return <StaticMembersPage locale={locale} />;
}

function StaticMembersPage({ locale }: { locale: Locale }) {
  const scopeState = useResolvedCommunityScope(fallbackCommunityFilters, locale);
  const controls = useMemberControls();
  return (
    <MembersView
      locale={locale}
      filters={fallbackCommunityFilters}
      scopeState={scopeState}
      controls={controls}
      members={[]}
      loading={false}
      canLoadMore={false}
      loadingMore={false}
      isAdmin={false}
    />
  );
}

function LiveMembersPage({ locale }: { locale: Locale }) {
  const { filters, isLoading: filtersLoading } = useCommunityFilters(true);
  const scopeState = useResolvedCommunityScope(filters, locale);
  const controls = useMemberControls();
  const membersQuery = useCommunityMembers({
    scope: filtersLoading ? { kind: "global" } : scopeState.scope,
    search: controls.query || undefined,
    role: controls.role === "all" ? undefined : controls.role,
  });

  return (
    <MembersView
      locale={locale}
      filters={filters}
      scopeState={scopeState}
      controls={controls}
      members={membersQuery.results}
      loading={filtersLoading || membersQuery.isInitialLoading}
      canLoadMore={membersQuery.status === "CanLoadMore"}
      loadingMore={membersQuery.status === "LoadingMore"}
      onLoadMore={() => membersQuery.loadMore(20)}
      isAdmin={filters.viewer.role === "admin"}
      onSetRole={(profileId, role) => membersQuery.setRole({ profileId, role })}
    />
  );
}

function MemberCard({
  locale,
  member,
  onOpen,
}: {
  locale: Locale;
  member: CommunityMemberRow;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-h-32 w-full items-start gap-3 rounded-[16px]! border border-line bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-ink hover:shadow-[4px_4px_0_rgba(14,49,88,0.1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <CommunityAvatar
        name={member.name}
        avatarUrl={member.avatarUrl}
        role={member.role}
        locale={locale}
        size="md"
        showRank={false}
      />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-base font-black text-ink">{member.name}</span>
          <ChevronRight className="size-4 shrink-0 text-line transition group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />
        </span>
        {member.username ? <span className="mt-0.5 block truncate text-xs font-bold text-muted">@{member.username}</span> : null}
        <span className="mt-2 block">
          <ScopeTrail
            locale={locale}
            track={locale === "sr" ? member.trackTitleSr : member.trackTitleEn}
            course={locale === "sr" ? member.courseTitleSr : member.courseTitleEn}
            compact
          />
        </span>
        <span className="mt-3 flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-black text-ink">{member.xp ?? 0} XP</span>
          <RoleBadge role={member.role} locale={locale} compact />
        </span>
      </span>
    </button>
  );
}

function MemberDrawer({
  locale,
  member,
  isAdmin,
  onClose,
  onSetRole,
}: {
  locale: Locale;
  member: CommunityMemberRow;
  isAdmin: boolean;
  onClose: () => void;
  onSetRole?: (profileId: string, role: AssignableRole) => Promise<unknown>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [role, setRole] = useState<AssignableRole>(
    member.role === "moderator" || member.role === "pro_student" ? member.role : "student",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  async function saveRole() {
    if (!onSetRole) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSetRole(member._id, role);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const progress = Math.max(0, Math.min(100, member.progressPercent ?? 0));

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        className="absolute inset-0 h-full w-full rounded-none bg-ink/55 backdrop-blur-[2px]"
        style={{ borderRadius: 0 }}
        onClick={onClose}
        aria-label={locale === "sr" ? "Zatvori profil" : "Close profile"}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-profile-title"
        className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l-2 border-ink bg-paper p-5 shadow-[-16px_0_48px_rgba(14,49,88,0.22)] sm:p-7"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-lg text-ink/70">{locale === "sr" ? "Javni profil" : "Public profile"}</p>
            <h2 id="member-profile-title" className="text-xl font-black text-ink">
              {locale === "sr" ? "Član zajednice" : "Community member"}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-full border border-ink bg-white text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            aria-label={locale === "sr" ? "Zatvori" : "Close"}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <section className="mt-6 rounded-[16px]! border-2 border-ink bg-white p-5 shadow-[5px_5px_0_rgba(244,190,48,0.7)]">
          <div className="flex items-center gap-4">
            <CommunityAvatar
              name={member.name}
              avatarUrl={member.avatarUrl}
              role={member.role}
              locale={locale}
              size="lg"
              showRank={false}
            />
            <div className="min-w-0">
              <h3 className="truncate text-xl font-black text-ink">{member.name}</h3>
              {member.username ? <p className="truncate text-sm font-bold text-muted">@{member.username}</p> : null}
              <div className="mt-2"><RoleBadge role={member.role} locale={locale} /></div>
            </div>
          </div>
          <div className="mt-5">
            <ScopeTrail
              locale={locale}
              track={locale === "sr" ? member.trackTitleSr : member.trackTitleEn}
              course={locale === "sr" ? member.courseTitleSr : member.courseTitleEn}
            />
          </div>
        </section>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <CommunityMetric icon={Award} label={locale === "sr" ? "Nivo" : "Level"} value={member.level ?? 1} />
          <CommunityMetric icon={Sparkles} label="XP" value={(member.xp ?? 0).toLocaleString()} />
          <CommunityMetric icon={BookOpen} label={locale === "sr" ? "Lekcije" : "Lessons"} value={member.completedLessons ?? 0} />
          <CommunityMetric icon={sharedIcons.Clock3} label={locale === "sr" ? "Korisni odgovori" : "Helpful replies"} value={member.helpfulAnswers ?? 0} />
        </div>

        {member.progressPercent !== undefined ? (
          <section className="mt-5 rounded-[16px]! border border-line bg-white p-4">
            <div className="flex items-center justify-between gap-2 text-sm font-black text-ink">
              <span>{locale === "sr" ? "Napredak na kursu" : "Course progress"}</span>
              <span className="font-mono">{progress}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dce5eb]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-yellow" style={{ width: `${progress}%` }} />
            </div>
          </section>
        ) : null}

        {isAdmin && member.role !== "admin" ? (
          <section className="mt-5 rounded-[16px]! border border-ink bg-[#eef3f7] p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-ink" aria-hidden="true" />
              <h3 className="text-sm font-black text-ink">{locale === "sr" ? "Administracija uloge" : "Role administration"}</h3>
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-muted">
              {locale === "sr"
                ? "Menja se samo uloga u zajednici. Pretplata i billing podaci nisu deo ovog profila."
                : "This changes only the community role. Subscription and billing data are not shown here."}
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.1em] text-muted">
                {locale === "sr" ? "Nova uloga" : "New role"}
              </span>
              <select
                value={role}
                onChange={(event) => {
                  setRole(event.target.value as AssignableRole);
                  setSaved(false);
                }}
                className="min-h-11 w-full rounded-[12px] border border-line bg-white px-3 text-sm font-black text-ink outline-none focus:border-ink focus:ring-4 focus:ring-yellow/25"
              >
                <option value="student">Lite</option>
                <option value="pro_student">Pro</option>
                <option value="moderator">Moderator</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void saveRole()}
              disabled={saving}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink disabled:opacity-60"
            >
              {saved ? <Check className="size-4" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
              {saved
                ? locale === "sr"
                  ? "Uloga je sačuvana"
                  : "Role saved"
                : saving
                  ? locale === "sr"
                    ? "Čuvanje"
                    : "Saving"
                  : locale === "sr"
                    ? "Sačuvaj ulogu"
                    : "Save role"}
            </button>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function MembersView({
  locale,
  filters,
  scopeState,
  controls,
  members,
  loading,
  canLoadMore,
  loadingMore,
  isAdmin,
  onLoadMore,
  onSetRole,
}: {
  locale: Locale;
  filters: CommunityFilters;
  scopeState: ReturnType<typeof useResolvedCommunityScope>;
  controls: ReturnType<typeof useMemberControls>;
  members: CommunityMemberRow[];
  loading: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  isAdmin: boolean;
  onLoadMore?: () => void;
  onSetRole?: (profileId: string, role: AssignableRole) => Promise<unknown>;
}) {
  const [selectedMember, setSelectedMember] = useState<CommunityMemberRow | null>(null);
  const scopedMembers = members.map((member) => ({
    ...member,
    trackTitleSr:
      member.trackTitleSr ?? (scopeState.scope.kind === "global" ? undefined : scopeState.selectedTrack?.titleSr),
    trackTitleEn:
      member.trackTitleEn ?? (scopeState.scope.kind === "global" ? undefined : scopeState.selectedTrack?.titleEn),
    courseTitleSr:
      member.courseTitleSr ?? (scopeState.scope.kind === "course" ? scopeState.selectedCourse?.titleSr : undefined),
    courseTitleEn:
      member.courseTitleEn ?? (scopeState.scope.kind === "course" ? scopeState.selectedCourse?.titleEn : undefined),
  }));

  return (
    <div className="space-y-6">
      <CommunityPageHeading
        eyebrow={locale === "sr" ? "Ljudi iza projekata" : "People behind the projects"}
        title={locale === "sr" ? "Pronađi člana po onome što uči" : "Find members by what they are learning"}
        body={
          locale === "sr"
            ? "Pretraži javne profile, suzi po smeru ili kursu i vidi doprinos zajednici bez privatnih podataka."
            : "Search public profiles, narrow by track or course, and see community contribution without private data."
        }
      />

      <section className="rounded-[16px]! border border-line bg-white p-3 sm:p-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <CommunitySearch
              value={controls.search}
              onChange={controls.setSearch}
              placeholder={locale === "sr" ? "Ime ili korisničko ime" : "Name or username"}
              label={locale === "sr" ? "Pretraži članove" : "Search members"}
            />
            <label className="shrink-0">
              <span className="sr-only">{locale === "sr" ? "Uloga člana" : "Member role"}</span>
              <select
                value={controls.role}
                onChange={(event) => controls.setRole(event.target.value as MemberRoleFilter)}
                className="min-h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none hover:border-ink/55 focus:border-ink focus:ring-4 focus:ring-yellow/25 sm:w-auto"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{locale === "sr" ? option.sr : option.en}</option>
                ))}
              </select>
            </label>
          </div>
          <CommunityScopeControls locale={locale} filters={filters} scopeState={scopeState} compact />
        </div>
      </section>

      {loading ? (
        <CommunityRouteSkeleton />
      ) : members.length ? (
        <section aria-live="polite">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-ink/60" aria-hidden="true" />
              <h2 className="text-sm font-black uppercase tracking-[0.1em] text-ink/65">
                {locale === "sr" ? "Direktorijum" : "Directory"}
              </h2>
            </div>
          <span className="font-mono text-xs font-black text-muted">{scopedMembers.length}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {scopedMembers.map((member) => (
              <MemberCard key={member._id} locale={locale} member={member} onOpen={() => setSelectedMember(member)} />
            ))}
          </div>
          {canLoadMore && onLoadMore ? (
            <div className="mt-6 flex justify-center">
              <LoadMoreButton locale={locale} loading={loadingMore} onClick={onLoadMore} />
            </div>
          ) : null}
        </section>
      ) : (
        <EmptyCommunityState
          locale={locale}
          icon={SearchX}
          title={locale === "sr" ? "Nema članova za ovaj izbor" : "No members match this view"}
          body={
            locale === "sr"
              ? "Promeni pretragu, ulogu ili scope. Privatni nalozi i billing podaci se nikada ne prikazuju ovde."
              : "Change the search, role, or scope. Private account and billing data are never shown here."
          }
        />
      )}

      {selectedMember ? (
        <MemberDrawer
          locale={locale}
          member={selectedMember}
          isAdmin={isAdmin}
          onClose={() => setSelectedMember(null)}
          onSetRole={onSetRole}
        />
      ) : null}
    </div>
  );
}
