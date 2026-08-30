import { expect, test } from "vitest";

import {
  decideStudioAccess,
  hasStudioAccess,
  isEmailVerifiedForStudio,
  isStudioStaff,
  MAX_ACTIVE_JOBS,
  MAX_DAILY_GENERATIONS,
  PUBLIC_LIMIT_DEFAULTS,
  resolveStudioLimits,
  STUDIO_STAFF_ONLY,
} from "./studioCore";

// ── STUDIO_STAFF_ONLY (privremeni kill switch, vidi komentar u studioCore.ts) ──

test("STUDIO_STAFF_ONLY je upaljen: samo osoblje ulazi, upis se ne pita", () => {
  expect(STUDIO_STAFF_ONLY).toBe(true);

  expect(hasStudioAccess("student", { _id: "enr" })).toBe(false);
  expect(hasStudioAccess("student", null)).toBe(false);
  expect(hasStudioAccess("pro_student", { _id: "enr" })).toBe(false);
  expect(hasStudioAccess(undefined, undefined)).toBe(false);

  expect(hasStudioAccess("admin", null)).toBe(true);
  expect(hasStudioAccess("moderator", null)).toBe(true);
  expect(hasStudioAccess("admin", { _id: "enr" })).toBe(true);
  expect(hasStudioAccess("moderator", { _id: "enr" })).toBe(true);

  expect(isStudioStaff("admin")).toBe(true);
  expect(isStudioStaff("moderator")).toBe(true);
  expect(isStudioStaff("student")).toBe(false);
});

/**
 * Najvažniji test u ovom fajlu: jedini dokaz da je gašenje flega ("promeni
 * SAMO ovaj red u `STUDIO_STAFF_ONLY = false`") stvarno dovoljno da vrati
 * staro ponašanje, u potpunosti - ne samo delimično. Treći argument postoji
 * SAMO zato da ovaj test može da simulira ugašen fleg bez diranja `const`-a;
 * `createJob` i `getStudioState` ga nikad ne prosleđuju.
 */
test("STUDIO_STAFF_ONLY = false vraća staro ponašanje u potpunosti", () => {
  // Upis ponovo pušta svakoga.
  expect(hasStudioAccess("student", { _id: "enr" }, false)).toBe(true);
  expect(hasStudioAccess("pro_student", { _id: "enr" }, false)).toBe(true);
  // Bez upisa, samo osoblje.
  expect(hasStudioAccess("student", null, false)).toBe(false);
  expect(hasStudioAccess("pro_student", null, false)).toBe(false);
  expect(hasStudioAccess(undefined, undefined, false)).toBe(false);
  expect(hasStudioAccess("admin", null, false)).toBe(true);
  expect(hasStudioAccess("moderator", null, false)).toBe(true);
});

// ── decideStudioAccess (javni fleg, studio-public F1) ──────────────────────

test("decideStudioAccess: ugašen javni fleg reprodukuje hasStudioAccess u potpunosti", () => {
  // Sve kombinacije role × upis × email — odluka mora biti identična
  // hasStudioAccess-u; potvrđen email NE pomaže dok je fleg ugašen.
  const roles = ["student", "pro_student", "admin", "moderator", undefined] as const;
  const enrollments = [{ _id: "enr" }, null] as const;
  for (const role of roles) {
    for (const enrollment of enrollments) {
      for (const emailVerified of [true, false]) {
        // Podrazumevan treći argument = pravi STUDIO_STAFF_ONLY.
        const decision = decideStudioAccess({
          role,
          enrollment,
          publicEnabled: false,
          emailVerified,
        });
        expect(decision.allowed).toBe(hasStudioAccess(role, enrollment));
        if (!decision.allowed) expect(decision.reason).toBe("NEMA_PRISTUPA");
        // I sa simulirano ugašenim STUDIO_STAFF_ONLY (test-only argument).
        const legacy = decideStudioAccess(
          { role, enrollment, publicEnabled: false, emailVerified },
          false,
        );
        expect(legacy.allowed).toBe(hasStudioAccess(role, enrollment, false));
      }
    }
  }
});

