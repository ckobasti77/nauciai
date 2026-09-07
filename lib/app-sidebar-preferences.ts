export const APP_SIDEBAR_COOKIE = "nauci_app_sidebar";

/**
 * Sidebar ima tacno dva stanja, pa kolacic pamti samo koje je od njih (N8). Sirine
 * su CSS tokeni (`--sidebar-w` / `--sidebar-w-collapsed` u `app/globals.css`) i
 * nikad ne prolaze kroz JS — nema slobodnog resize-a koji bi imao sta da sacuva.
 * Format kolacica ostaje `v: 1`: zapisi iz doba slobodne sirine nose i `width` /
 * `lastExpandedWidth`, koji se sad prosto ignorisu, pa zatecena preferenca
 * `collapsed` prezivi ovu promenu.
 */
export type AppSidebarPreferences = {
  collapsed: boolean;
};

export const DEFAULT_APP_SIDEBAR_PREFERENCES: AppSidebarPreferences = {
  collapsed: false,
};

export function parseAppSidebarPreferences(rawValue?: string | null): AppSidebarPreferences {
  if (!rawValue) return DEFAULT_APP_SIDEBAR_PREFERENCES;

  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue)) as { v?: number; collapsed?: boolean };
    if (parsed.v !== 1 || typeof parsed.collapsed !== "boolean") {
      return DEFAULT_APP_SIDEBAR_PREFERENCES;
    }
    return { collapsed: parsed.collapsed };
  } catch {
    return DEFAULT_APP_SIDEBAR_PREFERENCES;
  }
}

export function serializeAppSidebarPreferences(preferences: AppSidebarPreferences) {
  return encodeURIComponent(JSON.stringify({ v: 1, collapsed: preferences.collapsed }));
}
