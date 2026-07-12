export const APP_SIDEBAR_COOKIE = "nauci_app_sidebar";
export const APP_SIDEBAR_DEFAULT_WIDTH = 336;
export const APP_SIDEBAR_MIN_WIDTH = 280;
export const APP_SIDEBAR_MAX_WIDTH = 420;
export const APP_SIDEBAR_RAIL_WIDTH = 80;
export const APP_SIDEBAR_SNAP_WIDTH = 240;
export const APP_SIDEBAR_KEYBOARD_STEP = 16;

export type AppSidebarPreferences = {
  collapsed: boolean;
  width: number;
  lastExpandedWidth: number;
};

type StoredSidebarPreferences = {
  v: 1;
  collapsed: boolean;
  width: number;
  lastExpandedWidth: number;
};

export const DEFAULT_APP_SIDEBAR_PREFERENCES: AppSidebarPreferences = {
  collapsed: false,
  width: APP_SIDEBAR_DEFAULT_WIDTH,
  lastExpandedWidth: APP_SIDEBAR_DEFAULT_WIDTH,
};

export function clampAppSidebarWidth(width: number) {
  return Math.min(APP_SIDEBAR_MAX_WIDTH, Math.max(APP_SIDEBAR_MIN_WIDTH, Math.round(width)));
}

export function preferencesFromDraggedWidth(
  width: number,
  previous: AppSidebarPreferences,
): AppSidebarPreferences {
  if (!Number.isFinite(width) || width < APP_SIDEBAR_SNAP_WIDTH) {
    return {
      collapsed: true,
      width: APP_SIDEBAR_RAIL_WIDTH,
      lastExpandedWidth: clampAppSidebarWidth(previous.lastExpandedWidth),
    };
  }

  const expandedWidth = clampAppSidebarWidth(width);
  return {
    collapsed: false,
    width: expandedWidth,
    lastExpandedWidth: expandedWidth,
  };
}

export function parseAppSidebarPreferences(rawValue?: string | null): AppSidebarPreferences {
  if (!rawValue) return DEFAULT_APP_SIDEBAR_PREFERENCES;

  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue)) as Partial<StoredSidebarPreferences>;
    if (
      parsed.v !== 1 ||
      typeof parsed.collapsed !== "boolean" ||
      typeof parsed.width !== "number" ||
      typeof parsed.lastExpandedWidth !== "number" ||
      !Number.isFinite(parsed.width) ||
      !Number.isFinite(parsed.lastExpandedWidth)
    ) {
      return DEFAULT_APP_SIDEBAR_PREFERENCES;
    }

    const lastExpandedWidth = clampAppSidebarWidth(parsed.lastExpandedWidth);
    if (parsed.collapsed) {
      return {
        collapsed: true,
        width: APP_SIDEBAR_RAIL_WIDTH,
        lastExpandedWidth,
      };
    }

    const width = clampAppSidebarWidth(parsed.width);
    return { collapsed: false, width, lastExpandedWidth: width };
  } catch {
    return DEFAULT_APP_SIDEBAR_PREFERENCES;
  }
}

export function serializeAppSidebarPreferences(preferences: AppSidebarPreferences) {
  const normalized = preferences.collapsed
    ? {
        collapsed: true,
        width: APP_SIDEBAR_RAIL_WIDTH,
        lastExpandedWidth: clampAppSidebarWidth(preferences.lastExpandedWidth),
      }
    : {
        collapsed: false,
        width: clampAppSidebarWidth(preferences.width),
        lastExpandedWidth: clampAppSidebarWidth(preferences.width),
      };

  return encodeURIComponent(JSON.stringify({ v: 1, ...normalized } satisfies StoredSidebarPreferences));
}
