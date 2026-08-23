"use client";

import type { FunctionReturnType } from "convex/server";
import {
  ArrowRight,
  Bell,
  Coins,
  GraduationCap,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { LinkButton, Panel, cn } from "@/components/ui/primitives";
import type { api } from "@/convex/_generated/api";
import { classroomPath, lessonPath } from "@/lib/app-routes";
import { localized, t as tr, withLocale, type Locale, type LocalizedText } from "@/lib/i18n";

// Oblik koji vraća agregatni query — jedini izvor podataka za komandnu tablu.
export type DashboardOverview = NonNullable<
  FunctionReturnType<typeof api.dashboard.getDashboardOverview>
>;

// nextLessons se puni iz agregata (live) ili iz lib/content (hasConvex === false),
// pa je izdvojen kao zaseban ulaz koji oba puta hrane.
export type NextLesson = {
  courseSlug: string;
  lessonSlug: string;
  title: LocalizedText;
  durationSeconds: number;
};

function formatMinutes(durationSeconds: number) {
  return `${Math.max(1, Math.round(durationSeconds / 60))} min`;
}

function formatWhen(locale: Locale, at: number | null) {
  if (!at) return undefined;
  return new Intl.DateTimeFormat(locale === "sr" ? "sr-RS" : "en-US", {
    day: "2-digit",
    month: "short",
  }).format(new Date(at));
}

function studioKindLabel(locale: Locale, kind: string) {
  if (kind === "image") return tr(locale, "Slika", "Image");
  if (kind === "video") return tr(locale, "Video", "Video");
  if (kind === "audio") return tr(locale, "Audio", "Audio");
  return kind;
}

// ── Reusable window ─────────────────────────────────────────────────────────
export type WindowRow = {
  key: string;
  href?: string;
  leading?: ReactNode;
  primary: string;
  secondary?: string;
  meta?: string;
};

function WindowRowView({ row }: { row: WindowRow }) {
  const inner = (
    <>
      {row.leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-ink">{row.primary}</p>
        {row.secondary ? <p className="truncate text-xs font-bold text-muted">{row.secondary}</p> : null}
      </div>
      {row.meta ? <span className="shrink-0 text-xs font-bold text-muted">{row.meta}</span> : null}
    </>
  );
  // Nested panel unutar kartice → inset radius (12px).
  const className =
    "flex items-center gap-3 rounded-[12px] border-2 border-line bg-paper px-3 py-2";
  if (row.href) {
    return (
      <Link
        href={row.href}
        className={cn(
          className,
          "transition hover:-translate-y-0.5 hover:bg-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        )}
      >
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

export function DashboardWindow({
  eyebrow,
  title,
  icon: Icon,
  badge,
  items,
  emptyMessage,
  ctaLabel,
  ctaHref,
}: {
  eyebrow: string;
  title: string;
  icon: LucideIcon;
  badge?: number;
  items: WindowRow[];
  emptyMessage: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <Panel as="article" className="flex flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b-2 border-line p-4 sm:p-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-black uppercase text-muted">
            <Icon className="size-4 text-ink" />
            {eyebrow}
          </p>
          <h3 className="mt-1 text-lg font-black leading-tight text-ink">{title}</h3>
        </div>
        {badge && badge > 0 ? (
          <span className="shrink-0 rounded-full border-2 border-ink bg-yellow px-2.5 py-0.5 text-xs font-black text-ink">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </div>
      <div className="flex-1 p-4 sm:p-5">
        {items.length ? (
          <ul className="space-y-2">
            {items.slice(0, 3).map((row) => (
              <li key={row.key}>
                <WindowRowView row={row} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm font-bold leading-6 text-muted">{emptyMessage}</p>
        )}
      </div>
      <div className="border-t-2 border-line p-4 sm:p-5">
        <LinkButton href={ctaHref} tone="paper" className="w-full min-h-10 px-4 text-xs">
          {ctaLabel}
          <ArrowRight className="size-4" />
        </LinkButton>
      </div>
    </Panel>
  );
}

// ── Leading media ───────────────────────────────────────────────────────────
function AvatarLeading({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={36}
        height={36}
        unoptimized
        className="size-9 shrink-0 rounded-full border-2 border-ink object-cover"
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-xs font-black text-ink">
      {initial}
    </span>
  );
}

function ThumbLeading({ url, label }: { url: string | null; label: ReactNode }) {
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={40}
        height={40}
        unoptimized
        className="size-10 shrink-0 rounded-[8px] border-2 border-ink object-cover"
      />
    );
  }
  return (
    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink bg-paper text-ink">
      {label}
    </span>
  );
}

// ── PULS: 4 kompaktna tile-a ────────────────────────────────────────────────
function PulseTile({ href, label, value, icon: Icon }: { href: string; label: string; value: string; icon: LucideIcon }) {
  return (
    <Link
      href={href}
      className="rounded-[8px] border-2 border-line bg-paper-strong p-4 text-ink transition hover:-translate-y-0.5 hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase text-muted">{label}</p>
          <p className="mt-2 text-2xl font-black leading-none text-ink">{value}</p>
        </div>
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink bg-paper-strong text-ink">
          <Icon className="size-4" />
        </span>
      </div>
    </Link>
  );
}

export function DashboardPulse({
  locale,
  creditsBalance,
  unreadMessages,
  notifications,
  rank,
}: {
  locale: Locale;
  creditsBalance: number;
  unreadMessages: number;
  notifications: number;
  rank: number | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <PulseTile href={withLocale(locale, "/app/credits")} label={tr(locale, "Krediti", "Credits")} value={String(creditsBalance)} icon={Coins} />
      <PulseTile href={withLocale(locale, "/app/messages")} label={tr(locale, "Poruke", "Messages")} value={String(unreadMessages)} icon={MessageCircle} />
      <PulseTile href={withLocale(locale, "/app/community/notifications")} label={tr(locale, "Obaveštenja", "Notifications")} value={String(notifications)} icon={Bell} />
      <PulseTile href={withLocale(locale, "/app/community/leaderboard")} label={tr(locale, "Rang", "Rank")} value={rank != null ? `#${rank}` : "—"} icon={Trophy} />
    </div>
  );
}

// ── PROZORI: grid 1 / 2 (lg) / 3 (2xl), fiksan redosled ─────────────────────
export function DashboardWindowsGrid({
  locale,
  overview,
  nextLessons,
}: {
  locale: Locale;
  overview: DashboardOverview | null;
  nextLessons: NextLesson[];
}) {
  const messagesBase = withLocale(locale, "/app/messages");

  const classroomRows: WindowRow[] = nextLessons.slice(0, 3).map((lesson) => ({
    key: `${lesson.courseSlug}/${lesson.lessonSlug}`,
    href: lessonPath(locale, lesson.courseSlug, lesson.lessonSlug),
    primary: localized(lesson.title, locale),
    meta: formatMinutes(lesson.durationSeconds),
  }));

  const messageRows: WindowRow[] = (overview?.messages.items ?? []).map((item) => ({
    key: item.conversationId,
    href: `${messagesBase}/${item.conversationId}`,
    leading: <AvatarLeading url={item.avatarUrl} name={item.title ?? "?"} />,
    primary: item.title ?? tr(locale, "Konverzacija", "Conversation"),
    secondary: item.snippet ?? undefined,
    meta: formatWhen(locale, item.at),
  }));

  const communityRows: WindowRow[] = (overview?.community.items ?? []).map((item) => ({
    key: item.postId,
    href: withLocale(locale, `/app/community/${item.postId}`),
    primary: item.title,
    secondary: item.author,
    meta: `${item.replies} ${tr(locale, "odg.", "replies")}`,
  }));

  const notificationRows: WindowRow[] = (overview?.notifications.items ?? []).map((item, index) => ({
    key: `${item.kind}-${index}`,
    href: withLocale(locale, item.href),
    primary: item.title,
    meta: formatWhen(locale, item.at),
  }));

  const studioRows: WindowRow[] = (overview?.studio.items ?? []).map((item) => ({
    key: item.jobId,
    href: withLocale(locale, `/app/studio/m/${item.jobId}`),
    leading: <ThumbLeading url={item.thumbUrl} label={<Sparkles className="size-4" />} />,
    primary: studioKindLabel(locale, item.kind),
    meta: formatWhen(locale, item.at),
  }));

  const study = overview?.study ?? { pendingInvites: 0, partners: 0 };
  const studyRows: WindowRow[] = [];
  if (study.pendingInvites > 0) {
    studyRows.push({
      key: "invites",
      primary: `${study.pendingInvites} ${tr(locale, "pozivnica na čekanju", "pending invites")}`,
    });
  }
  if (study.partners > 0) {
    studyRows.push({
      key: "partners",
      primary: `${study.partners} ${tr(locale, "aktivnih partnera", "active partners")}`,
    });
  }

  const admin = overview?.admin ?? null;
  const adminRows: WindowRow[] = admin
    ? [
        {
          key: "readiness",
          primary: admin.readiness.ready
            ? tr(locale, "Sadržaj je spreman za objavu", "Content is ready to publish")
            : `${admin.readiness.blocking} ${tr(locale, "blokera pre objave", "blockers before publishing")}`,
        },
        {
          key: "approvals",
          primary: `${admin.pendingApprovals} ${tr(locale, "objava na čekanju", "posts awaiting review")}`,
        },
      ]
    : [];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
      <DashboardWindow
        eyebrow={tr(locale, "Učionica", "Classroom")}
        title={tr(locale, "Sledeće lekcije", "Up next")}
        icon={GraduationCap}
        items={classroomRows}
        emptyMessage={tr(locale, "Nema lekcija na čekanju.", "No lessons queued up.")}
        ctaLabel={tr(locale, "Otvori učionicu", "Open classroom")}
        ctaHref={classroomPath(locale)}
      />
      <DashboardWindow
        eyebrow={tr(locale, "Poruke", "Messages")}
        title={tr(locale, "Nepročitane konverzacije", "Unread conversations")}
        icon={MessageCircle}
        badge={overview?.messages.unreadTotal}
        items={messageRows}
        emptyMessage={tr(locale, "Nemaš nepročitanih poruka.", "No unread messages.")}
        ctaLabel={tr(locale, "Otvori poruke", "Open messages")}
        ctaHref={messagesBase}
      />
      <DashboardWindow
        eyebrow={tr(locale, "Zajednica", "Community")}
        title={tr(locale, "Nove teme", "New threads")}
        icon={Users}
        badge={overview?.community.unreadNotifications}
        items={communityRows}
        emptyMessage={tr(locale, "Još nema novih tema.", "No new threads yet.")}
        ctaLabel={tr(locale, "Otvori zajednicu", "Open community")}
        ctaHref={withLocale(locale, "/app/community/discussions")}
      />
      <DashboardWindow
        eyebrow={tr(locale, "Obaveštenja", "Notifications")}
        title={tr(locale, "Najnovije", "Latest")}
        icon={Bell}
        badge={overview?.notifications.total}
        items={notificationRows}
        emptyMessage={tr(locale, "Nema novih obaveštenja.", "No new notifications.")}
        ctaLabel={tr(locale, "Sva obaveštenja", "All notifications")}
        ctaHref={withLocale(locale, "/app/community/notifications")}
      />
      <DashboardWindow
        eyebrow={tr(locale, "Studio", "Studio")}
        title={tr(locale, "Poslednja generisanja", "Latest generations")}
        icon={Sparkles}
        items={studioRows}
        emptyMessage={tr(locale, "Još nema generisanja.", "Nothing generated yet.")}
        ctaLabel={tr(locale, "Otvori Studio", "Open Studio")}
        ctaHref={withLocale(locale, "/app/studio")}
      />
      <DashboardWindow
        eyebrow={tr(locale, "Uči zajedno", "Study together")}
        title={tr(locale, "Pozivnice i partneri", "Invites and partners")}
        icon={UsersRound}
        badge={study.pendingInvites}
        items={studyRows}
        emptyMessage={tr(locale, "Nemaš pozivnica ni partnera.", "No invites or partners yet.")}
        ctaLabel={tr(locale, "Otvori Study hub", "Open Study hub")}
        ctaHref={`${messagesBase}?view=study`}
      />
      {admin ? (
        <DashboardWindow
          eyebrow={tr(locale, "Admin", "Admin")}
          title={tr(locale, "Spremnost i čekanje", "Readiness and queue")}
          icon={ShieldCheck}
          badge={admin.pendingApprovals}
          items={adminRows}
          emptyMessage={tr(locale, "Sve je pod kontrolom.", "Everything is under control.")}
          ctaLabel={tr(locale, "Otvori admin", "Open admin")}
          ctaHref={withLocale(locale, "/app/admin/content")}
        />
      ) : null}
    </div>
  );
}
