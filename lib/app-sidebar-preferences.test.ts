import { describe, expect, it } from "vitest";

import {
  APP_SIDEBAR_DEFAULT_WIDTH,
  APP_SIDEBAR_MAX_WIDTH,
  APP_SIDEBAR_MIN_WIDTH,
  APP_SIDEBAR_RAIL_WIDTH,
  parseAppSidebarPreferences,
  preferencesFromDraggedWidth,
  serializeAppSidebarPreferences,
} from "./app-sidebar-preferences";

describe("app sidebar preferences", () => {
  it("round-trips expanded preferences", () => {
    const encoded = serializeAppSidebarPreferences({ collapsed: false, width: 372, lastExpandedWidth: 336 });
    expect(parseAppSidebarPreferences(encoded)).toEqual({ collapsed: false, width: 372, lastExpandedWidth: 372 });
  });

  it("keeps the last expanded width when collapsed", () => {
    const encoded = serializeAppSidebarPreferences({ collapsed: true, width: APP_SIDEBAR_RAIL_WIDTH, lastExpandedWidth: 388 });
    expect(parseAppSidebarPreferences(encoded)).toEqual({ collapsed: true, width: APP_SIDEBAR_RAIL_WIDTH, lastExpandedWidth: 388 });
  });

  it("falls back for malformed and unsupported cookies", () => {
    expect(parseAppSidebarPreferences("not-json").width).toBe(APP_SIDEBAR_DEFAULT_WIDTH);
    expect(parseAppSidebarPreferences(encodeURIComponent(JSON.stringify({ v: 2 })))).toEqual({
      collapsed: false,
      width: APP_SIDEBAR_DEFAULT_WIDTH,
      lastExpandedWidth: APP_SIDEBAR_DEFAULT_WIDTH,
    });
  });

  it("clamps stored widths", () => {
    const tooSmall = encodeURIComponent(JSON.stringify({ v: 1, collapsed: false, width: 20, lastExpandedWidth: 20 }));
    const tooLarge = encodeURIComponent(JSON.stringify({ v: 1, collapsed: false, width: 900, lastExpandedWidth: 900 }));
    expect(parseAppSidebarPreferences(tooSmall).width).toBe(APP_SIDEBAR_MIN_WIDTH);
    expect(parseAppSidebarPreferences(tooLarge).width).toBe(APP_SIDEBAR_MAX_WIDTH);
  });

  it("clamps dragged width to supported expanded bounds", () => {
    const previous = { collapsed: false, width: 360, lastExpandedWidth: 360 };
    expect(preferencesFromDraggedWidth(220, previous)).toEqual({
      collapsed: false,
      width: APP_SIDEBAR_MIN_WIDTH,
      lastExpandedWidth: APP_SIDEBAR_MIN_WIDTH,
    });
    expect(preferencesFromDraggedWidth(300, previous)).toEqual({
      collapsed: false,
      width: 300,
      lastExpandedWidth: 300,
    });
    expect(preferencesFromDraggedWidth(500, previous)).toEqual({
      collapsed: false,
      width: APP_SIDEBAR_MAX_WIDTH,
      lastExpandedWidth: APP_SIDEBAR_MAX_WIDTH,
    });
  });
});
