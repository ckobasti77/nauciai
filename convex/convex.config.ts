import aggregate from "@convex-dev/aggregate/convex.config.js";
import migrations from "@convex-dev/migrations/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    INITIAL_ADMIN_EMAILS: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
    AUTH_RESEND_KEY: v.optional(v.string()),
    AUTH_RESEND_FROM: v.optional(v.string()),
    VAPID_PUBLIC_KEY: v.optional(v.string()),
    VAPID_PRIVATE_KEY: v.optional(v.string()),
    VAPID_SUBJECT: v.optional(v.string()),
  },
});
app.use(aggregate, { name: "chatInbox" });
app.use(aggregate, { name: "studyHub" });
app.use(migrations);

export default app;
