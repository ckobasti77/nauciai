import { expect, test } from "vitest";

import { hasStudioAccess, isStudioStaff, STUDIO_STAFF_ONLY } from "./studioCore";

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
