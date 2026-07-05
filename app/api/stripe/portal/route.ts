import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { missingServerEnvName } from "@/lib/env";
import { createCustomerPortalSession } from "@/lib/stripe";

type BillingSubscription = {
  stripeCustomerId?: string;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const locale = body.locale === "en" ? "en" : "sr";
  const token = await convexAuthNextjsToken();
  const convex = getConvexHttpClient(token);
  const subscriptions = (await convex?.query(convexQueries.getBillingSummary, {}).catch(() => [])) as
    | BillingSubscription[]
    | undefined;
  const customerId =
    typeof body.customerId === "string"
      ? body.customerId
      : subscriptions?.find((subscription) => subscription.stripeCustomerId)?.stripeCustomerId;

  if (!customerId) {
    return Response.json({ error: "No Stripe customer is connected to this profile yet." }, { status: 400 });
  }

  try {
    const session = await createCustomerPortalSession({ customerId, locale });
    return Response.json({ url: session.url });
  } catch (error) {
    const missingEnv = missingServerEnvName(error);
    return Response.json(
      {
        error: missingEnv
          ? `Stripe billing portal is not configured. Set ${missingEnv} before opening billing portal.`
          : "Unable to create a Stripe billing portal session.",
      },
      { status: missingEnv ? 503 : 500 },
    );
  }
}
