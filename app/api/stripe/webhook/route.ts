import Stripe from "stripe";

import {
  chargeReversal,
  creditPackGrants,
  invoicePaidGrants,
  studioPlanSlug,
  type StripeGrant,
  type StripeReversalKind,
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
async function resolveSubscriptionMetadata(stripe: Stripe, invoice: Stripe.Invoice) {
  const subscriptionDetails = invoice.parent?.subscription_details ?? null;
  const subscription = subscriptionDetails?.subscription;
  const subscriptionId = typeof subscription === "string" ? subscription : subscription?.id;
  let metadata = subscriptionDetails?.metadata ?? null;

  if (!metadata || Object.keys(metadata).length === 0) {
    if (!subscriptionId) {
      return { metadata: null, subscriptionId: undefined };
    }
    metadata = (await stripe.subscriptions.retrieve(subscriptionId)).metadata;
  }

  return { metadata, subscriptionId };
}

async function grantInvoiceCredits(event: Stripe.Event, stripe: Stripe, invoice: Stripe.Invoice) {
  const { metadata } = await resolveSubscriptionMetadata(stripe, invoice);

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

/**
 * Iz jedne naplate nazad do ključa pod kojim je kredit-lot otvoren. Oba puta
 * vode preko `payment_intent`, jer naplata od Stripe API-ja iz 2025. više ne
 * nosi ni `invoice` ni sesiju.
 *
 * Faktura ima prednost: doza Studio plana visi na `invoice.id`
 * (`invoicePaidGrants`). Jednokratan paket kredita fakturu nema i njegov lot
 * stoji pod `checkout.session.id` (`creditPackGrants`).
 */
async function creditKeysOfCharge(stripe: Stripe, charge: Stripe.Charge) {
  const paymentIntent =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntent) {
    return { invoiceId: null, sessionId: null };
  }

  const payments = await stripe.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: paymentIntent },
    limit: 1,
  });
  const invoice = payments.data[0]?.invoice;
  const invoiceId = (typeof invoice === "string" ? invoice : invoice?.id) ?? null;
  if (invoiceId) {
    return { invoiceId, sessionId: null };
  }

  const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent, limit: 1 });
  return { invoiceId: null, sessionId: sessions.data[0]?.id ?? null };
}

/**
 * Oduzima kredite koje je jedna naplata dodelila, pošto je vraćena
 * (`charge.refunded`) ili osporena (`charge.dispute.created`).
 *
 * Naplata koja nikad nije dodelila kredite - pretplata na kurs, naplata pre
 * nego što je Studio postojao - nema ni fakturu sa Studio metapodacima ni
 * sesiju paketa, pa se `applyStripeReversal` završi bez ijednog upisa. To NIJE
 * greška i ne sme da vrati 500: Stripe bi tu istu naplatu ponavljao danima.
 *
 * Delimičan povraćaj oduzima ceo lot, kao i pun. Kredit koji je pola plaćen ne
 * postoji, a delimičan povraćaj je ionako ručna odluka podrške - ispravka ide
 * novim grantom, ne polovinom lota.
 */
async function reverseChargeCredits(
  event: Stripe.Event,
  stripe: Stripe,
  charge: Stripe.Charge,
  kind: StripeReversalKind,
) {
  const { invoiceId, sessionId } = await creditKeysOfCharge(stripe, charge);
  const reversal = chargeReversal({ eventId: event.id, kind, invoiceId, sessionId });

  if (!reversal) {
    console.info(
      "Stripe reversal has no credit key, nothing to revoke",
      event.id,
      event.type,
      charge.id,
    );
    return;
  }

  const convex = getConvexHttpClient();
  if (!convex || !process.env.WEBHOOK_SYNC_SECRET) {
    console.error(
      "Stripe reversal cannot be written: NEXT_PUBLIC_CONVEX_URL or WEBHOOK_SYNC_SECRET is missing",
      event.id,
      event.type,
    );
    throw new Error("Convex is unreachable for credit reversals");
  }

  await convex.mutation(convexMutations.applyStripeReversal, {
    syncSecret: requireWebhookSyncSecret(),
    ...reversal,
  });
}

/**
 * Naplata pretplate koja nije prošla. Ciklusni krediti vise isključivo na
 * `invoice.paid`, pa se ovde ništa ne dodeljuje samo po sebi - ostaje da se
 * pretplata OBELEŽI, da bi `past_due` stigao do Convexa i pre nego što Stripe
 * pošalje `customer.subscription.updated`.
 *
 * Obradjuju se samo Studio planovi. Pretplate na kurseve nemaju `kind` u
 * metapodacima i ostaju netaknute - njihov status i dalje piše isključivo
 * postojeća grana `customer.subscription.*`.
 *
 * Idempotencija ovde ne traži ključ: `syncStripeSubscription` upisuje APSOLUTNO
 * stanje pretplate koje je Stripe upravo vratio, pa isti dogadjaj isporučen
 * dvaput upiše isto stanje - drugi prolaz ne pomera ništa. Ključ po `event.id`
 * treba tamo gde se upisuje RAZLIKA, a to je `applyStripeReversal`.
 */
async function markInvoicePaymentFailed(event: Stripe.Event, stripe: Stripe, invoice: Stripe.Invoice) {
  const { metadata, subscriptionId } = await resolveSubscriptionMetadata(stripe, invoice);
  if (!studioPlanSlug(metadata) || !subscriptionId) {
    console.info(
      "Stripe payment failed on a non-plan invoice, no credits and no sync",
      event.id,
      event.type,
      invoice.id,
    );
    return;
  }

  console.info(
    "Stripe plan payment failed, cycle credits are not granted",
    event.id,
    event.type,
    invoice.id,
  );
  await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId));
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
      // Vraćen novac: krediti koje je ta naplata dodelila se oduzimaju. Ako su
      // već potrošeni, saldo ostaje u minusu i `studio.createJob` ne otvara
      // nov posao dok se minus ne poravna.
      case "charge.refunded":
        await reverseChargeCredits(event, stripe, event.data.object as Stripe.Charge, "refund");
        break;
      // Osporena naplata. Krediti se zamrzavaju ODMAH, ne kad se spor završi -
      // chargeback traje nedeljama i za to vreme se ne sme generisati. Spor
      // nosi ID naplate, ne samu naplatu, pa se naplata dovlači.
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
        if (!chargeId) {
          console.error("Stripe dispute without a charge", event.id, event.type, dispute.id);
          break;
        }
        await reverseChargeCredits(
          event,
          stripe,
          await stripe.charges.retrieve(chargeId),
          "dispute",
        );
        break;
      }
      case "invoice.payment_failed":
        await markInvoicePaymentFailed(event, stripe, event.data.object as Stripe.Invoice);
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
