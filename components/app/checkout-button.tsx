"use client";

import { CreditCard } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import { t as tr, withLocale } from "@/lib/i18n";

// Sve poruke greške koje student vidi idu kroz `lib/i18n` i prijateljske su — tehnički
// tekst sa servera (npr. „Stripe checkout is not configured…") nikad ne stigne do UI-ja,
// samo u `console.error`. Poznati kodovi dobijaju konkretan savet; sve ostalo (fali ključ,
// pao Stripe, mrežna greška) dobija jednu meku rečenicu, jer studentu-početniku razlika
// između tih uzroka ništa ne znači — akcija je uvek ista: pokušaj kasnije ili nam piši.
function friendlyCheckoutError(locale: Locale, code: string | null): string {
  switch (code) {
    case "AUTH_REQUIRED":
      return tr(locale, "Prijavi se pre kupovine kursa.", "Sign in before purchasing a course.");
    case "EMAIL_VERIFICATION_REQUIRED":
      return tr(locale, "Potvrdi email pre kupovine kursa.", "Confirm your email before purchasing a course.");
    default:
      return tr(
        locale,
        "Plaćanje trenutno nije dostupno — probaj za koji minut ili nam piši.",
        "Payments are unavailable right now — try again in a minute or message us.",
      );
  }
}

export function CheckoutButton({
  courseSlug,
  locale,
  label,
  className,
  size = "default",
  tone = "yellow",
  fullWidth = false,
}: {
  courseSlug: string;
  locale: Locale;
  label: string;
  className?: string;
  size?: "default" | "compact";
  tone?: "yellow" | "ink";
  fullWidth?: boolean;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function startCheckout() {
    setIsPending(true);
    setError(null);
    setErrorCode(null);

    let response: Response;
    try {
      response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseSlug, locale }),
      });
    } catch (networkError) {
      // Ni server nije odgovorio (nema mreže) — nema `data`, ali student svejedno
      // dobija istu meku rečenicu, a tehnički razlog ide u konzolu.
      console.error("Checkout request failed", networkError);
      setError(friendlyCheckoutError(locale, null));
      setIsPending(false);
      return;
    }

    const data = await response.json().catch(() => ({}) as Record<string, unknown>);
    setIsPending(false);

    if (!response.ok || !data.url) {
      // Tehnički detalj ostaje u konzoli za dijagnostiku; student ga nikad ne vidi.
      console.error("Checkout failed", { status: response.status, code: data.code ?? null, error: data.error });
      const code = typeof data.code === "string" ? data.code : null;
      setError(friendlyCheckoutError(locale, code));
      setErrorCode(code);
      return;
    }

    window.location.href = data.url as string;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        onClick={startCheckout}
        disabled={isPending}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-[8px] border-2 border-ink text-sm font-extrabold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70",
          tone === "yellow" && "bg-yellow text-ink",
          tone === "ink" && "bg-ink text-paper-strong",
          fullWidth && "w-full",
          size === "default" && "min-h-11 px-5 py-2.5 shadow-[4px_4px_0_0_var(--ink)]",
          size === "compact" && "min-h-9 px-3 py-1.5 shadow-[2px_2px_0_0_var(--ink)]",
        )}
      >
        {isPending ? <Spinner /> : <CreditCard className="size-4" />}
        {label}
      </button>
      {error ? (
        <div className="max-w-sm text-sm font-bold text-red-700">
          <p>{error}</p>
          {errorCode === "EMAIL_VERIFICATION_REQUIRED" ? (
            <Link href={withLocale(locale, "/app/profile")} className="mt-1 inline-flex text-ink underline">
              {locale === "sr" ? "Otvori podešavanja naloga" : "Open account settings"}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PortalButton({ locale, label }: { locale: Locale; label: string }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setIsPending(true);
    setError(null);

    const friendly = tr(
      locale,
      "Naplata trenutno nije dostupna — probaj za koji minut ili nam piši.",
      "Billing is unavailable right now — try again in a minute or message us.",
    );

    let response: Response;
    try {
      response = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
    } catch (networkError) {
      console.error("Portal request failed", networkError);
      setError(friendly);
      setIsPending(false);
      return;
    }

    const data = await response.json().catch(() => ({}) as Record<string, unknown>);
    setIsPending(false);

    if (!response.ok || !data.url) {
      // Tehnički detalj (npr. „Stripe billing portal is not configured…") ide u konzolu.
      console.error("Portal failed", { status: response.status, error: data.error });
      setError(friendly);
      return;
    }
    window.location.href = data.url as string;
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={openPortal}
        disabled={isPending}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-paper-strong px-5 py-2.5 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending ? <Spinner /> : <CreditCard className="size-4" />}
        {label}
      </button>
      {error ? <p className="max-w-sm text-sm font-bold text-red-700">{error}</p> : null}
    </div>
  );
}
