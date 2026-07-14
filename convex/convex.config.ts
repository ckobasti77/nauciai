import migrations from "@convex-dev/migrations/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    INITIAL_ADMIN_EMAILS: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
    AUTH_RESEND_KEY: v.optional(v.string()),
    AUTH_RESEND_FROM: v.optional(v.string()),
  },
});
app.use(migrations);

export default app;
