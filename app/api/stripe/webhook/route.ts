import Stripe from "stripe";

import {
  creditPackGrants,
  invoicePaidGrants,
  studioPlanSlug,
  type StripeGrant,
} from "@/convex/creditsCore";
import { convexMutations, convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { requireServerEnv, requireWebhookSyncSecret } from "@/lib/env";
import { normalizePlan } from "@/lib/plan";
import { getStripe } from "@/lib/stripe";

function normalizeSubscriptionStatus(status: string) {
  const allowed = new Set([
    "trialing",
    "active",
    "past_due",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "paused",
  ]);
  return allowed.has(status) ? status : "incomplete";
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const convex = getConvexHttpClient();
  if (!convex || !process.env.WEBHOOK_SYNC_SECRET) {
    return;
  }

  const subscriptionWithPeriod = subscription as Stripe.Subscription & {
    current_period_end?: number;
  };
  const courseId = subscription.metadata?.courseId;
  const userId = subscription.metadata?.userId;
  const planSlug = subscription.metadata?.planSlug;
  const stripePriceId = subscription.items.data[0]?.price.id;

  if (!courseId || !stripePriceId) {
    return;
  }

  await convex.mutation(convexMutations.syncStripeSubscription, {
    syncSecret: requireWebhookSyncSecret(),
    userId: userId || undefined,
    courseId,
    stripeCustomerId:
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
    stripePriceId,
    status: normalizeSubscriptionStatus(subscription.status),
    currentPeriodEnd: subscriptionWithPeriod.current_period_end
      ? subscriptionWithPeriod.current_period_end * 1000
      : undefined,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    // Omitted unless the subscription names a plan, so a course subscription
    // never silently downgrades a stored Premium tier to Basic.
    plan: planSlug ? normalizePlan(planSlug) : undefined,
  });
}

/**
 * Every branch that cannot write a grant throws, so the route answers 500 and
 * Stripe retries. A silent `return` here would answer 200 to a charge whose
 * credits were never granted - money taken, nothing delivered, no log. Retrying
 * is safe because every grant is idempotent on its Stripe key (`credits.ts`).
 */
async function applyStripeGrants(event: Stripe.Event, grants: StripeGrant[]) {
  if (grants.length === 0) {
    return;
  }

  const convex = getConvexHttpClient();
  if (!convex || !process.env.WEBHOOK_SYNC_SECRET) {
    console.error(
      "Stripe grant cannot be written: NEXT_PUBLIC_CONVEX_URL or WEBHOOK_SYNC_SECRET is missing",
      event.id,
      event.type,
    );
    throw new Error("Convex is unreachable for credit grants");
  }

  for (const grant of grants) {
    try {
      await convex.mutation(convexMutations.applyStripeGrant, {
        syncSecret: requireWebhookSyncSecret(),
        ...grant,
      });
    } catch (error) {
      console.error("Stripe grant was rejected by Convex", event.id, event.type, grant.source, error);
      throw error;
    }
  }
}

/**
 * Credits for a credit pack. Returns true when the session was a credit pack -
 * paid or not - so the caller knows not to fall through to the subscription
 * flow. Deferred payment methods (SEPA debit, bank transfer) complete the
 * session with `payment_status: "unpaid"` and only settle later, so credits
 * wait for `checkout.session.async_payment_succeeded`.
 */
async function grantCreditPackCredits(event: Stripe.Event, session: Stripe.Checkout.Session) {
  if (session.mode !== "payment" || session.metadata?.kind !== "credit_pack") {
    return false;
  }

  if (session.payment_status !== "paid") {
    console.info(
      "Stripe credit_pack session is not paid yet, waiting for async payment",
      event.id,
      event.type,
      session.id,
      session.payment_status,
    );
    return true;
  }

  // `payment_status: "paid"` does not mean money moved: a 100% coupon settles
  // the session at zero. Credits are only ever granted against an amount.
  if (typeof session.amount_total !== "number" || session.amount_total <= 0) {
    console.info(
      "Stripe credit_pack session settled at zero, no credits granted",
      event.id,
      event.type,
      session.id,
      session.amount_total,
    );
    return true;
  }

  const grants = creditPackGrants({ sessionId: session.id, metadata: session.metadata });
  if (grants.length === 0) {
    console.error("Stripe credit_pack session without usable metadata", session.id);
  }
  await applyStripeGrants(event, grants);
  return true;
}

/**
 * `invoice.paid` fires on the first payment AND on every renewal, so the
 * monthly credit dose hangs off it - `checkout.session.completed` only ever
 * fires once. The invoice carries an immutable snapshot of the subscription
 * metadata; when that snapshot is empty the plan is read off the subscription.
 */
async function grantInvoiceCredits(event: Stripe.Event, stripe: Stripe, invoice: Stripe.Invoice) {
  const subscriptionDetails = invoice.parent?.subscription_details ?? null;
  let metadata = subscriptionDetails?.metadata ?? null;

  if (!metadata || Object.keys(metadata).length === 0) {
    const subscription = subscriptionDetails?.subscription;
    const subscriptionId = typeof subscription === "string" ? subscription : subscription?.id;
    if (!subscriptionId) {
      return;
    }
    metadata = (await stripe.subscriptions.retrieve(subscriptionId)).metadata;
  }

  const planSlug = studioPlanSlug(metadata);
  if (!planSlug) {
    return;
  }

  const convex = getConvexHttpClient();
  if (!convex) {
    console.error(
      "Stripe invoice credits cannot be written: NEXT_PUBLIC_CONVEX_URL is missing",
      event.id,
      event.type,
    );
    throw new Error("Convex is unreachable for credit grants");
  }
  const pack = await convex.query(convexQueries.getPackBySlug, { slug: planSlug });

  await applyStripeGrants(
    event,
    invoicePaidGrants({
      invoiceId: invoice.id,
      billingReason: invoice.billing_reason,
      subscriptionMetadata: metadata,
      planCredits: pack?.credits ?? 0,
      planPackId: pack?._id,
      amountPaid: invoice.amount_paid,
    }),
  );
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  if (!signature) {
    return Response.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, requireServerEnv("STRIPE_WEBHOOK_SECRET"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Stripe webhook";
    return Response.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Credit packs are one-time payments and never carry a subscription, so
        // this branch runs first and leaves the subscription flow untouched.
        if (await grantCreditPackCredits(event, session)) {
          break;
        }
        if (typeof session.subscription === "string") {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await syncSubscription(subscription);
        }
        break;
      }
      // A deferred payment that settled later. Only the credit pack branch
      // runs: the subscription flow keeps listening to its own events.
      case "checkout.session.async_payment_succeeded":
        await grantCreditPackCredits(event, event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.async_payment_failed":
        console.info(
          "Stripe deferred payment failed, no credits granted",
          event.id,
          event.type,
          (event.data.object as Stripe.Checkout.Session).id,
        );
        break;
      case "invoice.paid":
        await grantInvoiceCredits(event, stripe, event.data.object as Stripe.Invoice);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (error) {
    // 500 makes Stripe retry. Answering 200 to an event we failed to process is
    // the one outcome that loses money silently.
    const message = error instanceof Error ? error.message : "Stripe webhook failed";
    console.error("Stripe webhook was not processed", event.id, event.type, message);
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({ received: true });
}
