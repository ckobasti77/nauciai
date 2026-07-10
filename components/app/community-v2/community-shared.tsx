"use client";

import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  GraduationCap,
  Heart,
  Loader2,
  MessageCircle,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  CommunityAvatar,
  formatCommunityTime,
  type CommunityRole,
} from "@/components/app/community-identity";
import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

import type { CommunityPostRow, CommunityScope } from "./community-types";

export function CommunityPageHeading({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="font-display text-xl leading-none text-ink/80">{eyebrow}</p>
        <h1 className="mt-2 text-[clamp(1.75rem,4vw,2.75rem)] font-black leading-[1.02] tracking-[-0.035em] text-ink">
          {title}
        </h1>
        <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-muted sm:text-base">{body}</p>
      </div>
      {action}
    </header>
  );
}

export function CommunitySearch({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-11 w-full rounded-full border border-line bg-white py-2 pl-11 pr-4 text-sm font-bold text-ink outline-none transition placeholder:font-semibold placeholder:text-muted/65 hover:border-ink/50 focus:border-ink focus:ring-4 focus:ring-yellow/25"
      />
    </label>
  );
}

export function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border px-4 text-sm font-black transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        active
          ? "border-ink bg-ink text-white shadow-[2px_2px_0_rgba(244,190,48,0.9)]"
          : "border-line bg-white text-ink/75 hover:border-ink hover:bg-yellow/15",
      )}
    >
      {children}
    </button>
  );
}

export function ScopeTrail({
  locale,
  track,
  course,
  compact = false,
}: {
  locale: Locale;
  track?: string;
  course?: string;
  compact?: boolean;
}) {
  const labels = [locale === "sr" ? "Globalno" : "Global", track, course].filter(Boolean) as string[];

  return (
    <ol
      className={cn(
        "flex min-w-0 items-center text-ink/65",
        compact ? "gap-1 text-[11px] font-extrabold" : "gap-1.5 text-xs font-black",
      )}
      aria-label={locale === "sr" ? "Putanja zajednice" : "Community path"}
    >
      {labels.map((label, index) => (
        <li key={`${label}-${index}`} className="flex min-w-0 items-center gap-1">
          {index === 0 ? <Compass className="size-3.5 shrink-0 text-yellow" aria-hidden="true" /> : null}
          {index > 0 ? <ChevronRight className="size-3 shrink-0 text-line" aria-hidden="true" /> : null}
          <span className="truncate">{label}</span>
        </li>
      ))}
    </ol>
  );
}

