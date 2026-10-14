"use client";

import { useQuery } from "convex/react";
import { GitFork, Images, Palette, Trophy, X } from "lucide-react";
import Link from "next/link";

import { FOCUS } from "@/components/crea/community/crea-community-ui";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_COMMUNITY_NAV, CREA_REF_COPY } from "@/lib/crea-community-copy";
import { withLocale, type Locale } from "@/lib/i18n";

/**
 * Traka iznad composera kad rad nastaje kao „svoja verzija" javnog rada ili uz deljen
 * stil (K27, G8/G11): čiji je rad/stil i da autor dobija zaslugu. „Ukloni" briše vezu.
 */
export function CreaRefNotice({
  locale,
  remix,
  style,
  onRemoveRemix,
  onRemoveStyle,
}: {
  locale: Locale;
  remix: { title: string | null; author: string } | null;
  style: { name: string; author: string } | null;
  onRemoveRemix: () => void;
  onRemoveStyle: () => void;
}) {
  if (!remix && !style) return null;
  const rows = [
    remix
      ? {
          key: "remix",
          icon: GitFork,
          text: remix.title
            ? fillCopy(CREA_REF_COPY.remix[locale], { title: remix.title, author: remix.author })
            : fillCopy(CREA_REF_COPY.remixUntitled[locale], { author: remix.author }),
          hint: CREA_REF_COPY.remixHint[locale],
          onRemove: onRemoveRemix,
        }
      : null,
    style
      ? {
          key: "style",
          icon: Palette,
          text: fillCopy(CREA_REF_COPY.style[locale], { name: style.name, author: style.author }),
          hint: CREA_REF_COPY.styleHint[locale],
          onRemove: onRemoveStyle,
        }
      : null,
  ].filter((row): row is NonNullable<typeof row> => row !== null);

  return (
    <ul className="surface-inset mb-3 divide-y divide-line border border-line bg-paper-strong px-3 text-ink">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center gap-3 py-2">
          <row.icon aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-sm font-black">{row.text}</span>
            <span className="block text-xs font-semibold text-muted">{row.hint}</span>
          </span>
          <button
            type="button"
            onClick={row.onRemove}
            aria-label={`${CREA_REF_COPY.remove[locale]}: ${row.text}`}
            className={cn("grid size-11 shrink-0 place-items-center rounded-full text-muted hover:text-ink", FOCUS)}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Pilule ka galeriji i izazovu u zaglavlju radionice - samo dok je galerija upaljena.
 * Na telefonu ih nema (zaglavlje je puno); tamo do njih vodi sveska.
 */
export function CreaCommunityLinks({ locale }: { locale: Locale }) {
  const state = useQuery(api.creaGallery.galleryState, {});
  if (!state?.enabled) return null;
  return (
    <nav aria-label={CREA_COMMUNITY_NAV.community[locale]} className="hidden shrink-0 items-center gap-2 sm:flex">
      {[
        { href: "/studio/galerija", label: CREA_COMMUNITY_NAV.gallery[locale], icon: Images },
        { href: "/studio/izazov", label: CREA_COMMUNITY_NAV.challenge[locale], icon: Trophy },
      ].map((link) => (
        <Link
          key={link.href}
          href={withLocale(locale, link.href)}
          aria-label={link.label}
          title={link.label}
          className="igra-press igra-shadow igra-depth-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3 text-xs font-black text-ink studio-focus-ink"
        >
          <link.icon aria-hidden="true" className="size-3.5" />
          <span className="hidden xl:inline">{link.label}</span>
        </Link>
      ))}
    </nav>
  );
}
