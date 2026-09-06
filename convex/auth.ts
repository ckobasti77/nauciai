import type { OIDCConfig } from "@auth/core/providers";
import type { EmailConfig } from "@auth/core/providers/email";
import type { GoogleProfile } from "@auth/core/providers/google";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, createAccount, getAuthUserId, modifyAccountCredentials, retrieveAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { upsertProfileFromAuthUser } from "./helpers";
import { isStrongPassword } from "../lib/password-policy";

const googleClientId = process.env.AUTH_GOOGLE_ID?.trim();
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET?.trim();
const resendApiKey = process.env.AUTH_RESEND_KEY?.trim();
const resendFrom = process.env.AUTH_RESEND_FROM?.trim() || "Nauci AI <onboarding@resend.dev>";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function localeFromAuthUrl(value: string) {
  try {
    const url = new URL(value);
    const callbackUrl = url.searchParams.get("callbackUrl") ?? "";
    return callbackUrl.includes("/en/") ? "en" : "sr";
  } catch {
    return "sr";
  }
}

function brandedEmailProvider(kind: "verify" | "reset"): EmailConfig | undefined {
  if (!resendApiKey) return undefined;
  return {
    id: kind === "reset" ? "password-reset-email" : "password-verify-email",
    type: "email",
    name: kind === "reset" ? "Nauci AI password reset" : "Nauci AI email verification",
    apiKey: resendApiKey,
    from: resendFrom,
    maxAge: 30 * 60,
    async sendVerificationRequest({ identifier, provider, url }) {
      const locale = localeFromAuthUrl(url);
      const isSerbian = locale === "sr";
      const reset = kind === "reset";
      const subject = reset
        ? isSerbian ? "Resetuj lozinku za Nauči AI" : "Reset your Nauči AI password"
        : isSerbian ? "Potvrdi email za Nauči AI" : "Confirm your Nauči AI email";
      const heading = reset
        ? isSerbian ? "Postavi novu lozinku" : "Set a new password"
        : isSerbian ? "Potvrdi svoj email" : "Confirm your email";
      const intro = reset
        ? isSerbian
          ? "Klikni na dugme ispod da otvoriš bezbednu stranicu za novu lozinku. Stara lozinka ostaje aktivna dok ne sačuvaš novu."
          : "Use the button below to open the secure password page. Your old password remains active until you save a new one."
        : isSerbian
          ? "Klikni na dugme ispod da potvrdiš email adresu svog naloga."
          : "Use the button below to confirm your account email.";
      const button = reset
        ? isSerbian ? "Resetuj lozinku" : "Reset password"
        : isSerbian ? "Potvrdi email" : "Confirm email";
      const expiry = isSerbian ? "Link važi 30 minuta i može se iskoristiti jednom." : "This link is valid for 30 minutes and can be used once.";
      const safeUrl = escapeHtml(url);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: provider.from,
          to: [identifier],
          subject,
          html: `<!doctype html><html><body style="margin:0;background:#f7f4ec;font-family:Arial,sans-serif;color:#0e3158"><div style="max-width:620px;margin:32px auto;padding:32px;background:#F4F0E8;border:2px solid #0e3158;border-radius:16px"><div style="font-size:20px;font-weight:900">Nauči AI</div><h1 style="margin:28px 0 12px;font-size:32px">${heading}</h1><p style="font-size:16px;line-height:1.65">${intro}</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;padding:13px 20px;background:#f4be30;color:#0e3158;text-decoration:none;font-weight:900;border:2px solid #0e3158;border-radius:999px">${button}</a></p><p style="font-size:13px;color:#637083">${expiry}</p><p style="font-size:11px;color:#637083;word-break:break-all">${safeUrl}</p></div></body></html>`,
          text: `${heading}\n\n${intro}\n\n${url}\n\n${expiry}`,
        }),
      });
      if (!response.ok) throw new Error("Password email could not be sent.");
    },
  };
}

const passwordVerificationProvider = brandedEmailProvider("verify");
const passwordResetProvider = brandedEmailProvider("reset");
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
            emailVerified: profile.email_verified,
          };
        },
      }
    : null;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      reset: passwordResetProvider,
      verify: passwordVerificationProvider,
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
        if (!isStrongPassword(password)) {
          throw new Error("Password must be at least 8 characters and include an uppercase letter, a number, and a special character.");
        }
      },
    }),
    ConvexCredentials({
      id: "password-login",
      authorize: async (params, ctx) => {
        const identifier = String(params.identifier ?? "").trim();
        const password = String(params.password ?? "");
        if (!identifier || !password) return null;
        const email: string | null = await ctx.runQuery(
          internal.authInternal.resolvePasswordIdentifier,
          { identifier },
        );
        if (!email) return null;
        try {
          const retrieved = await retrieveAccount(ctx, {
            provider: "password",
            account: { id: email, secret: password },
          });
          return retrieved ? { userId: retrieved.user._id } : null;
        } catch {
          return null;
        }
      },
    }),
    ...(googleProvider ? [googleProvider] : []),
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, profile, type }) {
      await upsertProfileFromAuthUser(
        ctx as unknown as MutationCtx,
        userId as Id<"users">,
        profile,
      );
      if (type === "oauth") {
        await ctx.scheduler.runAfter(0, internal.identityMerge.mergePasswordDuplicateForUser, {
          canonicalUserId: userId as Id<"users">,
        });
      }
    },
  },
});

export const setViewerPassword = action({
  args: { password: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }
    if (!isStrongPassword(args.password)) {
      throw new Error("Password must be at least 8 characters and include an uppercase letter, a number, and a special character.");
    }

    const setupState = await ctx.runQuery(internal.emailVerificationInternal.getPasswordSetupState, { userId });
    if (!setupState?.hasEmail) {
      throw new Error("A verified account email is required before setting a password.");
    }
    if (!setupState.emailVerifiedForPassword) {
      throw new Error("Verify your account email before setting a password.");
    }
    if (setupState.hasPassword) {
      throw new Error("Use the password reset email to change an existing password.");
    }
    const email = setupState.email;

    let existing = null;
    try {
      existing = await retrieveAccount(ctx, {
        provider: "password",
        account: { id: email },
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "InvalidAccountId") throw error;
    }

    if (existing) {
      if (String(existing.user._id) === String(userId)) {
        throw new Error("Use the password reset email to change an existing password.");
      }
      await ctx.runMutation(internal.identityMerge.mergeVerifiedUsers, {
        canonicalUserId: userId,
        duplicateUserId: existing.user._id,
      });
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: email, secret: args.password },
      });
      return { hasPassword: true };
    }

    const created = await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: {
        email,
        name: setupState.name,
      },
      shouldLinkViaEmail: true,
      shouldLinkViaPhone: false,
    });
    if (String(created.user._id) !== String(userId)) {
      throw new Error("Password credential could not be linked to the current user.");
    }

    return { hasPassword: true };
  },
});
