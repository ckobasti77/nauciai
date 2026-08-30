"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ArrowLeft, CheckCircle2, KeyRound, Mail } from "lucide-react";
import { FormEvent, useState } from "react";

import { Field, Input } from "@/components/ui/field";
import { Panel, cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { t, type Locale } from "@/lib/i18n";
import { passwordRequirements, passwordValidationErrors } from "@/lib/password-policy";
import {
  isValidUsername,
  normalizeUsername,
  USERNAME_VALIDATION_MESSAGE_EN,
  USERNAME_VALIDATION_MESSAGE_SR,
} from "@/lib/username-policy";

type AuthFlow = "signIn" | "signUp" | "reset" | "resetVerification";

function passwordError(locale: Locale, password: string) {
  const first = passwordValidationErrors(password)[0];
  return first
    ? t(locale, `Lozinka mora da sadrži: ${first.labelSr.toLowerCase()}.`, `Password must include: ${first.labelEn.toLowerCase()}.`)
    : null;
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
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetCode] = useState(initialCode);
  const normalizedUsername = normalizeUsername(username) ?? "";
  const usernameFormatValid = !normalizedUsername || isValidUsername(normalizedUsername);
  const usernameAvailable = useQuery(
    api.profiles.isUsernameAvailable,
    flow === "signUp" && normalizedUsername && usernameFormatValid ? { username: normalizedUsername } : "skip",
  );

  function switchFlow(nextFlow: AuthFlow) {
    setFlow(nextFlow);
    setMessage(null);
    setPassword("");
    setSignupConfirmPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const resetRedirectTo = `/${locale}/reset-password?email=${encodeURIComponent(normalizedEmail)}&next=${encodeURIComponent(redirectTo)}`;

    setPendingProvider("password");
    setMessage(null);
    try {
      if (flow === "reset") {
        await signIn("password", {
          flow: "reset",
          email: normalizedEmail,
          locale,
          redirectTo: resetRedirectTo,
        });
        setMessage({
          tone: "success",
          text: t(
            locale,
            "Ako nalog postoji, poslali smo link za reset lozinke na email.",
            "If the account exists, we sent a password reset link to that email.",
          ),
        });
        return;
      }

      if (flow === "resetVerification") {
        if (!resetCode) {
          throw new Error(t(locale, "Reset link nije ispravan.", "The reset link is not valid."));
        }
        const resetPasswordError = passwordError(locale, newPassword);
        if (resetPasswordError) {
          throw new Error(resetPasswordError);
        }
        if (newPassword !== confirmPassword) {
          throw new Error(t(locale, "Lozinke se ne poklapaju.", "Passwords do not match."));
        }

        const result = await signIn("password", {
          flow: "reset-verification",
          email: normalizedEmail,
          code: resetCode,
          newPassword,
          redirectTo,
        });
        if (result.redirect) {
          window.location.href = result.redirect.toString();
          return;
        }
        setPassword("");
        setNewPassword("");
        setConfirmPassword("");
        window.location.href = redirectTo;
        return;
      }

      if (flow === "signUp") {
        const signupPasswordError = passwordError(locale, password);
        if (signupPasswordError) {
          throw new Error(signupPasswordError);
        }
        if (password !== signupConfirmPassword) {
          throw new Error(t(locale, "Lozinke se ne poklapaju.", "Passwords do not match."));
        }
        if (!isValidUsername(normalizedUsername)) {
          throw new Error(
            t(
              locale,
              USERNAME_VALIDATION_MESSAGE_SR,
              USERNAME_VALIDATION_MESSAGE_EN,
            ),
          );
        }
        if (usernameAvailable === false) {
          throw new Error(t(locale, "Korisničko ime je već zauzeto.", "That username is already taken."));
        }
      }

      const completionRedirect = `/${locale}/auth/complete?next=${encodeURIComponent(redirectTo)}`;
      if (flow === "signIn") {
        const result = await signIn("password-login", {
          identifier: email.trim(),
          password,
          redirectTo: completionRedirect,
        });
        if (result.redirect) {
          window.location.href = result.redirect.toString();
          return;
        }
        if (result.signingIn) {
          window.location.href = completionRedirect;
          return;
        }
        throw new Error(t(locale, "Pogrešno korisničko ime/email ili lozinka.", "Incorrect username/email or password."));
      }
      const result = await signIn("password", {
        flow,
        email: normalizedEmail,
        password,
        redirectTo: completionRedirect,
        ...(flow === "signUp" ? { username: normalizedUsername } : {}),
      });
      if (result.redirect) {
        window.location.href = result.redirect.toString();
        return;
      }
      if (result.signingIn) {
        window.location.href = completionRedirect;
        return;
      }

      setMessage({
        tone: "success",
        text:
          flow === "signUp"
            ? t(
                locale,
                "Proveri email i potvrdi nalog. Ako profil vec postoji, nastavices bez dupliranja.",
                "Check your email and confirm the account. If the profile already exists, it will continue without duplicating.",
              )
            : t(locale, "Proveri email za nastavak prijave.", "Check your email to continue signing in."),
      });
    } catch (error) {
      if (flow === "reset") {
        setMessage({
          tone: "success",
          text: t(
            locale,
            "Ako nalog postoji, poslali smo link za reset lozinke na email.",
            "If the account exists, we sent a password reset link to that email.",
          ),
        });
        return;
      }
      setMessage({
        tone: "error",
        text: flow === "signIn"
          ? t(locale, "Pogrešno korisničko ime/email ili lozinka.", "Incorrect username/email or password.")
          : error instanceof Error
            ? error.message
            : t(locale, "Prijava nije uspela.", "Sign-in failed."),
      });
    } finally {
      setPendingProvider(null);
    }
  }

  async function handleOAuth(provider: "google") {
    setPendingProvider(provider);
    setMessage(null);
    try {
      const onboardingRedirect = `/${locale}/auth/complete?next=${encodeURIComponent(redirectTo)}`;
      const result = await signIn(provider, { redirectTo: onboardingRedirect });
      if (result.redirect) {
        window.location.href = result.redirect.toString();
      }
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : t(locale, "Prijava nije uspela.", "Sign-in failed."),
      });
      setPendingProvider(null);
    }
  }

  const isPasswordPending = pendingProvider === "password";
  const showPrimaryTabs = flow === "signIn" || flow === "signUp";
  const title =
    flow === "reset"
      ? t(locale, "Reset lozinke", "Reset password")
      : flow === "resetVerification"
        ? t(locale, "Nova lozinka", "New password")
        : null;

  return (
    <Panel className="p-6 md:p-8">
      {showPrimaryTabs ? (
        <div className="mb-6 flex overflow-hidden rounded-[8px] border-2 border-ink bg-paper-strong">
          <button
            type="button"
            onClick={() => switchFlow("signIn")}
            disabled={Boolean(pendingProvider)}
            className={cn(
              "flex-1 py-2.5 text-center text-sm font-black transition-all",
              flow === "signIn" ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink hover:bg-yellow/25",
            )}
          >
            {t(locale, "Prijavi se", "Sign in")}
          </button>
          <div className="w-0.5 bg-ink" />
          <button
            type="button"
            onClick={() => switchFlow("signUp")}
            disabled={Boolean(pendingProvider)}
            className={cn(
              "flex-1 py-2.5 text-center text-sm font-black transition-all",
              flow === "signUp" ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink hover:bg-yellow/25",
            )}
          >
            {t(locale, "Napravi profil", "Create profile")}
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
            {t(locale, "Nazad na prijavu", "Back to sign in")}
          </button>
          <h2 className="mt-4 type-h1 text-ink">{title}</h2>
        </div>
      )}

      <form onSubmit={handlePassword} className="space-y-4">
        <Field
          id="email"
          label={flow === "signIn" ? t(locale, "Korisničko ime ili email", "Username or email") : "Email"}
        >
          {(field) => (
            <Input
              {...field}
              name="email"
              type={flow === "signIn" ? "text" : "email"}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete={flow === "signIn" ? "username" : "email"}
              placeholder={flow === "signIn" ? t(locale, "@username ili ime@email.com", "@username or name@email.com") : undefined}
            />
          )}
        </Field>

        {flow === "signUp" ? (
          <Field
            id="username"
            label={t(locale, "Korisničko ime", "Username")}
            error={usernameAvailable === false ? t(locale, "Korisničko ime je već zauzeto.", "That username is already taken.") : undefined}
            hint={
              !normalizedUsername
                ? t(locale, "Username se koristi za @pominjanja u Zajednici.", "Your username is used for @mentions in Community.")
                : !usernameFormatValid
                  ? t(locale, USERNAME_VALIDATION_MESSAGE_SR, USERNAME_VALIDATION_MESSAGE_EN)
                  : usernameAvailable === undefined
                    ? t(locale, "Provera dostupnosti…", "Checking availability…")
                    : t(locale, "Username je slobodan.", "Username is available.")
            }
          >
            {(field) => (
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-black text-ink/45">@</span>
                <Input
                  {...field}
                  name="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  minLength={3}
                  maxLength={20}
                  pattern="[A-Za-zČĆŠĐŽčćšđž0-9._]{3,20}"
                  autoComplete="username"
                  className="pl-8 pr-4"
                  placeholder="npr. čika_fox.123"
                />
              </div>
            )}
          </Field>
        ) : null}

        {flow === "signIn" || flow === "signUp" ? (
          <div>
            <Field id="password" label="Password">
              {(field) => (
                <Input
                  {...field}
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={8}
                />
              )}
            </Field>
            {flow === "signUp" ? (
              <div className="mt-2 grid gap-1 text-xs font-bold text-muted sm:grid-cols-2">
                {passwordRequirements.map((requirement) => (
                  <span key={requirement.id}>• {t(locale, requirement.labelSr, requirement.labelEn)}</span>
                ))}
              </div>
            ) : null}
            {flow === "signIn" ? (
              <button
                type="button"
                onClick={() => switchFlow("reset")}
                className="mt-2 text-sm font-black text-blue-700 underline"
              >
                {t(locale, "Zaboravili ste lozinku?", "Forgot password?")}
              </button>
            ) : null}
          </div>
        ) : null}

        {flow === "signUp" ? (
          <Field
            id="signupConfirmPassword"
            label={t(locale, "Potvrdi lozinku", "Confirm password")}
            error={
              signupConfirmPassword && password !== signupConfirmPassword
                ? t(locale, "Lozinke se ne poklapaju.", "Passwords do not match.")
                : undefined
            }
          >
            {(field) => (
              <Input
                {...field}
                type="password"
                value={signupConfirmPassword}
                onChange={(event) => setSignupConfirmPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            )}
          </Field>
        ) : null}

        {flow === "resetVerification" ? (
          <>
            <div>
              <Field id="newPassword" label={t(locale, "Nova lozinka", "New password")}>
                {(field) => (
                  <Input
                    {...field}
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    minLength={8}
                  />
                )}
              </Field>
              <div className="mt-2 grid gap-1 text-xs font-bold text-muted sm:grid-cols-2">
                {passwordRequirements.map((requirement) => (
                  <span key={requirement.id}>• {t(locale, requirement.labelSr, requirement.labelEn)}</span>
                ))}
              </div>
            </div>
            <Field id="confirmPassword" label={t(locale, "Ponovi lozinku", "Repeat password")}>
              {(field) => (
                <Input
                  {...field}
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={8}
                />
              )}
            </Field>
          </>
        ) : null}

        <button
          type="submit"
          disabled={Boolean(pendingProvider)}
          className={cn(
            "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border-2 border-ink px-5 py-2.5 text-sm font-extrabold shadow-[4px_4px_0_0_var(--yellow)] transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-70",
            flow === "signUp" ? "bg-yellow text-ink shadow-[4px_4px_0_0_var(--ink)]" : "bg-ink text-paper-strong",
          )}
        >
          {isPasswordPending ? (
            <Spinner />
          ) : flow === "reset" || flow === "resetVerification" ? (
            <KeyRound className="size-4" />
          ) : (
            <Mail className="size-4" />
          )}
          {flow === "signIn"
            ? t(locale, "Prijavi se", "Sign in")
            : flow === "signUp"
              ? t(locale, "Napravi profil", "Create profile")
              : flow === "reset"
                ? t(locale, "Posalji link", "Send link")
                : t(locale, "Sacuvaj lozinku", "Save password")}
        </button>
      </form>

      {showPrimaryTabs ? (
        <>
          <div className="my-6 h-0.5 bg-line" />

          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={Boolean(pendingProvider)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-paper-strong px-5 py-2.5 text-sm font-extrabold text-ink transition-all duration-200 hover:bg-yellow/25 disabled:opacity-70"
          >
            {pendingProvider === "google" ? <Spinner /> : <span className="text-lg">G</span>}
            {t(locale, "Prijavi se preko Google-a", "Sign in with Google")}
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
        <h2 className="type-h2 text-ink">
          {t(locale, "Prijava je spremna za Convex", "Sign-in is ready for Convex")}
        </h2>
        <p className="mt-3 type-body type-measure text-muted">
          {t(
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
