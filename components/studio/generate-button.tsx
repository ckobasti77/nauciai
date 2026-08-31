"use client";

import { Coins, Wand2 } from "lucide-react";
import Link from "next/link";

import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import { generateButtonLabel } from "@/lib/studio-form";
import { generateBlockMessage, studioErrorMessage, type GenerateBlock } from "@/lib/studio-messages";

const PILL =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 px-5 py-2.5 text-sm font-extrabold transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Dugme za generisanje (STUDIO-CATALOG-V4 sekcija 6).
 *
 * `credits` MORA da dodje iz `computeCredits`-a nad istim objektom parametara
 * koji pozivalac šalje u `createJob` - komponenta namerno ne ume sama da
 * izračuna cenu, da druga računica ne bi mogla ni da nastane.
 *
 * Bez kredita dugme prestaje da bude dugme i postaje put do dopune; u svakom
 * drugom zaključanom stanju ostaje dugme sa rečenicom ispod koja kaže šta
 * fali. Greška iz `createJob`-a se nikad ne prikazuje kao kod.
 */
export function GenerateButton({
  locale,
  credits,
  block,
  isPending,
  onGenerate,
  topUpHref,
  error,
  notice,
}: {
  locale: Locale;
  /** `null` = cena još nije poznata (nedostaje merena količina ili kombinacija nema cenu). */
  credits: number | null;
  block: GenerateBlock | null;
  isPending: boolean;
  onGenerate: () => void;
  topUpHref: string;
  /** Sirova poruka poslednje greške `createJob`-a; prevodi se ovde. */
  error?: string | null;
  /** Objašnjenje uz CENU koja radi - ne razlog zbog kojeg dugme ne radi. */
  notice?: string | null;
}) {
  const message = block ? generateBlockMessage(block, locale) : null;

  if (block?.kind === "credits") {
    return (
      <div className="space-y-2">
        <Link
          href={topUpHref}
          className={cn(PILL, "border-ink bg-yellow text-ink shadow-[4px_4px_0_0_var(--ink)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[2px_2px_0_0_var(--ink)]")}
        >
          <Coins className="size-4" />
          {locale === "sr" ? "Dopuni kredite" : "Top up credits"}
        </Link>
        <p className="text-sm font-bold text-muted">{message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={isPending || block !== null || credits === null}
        onClick={onGenerate}
        className={cn(PILL, "border-ink bg-ink text-paper-strong shadow-[4px_4px_0_0_var(--yellow)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[2px_2px_0_0_var(--yellow)]")}
      >
        {isPending ? <Spinner /> : <Wand2 className="size-4" />}
        {credits === null
          ? locale === "sr"
            ? "Generiši"
            : "Generate"
          : generateButtonLabel(credits, locale)}
      </button>
      {message ? <p className="text-sm font-bold text-muted">{message}</p> : null}
      {notice ? <p className="text-sm font-bold text-muted">{notice}</p> : null}
      {error ? <p className="text-sm font-black text-red-700">{studioErrorMessage(error, locale)}</p> : null}
    </div>
  );
}