export function LearningSpine({
  locale,
  scope,
  track,
  course,
  xp,
}: {
  locale: Locale;
  scope?: CommunityScope;
  track?: string;
  course?: string;
  xp?: number;
}) {
  const steps = [
    {
      key: "global",
      label: locale === "sr" ? "Globalna zajednica" : "Global community",
      meta: locale === "sr" ? "Svi smerovi" : "All tracks",
      active: !scope || scope.kind === "global",
      icon: Compass,
    },
    {
      key: "track",
      label: track || (locale === "sr" ? "Izaberi smer" : "Choose a track"),
      meta: locale === "sr" ? "Smer" : "Track",
      active: scope?.kind === "track",
      icon: GraduationCap,
    },
    {
      key: "course",
      label: course || (locale === "sr" ? "Izaberi kurs" : "Choose a course"),
      meta: locale === "sr" ? "Kurs" : "Course",
      active: scope?.kind === "course",
      icon: BookOpen,
    },
  ];

  return (
    <aside className="rounded-[16px]! border border-ink/15 bg-[#eef3f7] p-4" aria-label={locale === "sr" ? "Putanja učenja" : "Learning path"}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-ink/60">
          {locale === "sr" ? "Learning spine" : "Learning spine"}
        </p>
        {typeof xp === "number" ? (
          <span className="rounded-full border border-ink bg-yellow px-2.5 py-1 font-mono text-[11px] font-black text-ink">
            {xp.toLocaleString(locale === "sr" ? "sr-RS" : "en-US")} XP
          </span>
        ) : null}
      </div>
      <ol className="relative mt-4 space-y-3 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-0.5 before:bg-ink/15">
        {steps.map(({ key, label, meta, active, icon: Icon }) => (
          <li key={key} className="relative flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border bg-white",
                active ? "border-ink bg-yellow text-ink" : "border-ink/20 text-ink/45",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-muted">{meta}</span>
              <span className={cn("block truncate text-sm font-black", active ? "text-ink" : "text-ink/70")}>{label}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function roleTone(role?: CommunityRole) {
  if (role === "admin") return "bg-yellow";
  if (role === "moderator") return "bg-[#dcecf1]";
  return "bg-white";
}

export function ThreadCard({
  locale,
  post,
  track,
  course,
  statusLabel,
  notice,
  action,
  highlighted = false,
}: {
  locale: Locale;
  post: CommunityPostRow;
  track?: string;
  course?: string;
  statusLabel?: ReactNode;
  notice?: ReactNode;
  action?: ReactNode;
  highlighted?: boolean;
}) {
  const threadHref = post._id.startsWith("preview-")
    ? withLocale(locale, "/app/community/discussions")
    : withLocale(locale, `/app/community/${post._id}`);

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-[16px]! border bg-white transition duration-200 focus-within:border-ink hover:-translate-y-0.5 hover:border-ink hover:shadow-[4px_4px_0_rgba(14,49,88,0.1)]",
        highlighted ? "border-ink shadow-[5px_5px_0_rgba(244,190,48,0.8)]" : "border-line",
      )}
    >
      <div className="flex min-w-0 gap-3 p-4 sm:gap-4 sm:p-5">
        <div className="relative shrink-0">
          <div className="absolute bottom-0 left-1/2 top-12 w-0.5 -translate-x-1/2 bg-line/70" aria-hidden="true" />
          <CommunityAvatar
            name={post.authorName}
            avatarUrl={post.authorAvatarUrl}
            role={post.authorRole}
            rank={post.authorRank}
            locale={locale}
            size="sm"
            showRank={false}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-black text-ink">{post.authorName}</span>
            {post.authorUsername ? <span className="text-xs font-bold text-muted">@{post.authorUsername}</span> : null}
            <span className="text-xs font-bold text-muted/75">· {formatCommunityTime(post.createdAt, locale)}</span>
            {statusLabel}
          </div>
          <ScopeTrail locale={locale} track={track} course={course} compact />
          <Link
            href={threadHref}
            className="mt-2 block rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
          >
            <h2 className="text-lg font-black leading-snug tracking-[-0.018em] text-ink transition group-hover:text-[#164d7d] sm:text-xl">
              {post.title}
            </h2>
            <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-6 text-muted">{post.body}</p>
          </Link>
          {notice ? <div className="mt-3">{notice}</div> : null}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs font-black text-muted">
              <span className="inline-flex items-center gap-1.5">
                <MessageCircle className="size-3.5" aria-hidden="true" />
                {post.commentsCount ?? 0}
                <span className="sr-only">{locale === "sr" ? "odgovora" : "replies"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Heart className="size-3.5" aria-hidden="true" />
                {post.reactionsCount ?? 0}
                <span className="sr-only">{locale === "sr" ? "reakcija" : "reactions"}</span>
              </span>
              {post.isFeaturedGlobal || post.isPinned ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-yellow/25 px-2 py-1 text-ink">
                  <Star className="size-3 fill-yellow text-ink" aria-hidden="true" />
                  {locale === "sr" ? "Mentorski izbor" : "Mentor pick"}
                </span>
              ) : null}
            </div>
            {action}
          </div>
        </div>
      </div>
      <div className={cn("absolute left-0 top-0 h-full w-1", roleTone(post.authorRole))} aria-hidden="true" />
    </article>
  );
}

export function EmptyCommunityState({
  locale,
  icon: Icon = CircleHelp,
  title,
  body,
  action,
}: {
  locale: Locale;
  icon?: typeof CircleHelp;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <section className="grid min-h-72 place-items-center rounded-[16px]! border border-dashed border-ink/35 bg-white/70 p-6 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-12 place-items-center rounded-full border border-ink bg-yellow text-ink">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-xl font-black text-ink">{title}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-muted">{body}</p>
        {action ? <div className="mt-5">{action}</div> : null}
        <span className="sr-only">{locale === "sr" ? "Prazan prikaz" : "Empty view"}</span>
      </div>
    </section>
  );
}

export function LoadMoreButton({
  locale,
  loading,
  onClick,
}: {
  locale: Locale;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-ink bg-white px-5 text-sm font-black text-ink transition hover:bg-yellow/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60"
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
      {loading
        ? locale === "sr"
          ? "Učitavanje"
          : "Loading"
        : locale === "sr"
          ? "Prikaži još"
          : "Show more"}
    </button>
  );
}

export function CommunityRouteSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading community content">
      <div className="h-24 animate-pulse rounded-[16px]! bg-ink/8" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-44 animate-pulse rounded-[16px]! border border-line bg-white" />
          ))}
        </div>
        <div className="hidden h-64 animate-pulse rounded-[16px]! bg-ink/8 xl:block" />
      </div>
    </div>
  );
}

export function CommunityMetric({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-[12px] bg-[#eef3f7] px-3 py-2">
      <Icon className="size-4 text-ink/55" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block font-mono text-sm font-black text-ink">{value}</span>
        <span className="block truncate text-[10px] font-black uppercase tracking-[0.1em] text-muted">{label}</span>
      </span>
    </div>
  );
}

export const sharedIcons = { Clock3, Sparkles };
