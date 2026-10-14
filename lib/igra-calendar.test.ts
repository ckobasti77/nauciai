import { describe, expect, it } from "vitest";

import { INK_CALENDAR_PHONE_WEEKS, INK_CALENDAR_WEEKS, inkCalendarView, inkLevel } from "./igra-calendar";

/** 2026-10-14 je sreda. */
const TODAY = "2026-10-14";

describe("inkLevel", () => {
  it("0 je prazno, 1 i 2 su stepeni, 3 i više je najtamnije", () => {
    expect([0, 1, 2, 3, 9].map(inkLevel)).toEqual([0, 1, 2, 3, 3]);
  });

  it("loš ulaz je prazno", () => {
    expect([-2, Number.NaN].map(inkLevel)).toEqual([0, 0]);
  });
});

describe("inkCalendarView", () => {
  it("mreža ima pune nedelje od ponedeljka, a poslednja sadrži današnji dan", () => {
    const view = inkCalendarView({ activity: [], todayKey: TODAY }, "sr");
    expect(view.weeks).toBe(INK_CALENDAR_WEEKS);
    expect(view.cells).toHaveLength(INK_CALENDAR_WEEKS * 7);
    // Ponedeljak tekuće nedelje je 12. oktobar; mreža počinje 25 nedelja pre njega.
    expect(view.startKey).toBe("2026-04-20");
    expect(new Date(`${view.startKey}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(view.cells.at(-7)?.dayKey).toBe("2026-10-12");
    expect(view.cells.filter((cell) => cell.today).map((cell) => cell.dayKey)).toEqual([TODAY]);
    expect(view.cells.map((cell) => cell.week).at(-1)).toBe(INK_CALENDAR_WEEKS - 1);
  });

  it("dani posle današnjeg su u mreži, ali prazni i označeni", () => {
    const view = inkCalendarView({ activity: [{ day: "2026-10-16", completed: 3 }], todayKey: TODAY }, "sr");
    const future = view.cells.filter((cell) => cell.future);
    expect(future.map((cell) => cell.dayKey)).toEqual(["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
    expect(future.every((cell) => cell.level === 0)).toBe(true);
    expect(view.activeDays).toBe(0);
  });

  it("nedelja je ceo red i kad je danas ponedeljak ili nedelja", () => {
    const monday = inkCalendarView({ activity: [], todayKey: "2026-10-12", weeks: 2 }, "sr");
    expect(monday.cells.filter((cell) => cell.future)).toHaveLength(6);
    const sunday = inkCalendarView({ activity: [], todayKey: "2026-10-18", weeks: 2 }, "sr");
    expect(sunday.cells.filter((cell) => cell.future)).toHaveLength(0);
    expect(sunday.cells.at(-1)?.today).toBe(true);
  });

  it("jačina mastila prati broj lekcija tog dana", () => {
    const view = inkCalendarView(
      {
        activity: [
          { day: "2026-10-12", completed: 1 },
          { day: "2026-10-13", completed: 2 },
          { day: TODAY, completed: 5 },
        ],
        todayKey: TODAY,
        weeks: 1,
      },
      "sr",
    );
    expect(view.cells.slice(0, 3).map((cell) => cell.level)).toEqual([1, 2, 3]);
    expect(view.activeDays).toBe(3);
  });

  it("dan aktivan u nizu (npr. samo rad u Crei) dobija najsvetliji stepen, ne više", () => {
    const view = inkCalendarView(
      {
        activity: [{ day: "2026-10-13", completed: 2 }],
        recent: [
          { dayKey: "2026-10-11", state: "frozen" },
          { dayKey: "2026-10-12", state: "active" },
          { dayKey: "2026-10-13", state: "active" },
          { dayKey: TODAY, state: "today" },
        ],
        todayKey: TODAY,
        weeks: 2,
      },
      "sr",
    );
    const level = (dayKey: string) => view.cells.find((cell) => cell.dayKey === dayKey)?.level;
    expect(level("2026-10-12")).toBe(1);
    expect(level("2026-10-13")).toBe(2);
    // Zamrznut dan i današnji dan koji još nije upisan ostaju prazni.
    expect(level("2026-10-11")).toBe(0);
    expect(level(TODAY)).toBe(0);
    expect(view.activeDays).toBe(2);
  });

  it("aktivnost starija od mreže se ne broji", () => {
    const view = inkCalendarView({ activity: [{ day: "2025-01-01", completed: 4 }], todayKey: TODAY }, "sr");
    expect(view.activeDays).toBe(0);
  });

  it("telefon vidi poslednjih 13 celih nedelja iste mreže", () => {
    const view = inkCalendarView({ activity: [], todayKey: TODAY }, "sr");
    const visible = view.cells.filter((cell) => cell.week >= view.weeks - INK_CALENDAR_PHONE_WEEKS);
    expect(visible).toHaveLength(INK_CALENDAR_PHONE_WEEKS * 7);
    expect(visible[0]?.dayKey).toBe("2026-07-20");
  });

  it("rečenica za čitač ekrana na oba jezika", () => {
    const activity = [{ day: TODAY, completed: 1 }];
    expect(inkCalendarView({ activity, todayKey: TODAY }, "sr").label).toBe("Aktivnih dana u poslednjih 26 nedelja: 1.");
    expect(inkCalendarView({ activity, todayKey: TODAY }, "en").label).toBe("Active days in the last 26 weeks: 1.");
  });

  it("neispravan dan ne ruši tablu: prazna mreža", () => {
    const view = inkCalendarView({ activity: [{ day: TODAY, completed: 1 }], todayKey: "juče" }, "sr");
    expect(view.cells).toEqual([]);
    expect(view.activeDays).toBe(0);
  });
});
