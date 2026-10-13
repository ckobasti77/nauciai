"use client";

import { X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useRef } from "react";

import { IgraArt } from "@/components/igra/igra-art";
import { gsap, useGSAP } from "@/components/igra/motion/gsap";
import { useStampIn } from "@/components/igra/motion/use-stamp-in";
import { IgraThreeStage } from "@/components/igra/three/igra-three-stage";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import type { IgraArtId } from "@/lib/igra-art";
import { celebrationView, type IgraCelebration } from "@/lib/igra-celebrations";
import { IGRA_CELEBRATION_COPY } from "@/lib/igra-copy";
import { IGRA_MOTION, shouldAnimate } from "@/lib/igra-motion";
import type { Locale } from "@/lib/i18n";

/** Amblem nivoa ili nalepnica bedža koja „udari" kad kartica stigne. */
function CelebrationStamp({ id, index }: { id: IgraArtId; index: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useStampIn(ref, { playKey: id, playOnMount: true, delay: 0.28 + index * 0.08 });
  return (
    <span ref={ref} className="block">
      <IgraArt id={id} size={72} decorative />
    </span>
  );
}

/**
 * Kartica slavlja (K03, plan K01 §3.3) - samo prikaz, bez upita; otvara je i zatvara
 * `CelebrationHost`. `stage` je kartica u preklopu (lik, pečat, naslov, „Nastavi"; na
 * računaru i 3D pehar za nivo i kraj kursa). `corner` je mirna kartica u uglu za smanjen
 * pokret: bez animacije, bez 3D-a, sa dugmetom za zatvaranje.
 *
 * Naziv dijaloga čine `labelId` (nadnaslov) i `titleId` (naslov).
 */
export function CelebrationCard({
  celebration,
  locale,
  variant,
  onClose,
  labelId,
  titleId,
}: {
  celebration: IgraCelebration;
  locale: Locale;
  variant: "stage" | "corner";
  onClose: () => void;
  labelId?: string;
  titleId?: string;
}) {
  const view = celebrationView(celebration, locale);
  const copy = IGRA_CELEBRATION_COPY;
  const reduced = useReducedMotion() ?? false;
  const cardRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const card = cardRef.current;
      if (!card || variant !== "stage" || !shouldAnimate({ reduced, hidden: document.hidden })) return;
      gsap.from(card, { y: 18, scale: 0.94, duration: 0.32, ease: "back.out(1.6)", clearProps: "transform" });
      gsap.from("[data-celebrate='art']", {
        scale: 0.6,
        rotation: -8,
        autoAlpha: 0,
        duration: IGRA_MOTION.stamp,
        ease: "back.out(1.8)",
        delay: 0.06,
        clearProps: "transform,opacity,visibility",
      });
      // `opacity`, ne `autoAlpha`: dugme „Nastavi" mora da primi fokus i dok ulazi
      // (element sa `visibility: hidden` fokus tiho odbija).
      gsap.from("[data-celebrate='copy']", {
        y: 10,
        opacity: 0,
        duration: 0.3,
        ease: IGRA_MOTION.ease.out,
        stagger: IGRA_MOTION.stagger,
        delay: 0.18,
        clearProps: "transform,opacity",
      });
    },
    { scope: cardRef, dependencies: [celebration.key, variant, reduced], revertOnUpdate: true },
  );

  if (variant === "corner") {
    return (
      <div className="pointer-events-auto surface-card relative flex w-full max-w-sm items-center gap-3 border-2 border-ink bg-paper-strong p-3 pr-12 text-ink shadow-[6px_6px_0_0_var(--shadow-hard-16)]">
        <IgraArt id={view.stamps[0] ?? view.hero} size="md" decorative />
        <div className="min-w-0">
          <p className="type-eyebrow-sm text-muted">{view.eyebrow}</p>
          <p className="type-body-sm font-black">{view.title}</p>
          {view.body ? <p className="type-caption font-bold text-muted">{view.body}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={copy.close[locale]}
          className="absolute right-1 top-1 inline-grid size-11 place-items-center rounded-full text-ink hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    );
  }

  const single = view.stamps.length === 1;
  return (
    <div
      ref={cardRef}
      className="surface-card relative border-2 border-ink bg-paper-strong px-6 pb-6 pt-8 text-center text-ink shadow-[8px_8px_0_0_var(--shadow-hard-22)]"
    >
      <div className="relative mx-auto w-44">
        <div data-celebrate="art">
          <IgraArt id={view.hero} size="hero" decorative />
        </div>
        {view.big ? (
          <div className="absolute -left-14 bottom-0 hidden w-24 lg:block">
            <IgraThreeStage kind="pehar" spin="once" />
          </div>
        ) : null}
        {view.stamps.length > 0 ? (
          <div className={cn("absolute -bottom-3 flex -space-x-3", single ? "-right-8" : "inset-x-0 justify-center")}>
            {view.stamps.map((id, index) => (
              <CelebrationStamp key={id} id={id} index={index} />
            ))}
          </div>
        ) : null}
      </div>
      <p data-celebrate="copy" className="mt-6">
        <span id={labelId} className="igra-marker bg-yellow py-1 type-eyebrow text-ink">
          {view.eyebrow}
        </span>
      </p>
      <h2 id={titleId} data-celebrate="copy" className="mt-2 font-display type-display-sm text-ink">
        {view.title}
      </h2>
      {view.body ? (
        <p data-celebrate="copy" className="mt-1 type-body-sm font-semibold text-muted">
          {view.body}
        </p>
      ) : null}
      <div data-celebrate="copy" className="mt-5">
        <Button data-dialog-initial-focus onClick={onClose}>
          {copy.continue[locale]}
        </Button>
      </div>
    </div>
  );
}
