import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { missingServerEnvName } from "@/lib/env";
import { createCreditPackCheckoutSession } from "@/lib/stripe";

type PackResult = {
  _id?: string;
  slug?: string;
  credits?: number;
  kind?: string;
  isActive?: boolean;
  stripePriceId?: string;
} | null;

type ViewerResult = {
  user?: {
    _id?: string;
    email?: string;
  };
} | null;

type ProfileStatusResult = {
  emailVerifiedForCourses?: boolean;
} | null;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const locale = body.locale === "en" ? "en" : "sr";
  const packSlug = typeof body.packSlug === "string" ? body.packSlug.trim() : "";

  if (!packSlug) {
    return Response.json(
      { error: locale === "sr" ? "Izaberi paket kredita." : "Pick a credit pack." },
      { status: 400 },
    );
  }

  const token = await convexAuthNextjsToken();
  const convex = getConvexHttpClient(token);
  const [pack, viewer, profileStatus] = await Promise.all([
    convex?.query(convexQueries.getPackBySlug, { slug: packSlug }).catch(() => null),
    convex?.query(convexQueries.viewer, {}).catch(() => null),
    convex?.query(convexQueries.getViewerProfileStatus, {}).catch(() => null),
  ]) as [PackResult, ViewerResult, ProfileStatusResult];

  if (!viewer?.user?._id) {
    return Response.json({ error: locale === "sr" ? "Prijavi se pre kupovine kredita." : "Sign in before purchasing credits.", code: "AUTH_REQUIRED" }, { status: 401 });
  }
  if (!profileStatus?.emailVerifiedForCourses) {
    return Response.json({ error: locale === "sr" ? "Potvrdi email pre kupovine kredita." : "Confirm your email before purchasing credits.", code: "EMAIL_VERIFICATION_REQUIRED" }, { status: 403 });
  }

  if (!pack?._id || !pack.isActive) {
    return Response.json(
      {
        error:
          locale === "sr"
            ? `Paket kredita "${packSlug}" ne postoji ili više nije u prodaji.`
            : `Credit pack "${packSlug}" does not exist or is no longer on sale.`,
        code: "PACK_NOT_AVAILABLE",
      },
      { status: 404 },
    );
  }
  // Plans are subscriptions and go through createPlanCheckoutSession; charging one
  // as a one-time payment here would hand out credits without ever renewing.
  if (pack.kind !== "pack") {
    return Response.json(
      {
        error:
          locale === "sr"
            ? `"${packSlug}" je plan pretplate, ne paket kredita.`
            : `"${packSlug}" is a subscription plan, not a credit pack.`,
        code: "NOT_A_CREDIT_PACK",
      },
      { status: 400 },
    );
  }
  if (!pack.stripePriceId) {
    return Response.json(
      {
        error:
          locale === "sr"
            ? `Paketu "${packSlug}" fali stripePriceId. Upiši Stripe jednokratnu cenu u creditPacks pre kupovine.`
            : `Pack "${packSlug}" is missing stripePriceId. Set the Stripe one-time price on creditPacks before checkout.`,
        code: "MISSING_STRIPE_PRICE",
      },
      { status: 400 },
    );
  }

  try {
    const session = await createCreditPackCheckoutSession({
      packSlug,
      packId: pack._id,
      credits: pack.credits ?? 0,
      locale,
      priceId: pack.stripePriceId,
      userId: viewer.user._id,
      customerEmail: viewer.user.email,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    const missingEnv = missingServerEnvName(error);
    return Response.json(
      {
        error: missingEnv
          ? `Stripe checkout is not configured. Set ${missingEnv} before starting checkout.`
          : "Unable to create a Stripe Checkout session.",
      },
      { status: missingEnv ? 503 : 500 },
    );
  }
}
