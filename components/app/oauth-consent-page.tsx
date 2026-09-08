"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { Check, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { MCP_SCOPE_WRITE } from "@/convex/mcp/apiKey";
import { pickAuthorizeParams, signInUrlForAuthorize } from "@/convex/oauth/authorizeRequest";
import { oauthConsentContent, withLocale, type Locale } from "@/lib/i18n";

/**
 * Ekran pristanka (MCP-P4-OAUTH, tačka 4). Neprijavljen korisnik ide na
 * prijavu sa ISTIM parametrima u `next`; prijavljen vidi ime klijenta, host
 * povratka i tačno tražene opsege (pisanje uz upozorenje o kreditima), pa
 * bira „Dozvoli" (server izdaje kod i vraća redirect) ili „Odbij"
 * (`error=access_denied`). Redirect ide samo na URI koji je server proverio.
 */
export function OAuthConsentPage({ locale }: { locale: Locale }) {
  const t = oauthConsentContent[locale];
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useMemo(() => pickAuthorizeParams(searchParams), [searchParams]);
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const request = useQuery(api.oauth.server.describeAuthorizeRequest, isAuthenticated ? { params } : "skip");
  const approve = useMutation(api.oauth.server.approveAuthorization);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || isAuthenticated) return;
    const search = searchParams.toString();
    router.replace(signInUrlForAuthorize(locale, search === "" ? "" : `?${search}`));
  }, [authLoading, isAuthenticated, locale, router, searchParams]);

  // Neispravan zahtev sa PROVERENIM `redirect_uri` -> klijent dobija `error`
  // (OAuth 2.1). Za nepoznat klijent/URI `redirect` je `null` i ostaje se ovde.
  const errorRedirect = request !== undefined && !request.ok ? request.redirect : null;
  useEffect(() => {
    if (errorRedirect) window.location.assign(errorRedirect);
  }, [errorRedirect]);

  async function onApprove() {
    setBusy(true);
    setError(null);
    try {
      const result = await approve({ params });
      if (result.ok) {
        window.location.assign(result.redirect);

        return;
      }
      if (result.redirect) {
        window.location.assign(result.redirect);

        return;
      }
      setError(t.genericError);
    } catch {
      setError(t.genericError);
    } finally {
      setBusy(false);
    }
  }

  function onDeny() {
    if (request?.ok) window.location.assign(request.denyRedirect);
  }

  if (authLoading || !isAuthenticated || request === undefined) {
    return (
      <Panel className="flex min-h-40 items-center justify-center p-6">
        <Spinner size="md" label={t.loading} className="text-muted" />
      </Panel>
    );
  }

  if (!request.ok) {
    const message =
      request.code === "UNKNOWN_CLIENT"
        ? t.errorUnknownClient
        : request.code === "REDIRECT_NOT_REGISTERED"
          ? t.errorRedirect
          : t.errorInvalidRequest;

    return (
      <Panel className="p-6 sm:p-8">
        <p className="type-eyebrow text-muted">{t.eyebrow}</p>
        <h1 className="mt-2 type-h1 text-ink">{t.errorTitle}</h1>
        <p className="mt-3 type-body type-measure text-muted">{message}</p>
        {request.redirect ? (
          <p className="mt-4 type-body-sm font-bold text-muted">{t.redirecting}</p>
        ) : (
          <Link
            href={withLocale(locale)}
            className="mt-6 inline-flex min-h-11 items-center rounded-full text-sm font-extrabold text-ink underline focus-visible:outline-2 outline-offset-2 outline-ink"
          >
            {t.backHome}
          </Link>
        )}
      </Panel>
    );
  }

  const wantsWrite = request.scopes.includes(MCP_SCOPE_WRITE);

  return (
    // Jedan okvir na celoj kartici; sekcije razdvaja `--line` crta, ne drugi okvir.
    <Panel className="overflow-hidden">
      <div className="px-6 py-6 sm:px-8">
        <p className="type-eyebrow text-muted">{t.eyebrow}</p>
        <h1 className="mt-2 type-h1 text-ink">{t.title(request.clientName)}</h1>
        <p className="mt-3 type-body type-measure text-muted">{t.body}</p>
        <dl className="mt-5 grid gap-1.5 type-body-sm">
          {request.email ? (
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-bold text-muted">{t.signedInAs}</dt>
              <dd className="font-black text-ink">{request.email}</dd>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-bold text-muted">{t.redirectsTo}</dt>
            {/* Pun URI, ne samo host: korisnik vidi tačno kuda ide (P4b). */}
            <dd className="min-w-0 break-all font-mono font-bold text-ink">{request.redirectUri}</dd>
          </div>
        </dl>
      </div>

      <div className="border-t border-line px-6 py-5 sm:px-8">
        <h2 className="type-body-sm font-black text-ink">{t.scopesLabel}</h2>
        <ul className="mt-1 divide-y divide-line">
          {request.scopes.map((scope) => {
            const write = scope === MCP_SCOPE_WRITE;

            return (
              <li key={scope} className="flex items-start gap-3 py-3">
                <Badge size="sm" tone={write ? "yellow" : "neutral"} className="mt-0.5 shrink-0">
                  {scope}
                </Badge>
                <span className="min-w-0">
                  <span className="block type-body-sm font-black text-ink">{write ? t.scopeWriteTitle : t.scopeReadTitle}</span>
                  <span className="mt-0.5 block type-caption font-semibold text-muted">
                    {write ? t.scopeWriteBody : t.scopeReadBody}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        {wantsWrite ? (
          <p role="note" className="mt-2 flex items-start gap-2 rounded-[12px] bg-yellow/30 px-4 py-3 type-body-sm font-bold text-ink">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{t.writeWarning}</span>
          </p>
        ) : null}
      </div>

      <div className="border-t border-line px-6 py-5 sm:px-8">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onDeny} disabled={busy} icon={<X className="size-4" />}>
            {t.deny}
          </Button>
          <Button onClick={onApprove} loading={busy} icon={<Check className="size-4" />}>
            {t.approve}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mt-3 type-caption font-black text-red-700">
            {error}
          </p>
        ) : null}
        <p className="mt-4 type-caption font-semibold text-muted">{t.revokeHint}</p>
      </div>
    </Panel>
  );
}
