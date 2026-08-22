"use client";

import { MessageCircleWarning, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";

export default function MessagesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const english = params.locale === "en";

  return (
    <div className="grid min-h-[60vh] place-items-center p-4">
      <section role="alert" className="w-full max-w-lg rounded-[16px] border-2 border-ink bg-paper-strong p-7 text-center shadow-[6px_6px_0_0_var(--yellow)]">
        <span className="mx-auto grid size-14 place-items-center rounded-full border-2 border-ink bg-[#d7e9f5] dark:bg-ink/15">
          <MessageCircleWarning className="size-6" />
        </span>
        <h1 className="mt-4 text-2xl font-black text-ink">{english ? "Messages could not be loaded" : "Poruke nisu učitane"}</h1>
        <p className="mt-2 text-sm font-bold leading-6 text-muted">
          {english ? "Your data is safe. Check your connection and try again." : "Tvoji podaci su bezbedni. Proveri vezu i pokušaj ponovo."}
        </p>
        <button type="button" onClick={reset} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black">
          <RefreshCw className="size-4" />
          {english ? "Try again" : "Pokušaj ponovo"}
        </button>
      </section>
    </div>
  );
}
