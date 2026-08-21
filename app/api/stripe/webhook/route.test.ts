import type Stripe from "stripe";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// No network and no Convex in tests: both clients are stubs that only record
// what the route handed them. Mocks are declared before the route is imported.
const constructEvent = vi.fn();
const retrieveSubscription = vi.fn();
const retrieveCharge = vi.fn();
// Od Stripe API-ja iz 2025. naplata ne nosi ni `invoice` ni sesiju, pa put
// nazad do kredit-lota ide preko `payment_intent`-a kroz ova dva spiska.
const listInvoicePayments = vi.fn(async () => ({ data: [] as Array<{ invoice: string }> }));
const listCheckoutSessions = vi.fn(async () => ({ data: [] as Array<{ id: string }> }));
const convexMutation = vi.fn(async () => "lot_1");
const convexQuery = vi.fn(async () => ({ _id: "pack_premium", credits: 2000 }));
let convexReachable = true;

vi.mock("server-only", () => ({}));
vi.mock("stripe", () => ({
  default: class StripeStub {
    webhooks = { constructEvent };
    subscriptions = { retrieve: retrieveSubscription };
    charges = { retrieve: retrieveCharge };
    invoicePayments = { list: listInvoicePayments };
    checkout = { sessions: { list: listCheckoutSessions } };
  },
}));
vi.mock("@/lib/convex-http", () => ({
  getConvexHttpClient: () =>
    convexReachable ? { mutation: convexMutation, query: convexQuery } : null,
  convexMutations: {
    applyStripeGrant: "credits:applyStripeGrant",
    applyStripeReversal: "credits:applyStripeReversal",
    syncStripeSubscription: "billing:syncStripeSubscription",
  },
  convexQueries: { getPackBySlug: "creditPacks:getPackBySlug" },
}));

process.env.STRIPE_SECRET_KEY = "sk_test_webhook";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.WEBHOOK_SYNC_SECRET = "test-sync-secret";
process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";

const { POST } = await import("./route");

function creditPackSession(overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id: "cs_test_starter",
    mode: "payment",
    payment_status: "paid",
    amount_total: 1990,
    metadata: {
      kind: "credit_pack",
      packId: "pack_starter",
      packSlug: "starter",
      userId: "user_1",
      credits: "500",
    },
    ...overrides,
  };
}

function planInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "in_test_premium",
    billing_reason: "subscription_cycle",
    amount_paid: 1990,
    parent: {
      subscription_details: {
        subscription: "sub_premium",
        metadata: {
          kind: "plan",
          planSlug: "premium",
          courseId: "course_1",
          userId: "user_1",
        },
      },
    },
    ...overrides,
  };
}

/** Sends one already-verified event through the route. */
function post(event: Record<string, unknown>) {
  constructEvent.mockReturnValue({ id: "evt_test", ...event });
  return POST(
    new Request("https://nauciai.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig_test" },
      body: "{}",
    }),
  );
}

