"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { IgraArt } from "@/components/igra/igra-art";
import { IgraSkeleton, type Loadable } from "@/components/igra/igra-skeleton";
import { useStickerPeel } from "@/components/igra/motion/use-sticker-peel";
import { cn } from "@/components/ui/primitives";
import { badgeStickerView, type BadgeStickerView, type IgraBadgeViewState } from "@/lib/igra-badge-view";
import { igraArt, igraBedzArt } from "@/lib/igra-art";
import type { IgraBadgeKey, IgraBadgeProgress } from "@/lib/igra-badges";
import type { Locale } from "@/lib/i18n";

type Size = "sm" | "md" | "lg";

/** Dugme je meta dodira (najmanje 44 px); nalepnica u njemu je 40 / 64 / 96 px. */
const BOX: Record<Size, string> = { sm: "size-11", md: "size-[4.5rem]", lg: "size-28" };
/** Najmanji razmak oblačića od ivice ekrana. */
const EDGE = 8;

function Sticker({ badge, view, size }: { badge: IgraBadgeKey; view: BadgeStickerView; size: Size }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  useStickerPeel(buttonRef);

  // Dodir van nalepnice zatvara oblačić (Safari dugmetu na dodir ne daje fokus, pa `blur` nije dovoljan).
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  // Oblačić je centriran nad nalepnicom; uz ivicu ekrana (ili dijaloga koji ga seče, npr.
  // panel „Moj napredak") se pomeri da ostane ceo vidljiv.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!open || !tip) return;
    tip.style.setProperty("--igra-tip-shift", "0px");
    const rect = tip.getBoundingClientRect();
    const frame = tip.closest('[role="dialog"]')?.getBoundingClientRect();
    const left = Math.max(0, frame?.left ?? 0) + EDGE;
    const right = Math.min(document.documentElement.clientWidth, frame?.right ?? Infinity) - EDGE;
    const shift = rect.left < left ? left - rect.left : rect.right > right ? right - rect.right : 0;
    tip.style.setProperty("--igra-tip-shift", `${shift}px`);
  }, [open]);

  const id = igraBedzArt(badge);
  const mask = `url(${igraArt(id).src})`;
  const tags = size !== "sm";

  return (
    <span ref={rootRef} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-label={view.label}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setOpen(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className={cn("relative grid place-items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink", BOX[size])}
      >
        <span data-igra-peel={view.peel ? "" : undefined} className="relative block">
          <IgraArt id={id} size={size} locked={view.locked} decorative />
          {view.peel ? (
            // Sjaj se vidi samo preko nalepnice: omotač je maskiran njenom slikom.
            <span aria-hidden="true" className="absolute inset-0 overflow-hidden" style={{ maskImage: mask, maskSize: "contain", WebkitMaskImage: mask, WebkitMaskSize: "contain" }}>
              <span data-igra-shine className="absolute inset-y-0 left-0 w-1/2 bg-[linear-gradient(105deg,transparent,var(--igra-sticker-edge),transparent)] opacity-0" />
            </span>
          ) : null}
        </span>
        {tags && view.tag ? (
          view.locked ? (
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 mx-auto w-max rounded-full bg-paper-strong px-2 py-0.5 type-eyebrow-sm text-muted shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
              {view.tag}
            </span>
          ) : (
            <span aria-hidden="true" className="igra-marker absolute -right-1 top-0 rotate-6 bg-yellow type-eyebrow-sm text-ink">
              {view.tag}
            </span>
          )
        ) : null}
      </button>
      {open ? (
        <span
          ref={tipRef}
          aria-hidden="true"
          className="surface-inset pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 block w-max max-w-56 border-2 border-ink bg-paper-strong px-3 py-2 text-left shadow-[4px_4px_0_0_var(--shadow-hard-16)] [translate:calc(-50%+var(--igra-tip-shift,0px))_0]"
        >
          <span className="block type-body-sm font-black text-ink">{view.name}</span>
          {view.detail ? <span className="block type-caption font-semibold text-muted">{view.detail}</span> : null}
          {view.status ? <span className="mt-1 block type-eyebrow-sm tabular-nums text-ink">{view.status}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Nalepnica bedža (K05). Osvojen je u boji, sa sjajem pod mišem; tek osvojen nosi žuti
 * marker „Novo"; zaključan je silueta mastila; „uskoro" je silueta bez uslova. Uslov i
 * napredak su u oblačiću (miš, fokus ili dodir), a ceo tekst je i u nazivu dugmeta.
 */
export function BadgeSticker(
  props: Loadable<{ badge: IgraBadgeKey; state: IgraBadgeViewState }> & {
    locale: Locale;
    /** Samo za zaključan bedž koji se broji („3 / 5"). */
    progress?: IgraBadgeProgress | null;
    size?: Size;
  },
) {
  const { locale, size = "md" } = props;
  if (props.loading) return <IgraSkeleton className={cn("inline-block rounded-full", BOX[size])} />;

  const view = badgeStickerView(props.badge, props.state, props.progress, locale);
  // Ključ: hook za sjaj se veže pri montiranju, pa bedž koji se upravo otključao kreće ispočetka.
  return <Sticker key={view.peel ? "peel" : "still"} badge={props.badge} view={view} size={size} />;
}
