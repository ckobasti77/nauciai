"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { UsersRound } from "lucide-react";
import { useState } from "react";

import { CreaLogo } from "@/components/crea/crea-logo";
import { Button, LinkButton, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_COMMUNITY_NAV, CREA_INVITE_COPY, communityErrorText } from "@/lib/crea-community-copy";
import { withLocale, type Locale } from "@/lib/i18n";

/**
 * Stranica poziva `/crea/poziv/<kod>` (K27, G10): čiji je poziv i šta znači. Gost bira
 * nalog (pa se vraća ovde), prijavljen prihvata - poziv se beleži, a par nastaje ako
 * nijedno od vas nema drugi par.
 */
export function CreaInviteLanding({ locale, code }: { locale: Locale; code: string }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const invite = useQuery(api.creaPairs.inviteByCode, { code });
  const accept = useMutation(api.creaPairs.acceptInvite);
  const [result, setResult] = useState<{ paired: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const here = withLocale(locale, `/studio/poziv/${code}`);
  const notebookHref = `${withLocale(locale, "/studio/sveska")}?deo=par`;

  if (invite === undefined || isLoading) {
    return (
      <p role="status" className="mx-auto max-w-2xl type-body font-bold text-muted">
        {CREA_COMMUNITY_NAV.loading[locale]}
      </p>
    );
  }
  if (invite === null || invite.inviter === null) {
    return (
      <section className="surface-card mx-auto max-w-2xl border-2 border-ink bg-paper-strong p-6 text-center text-ink shadow-[6px_6px_0_0_var(--shadow-hard-16)]">
        <p className="type-h3">{CREA_INVITE_COPY.notFound[locale]}</p>
        <LinkButton href={withLocale(locale, "/studio")} tone="yellow" className="mt-4">
          Crea
        </LinkButton>
      </section>
    );
  }

  const name = invite.inviter.name;
  const viewer = invite.viewer;
  return (
    <section className="surface-card mx-auto max-w-2xl border-2 border-ink bg-paper-strong p-6 text-ink shadow-[6px_6px_0_0_var(--shadow-hard-16)] sm:p-8">
      <div className="flex items-center gap-3">
        <CreaLogo variant="znak" className="size-12 shrink-0" />
        <span className="grid size-12 place-items-center rounded-full bg-yellow text-ink">
          <UsersRound aria-hidden="true" className="size-6" />
        </span>
      </div>
      <h1 className="mt-4 type-h1">{fillCopy(CREA_INVITE_COPY.title[locale], { name })}</h1>
      <p className="mt-2 type-body font-semibold text-muted type-measure">{CREA_INVITE_COPY.body[locale]}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!isAuthenticated ? (
          <LinkButton href={`${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(here)}`} tone="yellow" size="lg">
            {CREA_INVITE_COPY.signUp[locale]}
          </LinkButton>
        ) : viewer?.isInviter ? (
          <p className="type-body font-black">{CREA_INVITE_COPY.isInviter[locale]}</p>
        ) : result || viewer?.pairedTogether ? (
          <>
            <p role="status" className="type-body font-black">
              {result && !result.paired ? CREA_INVITE_COPY.acceptedNoPair[locale] : viewer?.pairedTogether && !result ? CREA_INVITE_COPY.pairedTogether[locale] : CREA_INVITE_COPY.accepted[locale]}
            </p>
            <LinkButton href={notebookHref} tone="ink">
              {CREA_INVITE_COPY.openNotebook[locale]}
            </LinkButton>
          </>
        ) : (
          <>
            <Button
              tone="yellow"
              size="lg"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  setResult(await accept({ code }));
                } catch (thrown) {
                  setError(communityErrorText(thrown, locale));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {CREA_INVITE_COPY.accept[locale]}
            </Button>
            {viewer?.hasOtherPair ? <p className="text-sm font-bold text-muted">{CREA_INVITE_COPY.hasOtherPair[locale]}</p> : null}
            {viewer?.inviterHasOtherPair ? <p className="text-sm font-bold text-muted">{fillCopy(CREA_INVITE_COPY.inviterHasOtherPair[locale], { name })}</p> : null}
          </>
        )}
      </div>
      {error ? (
        <p role="alert" className={cn("mt-3 text-sm font-bold text-red-700 dark:text-red-300")}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
