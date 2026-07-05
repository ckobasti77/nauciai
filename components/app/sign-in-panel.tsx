"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Loader2, Mail } from "lucide-react";
import { FormEvent, useState } from "react";

import { Panel, cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";

function ConvexSignInForm({ locale }: { locale: Locale }) {
  const { signIn } = useAuthActions();
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("flow", flow);
    formData.set("redirectTo", `/${locale}/app`);

    setPendingProvider("password");
    setMessage(null);
    try {
      const result = await signIn("password", formData);
      if (result.redirect) {
        window.location.href = result.redirect.toString();
        return;
      }
      window.location.href = `/${locale}/app`;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prijava nije uspela.");
    } finally {
      setPendingProvider(null);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setPendingProvider(provider);
    setMessage(null);
    try {
      const result = await signIn(provider, { redirectTo: `/${locale}/app` });
      if (result.redirect) {
        window.location.href = result.redirect.toString();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prijava nije uspela.");
      setPendingProvider(null);
    }
  }

  return (
    <Panel className="p-6 md:p-8">
      <div className="flex border-2 border-ink rounded-[8px] overflow-hidden bg-white mb-6">
        <button
          type="button"
          onClick={() => setFlow("signIn")}
          disabled={Boolean(pendingProvider)}
          className={cn(
            "flex-1 py-2.5 text-center text-sm font-black transition-all",
            flow === "signIn" ? "bg-ink text-white" : "bg-white text-ink hover:bg-yellow/25"
          )}
        >
          {locale === "sr" ? "Prijavi se" : "Sign in"}
        </button>
        <div className="w-0.5 bg-ink" />
        <button
          type="button"
          onClick={() => setFlow("signUp")}
          disabled={Boolean(pendingProvider)}
          className={cn(
            "flex-1 py-2.5 text-center text-sm font-black transition-all",
            flow === "signUp" ? "bg-ink text-white" : "bg-white text-ink hover:bg-yellow/25"
          )}
        >
          {locale === "sr" ? "Napravi nalog" : "Create account"}
        </button>
      </div>

      <form onSubmit={handlePassword} className="space-y-4">
        <div>
          <label htmlFor="email" className="text-sm font-black text-ink">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-2 h-12 w-full rounded-[8px] border-2 border-ink bg-white px-4 text-base font-bold text-ink outline-none focus:border-yellow"
          />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-black text-ink">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className="mt-2 h-12 w-full rounded-[8px] border-2 border-ink bg-white px-4 text-base font-bold text-ink outline-none focus:border-yellow"
          />
        </div>
        <div>
          {flow === "signIn" ? (
            <button
              type="submit"
              disabled={Boolean(pendingProvider)}
              className="w-full inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-ink px-5 py-2.5 text-sm font-extrabold text-white shadow-[4px_4px_0_0_#f4be30] disabled:opacity-70 transition-all duration-200 hover:-translate-y-0.5"
            >
              {pendingProvider === "password" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              {locale === "sr" ? "Prijavi se" : "Sign in"}
            </button>
          ) : (
            <button
              type="submit"
              disabled={Boolean(pendingProvider)}
              className="w-full inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-5 py-2.5 text-sm font-extrabold text-ink shadow-[4px_4px_0_0_#0e3158] disabled:opacity-70 transition-all duration-200 hover:-translate-y-0.5"
            >
              {pendingProvider === "password" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4 text-ink" />}
              {locale === "sr" ? "Napravi nalog" : "Create account"}
            </button>
          )}
        </div>
      </form>

      <div className="my-6 h-0.5 bg-line" />

      <div>
        <button
          type="button"
          onClick={() => handleOAuth("google")}
          disabled={Boolean(pendingProvider)}
          className="w-full inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-white px-5 py-2.5 text-sm font-extrabold text-ink disabled:opacity-70 hover:bg-yellow/25 transition-all duration-200"
        >
          {pendingProvider === "google" ? <Loader2 className="size-4 animate-spin" /> : <span className="text-lg">G</span>}
          {locale === "sr" ? "Prijavi se preko Google-a" : "Sign in with Google"}
        </button>
      </div>

      {message ? <p className="mt-4 text-sm font-bold text-red-700">{message}</p> : null}
    </Panel>
  );
}

export function SignInPanel({ locale, hasConvex }: { locale: Locale; hasConvex: boolean }) {
  if (!hasConvex) {
    return (
      <Panel className="p-6 md:p-8">
        <h2 className="text-2xl font-black text-ink">{locale === "sr" ? "Prijava je spremna za Convex" : "Sign-in is ready for Convex"}</h2>
        <p className="mt-3 text-base leading-7 text-muted">
          {locale === "sr"
            ? "Dodaj NEXT_PUBLIC_CONVEX_URL i Convex Auth tajne da aktiviraš email, Google i Apple prijavu."
            : "Add NEXT_PUBLIC_CONVEX_URL and Convex Auth secrets to activate email, Google, and Apple sign-in."}
        </p>
      </Panel>
    );
  }

  return <ConvexSignInForm locale={locale} />;
}
