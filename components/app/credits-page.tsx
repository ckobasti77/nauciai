"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { ArrowUp, Coins, CreditCard, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Panel, SectionHeader, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import {
  bestPackCreditsWithin,
  expiringSoon,
  formatEur,
  imageGenerationsLabel,
  packValueLine,
  referenceCreditCosts,
  signedAmount,
  transactionTypeLabel,
  unitsFor,
  type CreditTransactionType,
} from "@/lib/credits-value";
import { withLocale, type Locale } from "@/lib/i18n";
import { CREDITS_NO_BALANCE, CREDITS_NO_HISTORY, CREDITS_NO_PACKS } from "@/lib/studio-messages";

const PACKS_ANCHOR = "paketi";

function formatDate(timestamp: number, locale: Locale) {
  return new Date(timestamp).toLocaleDateString(locale === "sr" ? "sr-RS" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Jedno dugme za obe Stripe rute. Cena stoji u `label`-u i nikad se ne skriva;
 * `unavailableLabel` je jedini način da dugme bude ugašeno - paket bez
 * `stripePriceId` ne sme da obori stranicu, samo da se ne može kupiti.
 */
function CheckoutAction({
  locale,
  endpoint,
  payload,
  label,
  tone = "ink",
  unavailableLabel,
}: {
  locale: Locale;
  endpoint: string;
  payload: Record<string, string>;
  label: string;
  tone?: "ink" | "yellow";
  unavailableLabel?: string;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const buttonClass = cn(
    "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 px-5 py-2.5 text-sm font-extrabold transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60",
    tone === "ink" && "border-ink bg-ink text-paper-strong shadow-[4px_4px_0_0_var(--yellow)] hover:-translate-y-0.5",
    tone === "yellow" && "border-ink bg-yellow text-ink shadow-[4px_4px_0_0_var(--ink)] hover:-translate-y-0.5",
  );

  async function startCheckout() {
    setIsPending(true);
    setError(null);
    setErrorCode(null);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, locale }),
    });
    const data = await response.json();
    setIsPending(false);

    if (!response.ok || !data.url) {
      setError(data.error ?? (locale === "sr" ? "Kupovina trenutno ne radi. Sačekaj koji minut pa pokušaj ponovo - ništa ti nije naplaćeno." : "Checkout is not working right now. Wait a minute and try again - you have not been charged."));
      setErrorCode(data.code ?? null);
      return;
    }

    window.location.href = data.url;
  }

  if (unavailableLabel) {
    return (
      <button type="button" disabled className={buttonClass}>
        <CreditCard className="size-4" />
        {unavailableLabel}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={startCheckout} disabled={isPending} className={buttonClass}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
        {label}
      </button>
      {error ? (
        <div className="text-sm font-bold text-red-700">
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

export function CreditsPage({ locale }: { locale: Locale }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  // Prozor isteka je 30 dana, pa je "sad" zamrznut na prvom renderu dovoljan -
  // i drži render čistim, jer `Date.now()` u telu komponente nije dozvoljen.
  const [renderedAt] = useState(() => Date.now());
  const balance = useQuery(api.credits.getBalance, isAuthenticated ? {} : "skip");
  const lots = useQuery(api.credits.getLots, isAuthenticated ? {} : "skip");
  const packs = useQuery(api.creditPacks.listPacks, {});
  const models = useQuery(api.modelCatalog.listModels, {});
  const transactions = usePaginatedQuery(
    api.credits.getTransactions,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 10 },
  );

  const header = (
    <SectionHeader
      title={locale === "sr" ? "Krediti" : "Credits"}
      body={
        locale === "sr"
          ? "Kredit je bod kojim se plaća svaka slika, video ili zvuk koji napraviš u Studiju. Kupuju se jednom, važe 12 meseci i ne propadaju na kraju meseca."
          : "A credit is a point that pays for every image, video or sound you make in the Studio. Bought once, valid for 12 months, and they never expire at the end of a month."
      }
    />
  );

  if (authLoading) {
    return (
      <div className="space-y-6">
        {header}
        <Panel className="flex min-h-32 items-center justify-center p-6">
          <Loader2 className="size-5 animate-spin text-muted" />
        </Panel>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        {header}
        <Panel className="p-6">
          <p className="text-base font-bold text-muted">
            {locale === "sr"
              ? "Prijavi se da bi video/la koliko kredita imaš i mogao/la da kupiš još."
              : "Sign in to see how many credits you have and to buy more."}
          </p>
          <Link
            href={withLocale(locale, "/sign-in")}
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-ink px-5 py-2.5 text-sm font-extrabold text-paper-strong shadow-[4px_4px_0_0_var(--yellow)] transition hover:-translate-y-0.5"
          >
            {locale === "sr" ? "Prijavi se" : "Sign in"}
          </Link>
        </Panel>
      </div>
    );
  }

  const reference = referenceCreditCosts(models ?? []);
  const creditPacks = (packs ?? []).filter((pack) => pack.kind === "pack");
  const premium = (packs ?? []).find((pack) => pack.kind === "plan" && pack.planTier === "premium");
  const premiumPackCredits = premium ? bestPackCreditsWithin(packs ?? [], premium.priceEurCents) : null;
  const expiring = expiringSoon(lots ?? [], renderedAt);
  const currentBalance = balance?.balance ?? 0;
  const imageGenerations = unitsFor(currentBalance, reference.image);

  return (
    <div className="space-y-6">
      {header}

      {/* Balans. `useQuery` je pretplata, pa broj skoči sam čim webhook upiše lot. */}
      <Panel className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-muted">
              {locale === "sr" ? "Koliko kredita imaš" : "How many credits you have"}
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <span className="font-display text-6xl leading-none text-ink">
                {balance === undefined
                  ? "—"
                  : currentBalance.toLocaleString(locale === "sr" ? "sr-RS" : "en-US")}
              </span>
              <span className="text-lg font-black text-ink">{locale === "sr" ? "kredita" : "credits"}</span>
              {imageGenerations > 0 ? (
                <span className="text-sm font-bold text-muted">
                  ≈ {imageGenerationsLabel(imageGenerations, locale)}
                </span>
              ) : null}
            </div>
          </div>
          {balance !== undefined && currentBalance === 0 ? (
            <Link
              href={`#${PACKS_ANCHOR}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 py-2.5 text-sm font-extrabold text-ink shadow-[4px_4px_0_0_var(--ink)] transition hover:-translate-y-0.5"
            >
              <Coins className="size-4" />
              {CREDITS_NO_BALANCE.cta[locale]}
            </Link>
          ) : null}
        </div>

        {balance !== undefined && currentBalance === 0 ? (
          <p className="mt-4 text-base font-bold text-muted">{CREDITS_NO_BALANCE.body[locale]}</p>
        ) : null}

        {expiring.map((row) => (
          <p key={row.expiresAt} className="mt-4 text-sm font-black text-amber-900">
            {locale === "sr"
              ? `${row.credits} kredita ističe ${formatDate(row.expiresAt, locale)}`
              : `${row.credits} credits expire on ${formatDate(row.expiresAt, locale)}`}
          </p>
        ))}
      </Panel>

      {/* Paketi kredita: jednokratna kupovina kroz /api/stripe/credits. */}
      <Panel id={PACKS_ANCHOR} className="p-6">
        <h3 className="text-2xl font-black text-ink">{locale === "sr" ? "Paketi kredita" : "Credit packs"}</h3>
        <p className="mt-2 text-base font-bold text-muted">
          {locale === "sr"
            ? "Plaćaš jednom, bez pretplate. Krediti se pojave na nalogu čim banka potvrdi uplatu - obično za par sekundi."
            : "You pay once, with no subscription. The credits appear on your account as soon as the payment is confirmed - usually within seconds."}
        </p>

        {packs === undefined ? (
          <div className="mt-5 flex min-h-24 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted" />
          </div>
        ) : creditPacks.length === 0 ? (
          <p className="surface-inset mt-5 border-2 border-ink bg-paper p-4 text-sm font-bold text-muted">
            {CREDITS_NO_PACKS.body[locale]}
          </p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {creditPacks.map((pack) => {
              const value = packValueLine(pack.credits, reference, locale);
              return (
                <div
                  key={pack.slug}
                  className="surface-inset flex flex-col gap-3 border-2 border-ink bg-paper p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-lg font-black text-ink">
                      {locale === "sr" ? pack.titleSr : pack.titleEn}
                    </p>
                    {pack.bonusPercent > 0 ? (
                      <span className="rounded-full border-2 border-ink bg-yellow px-2.5 py-0.5 text-xs font-black text-ink">
                        +{pack.bonusPercent}%
                      </span>
                    ) : null}
                  </div>
                  <p className="font-display text-3xl leading-none text-ink">
                    {formatEur(pack.priceEurCents, locale)}
                  </p>
                  <p className="text-base font-extrabold text-ink">
                    {pack.credits.toLocaleString(locale === "sr" ? "sr-RS" : "en-US")}{" "}
                    {locale === "sr" ? "kredita" : "credits"}
                  </p>
                  {value ? <p className="text-sm font-bold text-muted">{value}</p> : null}
                  <div className="mt-auto pt-1">
                    <CheckoutAction
                      locale={locale}
                      endpoint="/api/stripe/credits"
                      payload={{ packSlug: pack.slug }}
                      tone="yellow"
                      label={`${locale === "sr" ? "Kupi" : "Buy"} - ${formatEur(pack.priceEurCents, locale)}`}
                      unavailableLabel={
                        pack.stripePriceId ? undefined : locale === "sr" ? "Uskoro" : "Coming soon"
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Premium plan: pretplata, odvojena od paketa i vizuelno istaknuta. */}
      {premium ? (
        <Panel className="border-4 bg-yellow/25 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-yellow px-3 py-1 text-xs font-black uppercase text-ink">
                <Sparkles className="size-4" />
                {locale === "sr" ? "Pretplata" : "Subscription"}
              </span>
              <p className="mt-3 font-display text-4xl leading-none text-ink">
                {locale === "sr" ? premium.titleSr : premium.titleEn}
              </p>
              <p className="mt-2 text-lg font-black text-ink">
                {formatEur(premium.priceEurCents, locale)}
                {locale === "sr" ? " / mesečno" : " / month"}
              </p>
              <ul className="mt-3 space-y-1 text-base font-bold text-ink">
                <li>
                  {locale === "sr"
                    ? `${premium.credits.toLocaleString("sr-RS")} kredita svakog ciklusa`
                    : `${premium.credits.toLocaleString("en-US")} credits every cycle`}
                </li>
                <li>{locale === "sr" ? "Pristup Pro lekcijama" : "Access to Pro lessons"}</li>
              </ul>
              {premiumPackCredits !== null ? (
                <p className="mt-3 text-sm font-black text-ink">
                  {locale === "sr"
                    ? `Isti novac u paketu daje ${premiumPackCredits.toLocaleString("sr-RS")} kredita.`
                    : `The same money in a pack gives ${premiumPackCredits.toLocaleString("en-US")} credits.`}
                </p>
              ) : null}
            </div>
            <div className="lg:w-64">
              <CheckoutAction
                locale={locale}
                endpoint="/api/stripe/plan"
                payload={{ planSlug: premium.slug }}
                label={`${locale === "sr" ? "Pretplati se" : "Subscribe"} - ${formatEur(premium.priceEurCents, locale)}${locale === "sr" ? "/mes" : "/mo"}`}
                unavailableLabel={
                  premium.stripePriceId ? undefined : locale === "sr" ? "Uskoro" : "Coming soon"
                }
              />
            </div>
          </div>
        </Panel>
      ) : null}

      {/* Istorija. */}
      <Panel className="p-6">
        <h3 className="text-2xl font-black text-ink">
          {locale === "sr" ? "Istorija kredita" : "Credit history"}
        </h3>
        <p className="mt-2 text-base font-bold text-muted">
          {locale === "sr"
            ? "Svaka kupovina i svaka potrošnja, od najnovije."
            : "Every purchase and every spend, newest first."}
        </p>

        {transactions.status === "LoadingFirstPage" ? (
          <div className="mt-5 flex min-h-24 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted" />
          </div>
        ) : transactions.results.length === 0 ? (
          <div className="surface-inset mt-5 border-2 border-ink bg-paper p-5">
            <p className="text-lg font-black text-ink">{CREDITS_NO_HISTORY.title[locale]}</p>
            <p className="mt-1 text-base font-bold text-muted">{CREDITS_NO_HISTORY.body[locale]}</p>
            <Link
              href={`#${PACKS_ANCHOR}`}
              className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-5 py-2.5 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5"
            >
              <ArrowUp className="size-4" />
              {CREDITS_NO_HISTORY.cta[locale]}
            </Link>
          </div>
        ) : (
          <>
            <ul className="mt-5 space-y-2">
              {transactions.results.map((transaction) => (
                <li
                  key={transaction._id}
                  className="surface-inset flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-2 border-ink bg-paper px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-black text-ink">
                      {transactionTypeLabel(transaction.type as CreditTransactionType, locale)}
                      {/* Galerija (A13) još ne postoji, pa je veza sa generacijom
                          namerno tekst - link bi vodio na 404. */}
                      {transaction.jobId ? (
                        <span className="ml-2 text-xs font-bold text-muted">
                          {locale === "sr" ? "potrošeno u Studiju" : "spent in the Studio"}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs font-bold text-muted">{formatDate(transaction.createdAt, locale)}</p>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <span
                      className={cn(
                        "font-mono text-base font-black",
                        transaction.amount > 0 ? "text-[#0f7b4f]" : "text-ink",
                      )}
                    >
                      {signedAmount(transaction.amount)}
                    </span>
                    <span className="font-mono text-xs font-bold text-muted">
                      {locale === "sr" ? "stanje posle" : "left after"} {transaction.balanceAfter}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {transactions.status === "CanLoadMore" || transactions.status === "LoadingMore" ? (
              <button
                type="button"
                onClick={() => transactions.loadMore(10)}
                disabled={transactions.status === "LoadingMore"}
                className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-5 py-2.5 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {transactions.status === "LoadingMore" ? <Loader2 className="size-4 animate-spin" /> : null}
                {locale === "sr" ? "Prikaži još" : "Show more"}
              </button>
            ) : null}
          </>
        )}
      </Panel>
    </div>
  );
}
