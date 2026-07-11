import type { OIDCConfig } from "@auth/core/providers";
import type { GoogleProfile } from "@auth/core/providers/google";
import Resend from "@auth/core/providers/resend";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { upsertProfileFromAuthUser } from "./helpers";

const googleClientId = process.env.AUTH_GOOGLE_ID?.trim();
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET?.trim();
const resendApiKey = process.env.AUTH_RESEND_KEY?.trim();
const resendFrom = process.env.AUTH_RESEND_FROM?.trim() || "Nauci AI <onboarding@resend.dev>";
const passwordEmailProvider = resendApiKey
  ? Resend({
      apiKey: resendApiKey,
      from: resendFrom,
    })
  : undefined;
const googleProvider: OIDCConfig<GoogleProfile> | null =
  googleClientId && googleClientSecret
    ? {
        id: "google",
        name: "Google",
        type: "oidc",
        issuer: "https://accounts.google.com",
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        authorization: {
          url: "https://accounts.google.com/o/oauth2/v2/auth",
          params: {
            prompt: "select_account",
            response_type: "code",
            scope: "openid profile email",
          },
        },
        token: "https://oauth2.googleapis.com/token",
        userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
        checks: ["pkce"],
        profile(profile) {
          return {
            id: profile.sub,
            name: profile.name,
            email: profile.email,
            image: profile.picture,
          };
        },
      }
    : null;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      reset: passwordEmailProvider,
      verify: passwordEmailProvider,
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase();
        const name = String(params.name ?? email.split("@")[0] ?? "Student").trim();
        const username = String(params.username ?? "").trim().toLowerCase();

        return {
          email,
          name,
          ...(username ? { username } : {}),
        };
      },
      validatePasswordRequirements(password) {
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters long.");
        }
      },
    }),
    ...(googleProvider ? [googleProvider] : []),
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, profile }) {
      await upsertProfileFromAuthUser(
        ctx as unknown as MutationCtx,
        userId as Id<"users">,
        profile,
      );
    },
  },
});
