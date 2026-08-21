export type Plan = "basic" | "premium";

/**
 * Absence of a plan means Basic: `enrollments.plan` is optional, so rows written
 * before the field existed carry no value. Anything unrecognized falls back the
 * same way, so a bad string can never grant Premium.
 */
export function normalizePlan(plan: string | undefined): Plan {
  return plan === "premium" ? "premium" : "basic";
}

/** Maps a Stripe price id to its plan; an unmapped price is Basic. */
export function planFromPriceId(priceId: string, map: Record<string, Plan>): Plan {
  return normalizePlan(map[priceId]);
}
