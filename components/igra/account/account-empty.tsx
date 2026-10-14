import { ArrowUp, Coins, KeyRound, Plus } from "lucide-react";
import Link from "next/link";

import { IgraArt } from "@/components/igra/igra-art";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { apiKeysContent, t, type Locale } from "@/lib/i18n";
import { CREDITS_NO_HISTORY, CREDITS_NO_PACKS } from "@/lib/studio-messages";

/**
 * Prazna stanja strana naloga (K19), prezentaciona: tekstovi i pozivi su isti kao pre
 * (`CREDITS_NO_*`, `apiKeysContent`), dobili su samo ilustraciju. Nijedan ne nudi kupovinu.
 */

export const CREDITS_PACKS_ANCHOR = "paketi";

/** Nijedan paket nije u prodaji. */
export function CreditsNoPacks({ locale }: { locale: Locale }) {
  return (
    <EmptyState
      className="mt-5"
      icon={Coins}
      art={<IgraArt id="prazno.uskoro" size="md" decorative />}
      title={CREDITS_NO_PACKS.title[locale]}
      body={CREDITS_NO_PACKS.body[locale]}
    />
  );
}

/** Istorija kredita je prazna. Veza vodi do paketa na istoj strani, kao i pre. */
export function CreditsNoHistory({ locale }: { locale: Locale }) {
  return (
    <EmptyState
      className="mt-5"
      icon={Coins}
      art={<IgraArt id="ikona.krediti" size="md" decorative />}
      title={CREDITS_NO_HISTORY.title[locale]}
      body={CREDITS_NO_HISTORY.body[locale]}
      action={
        <Link
          href={`#${CREDITS_PACKS_ANCHOR}`}
          className="igra-press igra-shadow inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-5 py-2.5 text-sm font-extrabold text-ink"
        >
          <ArrowUp className="size-4" />
          {CREDITS_NO_HISTORY.cta[locale]}
        </Link>
      }
    />
  );
}

/** Još nema nijednog API ključa. */
export function ApiKeysEmpty({ locale, onCreate }: { locale: Locale; onCreate: () => void }) {
  const copy = apiKeysContent[locale];
  return (
    <EmptyState
      icon={KeyRound}
      art={<IgraArt id="prazno.zakljucano" size="md" decorative />}
      title={copy.emptyTitle}
      body={copy.emptyBody}
      action={
        <Button icon={<Plus className="size-4" />} onClick={onCreate}>
          {copy.newKey}
        </Button>
      }
    />
  );
}

/** Nema odobrenih tema pomoći u izabranom opsegu. */
export function HelpTopicsEmpty({ locale }: { locale: Locale }) {
  return (
    <div className="surface-card grid justify-items-center gap-3 border border-dashed border-line p-6 text-center md:col-span-2">
      <IgraArt id="prazno.uskoro" size="md" decorative />
      <p className="text-sm font-bold text-muted">{t(locale, "Još nema odobrenih tema u ovom opsegu.", "There are no approved topics in this scope yet.")}</p>
    </div>
  );
}
