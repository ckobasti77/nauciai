import { beforeEach, describe, expect, it, vi } from "vitest";

import type Stripe from "stripe";

// No network in tests: the Stripe constructor is replaced with a stub whose
// `checkout.sessions.create` only records the params it was handed.
const createSession = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({
  id: "cs_test_1",
  url: `https://checkout.stripe.test/c/cs_test_1?mode=${params.mode}`,
}));

vi.mock("server-only", () => ({}));
vi.mock("stripe", () => ({
  default: class StripeStub {
    checkout = { sessions: { create: createSession } };
  },
}));

process.env.STRIPE_SECRET_KEY = "sk_test_studio";
process.env.NEXT_PUBLIC_SITE_URL = "https://nauciai.test";

const { createCourseCheckoutSession, createCreditPackCheckoutSession, createPlanCheckoutSession } =
  await import("./stripe");

function lastParams() {
  const params = createSession.mock.calls.at(-1)?.[0];
  if (!params) throw new Error("checkout.sessions.create was never called");
  return params;
}

beforeEach(() => {
  createSession.mockClear();
});

describe("createCreditPackCheckoutSession", () => {
  it("charges a credit pack once and tags the session for the webhook", async () => {
    await createCreditPackCheckoutSession({
      packSlug: "starter",
      packId: "pack_123",
      credits: 500,
      locale: "sr",
      priceId: "price_starter",
      userId: "user_1",
      customerEmail: "jovan@example.com",
    });

    const params = lastParams();
    expect(params.mode).toBe("payment");
    expect(params.subscription_data).toBeUndefined();
    expect(params.line_items).toEqual([{ price: "price_starter", quantity: 1 }]);
    expect(params.allow_promotion_codes).toBe(true);
    expect(params.customer_email).toBe("jovan@example.com");
    expect(params.metadata).toEqual({
      kind: "credit_pack",
      packId: "pack_123",
      packSlug: "starter",
      userId: "user_1",
      credits: "500",
    });
  });

  it("returns the buyer to the credits page for both outcomes", async () => {
    await createCreditPackCheckoutSession({
      packSlug: "creator",
      packId: "pack_456",
      credits: 1650,
      locale: "en",
      priceId: "price_creator",
      userId: "user_2",
    });

    const params = lastParams();
    expect(params.success_url).toBe("https://nauciai.test/en/app/credits?checkout=success");
    expect(params.cancel_url).toBe("https://nauciai.test/en/app/credits?checkout=cancelled");
  });
});

describe("createPlanCheckoutSession", () => {
  it("puts the plan metadata on the subscription too, so renewals can be attributed", async () => {
    await createPlanCheckoutSession({
      planSlug: "premium",
      courseId: "course_1",
      courseSlug: "ai-osnove",
      locale: "sr",
      priceId: "price_premium",
      userId: "user_3",
    });

    const params = lastParams();
    expect(params.mode).toBe("subscription");
    expect(params.subscription_data?.metadata).toMatchObject({
      kind: "plan",
      planSlug: "premium",
      courseId: "course_1",
      userId: "user_3",
    });
    expect(params.metadata).toMatchObject({
      kind: "plan",
      planSlug: "premium",
      courseId: "course_1",
      userId: "user_3",
    });
    expect(params.success_url).toBe("https://nauciai.test/sr/app/courses/ai-osnove?checkout=success");
  });
});

describe("createCourseCheckoutSession", () => {
  it("is unchanged: no kind marker, so the existing webhook branch still owns it", async () => {
    await createCourseCheckoutSession({
      courseId: "course_1",
      courseSlug: "ai-osnove",
      courseTitle: "AI osnove",
      locale: "sr",
      priceId: "price_course",
    });

    const params = lastParams();
    expect(params.mode).toBe("subscription");
    expect(params.metadata).not.toHaveProperty("kind");
    expect(params.subscription_data?.metadata).not.toHaveProperty("kind");
    expect(params.metadata).toEqual({
      courseId: "course_1",
      courseSlug: "ai-osnove",
      courseTitle: "AI osnove",
      userId: "",
    });
  });
});
