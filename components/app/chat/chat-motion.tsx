"use client";

import { gsap } from "gsap";
import {
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

export type ChatMotionKind =
  | "bubble"
  | "typing"
  | "reaction"
  | "read-status"
  | "request"
  | "member"
  | "drag-overlay"
  | "dock"
  | "dock-minimize"
  | "dock-toast"
  | "study-pulse";

export type ChatMotionDirection = "left" | "right";

export type ChatMotionRequest = {
  kind?: ChatMotionKind;
  direction?: ChatMotionDirection;
};

export type ChatMotionScopeProps = {
  children: ReactNode;
  className?: string;
  sceneKey: string;
};

const CHAT_MOTION_EVENT = "nauciai:chat-motion";
const LIVE_MOTION_SELECTOR = '[data-chat-motion-new="true"]';
const SURFACE_SELECTOR = [
  '[data-chat-motion-surface="inbox"]',
  '[data-chat-motion-surface="thread"]',
  '[data-chat-motion-surface="panel"]',
  '[data-chat-motion-surface="sheet"]',
  '[data-chat-motion="dock"]',
].join(",");

function clearChatMotionStyles(targets: Element | Element[]) {
  gsap.set(targets, {
    clearProps:
      "transform,opacity,visibility,clipPath,willChange,transformOrigin,strokeDasharray,strokeDashoffset",
  });
}

function motionKindFor(element: HTMLElement, request?: ChatMotionRequest): ChatMotionKind | undefined {
  const value = request?.kind ?? element.dataset.chatMotion;
  switch (value) {
    case "bubble":
    case "typing":
    case "reaction":
    case "read-status":
    case "request":
    case "member":
    case "drag-overlay":
    case "dock":
    case "dock-minimize":
    case "dock-toast":
    case "study-pulse":
      return value;
    default:
      return undefined;
  }
}

function directionFor(element: HTMLElement, request?: ChatMotionRequest): ChatMotionDirection {
  if (request?.direction) return request.direction;
  return element.dataset.chatMotionDirection === "right" ? "right" : "left";
}

function playReducedMotion(element: HTMLElement) {
  gsap.fromTo(
    element,
    { autoAlpha: 0 },
    {
      autoAlpha: 1,
      duration: 0.12,
      ease: "none",
      overwrite: "auto",
      onComplete: () => clearChatMotionStyles(element),
    },
  );
}

function playStudyPulse(element: HTMLElement) {
  const stroke = element.querySelector<SVGGeometryElement>("[data-chat-motion-progress]");
  if (!stroke) {
    gsap.fromTo(
      element,
      { autoAlpha: 0, scale: 0.9 },
      {
        autoAlpha: 1,
        scale: 1,
        duration: 0.24,
        ease: "back.out(1.7)",
        overwrite: "auto",
        onComplete: () => clearChatMotionStyles(element),
      },
    );
    return;
  }

  const declaredLength = Number(stroke.dataset.chatMotionProgressLength);
  const length = Number.isFinite(declaredLength) && declaredLength > 0
    ? declaredLength
    : stroke.getTotalLength();
  const declaredOffset = Number(stroke.dataset.chatMotionProgressOffset);
  const offset = Number.isFinite(declaredOffset) ? declaredOffset : 0;

  gsap.set(stroke, { strokeDasharray: length, strokeDashoffset: length });
  gsap.to(stroke, {
    strokeDashoffset: offset,
    duration: 0.42,
    ease: "power2.out",
    overwrite: "auto",
    onComplete: () => clearChatMotionStyles([element, stroke]),
  });
}

function playFullMotion(element: HTMLElement, request?: ChatMotionRequest) {
  const kind = motionKindFor(element, request);
  if (!kind) return;

  gsap.set(element, { willChange: "transform,opacity" });

  switch (kind) {
    case "bubble": {
      const direction = directionFor(element, request);
      gsap.fromTo(
        element,
        { autoAlpha: 0, x: direction === "right" ? 12 : -12, y: 4, scale: 0.985 },
        {
          autoAlpha: 1,
          x: 0,
          y: 0,
          scale: 1,
          duration: 0.22,
          ease: "power2.out",
          overwrite: "auto",
          onComplete: () => clearChatMotionStyles(element),
        },
      );
      break;
    }
    case "typing":
      gsap.fromTo(
        element,
        { autoAlpha: 0, y: 5 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.18,
          ease: "power2.out",
          overwrite: "auto",
          onComplete: () => clearChatMotionStyles(element),
        },
      );
      break;
    case "reaction":
      gsap.fromTo(
        element,
        { autoAlpha: 0, scale: 0.72 },
        {
          autoAlpha: 1,
          scale: 1,
          duration: 0.2,
          ease: "back.out(2.2)",
          overwrite: "auto",
          onComplete: () => clearChatMotionStyles(element),
        },
      );
      break;
    case "read-status":
      gsap.fromTo(
        element,
        { autoAlpha: 0, y: 3 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.16,
          ease: "power1.out",
          overwrite: "auto",
          onComplete: () => clearChatMotionStyles(element),
        },
      );
      break;
    case "request":
      gsap.fromTo(
        element,
        { autoAlpha: 0, y: 8, scale: 0.975 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.24,
          ease: "back.out(1.45)",
          overwrite: "auto",
          onComplete: () => clearChatMotionStyles(element),
        },
      );
      break;
    case "member":
      gsap.fromTo(
        element,
        { autoAlpha: 0, x: -8 },
        {
          autoAlpha: 1,
          x: 0,
          duration: 0.2,
          ease: "power2.out",
          overwrite: "auto",
          onComplete: () => clearChatMotionStyles(element),
        },
      );
      break;
    case "drag-overlay":
      gsap.fromTo(
        element,
        { autoAlpha: 0, clipPath: "inset(3% 3% 3% 3% round 16px)" },
        {
          autoAlpha: 1,
          clipPath: "inset(0% 0% 0% 0% round 16px)",
          duration: 0.2,
          ease: "power2.out",
          overwrite: "auto",
          onComplete: () => clearChatMotionStyles(element),
        },
      );
      break;
    case "dock":
      gsap.fromTo(
        element,
        { autoAlpha: 0, x: 14, y: 10, scale: 0.975 },
        {
          autoAlpha: 1,
          x: 0,
          y: 0,
          scale: 1,
          duration: 0.24,
          ease: "back.out(1.5)",
          overwrite: "auto",
          onComplete: () => clearChatMotionStyles(element),
        },
      );
      break;
    case "dock-minimize":
      gsap.fromTo(
        element,
        { autoAlpha: 0, y: 8, scale: 0.78 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.2,
          ease: "back.out(2)",
          overwrite: "auto",
          onComplete: () => clearChatMotionStyles(element),
        },
      );
      break;
    case "dock-toast":
      gsap.fromTo(
        element,
        { autoAlpha: 0, x: 12, y: -8 },
        {
          autoAlpha: 1,
          x: 0,
          y: 0,
          duration: 0.22,
          ease: "power2.out",
          overwrite: "auto",
          onComplete: () => clearChatMotionStyles(element),
        },
      );
      break;
    case "study-pulse":
      playStudyPulse(element);
      break;
  }
}

function animateSurfaces(rootOrSurfaces: HTMLElement | HTMLElement[], reducedMotion: boolean) {
  const surfaces = Array.isArray(rootOrSurfaces)
    ? rootOrSurfaces
    : [
        ...(rootOrSurfaces.matches(SURFACE_SELECTOR) ? [rootOrSurfaces] : []),
        ...rootOrSurfaces.querySelectorAll<HTMLElement>(SURFACE_SELECTOR),
      ];
  if (!surfaces.length) return;

  if (reducedMotion) {
    gsap.fromTo(
      surfaces,
      { autoAlpha: 0 },
      {
        autoAlpha: 1,
        duration: 0.12,
        ease: "none",
        stagger: 0,
        overwrite: "auto",
        onComplete: () => clearChatMotionStyles(surfaces),
      },
    );
    return;
  }

  const timeline = gsap.timeline({
    defaults: { overwrite: "auto" },
    onComplete: () => clearChatMotionStyles(surfaces),
  });

  surfaces.forEach((surface, index) => {
    const surfaceKind = surface.dataset.chatMotionSurface;
    const isSheet = surfaceKind === "sheet";
    const x = surfaceKind === "inbox" ? -12 : surfaceKind === "panel" ? 12 : 0;
    const y = surfaceKind === "thread" || isSheet ? 8 : 0;
    timeline.fromTo(
      surface,
      {
        autoAlpha: 0,
        x,
        y,
        clipPath: isSheet ? "inset(4% 0 0 0 round 16px)" : "none",
      },
      {
        autoAlpha: 1,
        x: 0,
        y: 0,
        clipPath: isSheet ? "inset(0% 0 0 0 round 16px)" : "none",
        duration: isSheet ? 0.24 : surfaceKind === "thread" ? 0.42 : 0.34,
        ease: "power2.out",
      },
      index * 0.04,
    );
  });
}

function collectLiveTargets(node: Node): HTMLElement[] {
  if (!(node instanceof HTMLElement)) return [];
  const targets = node.matches(LIVE_MOTION_SELECTOR) ? [node] : [];
  return [...targets, ...node.querySelectorAll<HTMLElement>(LIVE_MOTION_SELECTOR)];
}

function collectSurfaceTargets(node: Node): HTMLElement[] {
  if (!(node instanceof HTMLElement)) return [];
  const targets = node.matches(SURFACE_SELECTOR) ? [node] : [];
  return [...targets, ...node.querySelectorAll<HTMLElement>(SURFACE_SELECTOR)];
}

export function requestChatMotion(element: HTMLElement, request: ChatMotionRequest = {}) {
  element.dispatchEvent(
    new CustomEvent<ChatMotionRequest>(CHAT_MOTION_EVENT, {
      bubbles: true,
      detail: request,
    }),
  );
}

export function useChatMotionScope<T extends HTMLElement>(sceneKey: string): RefObject<T | null> {
  const rootRef = useRef<T>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const media = gsap.matchMedia();
    const context = gsap.context(() => {
      const installLiveMotion = (
        reducedMotion: boolean,
        contextSafe?: gsap.ContextSafeFunc,
      ) => {
        const played = new WeakSet<HTMLElement>();

        const playUnscoped = (element: HTMLElement, request?: ChatMotionRequest) => {
          if (!motionKindFor(element, request)) return;
          if (played.has(element) && !request) return;
          played.add(element);
          if (reducedMotion) playReducedMotion(element);
          else playFullMotion(element, request);
        };
        const play = (contextSafe?.(playUnscoped) ?? playUnscoped) as typeof playUnscoped;
        const animateSurfaceTargetsUnscoped = (surfaces: HTMLElement[]) => animateSurfaces(surfaces, reducedMotion);
        const animateSurfaceTargets = (contextSafe?.(animateSurfaceTargetsUnscoped) ?? animateSurfaceTargetsUnscoped) as typeof animateSurfaceTargetsUnscoped;

        const handleMotionRequest = (event: Event) => {
          const customEvent = event as CustomEvent<ChatMotionRequest>;
          if (!(customEvent.target instanceof HTMLElement)) return;
          play(customEvent.target, customEvent.detail);
        };

        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === "attributes") {
              if (mutation.target instanceof HTMLElement && mutation.target.dataset.chatMotionNew === "true") {
                play(mutation.target);
              }
              continue;
            }
            for (const node of mutation.addedNodes) {
              const surfaces = collectSurfaceTargets(node).filter((element) => !element.matches(LIVE_MOTION_SELECTOR));
              if (surfaces.length) animateSurfaceTargets(surfaces);
              collectLiveTargets(node).forEach((element) => play(element));
            }
          }
        });

        animateSurfaces(root, reducedMotion);
        root.querySelectorAll<HTMLElement>(LIVE_MOTION_SELECTOR).forEach((element) => play(element));
        root.addEventListener(CHAT_MOTION_EVENT, handleMotionRequest);
        observer.observe(root, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["data-chat-motion-new"],
        });

        return () => {
          observer.disconnect();
          root.removeEventListener(CHAT_MOTION_EVENT, handleMotionRequest);
        };
      };

      media.add(
        "(prefers-reduced-motion: reduce)",
        (_mediaContext, contextSafe) => installLiveMotion(true, contextSafe),
      );
      media.add(
        "(prefers-reduced-motion: no-preference)",
        (_mediaContext, contextSafe) => installLiveMotion(false, contextSafe),
      );
    }, root);

    return () => {
      gsap.killTweensOf(root.querySelectorAll("*"));
      media.revert();
      context.revert();
    };
  }, [sceneKey]);

  return rootRef;
}

export function ChatMotionScope({ children, className, sceneKey }: ChatMotionScopeProps) {
  const rootRef = useChatMotionScope<HTMLDivElement>(sceneKey);
  return (
    <div ref={rootRef} className={className} data-chat-motion-scope="">
      {children}
    </div>
  );
}
