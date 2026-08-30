"use client";

import { ChevronRight, SearchX, UserPlus, Users } from "lucide-react";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { CommunityAvatar, RoleBadge, roleLabel } from "@/components/app/community-identity";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

import { fallbackCommunityFilters, useCommunityFilters, useCommunityMembers } from "./community-data";
import { CommunityScopeControls, useCommunityQueryParams, useResolvedCommunityScope } from "./community-filters";
import { CommunityStickyToolbar } from "./community-sticky-toolbar";
import {
  CommunityRouteSkeleton,
  CommunitySearch,
  EmptyCommunityState,
  LoadMoreButton,
  ScopeTrail,
} from "./community-shared";
import type { CommunityFilters, CommunityMemberRow } from "./community-types";

type MemberRoleFilter = "all" | "student" | "pro_student" | "moderator" | "admin";
type MemberConnectionFilter = "all" | "following" | "followers";

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
  const requestedConnection = searchParams.get("connection");
  const connection: MemberConnectionFilter = requestedConnection === "following" || requestedConnection === "followers" ? requestedConnection : "all";

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
    connection,
    setRole: (next: MemberRoleFilter) => update({ role: next === "all" ? undefined : next }),
    setConnection: (next: MemberConnectionFilter) => update({ connection: next === "all" ? undefined : next }),
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
    connection: controls.connection,
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
    />
  );
}

function MemberCard({
  locale,
  member,
}: {
  locale: Locale;
  member: CommunityMemberRow;
}) {
  const toggleFollow = useMutation(api.publicProfiles.toggleFollow);
  const sourceFollowState = `${Boolean(member.isFollowing)}:${Boolean(member.isMutual)}`;
  const [optimisticFollow, setOptimisticFollow] = useState<{ source: string; following: boolean; mutual: boolean } | null>(null);
  const following = optimisticFollow?.source === sourceFollowState ? optimisticFollow.following : Boolean(member.isFollowing);
  const mutual = optimisticFollow?.source === sourceFollowState ? optimisticFollow.mutual : Boolean(member.isMutual);
  const [pending, setPending] = useState(false);

  async function follow() {
    if (!member.userId || pending) return;
    setPending(true);
    try {
      const result = await toggleFollow({ userId: member.userId as Id<"users"> });
      setOptimisticFollow({ source: sourceFollowState, following: result.following, mutual: result.isMutual });
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="group relative flex min-h-28 w-full items-start gap-3 rounded-[16px] border border-line bg-paper-strong p-3 text-left transition hover:border-ink hover:shadow-[3px_3px_0_var(--shadow-hard-08)]">
      <CommunityAvatar
        name={member.name}
        avatarUrl={member.avatarUrl}
        role={member.role}
        locale={locale}
        size="md"
        showRank={false}
      />
      <span className="min-w-0 flex-1">
        {member.username ? <Link href={withLocale(locale, `/app/members/${member.username}`)} className="flex min-w-0 items-center gap-2 rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          <span className="truncate text-base font-black text-ink">{member.name}</span>
          <ChevronRight className="size-4 shrink-0 text-line transition group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />
        </Link> : <span className="flex min-w-0 items-center gap-2"><span className="truncate text-base font-black text-ink">{member.name}</span></span>}
        {member.username ? <span className="mt-0.5 block truncate text-xs font-bold text-muted">@{member.username}</span> : null}
        <span className="mt-2 block">
          <ScopeTrail
            locale={locale}
            track={locale === "sr" ? member.trackTitleSr : member.trackTitleEn}
            course={locale === "sr" ? member.courseTitleSr : member.courseTitleEn}
            compact
          />
        </span>
        <span className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs font-black text-ink">{member.contributionCount ?? 0} {locale === "sr" ? "doprinosa" : "contributions"}</span>
          <RoleBadge role={member.role} locale={locale} compact />
        </span>
        {member.canFollow && member.userId ? <button type="button" onClick={() => void follow()} disabled={pending} className={cn("mt-3 inline-flex min-h-9 items-center gap-2 rounded-full border-2 border-ink px-3 text-[10px] font-black", following ? "bg-paper-strong" : "bg-yellow")}><UserPlus className="size-3.5" />{mutual ? (locale === "sr" ? "Pratite se" : "Mutual") : following ? (locale === "sr" ? "Pratiš" : "Following") : (locale === "sr" ? "Zaprati" : "Follow")}</button> : null}
      </span>
    </article>
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
  onLoadMore,
}: {
  locale: Locale;
  filters: CommunityFilters;
  scopeState: ReturnType<typeof useResolvedCommunityScope>;
  controls: ReturnType<typeof useMemberControls>;
  members: CommunityMemberRow[];
  loading: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore?: () => void;
}) {
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
    <div className="space-y-5">
      <CommunityStickyToolbar>
      <section className="rounded-[16px] border border-line bg-paper-strong p-3 sm:p-4">
        <div className="mb-3 flex gap-2 overflow-x-auto" role="tablist" aria-label={locale === "sr" ? "Veze članova" : "Member connections"}>
          {([
            ["all", locale === "sr" ? "Svi" : "All"],
            ["following", locale === "sr" ? "Pratim" : "Following"],
            ["followers", locale === "sr" ? "Pratioci" : "Followers"],
          ] as Array<[MemberConnectionFilter, string]>).map(([value, text]) => <button key={value} type="button" role="tab" aria-selected={controls.connection === value} onClick={() => controls.setConnection(value)} className={cn("shrink-0 rounded-full border-2 border-ink px-4 py-2 text-xs font-black", controls.connection === value ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink")}>{text}</button>)}
        </div>
        <div className="grid gap-2 xl:grid-cols-[minmax(220px,0.72fr)_minmax(0,1fr)]">
          <CommunityScopeControls locale={locale} filters={filters} scopeState={scopeState} compact />
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
                className="min-h-10 w-full rounded-full border border-line bg-paper-strong px-4 text-sm font-black text-ink outline-none hover:border-ink/55 focus:border-ink focus:ring-4 focus:ring-yellow/25 sm:w-auto"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{locale === "sr" ? option.sr : option.en}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>
      </CommunityStickyToolbar>

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
          <div className="space-y-5">
            {(["admin", "moderator", "pro_student", "student"] as const).map((groupRole) => {
              const group = scopedMembers.filter((member) => member.role === groupRole);
              if (!group.length) return null;
              return (
                <section key={groupRole} aria-labelledby={`members-${groupRole}`}>
                  <div className="mb-2 flex items-center gap-2 border-b border-line pb-2">
                    <RoleBadge role={groupRole} locale={locale} compact />
                    <h3 id={`members-${groupRole}`} className="text-xs font-black uppercase tracking-[0.12em] text-ink/60">
                      {roleLabel(groupRole, locale)}
                    </h3>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {group.map((member) => (
                      <MemberCard key={member._id} locale={locale} member={member} />
                    ))}
                  </div>
                </section>
              );
            })}
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
          title={locale === "sr" ? "Nijedan član ne odgovara ovom izboru" : "No member matches this selection"}
          body={
            locale === "sr"
              ? "Obriši reč iz pretrage ili izaberi drugi kurs i ulogu iznad. Ovde se nikad ne vide tuđi lični podaci ni podaci o plaćanju."
              : "Clear the search word, or pick a different course and role above. Other people's personal and payment details are never shown here."
          }
        />
      )}
    </div>
  );
}
