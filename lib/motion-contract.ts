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
// Course detail, not a lesson beneath it.
const courseDetailPattern = /^\/(?:sr|en)\/app\/classroom\/courses\/[^/]+\/?$/;

export function pageMotionVariantForPath(pathname: string): PageMotionVariant {
  if (
    localeRootPattern.test(pathname) ||
    appRootPattern.test(pathname) ||
    // Course detail used to live at /app?course=… and so inherited the app root's
    // showcase treatment. Moving it to its own path must not quietly demote it.
    courseDetailPattern.test(pathname) ||
    pathname.includes("/app/community")
  ) {
    return "showcase";
  }

  if (/\/app\/classroom\/courses\/[^/]+\/lessons\/[^/]+(?:\/edit)?\/?$/.test(pathname)) {
    return "focus";
  }

  return "standard";
}

/**
 * The pathname alone identifies a scene. Course detail was the one exception — it used to
 * be a search param on /app — and it now has its own segment, so no search param may key
 * an entrance again: community filters and lesson view modes must not replay it.
 */
export function pageMotionSceneKey(pathname: string): string {
  return pathname;
}
