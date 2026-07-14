import { v } from "convex/values";

import { internalQuery } from "./_generated/server";
import { isValidUsername, normalizeUsername } from "../lib/username-policy";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export const resolvePasswordIdentifier = internalQuery({
  args: { identifier: v.string() },
  handler: async (ctx, args) => {
    const raw = args.identifier.trim();
    if (!raw) return null;

    if (raw.includes("@") && !raw.startsWith("@")) {
      const email = normalizeEmail(raw);
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .first();
      return user?.email ? normalizeEmail(user.email) : null;
    }

    const username = normalizeUsername(raw.replace(/^@/, ""));
    if (!username || !isValidUsername(username)) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("username", (q) => q.eq("username", username))
      .unique();
    return user?.email ? normalizeEmail(user.email) : null;
  },
});
