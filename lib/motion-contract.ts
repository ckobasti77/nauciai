export type PageMotionVariant = "showcase" | "standard" | "focus";

export const pageMotionContract = {
  showcase: {
    pageDuration: 0.48,
    itemDuration: 0.58,
    stagger: 0.07,
    pageEase: "back.out(1.55)",
    itemEase: "back.out(1.7)",
    pageY: 22,
    itemY: 20,
  },
  standard: {
    pageDuration: 0.36,
    itemDuration: 0.42,
    stagger: 0.05,
    pageEase: "power3.out",
    itemEase: "power2.out",
    pageY: 14,
    itemY: 12,
  },
  focus: {
    pageDuration: 0.24,
    itemDuration: 0.28,
    stagger: 0.025,
    pageEase: "power2.out",
    itemEase: "power2.out",
    pageY: 8,
    itemY: 6,
  },
} as const;

const localeRootPattern = /^\/(?:sr|en)\/?$/;
const appRootPattern = /^\/(?:sr|en)\/app\/?$/;

export function pageMotionVariantForPath(pathname: string): PageMotionVariant {
  if (localeRootPattern.test(pathname) || appRootPattern.test(pathname) || pathname.includes("/app/community")) {
    return "showcase";
  }

  if (/\/app\/courses\/[^/]+\/lessons\/[^/]+(?:\/edit)?\/?$/.test(pathname)) {
    return "focus";
  }

  return "standard";
}

export function pageMotionSceneKey(pathname: string, dashboardCourse?: string | null): string {
  if (!appRootPattern.test(pathname)) return pathname;
  return `${pathname}|course:${dashboardCourse || "home"}`;
}
