"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { IgraState } from "@/components/igra/igra-state";
import { CommunityHeader, FOCUS, PILL_TAB, versionsLabel, WorkCard, workPath } from "@/components/crea/community/crea-community-ui";
import { CreaSeasonBanner } from "@/components/crea/community/crea-season-banner";
import { IgraArt } from "@/components/igra/igra-art";
import { LinkButton, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import { fillCopy } from "@/lib/crea-copy";
import { styleQuery } from "@/lib/crea-community";
import { CREA_COMMUNITY_NAV, CREA_GALLERY_COPY } from "@/lib/crea-community-copy";
import { CREA_STYLES } from "@/lib/crea-styles";
import { withLocale, type Locale } from "@/lib/i18n";

type Tab = "novo" | "popularno" | "stilovi" | "moje";
const TABS: readonly Tab[] = ["novo", "popularno", "stilovi", "moje"];
type Kind = "image" | "video" | "audio";
const KINDS: readonly Kind[] = ["image", "video", "audio"];

const PAGE_SIZE = 24;

/**
 * Javna galerija Cree (K27, G8): odobreni radovi (novo / popularno, po vrsti), deljeni
 * stilovi (G11) i moje objave sa stanjem provere. Deo, vrsta i pregled sezone su u URL-u.
 */
export function CreaGallery({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("prikaz");
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "novo";
  const rawKind = searchParams.get("vrsta");
  const kind = KINDS.includes(rawKind as Kind) ? (rawKind as Kind) : null;
  const state = useQuery(api.creaGallery.galleryState, {});

  const hrefFor = (next: Record<string, string | null>) => {
    const query = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    const text = query.toString();
    return `${pathname}${text ? `?${text}` : ""}`;
  };
  const tabLabel: Record<Tab, string> = {
    novo: CREA_GALLERY_COPY.tabNew[locale],
    popularno: CREA_GALLERY_COPY.tabPopular[locale],
    stilovi: CREA_GALLERY_COPY.tabStyles[locale],
    moje: CREA_GALLERY_COPY.tabMine[locale],
  };
  const kindLabel: Record<Kind, string> = {
    image: CREA_GALLERY_COPY.kindImage[locale],
    video: CREA_GALLERY_COPY.kindVideo[locale],
    audio: CREA_GALLERY_COPY.kindAudio[locale],
  };
  const tabs = state?.signedIn ? TABS : TABS.filter((id) => id !== "moje");

  return (
    <div className="mx-auto max-w-6xl space-y-5 text-ink">
      <CommunityHeader locale={locale} title={CREA_GALLERY_COPY.title[locale]} subtitle={CREA_GALLERY_COPY.subtitle[locale]} current="galerija" />
      <CreaSeasonBanner locale={locale} preview={searchParams.get("sezona")} />

      <nav aria-label={CREA_GALLERY_COPY.tabs[locale]} className="flex flex-wrap gap-2">
        {tabs.map((id) => (
          <Link
            key={id}
            href={hrefFor({ prikaz: id === "novo" ? null : id })}
            scroll={false}
            aria-current={tab === id ? "page" : undefined}
            className={cn(PILL_TAB, tab === id ? "bg-ink text-paper-strong shadow-[3px_3px_0_0_var(--yellow)]" : "bg-paper-strong text-ink hover:-translate-y-0.5")}
          >
            {tabLabel[id]}
          </Link>
        ))}
      </nav>

      {tab === "novo" || tab === "popularno" ? (
        <>
          <nav aria-label={CREA_GALLERY_COPY.kindFilter[locale]} className="flex flex-wrap gap-1.5">
            {[null, ...KINDS].map((id) => (
              <Link
                key={id ?? "sve"}
                href={hrefFor({ vrsta: id })}
                scroll={false}
                aria-current={kind === id ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border-2 px-3 text-xs font-black transition motion-reduce:transition-none",
                  kind === id ? "border-ink bg-yellow text-ink" : "border-ink/30 bg-paper text-ink hover:border-ink",
                  FOCUS,
                )}
              >
                {id ? kindLabel[id] : CREA_GALLERY_COPY.kindAll[locale]}
              </Link>
            ))}
          </nav>
          <WorksGrid key={`${tab}:${kind ?? ""}`} locale={locale} sort={tab} kind={kind} />
        </>
      ) : null}
      {tab === "stilovi" ? <SharedStyles locale={locale} /> : null}
      {tab === "moje" ? <MyPosts locale={locale} /> : null}
    </div>
  );
}

function WorksGrid({ locale, sort, kind }: { locale: Locale; sort: "novo" | "popularno"; kind: Kind | null }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.creaGallery.listPublicWorks,
    { sort, ...(kind ? { kind } : {}) },
    { initialNumItems: PAGE_SIZE },
  );
  if (status === "LoadingFirstPage") {
    return (
      <IgraState compact variant="ucitavanje" locale={locale} title={CREA_COMMUNITY_NAV.loading[locale]} />
    );
  }
  if (results.length === 0 && status === "Exhausted") return <GalleryEmpty locale={locale} />;
  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {results.map((work) => (
          <li key={work._id}>
            <WorkCard locale={locale} work={work} />
          </li>
        ))}
      </ul>
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(PAGE_SIZE)}
            className={cn(PILL_TAB, "bg-paper-strong text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] hover:-translate-y-0.5 disabled:opacity-50")}
          >
            {status === "LoadingMore" ? CREA_COMMUNITY_NAV.loading[locale] : CREA_COMMUNITY_NAV.loadMore[locale]}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Galerija bez odobrenih radova (K17: ilustracija `prazno.galerija`, izvezeno za izlog). */