beforeEach(() => {
  convexReachable = true;
  convexMutation.mockClear();
  convexMutation.mockResolvedValue("lot_1");
  convexQuery.mockClear();
  retrieveSubscription.mockClear();
  retrieveCharge.mockClear();
  listInvoicePayments.mockClear();
  listInvoicePayments.mockResolvedValue({ data: [] });
  listCheckoutSessions.mockClear();
  listCheckoutSessions.mockResolvedValue({ data: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("paid credit pack session grants credits once and answers 200", async () => {
  const response = await post({
    type: "checkout.session.completed",
    data: { object: creditPackSession() },
  });

  expect(response.status).toBe(200);
  expect(convexMutation).toHaveBeenCalledTimes(1);
  expect(convexMutation.mock.calls[0]).toEqual([
    "credits:applyStripeGrant",
    {
      syncSecret: "test-sync-secret",
      userId: "user_1",
      amount: 500,
      source: "purchase",
      stripeSessionId: "cs_test_starter",
      packId: "pack_starter",
    },
  ]);
});

test("unpaid credit pack session grants nothing - deferred payments settle later", async () => {
  const response = await post({
    type: "checkout.session.completed",
    data: { object: creditPackSession({ payment_status: "unpaid" }) },
  });

  // Credits before money is the one order that cannot be undone.
  expect(response.status).toBe(200);
  expect(convexMutation).not.toHaveBeenCalled();
});

test("async_payment_succeeded grants the credits the deferred payment waited for", async () => {
  const response = await post({
    type: "checkout.session.async_payment_succeeded",
    data: { object: creditPackSession() },
  });

  expect(response.status).toBe(200);
  expect(convexMutation).toHaveBeenCalledTimes(1);
  expect(convexMutation.mock.calls[0][1]).toMatchObject({ amount: 500, source: "purchase" });
});

test("async_payment_failed grants nothing and only logs", async () => {
  const response = await post({
    type: "checkout.session.async_payment_failed",
    data: { object: creditPackSession({ payment_status: "unpaid" }) },
  });

  expect(response.status).toBe(200);
  expect(convexMutation).not.toHaveBeenCalled();
});

test("credit pack session settled at zero grants nothing - a 100% coupon is not a payment", async () => {
  const response = await post({
    type: "checkout.session.completed",
    data: { object: creditPackSession({ amount_total: 0 }) },
  });

  // `payment_status` is still "paid" on a fully discounted session, so the
  // amount is the only thing that separates a sale from a giveaway.
  expect(response.status).toBe(200);
  expect(convexMutation).not.toHaveBeenCalled();
});

test("paid plan invoice grants the monthly dose", async () => {
  const response = await post({
    type: "invoice.paid",
    data: { object: planInvoice() },
  });

  expect(response.status).toBe(200);
  expect(convexMutation).toHaveBeenCalledTimes(1);
  expect(convexMutation.mock.calls[0][1]).toMatchObject({
    userId: "user_1",
    amount: 2000,
    source: "plan_grant",
    stripeInvoiceId: "in_test_premium",
  });
});

test("plan invoice paid at zero grants nothing - a forever coupon would renew monthly", async () => {
  const response = await post({
    type: "invoice.paid",
    data: { object: planInvoice({ amount_paid: 0, billing_reason: "subscription_create" }) },
  });

  // Every cycle produces a fresh `invoice.id`, so idempotency cannot stop this
  // one - only the amount can.
  expect(response.status).toBe(200);
  expect(convexMutation).not.toHaveBeenCalled();
});

test("missing Convex client answers 500 so Stripe retries instead of dropping the grant", async () => {
  convexReachable = false;

  const response = await post({
    type: "checkout.session.completed",
    data: { object: creditPackSession() },
  });

  expect(response.status).toBe(500);
  expect(convexMutation).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalled();
  // The event id and type must be in the log, or the retry is undiagnosable.
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain("evt_test");
});

test("missing WEBHOOK_SYNC_SECRET answers 500 instead of a silent 200", async () => {
  const previous = process.env.WEBHOOK_SYNC_SECRET;
  delete process.env.WEBHOOK_SYNC_SECRET;

  try {
    const response = await post({
      type: "checkout.session.completed",
      data: { object: creditPackSession() },
    });

    expect(response.status).toBe(500);
    expect(convexMutation).not.toHaveBeenCalled();
  } finally {
    process.env.WEBHOOK_SYNC_SECRET = previous;
  }
});

test("a grant rejected by Convex answers 500 - the retry is safe because grants are idempotent", async () => {
  convexMutation.mockRejectedValueOnce(new Error("Forbidden"));

  const response = await post({
    type: "checkout.session.completed",
    data: { object: creditPackSession() },
  });

  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({ error: "Forbidden" });
});

test("course subscription checkout still syncs the subscription, untouched by the credit branch", async () => {
  retrieveSubscription.mockResolvedValue({
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    cancel_at_period_end: false,
    metadata: { courseId: "course_1", userId: "user_1" },
    items: { data: [{ price: { id: "price_1" } }] },
  });

  const response = await post({
    type: "checkout.session.completed",
    data: { object: { id: "cs_sub", mode: "subscription", subscription: "sub_1" } },
  });

  expect(response.status).toBe(200);
  expect(retrieveSubscription).toHaveBeenCalledWith("sub_1");
  expect(convexMutation).toHaveBeenCalledTimes(1);
  expect(convexMutation.mock.calls[0][0]).toBe("billing:syncStripeSubscription");
});

// ── X7: povraćaji i propala naplata ────────────────────────────────────────

function refundedCharge(overrides: Record<string, unknown> = {}) {
  return { id: "ch_test", payment_intent: "pi_test", amount_refunded: 1990, ...overrides };
}

test("charge.refunded revokes the credits the credit pack payment granted", async () => {
  listCheckoutSessions.mockResolvedValue({ data: [{ id: "cs_test_starter" }] });

  const response = await post({ type: "charge.refunded", data: { object: refundedCharge() } });

  expect(response.status).toBe(200);
  expect(listInvoicePayments).toHaveBeenCalledWith({
    payment: { type: "payment_intent", payment_intent: "pi_test" },
    limit: 1,
  });
  expect(convexMutation).toHaveBeenCalledTimes(1);
  expect(convexMutation.mock.calls[0]).toEqual([
    "credits:applyStripeReversal",
    {
      syncSecret: "test-sync-secret",
      eventId: "evt_test",
      kind: "refund",
      stripeSessionId: "cs_test_starter",
    },
  ]);
});

test("charge.refunded on a subscription charge revokes by invoice, not by session", async () => {
  listInvoicePayments.mockResolvedValue({ data: [{ invoice: "in_test_premium" }] });

  const response = await post({ type: "charge.refunded", data: { object: refundedCharge() } });

  expect(response.status).toBe(200);
  // Doza plana visi na `invoice.id`; sesija se u tom slučaju i ne traži.
  expect(listCheckoutSessions).not.toHaveBeenCalled();
  expect(convexMutation.mock.calls[0][1]).toMatchObject({
    kind: "refund",
    stripeInvoiceId: "in_test_premium",
  });
});

test("the same charge.refunded delivered twice sends the same event id both times", async () => {
  listCheckoutSessions.mockResolvedValue({ data: [{ id: "cs_test_starter" }] });

  await post({ type: "charge.refunded", data: { object: refundedCharge() } });
  await post({ type: "charge.refunded", data: { object: refundedCharge() } });

  // Ruta ne pamti ništa - idempotencija je u Convexu, po `event.id`. Zato je
  // jedino što ovde mora da važi: oba poziva nose ISTI ključ.
  expect(convexMutation).toHaveBeenCalledTimes(2);
  expect(convexMutation.mock.calls[0][1]).toEqual(convexMutation.mock.calls[1][1]);
  expect(convexMutation.mock.calls[0][1]).toMatchObject({ eventId: "evt_test" });
});

test("a refunded charge with no credit key writes nothing and still answers 200", async () => {
  // Pretplata na kurs: nema ni fakture sa Studio dozom ni sesije paketa.
  const response = await post({ type: "charge.refunded", data: { object: refundedCharge() } });

  expect(response.status).toBe(200);
  expect(convexMutation).not.toHaveBeenCalled();
  // 500 bi Stripe ponavljao danima za naplatu koja nikad nije dala kredite.
  expect(console.info).toHaveBeenCalled();
});

test("charge.dispute.created freezes the credits of the disputed charge", async () => {
  retrieveCharge.mockResolvedValue(refundedCharge());
  listCheckoutSessions.mockResolvedValue({ data: [{ id: "cs_test_starter" }] });

  const response = await post({
    type: "charge.dispute.created",
    data: { object: { id: "dp_test", charge: "ch_test" } },
  });

  expect(response.status).toBe(200);
  expect(retrieveCharge).toHaveBeenCalledWith("ch_test");
  expect(convexMutation.mock.calls[0][1]).toMatchObject({
    eventId: "evt_test",
    kind: "dispute",
    stripeSessionId: "cs_test_starter",
  });
});

test("a dispute without a charge is logged and never reaches Convex", async () => {
  const response = await post({
    type: "charge.dispute.created",
    data: { object: { id: "dp_test", charge: null } },
  });

  expect(response.status).toBe(200);
  expect(retrieveCharge).not.toHaveBeenCalled();
  expect(convexMutation).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalled();
});

test("a reversal that cannot reach Convex answers 500 so Stripe retries", async () => {
  convexReachable = false;
  listCheckoutSessions.mockResolvedValue({ data: [{ id: "cs_test_starter" }] });

  const response = await post({ type: "charge.refunded", data: { object: refundedCharge() } });

  expect(response.status).toBe(500);
  expect(convexMutation).not.toHaveBeenCalled();
});

test("invoice.payment_failed grants no credits and marks the plan subscription", async () => {
  retrieveSubscription.mockResolvedValue({
    id: "sub_premium",
    status: "past_due",
    customer: "cus_1",
    cancel_at_period_end: false,
    metadata: { kind: "plan", planSlug: "premium", courseId: "course_1", userId: "user_1" },
    items: { data: [{ price: { id: "price_premium" } }] },
  });

  const response = await post({
    type: "invoice.payment_failed",
    data: { object: planInvoice({ amount_paid: 0, billing_reason: "subscription_cycle" }) },
  });

  expect(response.status).toBe(200);
  // Tačno jedan poziv, i to sinhronizacija - nijedan grant.
  expect(convexMutation).toHaveBeenCalledTimes(1);
  expect(convexMutation.mock.calls[0][0]).toBe("billing:syncStripeSubscription");
  expect(convexMutation.mock.calls[0][1]).toMatchObject({ status: "past_due" });
  expect(
    convexMutation.mock.calls.some((call) => call[0] === "credits:applyStripeGrant"),
  ).toBe(false);
});

test("invoice.payment_failed on a course subscription leaves the existing flow untouched", async () => {
  const response = await post({
    type: "invoice.payment_failed",
    data: {
      object: planInvoice({
        parent: {
          subscription_details: {
            subscription: "sub_kurs",
            metadata: { courseId: "course_1", userId: "user_1" },
          },
        },
      }),
    },
  });

  expect(response.status).toBe(200);
  // Pretplata na kurs nema `kind` u metapodacima; njen status i dalje piše
  // isključivo postojeća grana `customer.subscription.*`.
  expect(retrieveSubscription).not.toHaveBeenCalled();
  expect(convexMutation).not.toHaveBeenCalled();
});
