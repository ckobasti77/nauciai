"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import { FormEvent, useState } from "react";

import { Panel, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Locale } from "@/lib/i18n";

type AuthFlow = "signIn" | "signUp" | "reset" | "resetVerification";

function labelFor(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr : en;
}

function ConvexSignInForm({
  locale,
  initialFlow = "signIn",
  initialEmail = "",
  initialCode = "",
  redirectTo,
}: {
  locale: Locale;
  initialFlow?: AuthFlow;
  initialEmail?: string;
  initialCode?: string;
  redirectTo: string;
}) {
  const { signIn } = useAuthActions();
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [flow, setFlow] = useState<AuthFlow>(initialFlow);
  const [email, setEmail] = useState(initialEmail);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetCode] = useState(initialCode);
  const normalizedUsername = username.trim().toLowerCase();
  const usernameAvailable = useQuery(
    api.profiles.isUsernameAvailable,
    flow === "signUp" && normalizedUsername ? { username: normalizedUsername } : "skip",
  );

  function switchFlow(nextFlow: AuthFlow) {
    setFlow(nextFlow);
    setMessage(null);
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const resetRedirectTo = `/${locale}/sign-in?mode=reset-confirm&email=${encodeURIComponent(normalizedEmail)}&next=${encodeURIComponent(redirectTo)}`;

    setPendingProvider("password");
    setMessage(null);
    try {
      if (flow === "reset") {
        await signIn("password", {
          flow: "reset",
          email: normalizedEmail,
          redirectTo: resetRedirectTo,
        });
        setMessage({
          tone: "success",
          text: labelFor(
            locale,
            "Ako nalog postoji, poslali smo link za reset lozinke na email.",
            "If the account exists, we sent a password reset link to that email.",
          ),
        });
        return;
      }

      if (flow === "resetVerification") {
        if (!resetCode) {
          throw new Error(labelFor(locale, "Reset link nije ispravan.", "The reset link is not valid."));
        }
        if (newPassword.length < 8) {
          throw new Error(labelFor(locale, "Lozinka mora imati najmanje 8 karaktera.", "Password must be at least 8 characters."));
        }
        if (newPassword !== confirmPassword) {
          throw new Error(labelFor(locale, "Lozinke se ne poklapaju.", "Passwords do not match."));
        }

        await signIn("password", {
          flow: "reset-verification",
          email: normalizedEmail,
          code: resetCode,
          newPassword,
          redirectTo,
        });
        setPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setFlow("signIn");
        setMessage({
          tone: "success",
          text: labelFor(locale, "Lozinka je promenjena. Mozes da se prijavis.", "Password changed. You can sign in."),
        });
        return;
      }

      if (flow === "signUp") {
        if (!/^[a-zA-Z0-9_-]{3,20}$/.test(normalizedUsername)) {
          throw new Error(
            labelFor(
              locale,
              "Korisničko ime mora imati između 3 i 20 karaktera i može sadržati samo slova, brojeve, donje crte i crtice.",
              "Username must be 3–20 characters and use only letters, numbers, underscores, or hyphens.",
            ),
          );
        }
        if (usernameAvailable === false) {
          throw new Error(labelFor(locale, "Korisničko ime je već zauzeto.", "That username is already taken."));
        }
      }

      const result = await signIn("password", {
        flow,
        email: normalizedEmail,
        password,
        redirectTo,
        ...(flow === "signUp" ? { username: normalizedUsername } : {}),
      });
      if (result.redirect) {
        window.location.href = result.redirect.toString();
        return;
      }
      if (result.signingIn) {
        window.location.href = redirectTo;
        return;
      }

      setMessage({
        tone: "success",
        text:
          flow === "signUp"
            ? labelFor(
                locale,
                "Proveri email i potvrdi nalog. Ako profil vec postoji, nastavices bez dupliranja.",
                "Check your email and confirm the account. If the profile already exists, it will continue without duplicating.",
              )
            : labelFor(locale, "Proveri email za nastavak prijave.", "Check your email to continue signing in."),
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : labelFor(locale, "Prijava nije uspela.", "Sign-in failed."),
      });
    } finally {
      setPendingProvider(null);
    }
  }

  async function handleOAuth(provider: "google") {
    setPendingProvider(provider);
    setMessage(null);
    try {
      const result = await signIn(provider, { redirectTo });
      if (result.redirect) {
        window.location.href = result.redirect.toString();
      }
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : labelFor(locale, "Prijava nije uspela.", "Sign-in failed."),
      });
      setPendingProvider(null);
    }
  }

  const isPasswordPending = pendingProvider === "password";
  const showPrimaryTabs = flow === "signIn" || flow === "signUp";
  const title =
    flow === "reset"
      ? labelFor(locale, "Reset lozinke", "Reset password")
      : flow === "resetVerification"
        ? labelFor(locale, "Nova lozinka", "New password")
        : null;

  return (
    <Panel className="p-6 md:p-8">
      {showPrimaryTabs ? (
        <div className="mb-6 flex overflow-hidden rounded-[8px] border-2 border-ink bg-white">
          <button
            type="button"
            onClick={() => switchFlow("signIn")}
            disabled={Boolean(pendingProvider)}
            className={cn(
              "flex-1 py-2.5 text-center text-sm font-black transition-all",
              flow === "signIn" ? "bg-ink text-white" : "bg-white text-ink hover:bg-yellow/25",
            )}
          >
            {labelFor(locale, "Prijavi se", "Sign in")}
          </button>
          <div className="w-0.5 bg-ink" />
          <button
            type="button"
            onClick={() => switchFlow("signUp")}
            disabled={Boolean(pendingProvider)}
            className={cn(
              "flex-1 py-2.5 text-center text-sm font-black transition-all",
              flow === "signUp" ? "bg-ink text-white" : "bg-white text-ink hover:bg-yellow/25",
            )}
          >
            {labelFor(locale, "Napravi profil", "Create profile")}
          </button>
        </div>
      ) : (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => switchFlow("signIn")}
            className="inline-flex items-center gap-2 text-sm font-black text-ink underline"
          >
            <ArrowLeft className="size-4" />
            {labelFor(locale, "Nazad na prijavu", "Back to sign in")}
          </button>
          <h2 className="mt-4 text-3xl font-black text-ink">{title}</h2>
        </div>
      )}

      <form onSubmit={handlePassword} className="space-y-4">
        <div>
          <label htmlFor="email" className="text-sm font-black text-ink">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="mt-2 h-12 w-full rounded-[8px] border-2 border-ink bg-white px-4 text-base font-bold text-ink outline-none focus:border-yellow"
          />
        </div>

        {flow === "signUp" ? (
          <div>
            <label htmlFor="username" className="text-sm font-black text-ink">
              {labelFor(locale, "Korisničko ime", "Username")}
            </label>
            <div className="relative mt-2">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-black text-ink/45">@</span>
              <input
                id="username"
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                minLength={3}
                maxLength={20}
                autoComplete="username"
                className="h-12 w-full rounded-[8px] border-2 border-ink bg-white pl-8 pr-4 text-base font-extrabold text-ink outline-none focus:border-yellow"
                placeholder="npr. fox123"
              />
            </div>
            <p className={cn("mt-1.5 text-xs font-bold", usernameAvailable === false ? "text-red-700" : "text-muted")}>
              {!normalizedUsername
                ? labelFor(locale, "Username se koristi za @pominjanja u Zajednici.", "Your username is used for @mentions in Community.")
                : usernameAvailable === undefined
                  ? labelFor(locale, "Provera dostupnosti…", "Checking availability…")
                  : usernameAvailable
                    ? labelFor(locale, "Username je slobodan.", "Username is available.")
                    : labelFor(locale, "Korisničko ime je već zauzeto.", "That username is already taken.")}
            </p>
          </div>
        ) : null}

        {flow === "signIn" || flow === "signUp" ? (
          <div>
            <label htmlFor="password" className="text-sm font-black text-ink">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              className="mt-2 h-12 w-full rounded-[8px] border-2 border-ink bg-white px-4 text-base font-bold text-ink outline-none focus:border-yellow"
            />
            {flow === "signIn" ? (
              <button
                type="button"
                onClick={() => switchFlow("reset")}
                className="mt-2 text-sm font-black text-blue-700 underline"
              >
                {labelFor(locale, "Zaboravili ste lozinku?", "Forgot password?")}
              </button>
            ) : null}
          </div>
        ) : null}

        {flow === "resetVerification" ? (
          <>
            <div>
              <label htmlFor="newPassword" className="text-sm font-black text-ink">
                {labelFor(locale, "Nova lozinka", "New password")}
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={8}
                className="mt-2 h-12 w-full rounded-[8px] border-2 border-ink bg-white px-4 text-base font-bold text-ink outline-none focus:border-yellow"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="text-sm font-black text-ink">
                {labelFor(locale, "Ponovi lozinku", "Repeat password")}
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                className="mt-2 h-12 w-full rounded-[8px] border-2 border-ink bg-white px-4 text-base font-bold text-ink outline-none focus:border-yellow"
              />
            </div>
          </>
        ) : null}

        <button
          type="submit"
          disabled={Boolean(pendingProvider)}
          className={cn(
            "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border-2 border-ink px-5 py-2.5 text-sm font-extrabold shadow-[4px_4px_0_0_#f4be30] transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-70",
            flow === "signUp" ? "bg-yellow text-ink shadow-[4px_4px_0_0_#0e3158]" : "bg-ink text-white",
          )}
        >
          {isPasswordPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : flow === "reset" || flow === "resetVerification" ? (
            <KeyRound className="size-4" />
          ) : (
            <Mail className="size-4" />
          )}
          {flow === "signIn"
            ? labelFor(locale, "Prijavi se", "Sign in")
            : flow === "signUp"
              ? labelFor(locale, "Napravi profil", "Create profile")
              : flow === "reset"
                ? labelFor(locale, "Posalji link", "Send link")
                : labelFor(locale, "Sacuvaj lozinku", "Save password")}
        </button>
      </form>

      {showPrimaryTabs ? (
        <>
          <div className="my-6 h-0.5 bg-line" />

          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={Boolean(pendingProvider)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-white px-5 py-2.5 text-sm font-extrabold text-ink transition-all duration-200 hover:bg-yellow/25 disabled:opacity-70"
          >
            {pendingProvider === "google" ? <Loader2 className="size-4 animate-spin" /> : <span className="text-lg">G</span>}
            {labelFor(locale, "Prijavi se preko Google-a", "Sign in with Google")}
          </button>
        </>
      ) : null}

      {message ? (
        <p
          className={cn(
            "mt-4 rounded-[8px] border-2 px-3 py-2 text-sm font-black",
            message.tone === "success" ? "border-ink bg-yellow/25 text-ink" : "border-red-700 bg-red-50 text-red-700",
          )}
        >
          {message.tone === "success" ? <CheckCircle2 className="mr-2 inline size-4" /> : null}
          {message.text}
        </p>
      ) : null}
    </Panel>
  );
}

export function SignInPanel({
  locale,
  hasConvex,
  initialFlow,
  initialEmail,
  initialCode,
  redirectTo,
}: {
  locale: Locale;
  hasConvex: boolean;
  initialFlow?: AuthFlow;
  initialEmail?: string;
  initialCode?: string;
  redirectTo: string;
}) {
  if (!hasConvex) {
    return (
      <Panel className="p-6 md:p-8">
        <h2 className="text-2xl font-black text-ink">
          {labelFor(locale, "Prijava je spremna za Convex", "Sign-in is ready for Convex")}
        </h2>
        <p className="mt-3 text-base leading-7 text-muted">
          {labelFor(
            locale,
            "Dodaj NEXT_PUBLIC_CONVEX_URL i Convex Auth tajne da aktiviras email i Google prijavu.",
            "Add NEXT_PUBLIC_CONVEX_URL and Convex Auth secrets to activate email and Google sign-in.",
          )}
        </p>
      </Panel>
    );
  }

  return (
    <ConvexSignInForm
      locale={locale}
      initialFlow={initialFlow}
      initialEmail={initialEmail}
      initialCode={initialCode}
      redirectTo={redirectTo}
    />
  );
}
