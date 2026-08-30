import { describe, expect, it } from "vitest";

import { progressEncouragement, progressMilestone } from "./progress-encouragement";

describe("progressMilestone", () => {
  it("treats a course with no lessons as empty, never as finished", () => {
    // 0/0 je 100% po deljenju, ali prazan kurs nije zavrsen kurs.
    expect(progressMilestone({ completedLessons: 0, totalLessons: 0 })).toBe("empty");
    expect(progressMilestone({ completedLessons: 3, totalLessons: 0 })).toBe("empty");
  });

  it("reads the milestone from the lesson count, not from the rounded percent", () => {
    // 1/3 je 33% — pocetak, ne polovina.
    expect(progressMilestone({ completedLessons: 1, totalLessons: 3 })).toBe("started");
    // 2/3 je 67% — polovina je iza njega, ali „skoro gotovo" pocinje tek na 80%.
    expect(progressMilestone({ completedLessons: 2, totalLessons: 3 })).toBe("halfway");
    expect(progressMilestone({ completedLessons: 4, totalLessons: 5 })).toBe("almost");
  });

  it("moves to halfway at exactly half and to almost at exactly four fifths", () => {
    expect(progressMilestone({ completedLessons: 4, totalLessons: 10 })).toBe("started");
    expect(progressMilestone({ completedLessons: 5, totalLessons: 10 })).toBe("halfway");
    expect(progressMilestone({ completedLessons: 7, totalLessons: 10 })).toBe("halfway");
    expect(progressMilestone({ completedLessons: 8, totalLessons: 10 })).toBe("almost");
  });

  it("celebrates only when every lesson is behind the student", () => {
    expect(progressMilestone({ completedLessons: 9, totalLessons: 10 })).toBe("almost");
    expect(progressMilestone({ completedLessons: 10, totalLessons: 10 })).toBe("done");
    // Vise zavrsenih nego postojecih (lekcija je u medjuvremenu skinuta) je i dalje zavrsen kurs.
    expect(progressMilestone({ completedLessons: 12, totalLessons: 10 })).toBe("done");
  });
});

describe("progressEncouragement", () => {
  it("never scolds an empty course", () => {
    expect(progressEncouragement("sr", { completedLessons: 0, totalLessons: 8 })).toBe(
      "Prva lekcija je najteža — posle nje ide samo.",
    );
    expect(progressEncouragement("en", { completedLessons: 0, totalLessons: 8 })).toBe(
      "The first lesson is the hard one — after that it rolls.",
    );
  });

  it("uses the Serbian three-form plural for the remaining lessons", () => {
    // 5 preostalih -> "lekcija", 2 preostale -> "lekcije", 1 -> svoja recenica.
    expect(progressEncouragement("sr", { completedLessons: 20, totalLessons: 25 })).toBe(
      "Ostalo je još 5 lekcija.",
    );
    expect(progressEncouragement("sr", { completedLessons: 8, totalLessons: 10 })).toBe(
      "Ostalo je još 2 lekcije.",
    );
    expect(progressEncouragement("sr", { completedLessons: 9, totalLessons: 10 })).toBe(
      "Ostala je još jedna lekcija.",
    );
  });

  it("uses the Serbian three-form plural for the lessons already done", () => {
    expect(progressEncouragement("sr", { completedLessons: 1, totalLessons: 10 })).toBe(
      "Prva lekcija je iza tebe. Lepo počinje.",
    );
    expect(progressEncouragement("sr", { completedLessons: 2, totalLessons: 10 })).toBe(
      "Već 2 lekcije iza tebe.",
    );
    // 21 zavrsena mora da bude "lekcija" (jedanaest/dvadeset jedan pravilo).
    expect(progressEncouragement("sr", { completedLessons: 21, totalLessons: 100 })).toBe(
      "Već 21 lekcija iza tebe.",
    );
  });

  it("has an English line for every milestone", () => {
    expect(progressEncouragement("en", { completedLessons: 1, totalLessons: 10 })).toBe(
      "First lesson done. Good start.",
    );
    expect(progressEncouragement("en", { completedLessons: 5, totalLessons: 10 })).toBe(
      "You are past halfway. Keep the pace.",
    );
    expect(progressEncouragement("en", { completedLessons: 8, totalLessons: 10 })).toBe("2 lessons left.");
    expect(progressEncouragement("en", { completedLessons: 10, totalLessons: 10 })).toBe(
      "Course finished. Well done!",
    );
  });
});
