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
    // Dok kuponske politike nema, kupon od 100% je jedini ishod koji bi ovo
    // polje omogućilo: sesija `paid` na 0 € sa punim brojem kredita.
    expect(params.allow_promotion_codes).toBe(false);
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

  it("returnPath iz allowliste vraća kupca u samostalni Studio (studio-public F4)", async () => {
    await createCreditPackCheckoutSession({
      packSlug: "creator",
      packId: "pack_456",
      credits: 1650,
      locale: "sr",
      priceId: "price_creator",
      userId: "user_2",
      returnPath: "/studio/krediti",
    });

    const params = lastParams();
    expect(params.success_url).toBe("https://nauciai.test/sr/studio/krediti?checkout=success");
    expect(params.cancel_url).toBe("https://nauciai.test/sr/studio/krediti?checkout=cancelled");
    // Metapodaci za webhook su NEZAVISNI od povratne putanje - grant ide isto.
    expect(params.metadata).toMatchObject({ kind: "credit_pack", packSlug: "creator" });
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
    expect(params.success_url).toBe("https://nauciai.test/sr/app/classroom/courses/ai-osnove?checkout=success");
  });

  it("takes no promotion codes: a 100% forever coupon would renew for free every month", async () => {
    await createPlanCheckoutSession({
      planSlug: "premium",
      courseId: "course_1",
      courseSlug: "ai-osnove",
      locale: "sr",
      priceId: "price_premium",
      userId: "user_3",
    });

    expect(lastParams().allow_promotion_codes).toBe(false);
  });
});

describe("PDV na svakoj sesiji (X7)", () => {
  it("sve tri sesije obračunavaju porez i primaju poreski broj", async () => {
    await createCreditPackCheckoutSession({
      packSlug: "starter",
      packId: "pack_123",
      credits: 500,
      locale: "sr",
      priceId: "price_starter",
      userId: "user_1",
    });
    const pack = lastParams();

    await createPlanCheckoutSession({
      planSlug: "premium",
      courseId: "course_1",
      courseSlug: "ai-osnove",
      locale: "sr",
      priceId: "price_premium",
      userId: "user_1",
    });
    const plan = lastParams();

    await createCourseCheckoutSession({
      courseId: "course_1",
      courseSlug: "ai-osnove",
      courseTitle: "AI osnove",
      locale: "sr",
      priceId: "price_course",
    });
    const course = lastParams();

    for (const [name, params] of [
      ["pack", pack],
      ["plan", plan],
      ["course", course],
    ] as const) {
      expect(params.automatic_tax, name).toEqual({ enabled: true });
      expect(params.tax_id_collection, name).toEqual({ enabled: true });
    }
  });

  it("ne šalje `customer_update` dok sesija kupca imenuje preko email adrese", async () => {
    await createCreditPackCheckoutSession({
      packSlug: "starter",
      packId: "pack_123",
      credits: 500,
      locale: "sr",
      priceId: "price_starter",
      userId: "user_1",
      customerEmail: "jovan@example.com",
    });

    // Stripe prima `customer_update` isključivo uz `customer`; uz
    // `customer_email` sesija pada na 400 i kupovina se ne otvori uopšte.
    const params = lastParams();
    expect(params.customer_update).toBeUndefined();
    expect(params.customer).toBeUndefined();
    expect(params.customer_email).toBe("jovan@example.com");
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
