"use client";

import { useConvexAuth, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeft, Heart, Images, NotebookPen, Play, Trophy, Volume2 } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { CreaCover } from "@/components/igra/crea/crea-cover";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { IgraArtId } from "@/lib/igra-art";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_COMMUNITY_NAV, CREA_GALLERY_COPY, CREA_REMIX_FORMS, communityErrorText } from "@/lib/crea-community-copy";
import { pluralize, withLocale, type Locale } from "@/lib/i18n";

export type PublicWork = FunctionReturnType<typeof api.creaGallery.listPublicWorks>["page"][number];

export const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export const PILL_TAB =
  "inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink px-4 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none";

/** Javne putanje zajednice (kanonski segment `studio`, javno `/crea`). */
export const COMMUNITY_PATHS = {
  app: "/studio/app",
  gallery: "/studio/galerija",
  challenge: "/studio/izazov",
  notebook: "/studio/sveska",
} as const;

export function workPath(workId: string): string {
  return `${COMMUNITY_PATHS.gallery}/${workId}`;
}

export function versionsLabel(locale: Locale, count: number): string {
  return `${count} ${pluralize(locale, count, CREA_REMIX_FORMS[locale])}`;
}

/** Nalepnica naslovnice po ekranu (K17, plan K14 ODLUKA 15). */
const COVER_ART = { galerija: "lik.piksi.slavi", izazov: "rang.pehar" } as const satisfies Record<"galerija" | "izazov", IgraArtId>;

/**
 * Zaglavlje ekrana zajednice: nazad u Creu, naslov i pilule ka galeriji, izazovu i
 * svesci (trenutni ekran je označen). Isti jezik kao zaglavlje sveske (K26); od K17 je
 * naslov na naslovnici (`CreaCover`) sa nalepnicom ekrana.
 */
export function CommunityHeader({
  locale,
  title,
  subtitle,
  current,
  art = COVER_ART[current],
}: {
  locale: Locale;
  title: string;
  subtitle: string;
  current: "galerija" | "izazov";
  art?: IgraArtId;
}) {
  const links = [
    { id: "galerija", href: COMMUNITY_PATHS.gallery, label: CREA_COMMUNITY_NAV.gallery[locale], icon: Images },
    { id: "izazov", href: COMMUNITY_PATHS.challenge, label: CREA_COMMUNITY_NAV.challenge[locale], icon: Trophy },
    { id: "sveska", href: COMMUNITY_PATHS.notebook, label: CREA_COMMUNITY_NAV.notebook[locale], icon: NotebookPen },
  ] as const;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={withLocale(locale, COMMUNITY_PATHS.app)}
          className={cn("inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-black text-ink underline decoration-yellow decoration-2 underline-offset-4", FOCUS)}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {CREA_COMMUNITY_NAV.backToCrea[locale]}
        </Link>
        <nav aria-label={CREA_COMMUNITY_NAV.community[locale]} className="flex flex-wrap gap-2">
          {links.map((link) => (
            <Link
              key={link.id}
              href={withLocale(locale, link.href)}
              aria-current={current === link.id ? "page" : undefined}
              className={cn(
                PILL_TAB,
                current === link.id ? "bg-ink text-paper-strong shadow-[3px_3px_0_0_var(--yellow)]" : "igra-press bg-paper-strong text-ink",
              )}
            >
              <link.icon aria-hidden="true" className="size-4" />
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <CreaCover art={art} title={title} subtitle={subtitle} />
    </div>
  );
}

/**
 * Izlaz javnog rada u tamnom bunaru (kao moderation grid). `compact`: kvadrat za mrežu
 * (video pokazuje poster, zvuk ikonicu); inače pun prikaz sa plejerom.
 */
export function WorkMedia({
  work,
  compact,
  alt,
}: {
  work: Pick<PublicWork, "kind" | "outputUrl" | "posterUrl">;
  compact: boolean;
  alt: string;
}) {
  if (work.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={work.outputUrl} alt={alt} loading="lazy" className={cn("w-full", compact ? "aspect-square object-cover" : "max-h-[72vh] object-contain")} />
    );
  }
  if (work.kind === "video") {
    if (compact) {
      return (
        <span className="relative block aspect-square w-full">
          {work.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={work.posterUrl} alt={alt} loading="lazy" className="size-full object-cover" />
          ) : (
            <video src={`${work.outputUrl}#t=0.1`} preload="metadata" muted playsInline className="size-full object-cover" aria-label={alt} />
          )}
          <span className="absolute bottom-2 left-2 grid size-8 place-items-center rounded-full bg-paper-strong text-ink">
            <Play aria-hidden="true" className="size-4 fill-current" />
          </span>
        </span>
      );
    }
    return <video src={work.outputUrl} poster={work.posterUrl ?? undefined} controls playsInline preload="metadata" className="max-h-[72vh] w-full" aria-label={alt} />;
  }
  return (
    // Ikonica stoji na tamnom bunaru u obe teme: preko medija ide beo tekst (pravilo tamne teme).
    <span className={cn("grid w-full place-items-center gap-3 p-4 text-white", compact ? "aspect-square" : "min-h-56")}>
      <Volume2 aria-hidden="true" className="size-8" />
      <audio src={work.outputUrl} controls preload="none" className="w-full" aria-label={alt} />
    </span>
  );
}

