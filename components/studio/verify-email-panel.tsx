"use client";

import { useAction } from "convex/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Locale } from "@/lib/i18n";
import { STUDIO_VERIFY_EMAIL } from "@/lib/studio-messages";

type SendState = "idle" | "sending" | "sent" | "failed";

/**
 * Zajednička logika slanja linka za potvrdu (studio-public F3): ista akcija
 * koju koristi i profil (`requestViewerEmailVerification`), samo sa Studio
 * porukama. Panel varijanta stoji u floating slotu Studija; link varijanta
 * ide u poruke o grešci (npr. kupovina kredita bez potvrđenog emaila, F4).
 */
function useResendVerification(locale: Locale) {
  const request = useAction(api.emailVerification.requestViewerEmailVerification);
  const [state, setState] = useState<SendState>("idle");

  async function send() {
    setState("sending");
    try {
      const result = await request({ locale });
      setState(result.sent ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  }

  return { state, send };
}

/** Panel u floating slotu Studija - isti oklop kao STUDIO_NOT_ENROLLED kartica. */
export function StudioVerifyEmailPanel({ locale }: { locale: Locale }) {
  const { state, send } = useResendVerification(locale);

  return (
    <div className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard-16)] sm:p-6">
      <h3 className="type-h3 text-ink">{STUDIO_VERIFY_EMAIL.title[locale]}</h3>
      <p className="mt-2 type-body-sm font-bold text-muted">{STUDIO_VERIFY_EMAIL.body[locale]}</p>
      <Button onClick={send} loading={state === "sending"} className="mt-3">
        {STUDIO_VERIFY_EMAIL.cta[locale]}
      </Button>
      {state === "sent" ? (
        <p className="mt-3 type-body-sm font-bold text-ink" role="status">
          {STUDIO_VERIFY_EMAIL.sent[locale]}
        </p>
      ) : null}
      {state === "failed" ? (
        <p className="mt-3 type-body-sm font-bold text-muted" role="status">
          {STUDIO_VERIFY_EMAIL.failed[locale]}
        </p>
      ) : null}
    </div>
  );
}

/** Mala inline varijanta za poruke o grešci (F4: kupovina bez potvrđenog emaila). */
export function ResendVerificationLink({ locale }: { locale: Locale }) {
  const { state, send } = useResendVerification(locale);

  if (state === "sent") {
    return (
      <span className="font-extrabold text-ink" role="status">
        {STUDIO_VERIFY_EMAIL.sent[locale]}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={state === "sending"}
      className="rounded-full font-extrabold text-ink underline focus-visible:outline-2 outline-offset-2 outline-ink disabled:opacity-60"
    >
      {state === "failed" ? STUDIO_VERIFY_EMAIL.failed[locale] : STUDIO_VERIFY_EMAIL.cta[locale]}
    </button>
  );
}
