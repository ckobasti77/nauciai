import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

import { courses } from "@/lib/content";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { missingServerEnvName } from "@/lib/env";
import { createPlanCheckoutSession } from "@/lib/stripe";

type PackResult = {
  _id?: string;
  slug?: string;
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

type LiveCourseResult = {
  course?: {
    _id?: string;
  };
} | null;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const locale = body.locale === "en" ? "en" : "sr";
  const planSlug = typeof body.planSlug === "string" ? body.planSlug.trim() : "";
  // Pretplata je po kursu: `syncStripeSubscription` bez `courseId` ne upisuje
  // ništa, pa bi plan bez kursa naplatio pretplatu koju webhook ne prepoznaje.
  const courseSlug = typeof body.courseSlug === "string" && body.courseSlug.trim()
    ? body.courseSlug.trim()
    : courses[0].slug;

  if (!planSlug) {
    return Response.json(
      { error: locale === "sr" ? "Izaberi plan pretplate." : "Pick a subscription plan." },
      { status: 400 },
    );
  }

  const token = await convexAuthNextjsToken();
  const convex = getConvexHttpClient(token);
  const [pack, viewer, profileStatus, liveCourse] = await Promise.all([
    convex?.query(convexQueries.getPackBySlug, { slug: planSlug }).catch(() => null),
    convex?.query(convexQueries.viewer, {}).catch(() => null),
    convex?.query(convexQueries.getViewerProfileStatus, {}).catch(() => null),
    convex?.query(convexQueries.getCourseBySlug, { slug: courseSlug }).catch(() => null),
  ]) as [PackResult, ViewerResult, ProfileStatusResult, LiveCourseResult];

  if (!viewer?.user?._id) {
    return Response.json({ error: locale === "sr" ? "Prijavi se pre kupovine pretplate." : "Sign in before purchasing a subscription.", code: "AUTH_REQUIRED" }, { status: 401 });
  }
  if (!profileStatus?.emailVerifiedForCourses) {
    return Response.json({ error: locale === "sr" ? "Potvrdi email pre kupovine pretplate." : "Confirm your email before purchasing a subscription.", code: "EMAIL_VERIFICATION_REQUIRED" }, { status: 403 });
  }

  if (!pack?._id || !pack.isActive) {
    return Response.json(
      {
        error:
          locale === "sr"
            ? `Plan "${planSlug}" ne postoji ili više nije u prodaji.`
            : `Plan "${planSlug}" does not exist or is no longer on sale.`,
        code: "PLAN_NOT_AVAILABLE",
      },
      { status: 404 },
    );
  }
  // Paketi su jednokratni i idu kroz `createCreditPackCheckoutSession`; naplatiti
  // paket kao pretplatu značilo bi obnavljati uplatu koju niko nije tražio.
  if (pack.kind !== "plan") {
    return Response.json(
      {
        error:
          locale === "sr"
            ? `"${planSlug}" je paket kredita, ne plan pretplate.`
            : `"${planSlug}" is a credit pack, not a subscription plan.`,
        code: "NOT_A_PLAN",
      },
      { status: 400 },
    );
  }
  if (!pack.stripePriceId) {
    return Response.json(
      {
        error:
          locale === "sr"
            ? `Planu "${planSlug}" fali stripePriceId. Upiši Stripe mesečnu cenu u creditPacks pre kupovine.`
            : `Plan "${planSlug}" is missing stripePriceId. Set the Stripe recurring price on creditPacks before checkout.`,
        code: "MISSING_STRIPE_PRICE",
      },
      { status: 400 },
    );
  }

  const courseId = liveCourse?.course?._id;
  if (!courseId) {
    return Response.json(
      {
        error:
          locale === "sr"
            ? `Kurs "${courseSlug}" ne postoji u Convexu. Seeduj ga pre nego što pretplata krene.`
            : `Course "${courseSlug}" does not exist in Convex. Seed it before starting a subscription.`,
        code: "COURSE_NOT_AVAILABLE",
      },
      { status: 400 },
    );
  }

  try {
    const session = await createPlanCheckoutSession({
      planSlug,
      courseId,
      courseSlug,
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
