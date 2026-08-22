"use client";

import { CreditCard, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

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

    const response = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseSlug, locale }),
    });
    const data = await response.json();
    setIsPending(false);

    if (!response.ok || !data.url) {
      setError(data.error ?? "Checkout nije dostupan.");
      setErrorCode(data.code ?? null);
      return;
    }

    window.location.href = data.url;
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
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
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
    const response = await fetch("/api/stripe/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    });
    const data = await response.json();
    setIsPending(false);

    if (!response.ok || !data.url) {
      setError(data.error ?? "Portal nije dostupan.");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={openPortal}
        disabled={isPending}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-paper-strong px-5 py-2.5 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
        {label}
      </button>
      {error ? <p className="max-w-sm text-sm font-bold text-red-700">{error}</p> : null}
    </div>
  );
}
