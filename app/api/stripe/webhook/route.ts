import Stripe from "stripe";

import { convexMutations, getConvexHttpClient } from "@/lib/convex-http";
import { requireServerEnv, requireWebhookSyncSecret } from "@/lib/env";
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
  });
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
      if (typeof session.subscription === "string") {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await syncSubscription(subscription);
      }
      break;
    }
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
