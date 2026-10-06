"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, Copy, Flame, Gift, Link2, Snowflake, UsersRound } from "lucide-react";
import { useState } from "react";

import { FOCUS } from "@/components/crea/community/crea-community-ui";
import { useBelgradeToday } from "@/components/crea/game/crea-game-context";
import { Button, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { INVITE_REWARD_CREDITS, INVITE_REWARDS_PER_MONTH } from "@/lib/crea-community";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_COMMUNITY_NAV, CREA_PAIR_COPY, communityErrorText } from "@/lib/crea-community-copy";
import type { StreakSummary } from "@/lib/crea-streak";
import { withLocale, type Locale } from "@/lib/i18n";

function blockText(block: string | null, locale: Locale): string | null {
  if (!block) return null;
  const copy = CREA_PAIR_COPY[block as keyof typeof CREA_PAIR_COPY];
  return copy ? copy[locale] : null;
}

function dateLabel(dayKey: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn-RS" : "en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${dayKey}T12:00:00Z`));
}

/** Zajednički niz para: broj i poslednje dve nedelje (dan važi kad su oboje radili). */
function PairStreak({ locale, streak }: { locale: Locale; streak: StreakSummary }) {
  return (
    <div className="surface-inset border border-line bg-paper p-3">
      <p className="inline-flex items-center gap-2 type-h3 tabular-nums">
        <Flame aria-hidden="true" className={cn("size-6", streak.todayDone && "fill-yellow")} />
        {fillCopy(CREA_PAIR_COPY.sharedStreak[locale], { n: streak.current })}
      </p>
      <ol aria-hidden="true" className="mt-2 flex flex-wrap gap-1">
        {streak.recent.map((day) => (
          <li
            key={day.dayKey}
            className={cn(
              "grid size-6 place-items-center rounded-full",
              day.state === "active" && "bg-ink text-paper-strong",
              day.state === "frozen" && "bg-surface-b text-ink",
              day.state === "missed" && "border border-line",
              day.state === "today" && "border border-dashed border-ink",
            )}
          >
            {day.state === "frozen" ? <Snowflake className="size-3" /> : day.state === "active" ? <Flame className="size-3 fill-yellow text-yellow" /> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Kreativni par u svesci (K27, G10): link za poziv, par sa zajedničkim nizom (dan važi
 * kad OBOJE nešto urade) i pozvani prijatelji - napredak (prva lekcija, prvi rad) i
 * nagrada pozivaocu.
 */
export function CreaPairPanel({ locale }: { locale: Locale }) {
  const todayKey = useBelgradeToday();
  const data = useQuery(api.creaPairs.myPair, { todayKey });
  return <PairView locale={locale} data={data} />;
}

/** Prikaz para i poziva bez upita. */
export function PairView({ locale, data }: { locale: Locale; data: FunctionReturnType<typeof api.creaPairs.myPair> | undefined }) {
  const ensureCode = useMutation(api.creaPairs.ensureInviteCode);
  const leave = useMutation(api.creaPairs.leavePair);
  const claim = useMutation(api.creaPairs.claimInviteReward);
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  if (data === undefined || data === null) {
    return (
      <p role="status" className="type-body font-bold text-muted">
        {CREA_COMMUNITY_NAV.loading[locale]}
      </p>
    );
  }

  // Putanja se prikazuje, a pun link (sa domenom) se pravi tek pri kopiranju - isti HTML na serveru i u pregledaču.
  const invitePath = data.inviteCode ? withLocale(locale, `/studio/poziv/${data.inviteCode}`) : null;

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (thrown) {
      setMessage({ kind: "error", text: communityErrorText(thrown, locale) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section aria-labelledby="crea-par" className="surface-card border-2 border-ink bg-paper-strong p-4 text-ink shadow-[6px_6px_0_0_var(--shadow-hard-16)] sm:p-5">
        <h2 id="crea-par" className="type-h2 inline-flex items-center gap-2">
          <UsersRound aria-hidden="true" className="size-6" />
          {CREA_PAIR_COPY.title[locale]}
        </h2>
        <p className="mt-1 type-body-sm font-semibold text-muted type-measure">{CREA_PAIR_COPY.subtitle[locale]}</p>

        <div className="mt-4 border-t border-line pt-4">
          <h3 className="type-body-sm font-black">{CREA_PAIR_COPY.inviteTitle[locale]}</h3>
          {invitePath ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="surface-inset min-h-11 max-w-full truncate border border-line bg-paper px-3 py-2.5 text-sm font-bold">{invitePath}</code>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`${window.location.origin}${invitePath}`);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  } catch {
                    setCopied(false);
                  }
                }}
                className={cn("inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink", FOCUS)}
              >
                {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
                {copied ? CREA_COMMUNITY_NAV.copied[locale] : CREA_COMMUNITY_NAV.copyLink[locale]}
              </button>
            </div>
          ) : (
            <Button tone="yellow" className="mt-2" disabled={busy} onClick={() => void act(() => ensureCode({}))}>
              <Link2 aria-hidden="true" className="size-4" />
              {CREA_PAIR_COPY.makeLink[locale]}
            </Button>
          )}
        </div>

        <div className="mt-4 border-t border-line pt-4">
          {data.pair ? (
            <div className="space-y-3">
              <p className="type-body font-black">
                {fillCopy(CREA_PAIR_COPY.partner[locale], { name: data.pair.partner?.name ?? "" })}{" "}
                <span className="text-sm font-bold text-muted">· {fillCopy(CREA_PAIR_COPY.since[locale], { date: dateLabel(data.pair.since, locale) })}</span>
              </p>
              <ul className="flex flex-wrap gap-2 text-sm font-black">
                {[
                  { label: CREA_PAIR_COPY.meToday[locale], done: data.pair.todayMe },
                  { label: fillCopy(CREA_PAIR_COPY.partnerToday[locale], { name: data.pair.partner?.name ?? "" }), done: data.pair.todayPartner },
                ].map((entry) => (
                  <li
                    key={entry.label}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1",
                      entry.done ? "border-ink bg-yellow text-ink" : "border-dashed border-ink bg-paper text-ink",
                    )}
                  >
                    {entry.done ? <Flame aria-hidden="true" className="size-4 fill-current" /> : null}
                    {entry.label}: {entry.done ? CREA_PAIR_COPY.done[locale] : CREA_PAIR_COPY.notYet[locale]}
                  </li>
                ))}
              </ul>
              <PairStreak locale={locale} streak={data.pair.streak} />
              {confirmLeave ? (
                <div role="alertdialog" aria-label={CREA_PAIR_COPY.leave[locale]} className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold">{CREA_PAIR_COPY.leaveConfirm[locale]}</p>
                  <Button tone="ink" disabled={busy} onClick={() => void act(async () => { await leave({}); setConfirmLeave(false); })}>
                    {CREA_PAIR_COPY.leave[locale]}
                  </Button>
                  <Button tone="paper" onClick={() => setConfirmLeave(false)}>
                    {CREA_PAIR_COPY.cancel[locale]}
                  </Button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmLeave(true)} className={cn("inline-flex min-h-11 items-center rounded-full px-2 text-sm font-black text-muted hover:text-ink", FOCUS)}>
                  {CREA_PAIR_COPY.leave[locale]}
                </button>
              )}
            </div>
          ) : (
            <p className="type-body-sm font-bold text-muted">{CREA_PAIR_COPY.noPair[locale]}</p>
          )}
        </div>
      </section>

      <section aria-labelledby="crea-pozivi" className="surface-card border-2 border-ink bg-paper-strong p-4 text-ink shadow-[4px_4px_0_0_var(--shadow-hard-14)] sm:p-5">
        <h2 id="crea-pozivi" className="type-h3 inline-flex items-center gap-2">
          <Gift aria-hidden="true" className="size-5" />
          {CREA_PAIR_COPY.invitesTitle[locale]}
        </h2>
        <p className="mt-1 text-sm font-semibold text-muted type-measure">
          {fillCopy(CREA_PAIR_COPY.rewardRule[locale], { n: INVITE_REWARD_CREDITS, max: INVITE_REWARDS_PER_MONTH })}
        </p>
        {data.invites.length === 0 ? (
          <p className="mt-3 type-body-sm font-bold text-muted">{CREA_PAIR_COPY.noInvites[locale]}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {data.invites.map((invite) => (
              <li key={invite.inviteId} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block type-body-sm font-black">{invite.friend}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5 text-xs font-black">
                    {[
                      { label: CREA_PAIR_COPY.firstLesson[locale], done: invite.lessonDone },
                      { label: CREA_PAIR_COPY.firstWork[locale], done: invite.workDone },
                    ].map((step) => (
                      <span key={step.label} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5", step.done ? "border-ink bg-surface-b" : "border-dashed border-ink/50 text-muted")}>
                        {step.done ? <Check aria-hidden="true" className="size-3" /> : null}
                        {step.label}
                      </span>
                    ))}
                  </span>
                </span>
                {invite.rewarded ? (
                  <span className="rounded-full border-2 border-ink bg-yellow px-3 py-1 text-xs font-black text-ink">
                    {fillCopy(CREA_PAIR_COPY.claimed[locale], { n: invite.rewardCredits })}
                  </span>
                ) : invite.block === null ? (
                  <Button
                    tone="yellow"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const result = await claim({ inviteId: invite.inviteId as Id<"creaInvites"> });
                        setMessage(
                          result.ok
                            ? { kind: "ok", text: fillCopy(CREA_PAIR_COPY.claimed[locale], { n: result.credits }) }
                            : { kind: "error", text: blockText(result.reason, locale) ?? CREA_COMMUNITY_NAV.error[locale] },
                        );
                      })
                    }
                  >
                    {fillCopy(CREA_PAIR_COPY.claim[locale], { n: INVITE_REWARD_CREDITS })}
                  </Button>
                ) : (
                  <span className="max-w-xs text-xs font-bold text-muted">{blockText(invite.block, locale)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {data.rewardProblem ? <p className="mt-2 text-xs font-bold text-muted">{blockText(data.rewardProblem, locale)}</p> : null}
      </section>
      {message ? (
        <p role={message.kind === "error" ? "alert" : "status"} className={cn("text-sm font-bold", message.kind === "error" ? "text-red-700 dark:text-red-300" : "text-ink")}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
