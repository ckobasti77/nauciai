import { afterEach, beforeEach, expect, test, vi } from "vitest";

// Bez mreže i bez Convexa: i Stripe i Convex su zamene koje samo beleže šta im
// je ruta prosledila. Mokovi se prijavljuju pre nego što se ruta uveze.
const createPlanCheckoutSession = vi.fn(async () => ({ url: "https://checkout.stripe.test/plan" }));
const convexQuery = vi.fn();
let convexReachable = true;

vi.mock("server-only", () => ({}));
vi.mock("@convex-dev/auth/nextjs/server", () => ({
  convexAuthNextjsToken: async () => "token_test",
}));
vi.mock("@/lib/stripe", () => ({ createPlanCheckoutSession }));
vi.mock("@/lib/convex-http", () => ({
  getConvexHttpClient: () => (convexReachable ? { query: convexQuery } : null),
  convexQueries: {
    getPackBySlug: "creditPacks:getPackBySlug",
    viewer: "courses:viewer",
    getViewerProfileStatus: "profiles:getViewerProfileStatus",
    getCourseBySlug: "courses:getCourseBySlug",
  },
}));

const { POST } = await import("./route");

const PREMIUM = { _id: "pack_premium", slug: "premium", kind: "plan", isActive: true, stripePriceId: "price_premium" };
const VIEWER = { user: { _id: "user_1", email: "student@nauciai.test" } };
const VERIFIED = { emailVerifiedForCourses: true };
const COURSE = { course: { _id: "course_1" } };

/** Svaki query vraća svoj red; test menja samo ono što ispituje. */
function stubConvex(overrides: Record<string, unknown> = {}) {
  const rows: Record<string, unknown> = {
    "creditPacks:getPackBySlug": PREMIUM,
    "courses:viewer": VIEWER,
    "profiles:getViewerProfileStatus": VERIFIED,
    "courses:getCourseBySlug": COURSE,
    ...overrides,
  };
  convexQuery.mockImplementation(async (reference: string) => rows[reference] ?? null);
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request("https://nauciai.test/api/stripe/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  convexReachable = true;
  createPlanCheckoutSession.mockClear();
  createPlanCheckoutSession.mockResolvedValue({ url: "https://checkout.stripe.test/plan" });
  convexQuery.mockReset();
  stubConvex();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("premium plan otvara subscription checkout sa kursom iz Convexa", async () => {
  const response = await post({ planSlug: "premium", locale: "sr" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ url: "https://checkout.stripe.test/plan" });
  expect(createPlanCheckoutSession).toHaveBeenCalledTimes(1);
  expect(createPlanCheckoutSession).toHaveBeenCalledWith({
    planSlug: "premium",
    courseId: "course_1",
    courseSlug: "video-audio-ai",
    locale: "sr",
    priceId: "price_premium",
    userId: "user_1",
    customerEmail: "student@nauciai.test",
  });
});

test("bez planSlug-a nema checkout sesije", async () => {
  const response = await post({ locale: "sr" });

  expect(response.status).toBe(400);
  expect(createPlanCheckoutSession).not.toHaveBeenCalled();
});

test("neprijavljen korisnik dobija 401 i AUTH_REQUIRED", async () => {
  stubConvex({ "courses:viewer": null });
  const response = await post({ planSlug: "premium", locale: "sr" });

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toMatchObject({ code: "AUTH_REQUIRED" });
  expect(createPlanCheckoutSession).not.toHaveBeenCalled();
});

test("nepotvrdjen email dobija 403 i EMAIL_VERIFICATION_REQUIRED", async () => {
  stubConvex({ "profiles:getViewerProfileStatus": { emailVerifiedForCourses: false } });
  const response = await post({ planSlug: "premium", locale: "sr" });

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ code: "EMAIL_VERIFICATION_REQUIRED" });
  expect(createPlanCheckoutSession).not.toHaveBeenCalled();
});

test("nepostojeci plan vraca 404", async () => {
  stubConvex({ "creditPacks:getPackBySlug": null });
  const response = await post({ planSlug: "zlatni", locale: "sr" });

  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toMatchObject({ code: "PLAN_NOT_AVAILABLE" });
  expect(createPlanCheckoutSession).not.toHaveBeenCalled();
});

test("ugasen plan vraca 404", async () => {
  stubConvex({ "creditPacks:getPackBySlug": { ...PREMIUM, isActive: false } });
  const response = await post({ planSlug: "premium", locale: "sr" });

  expect(response.status).toBe(404);
  expect(createPlanCheckoutSession).not.toHaveBeenCalled();
});

// Paket kredita kroz `mode: "subscription"` bi obnavljao jednokratnu uplatu.
test("paket kredita se ne moze naplatiti kao pretplata", async () => {
  stubConvex({ "creditPacks:getPackBySlug": { ...PREMIUM, slug: "starter", kind: "pack" } });
  const response = await post({ planSlug: "starter", locale: "sr" });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ code: "NOT_A_PLAN" });
  expect(createPlanCheckoutSession).not.toHaveBeenCalled();
});

test("plan bez stripePriceId ne otvara checkout", async () => {
  stubConvex({ "creditPacks:getPackBySlug": { ...PREMIUM, stripePriceId: undefined } });
  const response = await post({ planSlug: "premium", locale: "en" });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ code: "MISSING_STRIPE_PRICE" });
  expect(createPlanCheckoutSession).not.toHaveBeenCalled();
});

// Bez `courseId` webhook (`syncSubscription`) ne upiše pretplatu, pa bi novac
// bio naplaćen a plan nikad dodeljen.
test("kurs koji ne postoji u Convexu zaustavlja checkout", async () => {
  stubConvex({ "courses:getCourseBySlug": null });
  const response = await post({ planSlug: "premium", locale: "sr" });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ code: "COURSE_NOT_AVAILABLE" });
  expect(createPlanCheckoutSession).not.toHaveBeenCalled();
});

test("nedostupan Convex se ponasa kao neprijavljen korisnik", async () => {
  convexReachable = false;
  const response = await post({ planSlug: "premium", locale: "sr" });

  expect(response.status).toBe(401);
  expect(createPlanCheckoutSession).not.toHaveBeenCalled();
});

test("nedostajuca Stripe env varijabla vraca 503", async () => {
  createPlanCheckoutSession.mockRejectedValueOnce(
    new Error("Missing required environment variable: STRIPE_SECRET_KEY"),
  );
  const response = await post({ planSlug: "premium", locale: "sr" });

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toMatchObject({
    error: "Stripe checkout is not configured. Set STRIPE_SECRET_KEY before starting checkout.",
  });
});

test("ostale Stripe greske vracaju 500", async () => {
  createPlanCheckoutSession.mockRejectedValueOnce(new Error("Stripe is down"));
  const response = await post({ planSlug: "premium", locale: "sr" });

  expect(response.status).toBe(500);
});

test("eksplicitan courseSlug se prosledjuje Stripe-u", async () => {
  await post({ planSlug: "premium", locale: "en", courseSlug: "drugi-kurs" });

  expect(convexQuery).toHaveBeenCalledWith("courses:getCourseBySlug", { slug: "drugi-kurs" });
  expect(createPlanCheckoutSession).toHaveBeenCalledWith(
    expect.objectContaining({ courseSlug: "drugi-kurs", locale: "en" }),
  );
});
