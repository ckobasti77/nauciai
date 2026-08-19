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

async function applyStripeGrants(grants: StripeGrant[]) {
  const convex = getConvexHttpClient();
  if (!convex || !process.env.WEBHOOK_SYNC_SECRET) {
    return;
  }

  for (const grant of grants) {
    await convex.mutation(convexMutations.applyStripeGrant, {
      syncSecret: requireWebhookSyncSecret(),
      ...grant,
    });
  }
}

/**
 * `invoice.paid` fires on the first payment AND on every renewal, so the
 * monthly credit dose hangs off it - `checkout.session.completed` only ever
 * fires once. The invoice carries an immutable snapshot of the subscription
 * metadata; when that snapshot is empty the plan is read off the subscription.
 */
async function grantInvoiceCredits(stripe: Stripe, invoice: Stripe.Invoice) {
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
    return;
  }
  const pack = await convex.query(convexQueries.getPackBySlug, { slug: planSlug });

  await applyStripeGrants(
    invoicePaidGrants({
      invoiceId: invoice.id,
      billingReason: invoice.billing_reason,
      subscriptionMetadata: metadata,
      planCredits: pack?.credits ?? 0,
      planPackId: pack?._id,
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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      // Credit packs are one-time payments and never carry a subscription, so
      // this branch runs first and leaves the subscription flow untouched.
      if (session.mode === "payment" && session.metadata?.kind === "credit_pack") {
        const grants = creditPackGrants({ sessionId: session.id, metadata: session.metadata });
        if (grants.length === 0) {
          console.error("Stripe credit_pack session without usable metadata", session.id);
        }
        await applyStripeGrants(grants);
        break;
      }
      if (typeof session.subscription === "string") {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await syncSubscription(subscription);
      }
      break;
    }
    case "invoice.paid":
      await grantInvoiceCredits(stripe, event.data.object as Stripe.Invoice);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
    default:
      break;
  }

  return Response.json({ received: true });
}
