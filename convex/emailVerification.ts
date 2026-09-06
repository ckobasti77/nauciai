import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, env } from "./_generated/server";

const verificationLocale = v.union(v.literal("sr"), v.literal("en"));
const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 30 * 60 * 1000;

type VerificationResult =
  | { status: "verified"; email: string }
  | { status: "invalid" | "expired" | "used" | "email_changed" };

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const requestViewerEmailVerification = action({
  args: { locale: verificationLocale },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const tokenBytes = new Uint8Array(TOKEN_BYTES);
    crypto.getRandomValues(tokenBytes);
    const token = toBase64Url(tokenBytes);
    const tokenHash = await hashToken(token);
    const createdAt = Date.now();
    const expiresAt = createdAt + TOKEN_TTL_MS;
    const prepared = await ctx.runMutation(internal.emailVerificationInternal.createRequest, {
      userId,
      tokenHash,
      createdAt,
      expiresAt,
    });

    const siteUrl = String(env.SITE_URL ?? "").trim().replace(/\/$/, "");
    const apiKey = String(env.AUTH_RESEND_KEY ?? "").trim();
    const from = String(env.AUTH_RESEND_FROM ?? "").trim();
    if (!siteUrl || !apiKey || !from) {
      await ctx.runMutation(internal.emailVerificationInternal.removeRequest, { tokenHash });
      console.error("email_verification_not_configured", {
        hasSiteUrl: Boolean(siteUrl),
        hasApiKey: Boolean(apiKey),
        hasFrom: Boolean(from),
      });
      return { sent: false as const, code: "not_configured" as const };
    }

    const verificationUrl = `${siteUrl}/${args.locale}/verify-email?token=${encodeURIComponent(token)}`;
    const isSerbian = args.locale === "sr";
    const subject = isSerbian ? "Potvrdi email za Nauči AI" : "Confirm your Nauči AI email";
    const heading = isSerbian ? "Potvrdi svoj email" : "Confirm your email";
    const intro = isSerbian
      ? "Klikni na dugme ispod da potvrdiš email i otključaš checkout i lekcije. Lozinka ostaje opciona."
      : "Use the button below to confirm your email and unlock checkout and lessons. A password remains optional.";
    const button = isSerbian ? "Potvrdi email" : "Confirm email";
    const expiry = isSerbian ? "Link važi 30 minuta." : "This link expires in 30 minutes.";
    const safeUrl = escapeHtml(verificationUrl);
    const html = `<!doctype html><html><body style="margin:0;background:#f7f4ec;font-family:Arial,sans-serif;color:#0e3158"><div style="max-width:620px;margin:32px auto;padding:32px;background:#F4F0E8;border:2px solid #0e3158;border-radius:16px"><div style="font-size:20px;font-weight:900">Nauči AI</div><h1 style="margin:28px 0 12px;font-size:32px">${heading}</h1><p style="font-size:16px;line-height:1.65">${intro}</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;padding:13px 20px;background:#f4be30;color:#0e3158;text-decoration:none;font-weight:900;border:2px solid #0e3158;border-radius:999px">${button}</a></p><p style="font-size:13px;color:#637083">${expiry}</p><p style="font-size:11px;color:#637083;word-break:break-all">${safeUrl}</p></div></body></html>`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [prepared.email],
        subject,
        html,
        text: `${heading}\n\n${intro}\n\n${verificationUrl}\n\n${expiry}`,
      }),
    });
    if (!response.ok) {
      await ctx.runMutation(internal.emailVerificationInternal.removeRequest, { tokenHash });
      const providerRequestId = response.headers.get("x-request-id") ?? undefined;
      console.error("email_verification_provider_error", {
        status: response.status,
        providerRequestId,
      });
      return { sent: false as const, code: "provider_rejected" as const };
    }

    return { sent: true as const, expiresAt };
  },
});

export const verifyEmail = action({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<VerificationResult> => {
    const token = args.token.trim();
    if (!token || token.length > 256) return { status: "invalid" as const };
    const result = await ctx.runMutation(internal.emailVerificationInternal.consumeRequest, {
      tokenHash: await hashToken(token),
      now: Date.now(),
    });
    return result;
  },
});
