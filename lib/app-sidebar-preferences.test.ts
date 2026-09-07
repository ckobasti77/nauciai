import { describe, expect, it } from "vitest";

import {
  DEFAULT_APP_SIDEBAR_PREFERENCES,
  parseAppSidebarPreferences,
  serializeAppSidebarPreferences,
} from "./app-sidebar-preferences";

describe("app sidebar preferences", () => {
  it("round-trips both states", () => {
    expect(parseAppSidebarPreferences(serializeAppSidebarPreferences({ collapsed: false }))).toEqual({
      collapsed: false,
    });
    expect(parseAppSidebarPreferences(serializeAppSidebarPreferences({ collapsed: true }))).toEqual({
      collapsed: true,
    });
  });

  it("keeps the collapsed preference stored before widths were dropped", () => {
    const legacy = encodeURIComponent(JSON.stringify({ v: 1, collapsed: true, width: 80, lastExpandedWidth: 388 }));
    expect(parseAppSidebarPreferences(legacy)).toEqual({ collapsed: true });
  });

  it("falls back for malformed and unsupported cookies", () => {
    expect(parseAppSidebarPreferences("not-json")).toEqual(DEFAULT_APP_SIDEBAR_PREFERENCES);
    expect(parseAppSidebarPreferences(encodeURIComponent(JSON.stringify({ v: 2, collapsed: true })))).toEqual(
      DEFAULT_APP_SIDEBAR_PREFERENCES,
    );
    expect(parseAppSidebarPreferences(encodeURIComponent(JSON.stringify({ v: 1 })))).toEqual(
      DEFAULT_APP_SIDEBAR_PREFERENCES,
    );
  });
});
