"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { CircleAlert, Loader2, Send } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Locale } from "@/lib/i18n";

function labelFor(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr : en;
}

function formatEnd(locale: Locale, endsAt?: number, permanent?: boolean) {
  if (permanent || !endsAt) return labelFor(locale, "Trajna suspenzija", "Permanent suspension");
  return new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : "en", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(endsAt));
}

export function SuspensionGate({ locale, children }: { locale: Locale; children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const suspension = useQuery(api.chatModeration.getMySuspension, isAuthenticated ? {} : "skip");
  const submitAppeal = useMutation(api.chatModeration.submitSuspensionAppeal);
  const [appeal, setAppeal] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading || (isAuthenticated && suspension === undefined)) {
    return <div className="grid min-h-screen place-items-center bg-paper"><Loader2 className="size-8 animate-spin text-ink" aria-label={labelFor(locale, "Provera naloga", "Checking account")} /></div>;
  }
  if (!isAuthenticated || suspension === null || suspension === undefined) return children;
  const activeSuspension = suspension;

  async function sendAppeal() {
    if (!appeal.trim()) return;
    setPending(true);
    setError(null);
    try {
      await submitAppeal({ suspensionId: activeSuspension.suspensionId, body: appeal });
      setAppeal("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labelFor(locale, "Žalba nije poslata.", "The appeal was not sent."));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-paper p-4 text-ink">
      <section aria-labelledby="suspension-title" className="w-full max-w-2xl rounded-[16px] border-2 border-ink bg-white p-5 shadow-[7px_7px_0_0_#f4be30] sm:p-8">
        <span className="grid size-12 place-items-center rounded-full border-2 border-ink bg-yellow"><CircleAlert className="size-6" /></span>
        <p className="mt-5 text-xs font-black uppercase tracking-wide text-red-700">{labelFor(locale, "Nalog je suspendovan", "Account suspended")}</p>
        <h1 id="suspension-title" className="mt-1 text-3xl font-black leading-tight">{formatEnd(locale, activeSuspension.endsAt, activeSuspension.permanent)}</h1>
        <div className="mt-5 rounded-[16px] border-2 border-line bg-paper p-4">
          <p className="text-xs font-black uppercase text-muted">{labelFor(locale, "Razlog", "Reason")}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6">{activeSuspension.reason}</p>
        </div>

        {activeSuspension.appeal ? (
          <div className="mt-5 rounded-[16px] border-2 border-[#70a7cf] bg-[#eef6fb] p-4">
            <p className="text-xs font-black uppercase text-[#2e6f9f]">{labelFor(locale, "Tvoja žalba", "Your appeal")} · {activeSuspension.appeal.status}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6">{activeSuspension.appeal.body}</p>
            {activeSuspension.appeal.response ? <div className="mt-3 border-t-2 border-[#b9d3e8] pt-3"><p className="text-xs font-black uppercase text-[#2e6f9f]">{labelFor(locale, "Odgovor", "Response")}</p><p className="mt-1 text-sm font-bold leading-6">{activeSuspension.appeal.response}</p></div> : null}
          </div>
        ) : (
          <div className="mt-5">
            <label className="block text-sm font-black">
              {labelFor(locale, "Jedina žalba", "One appeal")}
              <textarea value={appeal} onChange={(event) => setAppeal(event.target.value)} maxLength={2_000} rows={5} placeholder={labelFor(locale, "Objasni zbog čega tražiš ponovno razmatranje…", "Explain why you are asking for another review…")} className="mt-2 w-full resize-y rounded-[8px] border-2 border-ink bg-white px-4 py-3 text-sm font-bold leading-6 outline-none focus:border-yellow focus:ring-4 focus:ring-yellow/25" />
            </label>
            <button type="button" disabled={pending || appeal.trim().length < 10} onClick={() => void sendAppeal()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black shadow-[3px_3px_0_0_#0e3158] disabled:opacity-50">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{labelFor(locale, "Pošalji žalbu", "Send appeal")}
            </button>
            {error ? <p role="alert" className="mt-3 text-sm font-black text-red-700">{error}</p> : null}
          </div>
        )}
      </section>
    </main>
  );
}
