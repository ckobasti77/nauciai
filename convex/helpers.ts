import { getAuthUserId } from "@convex-dev/auth/server";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["trialing", "active"]);

type AnyCtx = {
  auth: unknown;
  db: unknown;
  storage?: unknown;
};

type QueryBuilderLike = {
  eq: (field: string, value: unknown) => QueryBuilderLike;
};

type QueryLike = {
  withIndex: (name: string, callback: (q: QueryBuilderLike) => QueryBuilderLike) => QueryLike;
  unique: () => Promise<DocLike | null>;
  collect: () => Promise<DocLike[]>;
};

type DatabaseLike = {
  get: (...args: unknown[]) => Promise<DocLike | null>;
  query: (table: string) => QueryLike;
  insert?: (table: string, value: Record<string, unknown>) => Promise<string>;
  patch?: (id: unknown, value: Record<string, unknown>) => Promise<void>;
};

type DocLike = Record<string, unknown> & {
  _id: string;
  userId?: string;
  email?: string;
  image?: string;
  name?: string;
  role?: string;
  status?: string;
};

function dbFrom(ctx: AnyCtx): DatabaseLike {
  return ctx.db as DatabaseLike;
}

function initialAdminEmails(): Set<string> {
  return new Set(
    (process.env.INITIAL_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function roleForEmail(email: string) {
  return initialAdminEmails().has(email.trim().toLowerCase()) ? "admin" : "student";
}

export async function currentUserId(ctx: AnyCtx) {
  return getAuthUserId(ctx as never);
}

export async function requireUserId(ctx: AnyCtx) {
  const userId = await currentUserId(ctx);
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

export async function getCurrentProfile(ctx: AnyCtx) {
  const userId = await requireUserId(ctx);
  const db = dbFrom(ctx);
  const user = await db.get(userId);
  const email = String(user?.email ?? "").toLowerCase();
  const existing = await db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();

  const role = roleForEmail(email);
  const name = user?.name ?? email.split("@")[0] ?? "Student";

  const profile = existing
    ? { ...existing, role }
    : ({
        _id: "",
        userId,
        email,
        name,
        avatarUrl: user?.image,
        role,
        language: "sr",
      } as DocLike);

  return {
    existing,
    profile,
    userId,
    email,
    role,
    name,
    avatarUrl: user?.image,
  };
}

export async function ensureProfile(ctx: AnyCtx) {
  const current = await getCurrentProfile(ctx);
  const now = Date.now();

  const db = dbFrom(ctx);

  if (!db.insert || !db.patch) {
    throw new Error("Profile bootstrap requires a write-capable Convex context.");
  }

  const { existing, userId, email, role, name, avatarUrl } = current;

  if (!existing) {
    const profileId = await db.insert("profiles", {
      userId,
      email,
      name,
      avatarUrl,
      role,
      language: "sr",
      createdAt: now,
      updatedAt: now,
    });
    return db.get(profileId);
  }

  if (existing.role !== role) {
    await db.patch(existing._id, { role, updatedAt: now });
    return db.get(existing._id);
  }

  return existing;
}

export async function requireAdmin(ctx: AnyCtx) {
  const profile = await ensureProfile(ctx);
  if (!profile || profile.role !== "admin") {
    throw new Error("Forbidden");
  }
  return profile;
}

export async function hasActiveSubscription(ctx: AnyCtx, userId: string, courseId: string) {
  const db = dbFrom(ctx);
  const subscriptions = await db
    .query("subscriptions")
    .withIndex("by_user_status", (q) => q.eq("userId", userId))
    .collect();
  const subscription = subscriptions.find((item) => item.courseId === courseId);

  return Boolean(
    subscription &&
      typeof subscription.status === "string" &&
      ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status),
  );
}

export async function requireCourseAccess(ctx: AnyCtx, courseId: string) {
  const { profile } = await getCurrentProfile(ctx);
  if (!profile) {
    throw new Error("Unauthorized");
  }

  if (profile.role === "admin") {
    return profile;
  }

  if (typeof profile.userId !== "string") {
    throw new Error("Unauthorized");
  }

  if (!(await hasActiveSubscription(ctx, profile.userId, courseId))) {
    throw new Error("Active subscription required");
  }

  return profile;
}

export function requireSyncSecret(syncSecret: string) {
  const expected = process.env.WEBHOOK_SYNC_SECRET;
  if (!expected || syncSecret !== expected) {
    throw new Error("Forbidden");
  }
}
