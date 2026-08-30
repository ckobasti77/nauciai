"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CircleAlert, Send } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import { t, type Locale } from "@/lib/i18n";
import { Spinner } from "@/components/ui/spinner";

export type ViewerSuspension = NonNullable<
  FunctionReturnType<typeof api.chatModeration.getMySuspension>
>;

function formatEnd(locale: Locale, endsAt?: number, permanent?: boolean) {
  if (permanent || !endsAt) return t(locale, "Trajna suspenzija", "Permanent suspension");
  return new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : "en", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(endsAt));
}

export function SuspensionGate({
  locale,
  initialSuspension,
  children,
}: {
  locale: Locale;
  initialSuspension: ViewerSuspension | null;
  children: ReactNode;
}) {
  // isAuthenticated only drives the subscription argument. Branching render output on it
  // would diverge between SSR and the first client render.
  const { isAuthenticated } = useConvexAuth();
  const suspension = useQuery(api.chatModeration.getMySuspension, isAuthenticated ? {} : "skip");
  const submitAppeal = useMutation(api.chatModeration.submitSuspensionAppeal);
  const [appeal, setAppeal] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `null` is a meaningful resolved value ("live query says not suspended"), so this must
  // test for `undefined` rather than falling back with `??`.
  const resolved = suspension === undefined ? initialSuspension : suspension;
  if (!resolved) return children;
  const activeSuspension = resolved;

  async function sendAppeal() {
    if (!appeal.trim()) return;
    setPending(true);
    setError(null);
    try {
      await submitAppeal({ suspensionId: activeSuspension.suspensionId, body: appeal });
      setAppeal("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t(locale, "Žalba nije poslata.", "The appeal was not sent."));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-paper p-4 text-ink">
      <section aria-labelledby="suspension-title" className="w-full max-w-2xl rounded-[16px] border-2 border-ink bg-paper-strong p-5 shadow-[7px_7px_0_0_var(--yellow)] sm:p-8">
        <span className="grid size-12 place-items-center rounded-full border-2 border-ink bg-yellow"><CircleAlert className="size-6" /></span>
        <p className="mt-5 text-xs font-black uppercase tracking-wide text-red-700">{t(locale, "Nalog je suspendovan", "Account suspended")}</p>
        {/* Server-rendered without a fixed timeZone, so the SSR string can differ from the viewer's. */}
        <h1 suppressHydrationWarning id="suspension-title" className="mt-1 text-3xl font-black leading-tight">{formatEnd(locale, activeSuspension.endsAt, activeSuspension.permanent)}</h1>
        <div className="mt-5 rounded-[16px] border-2 border-line bg-paper p-4">
          <p className="text-xs font-black uppercase text-muted">{t(locale, "Razlog", "Reason")}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6">{activeSuspension.reason}</p>
        </div>

        {activeSuspension.appeal ? (
          <div className="mt-5 rounded-[16px] border-2 border-[#70a7cf] dark:border-line bg-[#eef6fb] dark:bg-ink/10 p-4">
            <p className="text-xs font-black uppercase text-blue-mid dark:text-muted">{t(locale, "Tvoja žalba", "Your appeal")} · {activeSuspension.appeal.status}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6">{activeSuspension.appeal.body}</p>
            {activeSuspension.appeal.response ? <div className="mt-3 border-t-2 border-[#b9d3e8] dark:border-line pt-3"><p className="text-xs font-black uppercase text-blue-mid dark:text-muted">{t(locale, "Odgovor", "Response")}</p><p className="mt-1 text-sm font-bold leading-6">{activeSuspension.appeal.response}</p></div> : null}
          </div>
        ) : (
          <div className="mt-5">
            <label className="block text-sm font-black">
              {t(locale, "Jedina žalba", "One appeal")}
              <textarea value={appeal} onChange={(event) => setAppeal(event.target.value)} maxLength={2_000} rows={5} placeholder={t(locale, "Objasni zbog čega tražiš ponovno razmatranje…", "Explain why you are asking for another review…")} className="mt-2 w-full resize-y rounded-[8px] border-2 border-ink bg-paper-strong px-4 py-3 text-sm font-bold leading-6 focus:border-yellow focus:ring-4 focus:ring-yellow/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" />
            </label>
            <button type="button" disabled={pending || appeal.trim().length < 10} onClick={() => void sendAppeal()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black shadow-[3px_3px_0_0_var(--ink)] disabled:opacity-50">
              {pending ? <Spinner /> : <Send className="size-4" />}{t(locale, "Pošalji žalbu", "Send appeal")}
            </button>
            {error ? <p role="alert" className="mt-3 text-sm font-black text-red-700">{error}</p> : null}
          </div>
        )}
      </section>
    </main>
  );
}
