import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

import { courses, findCourse } from "@/lib/content";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { missingServerEnvName } from "@/lib/env";
import { createCourseCheckoutSession } from "@/lib/stripe";

type LiveCourseResult = {
  course?: {
    _id?: string;
    titleSr?: string;
    stripePriceId?: string;
  };
} | null;

type ViewerResult = {
  user?: {
    _id?: string;
    email?: string;
  };
} | null;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const locale = body.locale === "en" ? "en" : "sr";
  const courseSlug = typeof body.courseSlug === "string" ? body.courseSlug : courses[0].slug;
  const fallbackCourse = findCourse(courseSlug);

  const token = await convexAuthNextjsToken();
  const convex = getConvexHttpClient(token);
  const [liveCourse, viewer] = await Promise.all([
    convex?.query(convexQueries.getCourseBySlug, { slug: courseSlug }).catch(() => null),
    convex?.query(convexQueries.viewer, {}).catch(() => null),
  ]) as [LiveCourseResult, ViewerResult];

  const course = liveCourse?.course;
  const priceId =
    course?.stripePriceId ??
    process.env[fallbackCourse.stripePriceEnv] ??
    (typeof body.priceId === "string" ? body.priceId : undefined);

  if (!priceId) {
    return Response.json(
      { error: `Missing Stripe price. Set ${fallbackCourse.stripePriceEnv} or configure the course in Convex.` },
      { status: 400 },
    );
  }

  const courseId = course?._id ?? body.courseId;
  if (!courseId) {
    return Response.json(
      { error: "Missing Convex courseId. Seed or create the course before starting live checkout." },
      { status: 400 },
    );
  }

  try {
    const session = await createCourseCheckoutSession({
      courseId,
      courseSlug,
      courseTitle: course?.titleSr ?? fallbackCourse.title.sr,
      locale,
      priceId,
      userId: viewer?.user?._id,
      customerEmail: viewer?.user?.email,
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