export function GalleryEmpty({ locale }: { locale: Locale }) {
  return (
    <section className="surface-card border-2 border-dashed border-ink/40 bg-paper p-6 text-center">
      <div className="flex justify-center">
        <IgraArt id="prazno.galerija" size={120} decorative />
      </div>
      <p className="mt-3 type-body font-bold text-muted type-measure mx-auto">{CREA_GALLERY_COPY.empty[locale]}</p>
    </section>
  );
}

function Swatches({ colors }: { colors: readonly string[] }) {
  if (colors.length === 0) return null;
  return (
    <span aria-hidden="true" className="inline-flex gap-1">
      {colors.slice(0, 8).map((hex) => (
        // Boja palete je podatak korisnika (HEX iz stila), ne boja interfejsa.
        <span key={hex} className="size-4 rounded-full shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" style={{ backgroundColor: hex }} />
      ))}
    </span>
  );
}

function SharedStyles({ locale }: { locale: Locale }) {
  const styles = useQuery(api.creaGallery.listPublicStyles, {});
  if (styles === undefined) {
    return (
      <IgraState compact variant="ucitavanje" locale={locale} title={CREA_COMMUNITY_NAV.loading[locale]} />
    );
  }
  return (
    <section className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[4px_4px_0_0_var(--shadow-hard-14)] sm:p-5">
      <p className="type-body-sm font-semibold text-muted type-measure">{CREA_GALLERY_COPY.stylesHint[locale]}</p>
      {styles.length === 0 ? (
        <p className="mt-4 type-body font-bold text-muted">{CREA_GALLERY_COPY.stylesEmpty[locale]}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {styles.map((style) => {
            const base = style.styleId ? CREA_STYLES.find((entry) => entry.id === style.styleId)?.label[locale] : null;
            return (
              <li key={style._id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="type-body font-black">{style.name}</p>
                  <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted">
                    <span>{style.author.name}</span>
                    {base ? <span>· {base}</span> : null}
                    {style.camera ? <span>· {`${style.camera.focal} mm ${style.camera.aperture}`}</span> : null}
                    <Swatches colors={style.palette} />
                    <span>· {fillCopy(CREA_GALLERY_COPY.styleUses[locale], { n: style.uses })}</span>
                  </p>
                  {style.promptFragment ? <p className="mt-1 truncate text-sm font-semibold">{style.promptFragment}</p> : null}
                </div>
                {style.isMine ? null : (
                  <LinkButton href={`${withLocale(locale, "/studio/app")}?${styleQuery(style._id)}`} tone="yellow">
                    {CREA_GALLERY_COPY.useStyle[locale]}
                  </LinkButton>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MyPosts({ locale }: { locale: Locale }) {
  const posts = useQuery(api.creaGallery.myPublicWorks, {});
  if (posts === undefined) {
    return (
      <IgraState compact variant="ucitavanje" locale={locale} title={CREA_COMMUNITY_NAV.loading[locale]} />
    );
  }
  if (posts.length === 0) {
    return <p className="type-body font-bold text-muted">{CREA_GALLERY_COPY.emptyMine[locale]}</p>;
  }
  const statusLabel = {
    pending: CREA_GALLERY_COPY.statusPending[locale],
    approved: CREA_GALLERY_COPY.statusApproved[locale],
    rejected: CREA_GALLERY_COPY.statusRejected[locale],
    withdrawn: "",
  } as const;
  return (
    <ul className="surface-card divide-y divide-line overflow-hidden border-2 border-ink bg-paper-strong px-4 shadow-[4px_4px_0_0_var(--shadow-hard-14)]">
      {posts.map((post) => (
        <li key={post._id}>
          <Link href={withLocale(locale, workPath(post._id))} className={cn("flex min-h-16 items-center gap-3 py-2", FOCUS)}>
            <span className="surface-media grid size-12 shrink-0 place-items-center overflow-hidden bg-studio-well">
              {post.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.thumbUrl} alt="" className="size-full object-cover" />
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate type-body-sm font-black">{post.title ?? CREA_GALLERY_COPY.untitled[locale]}</span>
              <span className="block truncate text-xs font-bold text-muted">
                {fillCopy(CREA_GALLERY_COPY.likeCount[locale], { n: post.likes })} · {versionsLabel(locale, post.remixes)}
                {post.rejectReason ? ` · ${post.rejectReason}` : ""}
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full border-2 px-2.5 py-0.5 text-xs font-black",
                post.status === "approved" ? "border-ink bg-yellow text-ink" : post.status === "rejected" ? "border-ink bg-paper text-muted" : "border-dashed border-ink bg-paper text-ink",
              )}
            >
              {statusLabel[post.status]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