test("decideStudioAccess: upaljen fleg pušta osoblje i potvrđene, traži potvrdu emaila", () => {
  // Potvrđen email otvara Studio bez ikakvog upisa.
  expect(
    decideStudioAccess({ role: "student", enrollment: null, publicEnabled: true, emailVerified: true }),
  ).toEqual({ allowed: true });
  expect(
    decideStudioAccess({ role: undefined, enrollment: null, publicEnabled: true, emailVerified: true }),
  ).toEqual({ allowed: true });
  // Nepotvrđen pada na EMAIL_NIJE_POTVRDJEN — čak i ako JESTE upisan na kurs.
  expect(
    decideStudioAccess({
      role: "student",
      enrollment: { _id: "enr" },
      publicEnabled: true,
      emailVerified: false,
    }),
  ).toEqual({ allowed: false, reason: "EMAIL_NIJE_POTVRDJEN" });
  // Osoblje ulazi i bez potvrde (interni nalozi).
  expect(
    decideStudioAccess({ role: "admin", enrollment: null, publicEnabled: true, emailVerified: false }),
  ).toEqual({ allowed: true });
  expect(
    decideStudioAccess({
      role: "moderator",
      enrollment: null,
      publicEnabled: true,
      emailVerified: false,
    }),
  ).toEqual({ allowed: true });
});

test("isEmailVerifiedForStudio: bilo koji od tri pečata, uključujući Google OAuth", () => {
  expect(isEmailVerifiedForStudio(null)).toBe(false);
  expect(isEmailVerifiedForStudio({})).toBe(false);
  expect(isEmailVerifiedForStudio({ appEmailVerificationTime: 1 })).toBe(true);
  expect(isEmailVerifiedForStudio({ passwordEmailVerificationTime: 1 })).toBe(true);
  // Ključna razlika od kursnog predikata: OAuth pečat je dovoljan za Studio.
  expect(isEmailVerifiedForStudio({ emailVerificationTime: 1 })).toBe(true);
});

// ── resolveStudioLimits ────────────────────────────────────────────────────

test("resolveStudioLimits: osoblje zadržava današnje granice bez obzira na config", () => {
  const staff = resolveStudioLimits(
    { maxConcurrentJobs: 1, maxJobsPerMinute: 1, maxJobsPerDay: 1, maxDailyCredits: 1 },
    true,
  );
  expect(staff).toEqual({
    maxConcurrentJobs: MAX_ACTIVE_JOBS,
    maxJobsPerMinute: null,
    maxJobsPerDay: MAX_DAILY_GENERATIONS,
    maxDailyCredits: null,
  });
});

test("resolveStudioLimits: javni podrazumevano 2/6/200/500, config ih menja", () => {
  expect(resolveStudioLimits({}, false)).toEqual({
    maxConcurrentJobs: PUBLIC_LIMIT_DEFAULTS.maxConcurrentJobs,
    maxJobsPerMinute: PUBLIC_LIMIT_DEFAULTS.maxJobsPerMinute,
    maxJobsPerDay: PUBLIC_LIMIT_DEFAULTS.maxJobsPerDay,
    maxDailyCredits: PUBLIC_LIMIT_DEFAULTS.maxDailyCredits,
  });
  expect(PUBLIC_LIMIT_DEFAULTS).toEqual({
    maxConcurrentJobs: 2,
    maxJobsPerMinute: 6,
    maxJobsPerDay: 200,
    maxDailyCredits: 500,
  });
  expect(
    resolveStudioLimits(
      { maxConcurrentJobs: 3, maxJobsPerMinute: 10, maxJobsPerDay: 400, maxDailyCredits: 2000 },
      false,
    ),
  ).toEqual({ maxConcurrentJobs: 3, maxJobsPerMinute: 10, maxJobsPerDay: 400, maxDailyCredits: 2000 });
});

test("resolveStudioLimits: nevalidan override (0, minus, decimala) pada na podrazumevano", () => {
  expect(
    resolveStudioLimits(
      { maxConcurrentJobs: 0, maxJobsPerMinute: -6, maxJobsPerDay: 2.5, maxDailyCredits: NaN },
      false,
    ),
  ).toEqual({
    maxConcurrentJobs: PUBLIC_LIMIT_DEFAULTS.maxConcurrentJobs,
    maxJobsPerMinute: PUBLIC_LIMIT_DEFAULTS.maxJobsPerMinute,
    maxJobsPerDay: PUBLIC_LIMIT_DEFAULTS.maxJobsPerDay,
    maxDailyCredits: PUBLIC_LIMIT_DEFAULTS.maxDailyCredits,
  });
});
