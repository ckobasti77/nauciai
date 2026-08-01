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
