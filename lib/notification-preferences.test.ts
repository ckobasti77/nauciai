import { describe, expect, it } from "vitest";

import {
  notificationMasterState,
  preferenceSnapshot,
  restoredPreferences,
  silencedPreferences,
  toggledChannel,
  type NotificationPreferenceRow,
} from "./notification-preferences";

const row = (category: string, inApp: boolean, push: boolean, sound: boolean): NotificationPreferenceRow => ({
  category,
  inApp,
  push,
  sound,
});

const allOn = [row("chat", true, true, true), row("mentions", true, true, true)];

describe("notification master state", () => {
  it("is on whenever a single channel is on", () => {
    expect(notificationMasterState(allOn)).toBe("all");
    expect(notificationMasterState([row("chat", false, false, true), row("mentions", false, false, false)])).toBe("partial");
    expect(notificationMasterState([row("chat", true, true, true), row("mentions", true, true, false)])).toBe("partial");
    expect(notificationMasterState([row("chat", false, false, false), row("mentions", false, false, false)])).toBe("none");
    expect(notificationMasterState([])).toBe("none");
  });

  it("silences every channel of every category", () => {
    expect(silencedPreferences(allOn)).toEqual([row("chat", false, false, false), row("mentions", false, false, false)]);
    expect(notificationMasterState(silencedPreferences(allOn))).toBe("none");
  });

  it("restores the state the snapshot was taken from", () => {
    const before = [row("chat", true, false, true), row("mentions", false, true, false)];
    const snapshot = preferenceSnapshot(before);
    const silenced = silencedPreferences(before);
    expect(restoredPreferences(silenced, snapshot)).toEqual(before);
  });

  it("turns everything on when there is nothing usable to restore", () => {
    const silenced = silencedPreferences(allOn);
    expect(restoredPreferences(silenced, null)).toEqual(allOn);
    // A snapshot taken while everything was already off must not restore into silence.
    expect(restoredPreferences(silenced, preferenceSnapshot(silenced))).toEqual(allOn);
  });

  it("turns on a category the snapshot does not know about", () => {
    const snapshot = preferenceSnapshot([row("chat", true, false, false)]);
    const silenced = silencedPreferences([row("chat", false, false, false), row("study", false, false, false)]);
    expect(restoredPreferences(silenced, snapshot)).toEqual([row("chat", true, false, false), row("study", true, true, true)]);
  });

  it("flips exactly one channel", () => {
    expect(toggledChannel(row("chat", true, true, true), "push")).toEqual(row("chat", true, false, true));
    expect(toggledChannel(row("chat", false, false, false), "inApp")).toEqual(row("chat", true, false, false));
  });
});
