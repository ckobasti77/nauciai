/**
 * Glavno zvono i pojedinačni prekidači po tipu su JEDNO stanje, ne dva (N9).
 *
 * Izvor istine ostaje lista po kategorijama (`chat.getNotificationPreferences`);
 * zvono je izvedeno iz nje, pa se njih dvoje ne mogu razići:
 *   - bar jedan kanal upaljen  → zvono je upaljeno (`all` ili `partial`),
 *   - sve ugašeno              → zvono je ugašeno (`none`).
 * Gašenje zvona gasi sve kanale, a paljenje vraća zapamćeno stanje (snimak čuva
 * pozivalac — u `chat-inbox.tsx` je to localStorage, jer u shemi nema polje za njega;
 * bez snimka se pali sve, da paljenje nikad ne ostavi korisnika u tišini).
 */
export const NOTIFICATION_CHANNELS = ["inApp", "push", "sound"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationToggles = Record<NotificationChannel, boolean>;

export type NotificationPreferenceRow = NotificationToggles & { category: string };

export type NotificationMasterState = "all" | "partial" | "none";

export type NotificationSnapshot = Record<string, NotificationToggles>;

const ALL_ON: NotificationToggles = { inApp: true, push: true, sound: true };

function anyOn(row: NotificationToggles) {
  return NOTIFICATION_CHANNELS.some((channel) => row[channel]);
}

function allOn(row: NotificationToggles) {
  return NOTIFICATION_CHANNELS.every((channel) => row[channel]);
}

export function notificationMasterState(rows: readonly NotificationPreferenceRow[]): NotificationMasterState {
  if (rows.length === 0 || !rows.some(anyOn)) return "none";
  return rows.every(allOn) ? "all" : "partial";
}

/** Sve ugašeno — kategorije i redosled ostaju isti, menjaju se samo kanali. */
export function silencedPreferences(rows: readonly NotificationPreferenceRow[]): NotificationPreferenceRow[] {
  return rows.map((row) => ({ category: row.category, inApp: false, push: false, sound: false }));
}

export function preferenceSnapshot(rows: readonly NotificationPreferenceRow[]): NotificationSnapshot {
  const snapshot: NotificationSnapshot = {};
  for (const row of rows) {
    snapshot[row.category] = { inApp: row.inApp, push: row.push, sound: row.sound };
  }
  return snapshot;
}

/**
 * Vraća zapamćeno stanje. Kategorija koje nema u snimku (ili je u snimku bila cela
 * ugašena) se pali — inače bi „upali zvono" ostavilo tip trajno nem.
 */
export function restoredPreferences(
  rows: readonly NotificationPreferenceRow[],
  snapshot: NotificationSnapshot | null,
): NotificationPreferenceRow[] {
  const usable = snapshot && Object.values(snapshot).some(anyOn) ? snapshot : null;
  return rows.map((row) => {
    const remembered = usable?.[row.category];
    const next = remembered && anyOn(remembered) ? remembered : ALL_ON;
    return { category: row.category, inApp: next.inApp, push: next.push, sound: next.sound };
  });
}

/** Jedan kanal jedne kategorije — zvono se prati samo, nikad se ne postavlja zasebno. */
export function toggledChannel(
  row: NotificationPreferenceRow,
  channel: NotificationChannel,
): NotificationPreferenceRow {
  return { ...row, [channel]: !row[channel] };
}
