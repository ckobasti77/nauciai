"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";

import { IgraState } from "@/components/igra/igra-state";
import { useOnline } from "@/components/igra/use-online";
import { normalizeLocale } from "@/lib/i18n";
import { igraErrorVariant } from "@/lib/igra-state";

/**
 * Telo `error.tsx` granice greške unutar aplikacije (K23). Bez veze prikazuje `offline`
 * umesto `greska`; uz vezu ide tekst strane (`title`/`body`) ako ga ima. Jezik se čita iz
 * ruta jer granica greške ne dobija `params`.
 */
export function IgraErrorState({
  error,
  reset,
  title,
  body,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: { sr: string; en: string };
  body?: { sr: string; en: string };
}) {
  const params = useParams<{ locale?: string }>();
  const locale = normalizeLocale(params?.locale);
  const online = useOnline();
  const variant = igraErrorVariant(online);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <IgraState
      page
      variant={variant}
      locale={locale}
      title={variant === "greska" ? title?.[locale] : undefined}
      body={variant === "greska" ? body?.[locale] : undefined}
      onRetry={reset}
    />
  );
}
