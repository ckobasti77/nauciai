import { describe, expect, it } from "vitest";

import {
  buildFirstRunChecklist,
  celebratedStepId,
  firstRunDoneCount,
  firstRunDoneIds,
  firstRunZoneView,
  shouldShowResumeHero,
  type FirstRunSignals,
} from "./dashboard-first-run";

function signals(overrides: Partial<FirstRunSignals> = {}): FirstRunSignals {
  return { hasUnlockedCourse: false, completedLessons: 0, ...overrides };
}

describe("buildFirstRunChecklist", () => {
  it("vraca tri koraka u fiksnom redosledu", () => {
    expect(buildFirstRunChecklist(signals()).map((step) => step.id)).toEqual([
      "course",
      "lesson",
      "community",
    ]);
  });

  it("nov korisnik: nijedan korak nije zavrsen, prvi je sledeci", () => {
    const steps = buildFirstRunChecklist(signals());
    expect(steps.map((step) => step.done)).toEqual([false, false, false]);
    expect(steps.map((step) => step.next)).toEqual([true, false, false]);
  });

  it("otkljucan kurs stiklira prvi korak i pomera 'sledeci' na lekciju", () => {
    const steps = buildFirstRunChecklist(signals({ hasUnlockedCourse: true }));
    expect(steps[0]).toEqual({ id: "course", done: true, next: false });
    expect(steps[1]).toEqual({ id: "lesson", done: false, next: true });
  });

  it("zavrsena lekcija stiklira drugi korak", () => {
    const steps = buildFirstRunChecklist(signals({ completedLessons: 1 }));
    expect(steps[1].done).toBe(true);
  });

  it("nula zavrsenih lekcija ne stiklira korak", () => {
    expect(buildFirstRunChecklist(signals({ completedLessons: 0 }))[1].done).toBe(false);
  });

  it("negativan broj lekcija se ponasa kao nula", () => {
    expect(buildFirstRunChecklist(signals({ completedLessons: -3 }))[1].done).toBe(false);
  });

  it("objava u zajednici stiklira treci korak", () => {
    expect(buildFirstRunChecklist(signals({ hasCommunityPost: true }))[2].done).toBe(true);
  });

  it("nedostajuci podatak o zajednici (undefined) NE stiklira korak", () => {
    // Ucionica taj signal nema; `undefined` ne sme da se procita kao "uradjeno".
    expect(buildFirstRunChecklist(signals({ hasCommunityPost: undefined }))[2].done).toBe(false);
  });

  it("preskocen korak: lekcija zavrsena bez kursa - 'sledeci' ostaje na kursu", () => {
    // Moguce jer backend danas pusta svakog verifikovanog korisnika u objavljenu
    // lekciju (vidi UX-BOOST-PLAN §1B). Checklist tada i dalje vodi na katalog.
    const steps = buildFirstRunChecklist(signals({ completedLessons: 4 }));
    expect(steps[0]).toEqual({ id: "course", done: false, next: true });
    expect(steps[1]).toEqual({ id: "lesson", done: true, next: false });
  });

  it("sve zavrseno: nijedan korak nije 'sledeci'", () => {
    const steps = buildFirstRunChecklist(
      signals({ hasUnlockedCourse: true, completedLessons: 2, hasCommunityPost: true }),
    );
    expect(steps.every((step) => step.done)).toBe(true);
    expect(steps.some((step) => step.next)).toBe(false);
  });

  it("tacno jedan korak je 'sledeci' u svakoj kombinaciji", () => {
    for (const hasUnlockedCourse of [false, true]) {
      for (const completedLessons of [0, 5]) {
        for (const hasCommunityPost of [false, true]) {
          const steps = buildFirstRunChecklist({ hasUnlockedCourse, completedLessons, hasCommunityPost });
          const nextCount = steps.filter((step) => step.next).length;
          expect(nextCount).toBe(steps.every((step) => step.done) ? 0 : 1);
        }
      }
    }
  });
});

describe("firstRunDoneCount", () => {
  it("broji samo zavrsene korake", () => {
    expect(firstRunDoneCount(buildFirstRunChecklist(signals()))).toBe(0);
    expect(firstRunDoneCount(buildFirstRunChecklist(signals({ hasUnlockedCourse: true })))).toBe(1);
    expect(
      firstRunDoneCount(
        buildFirstRunChecklist(signals({ hasUnlockedCourse: true, completedLessons: 1, hasCommunityPost: true })),
      ),
    ).toBe(3);
  });
});

