"use client";

import type { FunctionReturnType } from "convex/server";
import {
  ArrowRight,
  Bell,
  Coins,
  GraduationCap,
  MessageCircle,
  PenLine,
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

import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton, Panel, cn } from "@/components/ui/primitives";
import type { api } from "@/convex/_generated/api";
import { classroomPath, courseCatalogPath, lessonPath } from "@/lib/app-routes";
import { dashboardZoneChipClass, type DashboardZoneId } from "@/lib/dashboard-zones";
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
    "flex items-center gap-3 surface-inset border-2 border-line bg-paper px-3 py-2";
  if (row.href) {
    return (
      <Link
        href={row.href}
        className={cn(
          className,
          // Pritisak spušta red nazad na nulu: podizanje je „mogu da kliknem", povratak je
          // „kliknuo sam". Trajanje je `--motion-mikro` preko `studio-anim-mikro`.
          "studio-anim-mikro hover:-translate-y-0.5 hover:bg-yellow active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        )}
      >
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

export function DashboardWindow({
  zone,
  eyebrow,
  title,
  icon: Icon,
  badge,
  items,
  emptyTitle,
  emptyBody,
  ctaLabel,
  ctaHref,
}: {
  /** Koja je ovo zona — odatle ide akcenat pločice sa ikonom (`lib/dashboard-zones.ts`). */
  zone: DashboardZoneId;
  eyebrow: string;
  title: string;
  icon: LucideIcon;
  badge?: number;
  items: WindowRow[];
  /** Prazna zona nije jedna siva rečenica nego `EmptyState` sa sledećim korakom. */
  emptyTitle: string;
  emptyBody: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  // U9 je prozoru namerno dao samo rastuću senku, jer prozor nije link. U11 traži i
  // podizanje („hover podizanje po motion rečniku"), pa ga prozor sada ima — ali za
  // pola koraka (2px) umesto 3px koliko se diže kartica kursa, koja jeste jedan klik.
  // Transform i senku vodi ista `studio-anim-mikro` tranzicija (120ms), a globalni
  // `prefers-reduced-motion` blok u `app/globals.css` joj gasi trajanje.
  return (
    <Panel
      as="article"
      className="studio-anim-mikro flex flex-col overflow-hidden hover:-translate-y-0.5 hover:shadow-[8px_8px_0_0_var(--shadow-hard-20)]"
    >
      {/* Zaglavlje prozora: pločica sa ikonom nosi identitet zone (žuto = ovde ti
          radiš, mastilo = ovde su drugi ljudi, papir = ovde ti se javlja stanje), a
          školska mreža ispod svega drži metaforu „prozor na papiru". */}
      <div className="relative flex items-start justify-between gap-3 border-b-2 border-line p-4 sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 sketch-grid" />
        <div className="relative flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center surface-inset border-2",
              dashboardZoneChipClass(zone),
            )}
          >
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="type-eyebrow text-muted">{eyebrow}</p>
            <h3 className="mt-1 type-h3 text-ink">{title}</h3>
          </div>
        </div>
        {badge && badge > 0 ? (
          // Broj je poenta prozora („koliko me čeka"), pa je pločica, a ne sitna
          // pilula: 32px krug, 16px cifra, tvrda senka — čita se iz mreže od šest.
          <span className="relative grid h-8 min-w-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow px-2 type-h4 text-ink shadow-[2px_2px_0_0_var(--shadow-hard-15)]">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </div>
      <div className="flex-1 p-4 sm:p-6">
        {items.length ? (
          <ul className="space-y-2">
            {items.slice(0, 3).map((row) => (
              <li key={row.key}>
                <WindowRowView row={row} />
              </li>
            ))}
          </ul>
        ) : (
          // Dugme se namerno NE ponavlja unutar praznog stanja: svaki prozor već
          // ima tačno jedno dugme u podnožju, a ono je kontekstualno.
          // `cn` je obično spajanje, ne tailwind-merge — zato ovde ide samo `h-full`,
          // klasa koja se ni sa čim u primitivu ne sudara.
          <EmptyState icon={Icon} title={emptyTitle} body={emptyBody} className="h-full" />
        )}
      </div>
      <div className="border-t-2 border-line p-4 sm:p-6">
        {/* `quiet`, ne `smoke`: `smoke` je žut tekst na belom (~1,7:1) u svetloj temi. */}
        <LinkButton href={ctaHref} tone="quiet" className="w-full min-h-10 px-4 text-xs font-black">
          <span>{ctaLabel}</span>
          <ArrowRight className="size-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
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
        className="size-10 shrink-0 surface-media border-2 border-ink object-cover"
      />
    );
  }
  return (
    <span className="inline-flex size-10 shrink-0 items-center justify-center surface-media border-2 border-ink bg-paper text-ink">
      {label}
    </span>
  );
}

// ── PULS: 4 kompaktna tile-a ────────────────────────────────────────────────
function PulseTile({ href, label, value, icon: Icon }: { href: string; label: string; value: string; icon: LucideIcon }) {
  return (
    // Pločica je samostalna kartica na tabli, pa ide na card tier (16px) kao i prozori
    // ispod nje; brojka je jedini razlog zbog kog pločica postoji, pa nosi `type-h1`.
    <Link
      href={href}
      className="group surface-card border-2 border-line bg-paper-strong p-4 text-ink shadow-[3px_3px_0_0_var(--shadow-hard-10)] transition hover:-translate-y-0.5 hover:border-yellow hover:shadow-[5px_5px_0_0_var(--shadow-hard-16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-eyebrow text-muted transition-colors duration-200 group-hover:text-yellow">{label}</p>
          <p className="mt-2 type-h1 text-ink">{value}</p>
        </div>
        <span className="inline-flex size-9 shrink-0 items-center justify-center surface-media border-2 border-ink bg-paper-strong text-ink transition duration-200 group-hover:border-yellow group-hover:bg-yellow group-hover:text-ink">
          <Icon aria-hidden="true" className="size-4" />
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
// Renderuje se UVEK — i za korisnika bez ijednog kursa. Ranije ga je gutao
// `DashboardFirstRun`, pa FREE korisnik nikad nije video ni poruke, ni zajednicu,
// ni Studio, iako svi ti podaci za njega postoje.
export function DashboardWindowsGrid({
  locale,
  overview,
  nextLessons,
  hasUnlockedCourse,
}: {
  locale: Locale;
  overview: DashboardOverview | null;
  nextLessons: NextLesson[];
  /** Menja samo prazno stanje i dugme „Učionica" prozora: katalog umesto učionice. */
  hasUnlockedCourse: boolean;
}) {
  const messagesBase = withLocale(locale, "/app/messages");
  const adminContentBase = withLocale(locale, "/app/admin/content");
  const moderationHref = withLocale(locale, "/app/community/moderation");

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

  // Nacrt vodi tačno u svoj red u „Kontrolnom centru" — `admin-content-manager.tsx`
  // čita `?track=` / `?course=` i sam bira te stavke u padajućim listama.
  const draftHref = (item: { trackId: string | null; courseId: string | null }) => {
    const params = new URLSearchParams();
    if (item.trackId) params.set("track", item.trackId);
    if (item.courseId) params.set("course", item.courseId);
    const query = params.toString();
    return query ? `${adminContentBase}?${query}` : adminContentBase;
  };

  const adminContentRows: WindowRow[] = admin
    ? [
        ...(admin.readiness.blocking > 0
          ? [
              {
                key: "readiness",
                href: adminContentBase,
                primary: `${admin.readiness.blocking} ${tr(locale, "blokera pre objave", "blockers before publishing")}`,
                secondary: tr(
                  locale,
                  "Objavljeni kursevi kojima nešto nedostaje",
                  "Published courses that are missing something",
                ),
              },
            ]
          : []),
        ...admin.drafts.items.map((item, index) => ({
          key: `draft-${index}`,
          href: draftHref(item),
          primary: localized(item.title, locale),
          secondary:
            item.kind === "track" ? tr(locale, "Smer u nacrtu", "Draft track") : tr(locale, "Kurs u nacrtu", "Draft course"),
        })),
      ]
    : [];

  const adminPeopleRows: WindowRow[] = admin
    ? [
        ...(admin.pendingApprovals > 0
          ? [
              {
                key: "approvals",
                href: moderationHref,
                primary: `${admin.pendingApprovals} ${tr(locale, "objava na čekanju", "posts awaiting review")}`,
                secondary: tr(locale, "Moderacija zajednice", "Community moderation"),
              },
            ]
          : []),
        ...admin.recentUsers.map((user, index) => ({
          key: `user-${index}`,
          href: user.username ? withLocale(locale, `/app/members/${user.username}`) : undefined,
          leading: <AvatarLeading url={null} name={user.name} />,
          primary: user.name,
          secondary: user.username ? `@${user.username}` : tr(locale, "Novi član", "New member"),
          meta: formatWhen(locale, user.at),
        })),
      ]
    : [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">
      <DashboardWindow
        zone="classroom"
        eyebrow={tr(locale, "Učionica", "Classroom")}
        title={tr(locale, "Sledeće lekcije", "Up next")}
        icon={GraduationCap}
        items={classroomRows}
        emptyTitle={
          hasUnlockedCourse
            ? tr(locale, "Nema lekcija na čekanju", "No lessons queued up")
            : tr(locale, "Još nemaš kurs", "You have no course yet")
        }
        emptyBody={
          hasUnlockedCourse
            ? tr(
                locale,
                "Otvori učionicu i izaberi lekciju koju želiš da ponoviš.",
                "Open the classroom and pick a lesson to go over again.",
              )
            : tr(
                locale,
                "Pogledaj šta te čeka i otključaj prvi kurs — lekcije se onda pojavljuju ovde.",
                "See what is waiting and unlock your first course — lessons then show up here.",
              )
        }
        ctaLabel={
          hasUnlockedCourse
            ? tr(locale, "Otvori učionicu", "Open classroom")
            : tr(locale, "Pogledaj kurseve", "Browse courses")
        }
        ctaHref={hasUnlockedCourse ? classroomPath(locale) : courseCatalogPath(locale)}
      />
      <DashboardWindow
        zone="messages"
        eyebrow={tr(locale, "Poruke", "Messages")}
        title={tr(locale, "Nepročitane konverzacije", "Unread conversations")}
        icon={MessageCircle}
        badge={overview?.messages.unreadTotal}
        items={messageRows}
        emptyTitle={tr(locale, "Nemaš nepročitanih poruka", "No unread messages")}
        emptyBody={tr(
          locale,
          "Sve je pročitano. Piši nekome iz zajednice kad ti zatreba pomoć.",
          "Everything is read. Message someone from the community when you need a hand.",
        )}
        ctaLabel={tr(locale, "Otvori poruke", "Open messages")}
        ctaHref={messagesBase}
      />
      <DashboardWindow
        zone="community"
        eyebrow={tr(locale, "Zajednica", "Community")}
        title={tr(locale, "Nove teme", "New topics")}
        icon={Users}
        badge={overview?.community.unreadNotifications}
        items={communityRows}
        emptyTitle={tr(locale, "Još nema novih tema", "No new topics yet")}
        emptyBody={tr(
          locale,
          "Postavi prvo pitanje — neko iz zajednice će ti odgovoriti.",
          "Ask the first question — someone from the community will answer.",
        )}
        ctaLabel={tr(locale, "Otvori zajednicu", "Open community")}
        ctaHref={withLocale(locale, "/app/community/discussions")}
      />
      <DashboardWindow
        zone="notifications"
        eyebrow={tr(locale, "Obaveštenja", "Notifications")}
        title={tr(locale, "Najnovije", "Latest")}
        icon={Bell}
        badge={overview?.notifications.total}
        items={notificationRows}
        emptyTitle={tr(locale, "Nema novih obaveštenja", "No new notifications")}
        emptyBody={tr(
          locale,
          "Kad ti neko odgovori ili te pomene, javljamo ti ovde.",
          "When someone replies to you or mentions you, we tell you here.",
        )}
        ctaLabel={tr(locale, "Sva obaveštenja", "All notifications")}
        ctaHref={withLocale(locale, "/app/community/notifications")}
      />
      <DashboardWindow
        zone="studio"
        eyebrow={tr(locale, "Studio", "Studio")}
        title={tr(locale, "Poslednje što si napravio/la", "The last things you made")}
        icon={Sparkles}
        items={studioRows}
        emptyTitle={tr(locale, "Još nisi ništa napravio/la", "You have not made anything yet")}
        emptyBody={tr(
          locale,
          "Otvori Studio i napravi prvu sliku — kredite za to već imaš.",
          "Open the Studio and make your first image — you already have the credits for it.",
        )}
        ctaLabel={tr(locale, "Otvori Studio", "Open Studio")}
        ctaHref={withLocale(locale, "/app/studio")}
      />
      <DashboardWindow
        zone="study"
        eyebrow={tr(locale, "Uči zajedno", "Study together")}
        title={tr(locale, "Pozivnice i partneri", "Invites and partners")}
        icon={UsersRound}
        badge={study.pendingInvites}
        items={studyRows}
        emptyTitle={tr(locale, "Nemaš pozivnica ni partnera", "No invites or partners yet")}
        emptyBody={tr(
          locale,
          "Nađi nekoga ko uči isto što i ti, pa idite kroz lekcije zajedno.",
          "Find someone learning the same thing and go through the lessons together.",
        )}
        ctaLabel={tr(locale, "Otvori „Uči zajedno”", "Open “Study together”")}
        ctaHref={`${messagesBase}?view=study`}
      />
      {admin ? (
        <>
          <DashboardWindow
            zone="adminContent"
            eyebrow={tr(locale, "Admin", "Admin")}
            title={tr(locale, "Nacrti i spremnost", "Drafts and readiness")}
            icon={PenLine}
            badge={admin.drafts.total}
            items={adminContentRows}
            emptyTitle={tr(locale, "Nema nacrta", "No drafts")}
            emptyBody={tr(
              locale,
              "Sve je objavljeno. Novi smer ili kurs čeka ovde dok ga ne objaviš.",
              "Everything is published. A new track or course waits here until you publish it.",
            )}
            ctaLabel={tr(locale, "Otvori Kontrolni centar", "Open the control centre")}
            ctaHref={adminContentBase}
          />
          <DashboardWindow
            zone="adminPeople"
            eyebrow={tr(locale, "Admin", "Admin")}
            title={tr(locale, "Moderacija i novi članovi", "Moderation and new members")}
            icon={ShieldCheck}
            badge={admin.pendingApprovals}
            items={adminPeopleRows}
            emptyTitle={tr(locale, "Ništa ne čeka", "Nothing is waiting")}
            emptyBody={tr(
              locale,
              "Nema objava za pregled ni novih registracija.",
              "No posts to review and no new sign-ups.",
            )}
            ctaLabel={tr(locale, "Otvori korisnike", "Open users")}
            ctaHref={withLocale(locale, "/app/admin/users")}
          />
        </>
      ) : null}
    </div>
  );
}
