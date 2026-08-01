"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";

import {
  pageMotionContract,
  pageMotionSceneKey,
  pageMotionVariantForPath,
  type PageMotionVariant,
} from "@/lib/motion-contract";

export type PageMotionProps = {
  variant: PageMotionVariant;
  sceneKey?: string;
  className?: string;
  children: ReactNode;
};

const motionSelector = [
  '[data-motion="hero"]',
  '[data-motion="copy"]',
  '[data-motion="circle"]',
  '[data-motion="chart"]',
  '[data-motion="card"]',
  '[data-motion="interactive"]',
].join(",");

let scrollTriggerRegistered = false;

function uniqueElements(elements: HTMLElement[]): HTMLElement[] {
  return elements.filter((element, index) => elements.indexOf(element) === index);
}

function clearMotionStyles(elements: Element[]) {
  if (!elements.length) return;
  gsap.set(elements, {
    clearProps: "transform,opacity,visibility,clipPath,willChange,transformOrigin",
  });
}

function playPageEntrance(root: HTMLDivElement, variant: PageMotionVariant) {
  const target =
    root.querySelector<HTMLElement>('[data-motion="page"]') ??
    root.querySelector<HTMLElement>("main") ??
    root;
  const contract = pageMotionContract[variant];
  const marked = uniqueElements(Array.from(target.querySelectorAll<HTMLElement>(motionSelector)));
  const belowFold = marked.filter((element) => element.getBoundingClientRect().top >= window.innerHeight * 0.92);
  const deferred = belowFold.filter(
    (element) => !belowFold.some((candidate) => candidate !== element && candidate.contains(element)),
  );
  const immediate = marked.filter((element) => !deferred.includes(element));
  const heroes = immediate.filter((element) => element.dataset.motion === "hero");
  const copy = immediate.filter((element) => element.dataset.motion === "copy");
  const circles = immediate.filter((element) => element.dataset.motion === "circle");
  const charts = immediate.filter((element) => element.dataset.motion === "chart");
  const cards = immediate.filter((element) => element.dataset.motion === "card");
  const interactive = immediate.filter((element) => element.dataset.motion === "interactive");
  const progressPaths = Array.from(target.querySelectorAll<SVGCircleElement>("[data-motion-progress]"));
  const scribblePaths = Array.from(
    target.querySelectorAll<SVGPathElement>('[data-motion="scribble"] path'),
  );
  const allImmediate = uniqueElements([target, ...immediate]);

  const media = gsap.matchMedia();
  const context = gsap.context(() => {

    media.add("(prefers-reduced-motion: reduce)", () => {
      gsap.fromTo(
        target,
        { autoAlpha: 0 },
        {
          autoAlpha: 1,
          duration: 0.12,
          ease: "none",
          onComplete: () => clearMotionStyles([target]),
        },
      );
    });

    media.add("(prefers-reduced-motion: no-preference)", () => {
      if (!scrollTriggerRegistered) {
        gsap.registerPlugin(ScrollTrigger);
        scrollTriggerRegistered = true;
      }

      gsap.set(allImmediate, { willChange: "transform,opacity" });
      const timeline = gsap.timeline({
        defaults: { overwrite: "auto" },
        onComplete: () => clearMotionStyles(allImmediate),
      });

      timeline.fromTo(
        target,
        {
          autoAlpha: 0,
          y: contract.pageY,
          scale: variant === "showcase" ? 0.985 : 0.995,
        },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: contract.pageDuration,
          ease: contract.pageEase,
        },
        0,
      );

      if (heroes.length) {
        timeline.fromTo(
          heroes,
          {
            autoAlpha: 0,
            y: variant === "showcase" ? 26 : contract.itemY,
            rotation: variant === "showcase" ? -1.35 : 0,
            scale: variant === "showcase" ? 0.965 : 0.99,
            clipPath: "inset(0 0 10% 0 round 16px)",
          },
          {
            autoAlpha: 1,
            y: 0,
            rotation: 0,
            scale: 1,
            clipPath: "inset(0 0 0% 0 round 16px)",
            duration: contract.itemDuration,
            ease: contract.itemEase,
            stagger: contract.stagger,
          },
          0.05,
        );
      }

      if (copy.length) {
        timeline.fromTo(
          copy,
          { autoAlpha: 0, y: contract.itemY, scale: 0.985 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: contract.itemDuration * 0.82,
            ease: contract.itemEase,
            stagger: contract.stagger,
          },
          0.12,
        );
      }

      if (circles.length && variant === "showcase") {
        timeline.fromTo(
          circles,
          { autoAlpha: 0, rotation: -165, scale: 0.54, transformOrigin: "50% 50%" },
          {
            autoAlpha: 1,
            rotation: 0,
            scale: 1,
            duration: 0.78,
            ease: "back.out(1.85)",
            stagger: 0.09,
          },
          0.16,
        );
      }

      if (cards.length) {
        cards.forEach((card, index) => {
          timeline.fromTo(
            card,
            {
              autoAlpha: 0,
              x: variant === "showcase" ? (index % 2 === 0 ? -24 : 24) : 0,
              y: contract.itemY,
              rotation: variant === "showcase" ? (index % 2 === 0 ? -1.6 : 1.6) : 0,
              scale: variant === "showcase" ? 0.97 : 0.99,
            },
            {
              autoAlpha: 1,
              x: 0,
              y: 0,
              rotation: 0,
              scale: 1,
              duration: contract.itemDuration,
              ease: contract.itemEase,
            },
            0.2 + Math.min(index, 7) * contract.stagger,
          );
        });
      }

      if (interactive.length) {
        timeline.fromTo(
          interactive,
          { autoAlpha: 0, y: 9, scale: variant === "showcase" ? 0.82 : 0.96 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: contract.itemDuration * 0.72,
            ease: variant === "showcase" ? "back.out(2.1)" : contract.itemEase,
            stagger: contract.stagger * 0.72,
          },
          0.3,
        );
      }

      if (charts.length) {
        timeline.fromTo(
          charts,
          { autoAlpha: 0, scaleY: 0, transformOrigin: "50% 100%" },
          {
            autoAlpha: 1,
            scaleY: 1,
            duration: 0.5,
            ease: "back.out(1.45)",
            stagger: 0.035,
          },
          0.32,
        );
      }

      if (progressPaths.length && variant === "showcase") {
        progressPaths.forEach((path, index) => {
          const start = Number(path.dataset.motionProgressLength || 0);
          const finish = Number(path.dataset.motionProgressOffset || 0);
          if (!Number.isFinite(start) || !Number.isFinite(finish)) return;
          timeline.fromTo(
            path,
            { strokeDashoffset: start },
            {
              strokeDashoffset: finish,
              duration: 0.76,
              ease: "power2.out",
            },
            0.2 + index * 0.08,
          );
        });
      }

      if (scribblePaths.length) {
        scribblePaths.forEach((path, index) => {
          const length = path.getTotalLength();
          gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
          timeline.to(
            path,
            {
              strokeDashoffset: 0,
              duration: variant === "showcase" ? 0.52 : 0.34,
              ease: "power2.out",
              onComplete: () => gsap.set(path, { clearProps: "strokeDasharray,strokeDashoffset" }),
            },
            0.16 + index * 0.08,
          );
        });
      }

      deferred.forEach((element, index) => {
        gsap.fromTo(
          element,
          {
            autoAlpha: 0,
            y: contract.itemY + 4,
            rotation: variant === "showcase" ? (index % 2 === 0 ? -1 : 1) : 0,
            scale: 0.985,
          },
          {
            autoAlpha: 1,
            y: 0,
            rotation: 0,
            scale: 1,
            duration: contract.itemDuration,
            ease: contract.itemEase,
            clearProps: "transform,opacity,visibility,willChange",
            scrollTrigger: {
              trigger: element,
              start: "top 88%",
              once: true,
            },
          },
        );
      });
    });
  }, root);

  return () => {
    media.revert();
    context.revert();
  };
}

export function PageMotion({ variant, sceneKey = "page", className, children }: PageMotionProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!rootRef.current) return;
    return playPageEntrance(rootRef.current, variant);
  }, [sceneKey, variant]);

  return (
    <div ref={rootRef} className={className} data-page-motion-boundary={variant}>
      {children}
    </div>
  );
}

export function SiteRouteMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const variant = pageMotionVariantForPath(pathname);
  const sceneKey = pageMotionSceneKey(pathname);

  return (
    <PageMotion variant={variant} sceneKey={sceneKey} className="contents">
      {children}
    </PageMotion>
  );
}

/**
 * App-segment variant. It renders inside AppShell's <main>, so playPageEntrance finds
 * neither [data-motion="page"] nor a <main> below it and falls through to the PageMotion
 * root — which therefore must NOT be `display: contents`, or the tween would no-op.
 */
export function AppRouteMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const variant = pageMotionVariantForPath(pathname);
  const sceneKey = pageMotionSceneKey(pathname);

  return (
    <PageMotion variant={variant} sceneKey={sceneKey}>
      {children}
    </PageMotion>
  );
}
