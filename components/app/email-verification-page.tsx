"use client";

import { useAction } from "convex/react";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { BrandMark, LinkButton, Panel } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import { t, type Locale, withLocale } from "@/lib/i18n";

type VerificationState = "loading" | "verified" | "invalid" | "expired" | "used" | "email_changed" | "error";

export function EmailVerificationPage({ locale, token }: { locale: Locale; token?: string }) {
  const verifyEmail = useAction(api.emailVerification.verifyEmail);
  const [state, setState] = useState<VerificationState>(token ? "loading" : "invalid");

  useEffect(() => {
    if (!token) return;
    let active = true;
    void verifyEmail({ token })
      .then((result) => {
        if (!active) return;
        setState(result.status === "verified" ? "verified" : result.status);
        window.history.replaceState(null, "", withLocale(locale, "/verify-email"));
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [locale, token, verifyEmail]);

  const homeHref = withLocale(locale);
  const dashboardHref = withLocale(locale, "/app");
  const profileHref = withLocale(locale, "/app/profile");
  const isSuccess = state === "verified";
  const isLoading = state === "loading";

  const title = isLoading
    ? t(locale, "Potvrđujemo email…", "Confirming your email…")
    : isSuccess
      ? t(locale, "Email je potvrđen!", "Email confirmed!")
      : t(locale, "Link nije moguće iskoristiti", "This link cannot be used");
  const body = isLoading
    ? t(locale, "Sačekaj trenutak dok završimo potvrdu naloga.", "Please wait while we finish confirming your account.")
    : isSuccess
      ? t(locale, "Checkout i lekcije su sada otključani. Na profilu možeš opciono da dodaš lozinku.", "Checkout and lessons are now unlocked. You can optionally add a password on your profile.")
      : state === "expired"
        ? t(locale, "Ovaj verifikacioni link je istekao. Pošalji novi link sa stranice Profil.", "This verification link has expired. Send a new one from your Profile page.")
        : state === "used"
          ? t(locale, "Ovaj link je već iskorišćen. Email je već potvrđen ili je zatražen novi link.", "This link has already been used. The email is already confirmed or a newer link was requested.")
          : state === "email_changed"
            ? t(locale, "Email adresa naloga se promenila. Zatraži novi verifikacioni link.", "The account email changed. Request a new verification link.")
            : t(locale, "Link je nevažeći ili je došlo do greške. Zatraži novi link sa stranice Profil.", "The link is invalid or an error occurred. Request a new link from your Profile page.");

  return (
    <main className="sketch-grid min-h-screen bg-paper px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-2xl items-center justify-center">
        <Panel className="w-full p-6 text-center sm:p-10">
          <BrandMark href={homeHref} label="Nauči AI" />
          <p className="mt-6 text-sm font-black uppercase tracking-[0.16em] text-muted">
            <MailCheck className="mr-2 inline size-4" />
            {t(locale, "Verifikacija email-a", "Email verification")}
          </p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-ink sm:text-5xl">{title}</h1>
          <p className="mx-auto mt-5 max-w-xl text-base font-bold leading-7 text-muted">{body}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <LinkButton href={isSuccess ? profileHref : dashboardHref} tone="ink">
              {isSuccess ? t(locale, "Nazad na Profil", "Back to Profile") : t(locale, "Dashboard", "Dashboard")}
            </LinkButton>
            <LinkButton href={homeHref} tone="paper">
              {t(locale, "Početna stranica", "Home page")}
            </LinkButton>
          </div>
          {!isSuccess && !isLoading ? (
            <Link href={dashboardHref} className="mt-6 inline-flex text-sm font-black text-ink underline">
              {t(locale, "Otvori Profil i pošalji novi link", "Open Profile and send a new link")}
            </Link>
          ) : null}
        </Panel>
      </div>
    </main>
  );
}
