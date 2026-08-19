import { normalizePlan } from "./plan";

/**
 * The subscription tier lives on `enrollments.plan` (per course), not on
 * `users.role` (global) - Premium on one course must not unlock Pro content on
 * another. `role` only carries staff access; `pro_student` stays accepted so
 * legacy rows keep working during the transition.
 */
export function canUseProLesson(plan: string | undefined, role: string | undefined, proEnabled = true) {
  const isStaff = role === "admin" || role === "moderator" || role === "pro_student";
  return proEnabled && (isStaff || normalizePlan(plan) === "premium");
}