describe("shouldShowResumeHero", () => {
  it("bez otkljucanog kursa nikad ne prikazuje ResumeHero", () => {
    expect(shouldShowResumeHero({ hasUnlockedCourse: false, hasResume: true, totalLessons: 10 })).toBe(false);
    expect(shouldShowResumeHero({ hasUnlockedCourse: false, hasResume: false, totalLessons: 0 })).toBe(false);
  });

  it("otkljucan kurs sa lekcijom koja se nastavlja prikazuje ResumeHero", () => {
    expect(shouldShowResumeHero({ hasUnlockedCourse: true, hasResume: true, totalLessons: 10 })).toBe(true);
  });

  it("otkljucan kurs bez `resume`, ali sa lekcijama, i dalje prikazuje ResumeHero", () => {
    // To je stanje "sve lekcije su zavrsene" - hero za njega ima svoju granu.
    expect(shouldShowResumeHero({ hasUnlockedCourse: true, hasResume: false, totalLessons: 4 })).toBe(true);
  });

  it("admin na praznoj bazi dobija pozdravni hero, ne 'Sve lekcije su zavrsene'", () => {
    expect(shouldShowResumeHero({ hasUnlockedCourse: true, hasResume: false, totalLessons: 0 })).toBe(false);
  });
});

describe("firstRunZoneView", () => {
  const base = {
    hasUnlockedCourse: false,
    hasResume: false,
    totalLessons: 0,
    doneCount: 0,
    stepCount: 3,
    compactDismissed: false,
  };

  it("ima kurs koji se nastavlja → hero, ne dira ostalo", () => {
    expect(
      firstRunZoneView({ ...base, hasUnlockedCourse: true, hasResume: true, totalLessons: 10 }),
    ).toBe("resume");
  });

  it("nema kursa, nijedan korak → checklista", () => {
    expect(firstRunZoneView({ ...base, doneCount: 0 })).toBe("checklist");
  });

  it("nema kursa, 2 od 3 koraka → i dalje checklista (nije sve odrađeno)", () => {
    expect(firstRunZoneView({ ...base, doneCount: 2 })).toBe("checklist");
  });

  it("3 od 3 koraka bez `resume` → kompaktna traka umesto pune checkliste", () => {
    // Bez ovoga je student koji je sve odradio gledao punu checklistu zauvek.
    expect(firstRunZoneView({ ...base, doneCount: 3 })).toBe("compact");
  });

  it("zatvorena kompaktna traka → zona nestaje (mreža se podiže)", () => {
    expect(firstRunZoneView({ ...base, doneCount: 3, compactDismissed: true })).toBe("hidden");
  });

  it("zatvaranje ne utiče dok checklista još nije sve odradila", () => {
    // `compactDismissed` sme da sakrije samo kompaktnu traku, ne i checklistu.
    expect(firstRunZoneView({ ...base, doneCount: 1, compactDismissed: true })).toBe("checklist");
  });

  it("hero pobeđuje čak i kad su svi koraci odrađeni", () => {
    expect(
      firstRunZoneView({
        ...base,
        hasUnlockedCourse: true,
        totalLessons: 4,
        doneCount: 3,
      }),
    ).toBe("resume");
  });
});

describe("celebratedStepId", () => {
  const nothing = firstRunDoneIds(buildFirstRunChecklist(signals()));
  const withCourse = firstRunDoneIds(buildFirstRunChecklist(signals({ hasUnlockedCourse: true })));
  const withLesson = firstRunDoneIds(
    buildFirstRunChecklist(signals({ hasUnlockedCourse: true, completedLessons: 1 })),
  );

  it("firstRunDoneIds vraca samo stiklirane korake, u fiksnom redosledu", () => {
    expect(nothing).toEqual([]);
    expect(withCourse).toEqual(["course"]);
    expect(withLesson).toEqual(["course", "lesson"]);
  });

  it("ne slavi nista na prvom renderu - nema prethodnog stanja za poredjenje", () => {
    expect(celebratedStepId(null, withCourse)).toBeNull();
  });

  it("ne slavi kad se nista nije promenilo (obican ponovni render)", () => {
    expect(celebratedStepId(withCourse, withCourse)).toBeNull();
    expect(celebratedStepId(nothing, nothing)).toBeNull();
  });

  it("slavi tacno korak koji je upravo postao uradjen", () => {
    expect(celebratedStepId(nothing, withCourse)).toBe("course");
    expect(celebratedStepId(withCourse, withLesson)).toBe("lesson");
  });

  it("kad se vise koraka stiklira odjednom, slavi prvi po redosledu", () => {
    expect(celebratedStepId(nothing, withLesson)).toBe("course");
  });

  it("povratak koraka u neuradjeno stanje nije proslava", () => {
    expect(celebratedStepId(withLesson, withCourse)).toBeNull();
  });
});
