"use client";

import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Compass,
  GraduationCap,
  Pin,
  Search,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  CommunityAvatar,
  formatCommunityTime,
  type CommunityRole,
} from "@/components/app/community-identity";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

import type { CommunityPostRow, CommunityScope } from "./community-types";

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
        className="min-h-10 w-full rounded-full border border-line bg-paper-strong py-2 pl-11 pr-4 text-sm font-bold text-ink transition placeholder:font-semibold placeholder:text-muted/65 hover:border-ink/50 focus:border-ink focus:ring-4 focus:ring-yellow/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
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
          ? "border-ink bg-ink text-paper-strong shadow-[2px_2px_0_var(--yellow)]"
          : "border-line bg-paper-strong text-ink/75 hover:border-ink hover:bg-yellow/15",
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
        compact ? "gap-1 type-caption font-extrabold" : "gap-1.5 type-caption font-black",
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
    <aside className="surface-card border border-ink/15 bg-ink/5 p-4 dark:bg-ink/10" aria-label={locale === "sr" ? "Putanja učenja" : "Learning path"}>
      <div className="flex items-center justify-between gap-3">
        <p className="type-eyebrow text-ink/60">
          {locale === "sr" ? "Learning spine" : "Learning spine"}
        </p>
        {typeof xp === "number" ? (
          <span className="rounded-full border border-ink bg-yellow px-2.5 py-1 font-mono type-caption font-black text-ink">
            {xp.toLocaleString(locale === "sr" ? "sr-RS" : "en-US")} XP
          </span>
        ) : null}
      </div>
      <ol className="relative mt-4 space-y-3 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-0.5 before:bg-ink/15">
        {steps.map(({ key, label, meta, active, icon: Icon }) => (
          <li key={key} className="relative flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border bg-paper-strong",
                active ? "border-ink bg-yellow text-ink" : "border-ink/20 text-ink/45",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block type-eyebrow-sm text-muted">{meta}</span>
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
  if (role === "moderator") return "bg-blue-mid/25 dark:bg-ink/10";
  return "bg-paper-strong";
}

export function ThreadCard({
  locale,
  post,
  track,
  course,
  statusLabel,
  notice,
  action,
  leadingAction,
  below,
  highlighted = false,
}: {
  locale: Locale;
  post: CommunityPostRow;
  track?: string;
  course?: string;
  statusLabel?: ReactNode;
  notice?: ReactNode;
  action?: ReactNode;
  leadingAction?: ReactNode;
  below?: ReactNode;
  highlighted?: boolean;
}) {
  const threadHref = post._id.startsWith("preview-")
    ? withLocale(locale, "/app/community/discussions")
    : withLocale(locale, `/app/community/${post._id}`);

  return (
    <article
      data-motion="card"
      className={cn(
        "group relative isolate overflow-hidden surface-card border-2 border-ink bg-paper-strong transition duration-200 focus-within:border-ink hover:border-ink",
        // Zuta tvrda senka = "ova je istaknuta"; mastilo = obicna kartica u feedu.
        // Ranije je razliku nosio goli heks okvira (#d7a91b) i pozadine (#fffaf0),
        // koji u tamnoj temi nisu imali parnjaka.
        highlighted
          ? "bg-yellow/10 shadow-[6px_6px_0_0_var(--yellow)] hover:shadow-[8px_8px_0_0_var(--yellow)] dark:bg-yellow/15"
          : "shadow-[6px_6px_0_0_var(--shadow-hard-13)] hover:shadow-[8px_8px_0_0_var(--shadow-hard-13)]",
      )}
    >
      <div className="flex min-w-0 gap-3 p-4">
        <Link
          href={post.authorUsername ? withLocale(locale, `/app/members/${post.authorUsername}`) : threadHref}
          className="relative z-10 shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          aria-label={locale === "sr" ? `Profil člana ${post.authorName}` : `${post.authorName}'s profile`}
        >
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
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {post.authorUsername ? <Link href={withLocale(locale, `/app/members/${post.authorUsername}`)} className="relative z-10 type-body-sm font-black text-ink hover:underline">@{post.authorUsername}</Link> : <span className="type-body-sm font-black text-ink">{post.authorName}</span>}
            {post.authorUsername ? <span className="type-caption font-semibold text-muted">{post.authorName}</span> : null}
            <span className="type-caption font-bold text-muted/75">· {formatCommunityTime(post.createdAt, locale)}</span>
            {statusLabel}
            {highlighted ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow/20 px-2 py-0.5 type-caption font-black text-ink/70">
                <Pin className="size-3 fill-yellow text-ink" aria-hidden="true" />
                {locale === "sr" ? "Zakačeno" : "Pinned"}
              </span>
            ) : null}
          </div>
          <ScopeTrail locale={locale} track={track} course={course} compact />
          <div className="relative z-10 mt-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <Link
              href={threadHref}
              className="min-w-0 flex-1 surface-media after:absolute after:inset-0 after:z-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
            >
              <h2 className="truncate type-h4 text-ink transition group-hover:text-blue-mid dark:group-hover:text-ink">
                {post.title}
              </h2>
              <p className="mt-1 line-clamp-1 type-caption font-semibold text-muted">{post.body}</p>
            </Link>
            {/* Dve grupe akcija, ne jedan niz od pet dugmadi: `leadingAction` je
                razgovor (glas + komentari), `action` je sta radis sa temom (podeli,
                sacuvaj). Razmak izmedju grupa je jedan korak veci od razmaka unutar
                grupe, pa se granica vidi bez ijedne nove linije. */}
            <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-end gap-3 self-end sm:flex-nowrap sm:self-start">
              {leadingAction}
              {action}
            </div>
          </div>
          {notice ? <div className="mt-3">{notice}</div> : null}
        </div>
      </div>
      <div className={cn("absolute left-0 top-0 h-full w-1", roleTone(post.authorRole))} aria-hidden="true" />
      {below ? <div className="relative z-10 border-t border-line bg-paper/35 p-4">{below}</div> : null}
    </article>
  );
}

/**
 * Prazno stanje zajednice je od U5 samo omotac oko `EmptyState` primitiva iz
 * `components/ui/empty-state.tsx` - potpis ostaje isti zbog pet pozivaoca, ali
 * se zajednica vise ne crta po svojim pravilima. `locale` sluzi jos samo
 * citacu ekrana.
 */
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
    <section aria-label={locale === "sr" ? "Prazan prikaz" : "Empty view"}>
      <EmptyState className="min-h-72" icon={Icon} title={title} body={body} action={action} />
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
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-ink bg-paper-strong px-5 text-sm font-black text-ink transition hover:bg-yellow/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60"
    >
      {loading ? <Spinner /> : <ArrowRight className="size-4" aria-hidden="true" />}
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
      <div className="h-24 animate-pulse surface-card bg-ink/8" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-44 animate-pulse surface-card border border-line bg-paper-strong" />
          ))}
        </div>
        <div className="hidden h-64 animate-pulse surface-card bg-ink/8 xl:block" />
      </div>
    </div>
  );
}