/** Lajk: jedan po osobi, ne za svoj rad. Gost vidi samo broj. */
export function LikeButton({
  locale,
  workId,
  likes,
  liked,
  isMine,
}: {
  locale: Locale;
  workId: Id<"creaPublicWorks">;
  likes: number;
  liked: boolean;
  isMine: boolean;
}) {
  const { isAuthenticated } = useConvexAuth();
  const toggle = useMutation(api.creaGallery.toggleLike);
  const [override, setOverride] = useState<{ liked: boolean; likes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prevProps, setPrevProps] = useState({ liked, likes });
  if (prevProps.liked !== liked || prevProps.likes !== likes) {
    setPrevProps({ liked, likes });
    setOverride(null);
  }
  const state = override ?? { liked, likes };
  const countLabel = fillCopy(CREA_GALLERY_COPY.likeCount[locale], { n: state.likes });

  if (!isAuthenticated || isMine) {
    return (
      <span
        title={isMine ? CREA_GALLERY_COPY.ownWork[locale] : CREA_GALLERY_COPY.signInToLike[locale]}
        className="inline-flex min-h-11 shrink-0 items-center gap-1 px-1 text-sm font-black tabular-nums text-muted"
      >
        <Heart aria-hidden="true" className="size-4" />
        <span className="sr-only">{countLabel}</span>
        <span aria-hidden="true">{state.likes}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 flex-col items-end">
      <button
        type="button"
        aria-pressed={state.liked}
        aria-label={`${state.liked ? CREA_GALLERY_COPY.unlike[locale] : CREA_GALLERY_COPY.like[locale]} (${countLabel})`}
        onClick={async () => {
          setError(null);
          setOverride({ liked: !state.liked, likes: Math.max(0, state.likes + (state.liked ? -1 : 1)) });
          try {
            setOverride(await toggle({ workId }));
          } catch (thrown) {
            setOverride(null);
            setError(communityErrorText(thrown, locale));
          }
        }}
        className={cn(
          "igra-press inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border-2 border-ink px-3 text-sm font-black tabular-nums",
          state.liked ? "bg-yellow text-ink" : "bg-paper-strong text-ink",
          FOCUS,
        )}
      >
        <Heart aria-hidden="true" className={cn("size-4", state.liked && "crea-vote-pop fill-current")} />
        {state.likes}
      </button>
      {error ? (
        <span role="alert" className="mt-1 text-xs font-bold text-red-700 dark:text-red-300">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Kartica javnog rada u mreži: medij (link na stranu rada), naslov, autor, lajk.
 * `sticker`: nalepnica preko gornjeg desnog ugla (kruna pobednika, K17), samo ukras.
 */
export function WorkCard({ locale, work, footer, sticker }: { locale: Locale; work: PublicWork; footer?: ReactNode; sticker?: ReactNode }) {
  const title = work.title ?? CREA_GALLERY_COPY.untitled[locale];
  return (
    <article className="surface-card relative flex flex-col border-2 border-ink bg-paper-strong p-2 text-ink shadow-[3px_3px_0_0_var(--shadow-hard-12)]">
      {sticker ? (
        <span aria-hidden="true" className="pointer-events-none absolute -right-3 -top-4 z-10 rotate-12">
          {sticker}
        </span>
      ) : null}
      <Link
        href={withLocale(locale, workPath(work._id))}
        aria-label={fillCopy(CREA_GALLERY_COPY.open[locale], { title })}
        className={cn("surface-media block overflow-hidden bg-studio-well shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]", FOCUS)}
      >
        <WorkMedia work={work} compact alt={title} />
      </Link>
      <div className="mt-2 flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="line-clamp-2 break-words text-sm font-black">{title}</p>
          <p className="truncate text-xs font-bold text-muted">
            {work.author.name}
            {work.remixes > 0 ? ` · ${versionsLabel(locale, work.remixes)}` : ""}
          </p>
        </div>
        <LikeButton locale={locale} workId={work._id} likes={work.likes} liked={work.likedByMe} isMine={work.isMine} />
      </div>
      {footer ? <div className="mt-2 border-t border-line px-1 pt-2">{footer}</div> : null}
    </article>
  );
}
