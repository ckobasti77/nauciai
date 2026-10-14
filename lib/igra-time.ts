/**
 * Sat u Beogradu (K04, plan K01 §5.3) - za bedževe „Noćna sova" i „Rani pevac".
 * Pragovi se računaju u vremenskoj zoni Beograda, kao i ostali dnevni ključevi u repou
 * (`leaderboardCore.belgradeDayKey`), pa letnje računanje vremena ne pomera granicu.
 */

const belgradeHourFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Belgrade",
  hour: "2-digit",
  hourCycle: "h23",
});

/** Sat (0-23) u Beogradu za dati trenutak. */
export function belgradeHour(timestamp: number): number {
  const part = belgradeHourFormatter.formatToParts(new Date(timestamp)).find((item) => item.type === "hour");
  return Number(part?.value ?? 0) % 24;
}

/** „Posle 22 h": od 22:00 do 03:59 (noćna tura se ne prekida u ponoć). */
export function isNightOwlHour(hour: number): boolean {
  return hour >= 22 || hour < 4;
}

/** „Pre 8 h": od 05:00 do 07:59 (ranije od toga je još noć). */
export function isEarlyBirdHour(hour: number): boolean {
  return hour >= 5 && hour < 8;
}
