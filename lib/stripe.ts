import "server-only";

import Stripe from "stripe";

import { getSiteUrl, requireServerEnv } from "./env";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireServerEnv("STRIPE_SECRET_KEY"), {
      appInfo: {
        name: "Fakultet za AI",
        version: "0.1.0",
      },
    });
  }

  return stripeClient;
}

export async function createCourseCheckoutSession(params: {
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  locale: string;
  priceId: string;
  userId?: string;
  customerEmail?: string;
}) {
  const stripe = getStripe();
  const siteUrl = getSiteUrl();

  return stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: `${siteUrl}/${params.locale}/app/courses/${params.courseSlug}?checkout=success`,
    cancel_url: `${siteUrl}/${params.locale}?checkout=cancelled&course=${params.courseSlug}`,
    customer_email: params.customerEmail,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: {
        courseId: params.courseId,
        courseSlug: params.courseSlug,
        userId: params.userId ?? "",
      },
    },
    metadata: {
      courseId: params.courseId,
      courseSlug: params.courseSlug,
      courseTitle: params.courseTitle,
      userId: params.userId ?? "",
    },
  });
}

export async function createCustomerPortalSession(params: {
  customerId: string;
  locale: string;
}) {
  const stripe = getStripe();
  const siteUrl = getSiteUrl();

  return stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: `${siteUrl}/${params.locale}/app/billing`,
  });
}

export async function createCreditPackCheckoutSession(params: {
  packSlug: string;
  packId: string;
  credits: number;
  locale: string;
  priceId: string;
  userId: string;
  customerEmail?: string;
}) {
  const stripe = getStripe();
  const siteUrl = getSiteUrl();

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: `${siteUrl}/${params.locale}/app/credits?checkout=success`,
    cancel_url: `${siteUrl}/${params.locale}/app/credits?checkout=cancelled`,
    customer_email: params.customerEmail,
    // Nema kuponske politike, pa nema ni kupona: kupon od 100% pravi sesiju
    // koja je uredno `paid` na 0 € i puni ledger besplatno.
    allow_promotion_codes: false,
    metadata: {
      kind: "credit_pack",
      packId: params.packId,
      packSlug: params.packSlug,
      userId: params.userId,
      credits: String(params.credits),
    },
  });
}

export async function createPlanCheckoutSession(params: {
  planSlug: string;
  courseId: string;
  courseSlug: string;
  locale: string;
  priceId: string;
  userId: string;
  customerEmail?: string;
}) {
  const stripe = getStripe();
  const siteUrl = getSiteUrl();
  // Renewals fire `invoice.paid`, which only ever sees the subscription's own
  // metadata - so the same payload has to live on both the session and the
  // subscription, otherwise the webhook cannot tell whose plan just renewed.
  const metadata = {
    kind: "plan",
    planSlug: params.planSlug,
    courseId: params.courseId,
    courseSlug: params.courseSlug,
    userId: params.userId,
  };

  return stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: `${siteUrl}/${params.locale}/app/courses/${params.courseSlug}?checkout=success`,
    cancel_url: `${siteUrl}/${params.locale}/app/courses/${params.courseSlug}?checkout=cancelled`,
    customer_email: params.customerEmail,
    // Kupon od 100% "forever" na plan proizvodi `invoice.paid` svakog meseca,
    // svaki sa novim `invoice.id` - dakle mesečna doza kredita, neograničeno.
    allow_promotion_codes: false,
    subscription_data: { metadata },
    metadata,
  });
}
