"use client";

import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, Loader2, Power, XCircle } from "lucide-react";
import { useState } from "react";

import { Panel, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatEur } from "@/lib/credits-value";
import { computeMargin, formatMargin, jobStatusLabel, marginTone } from "@/lib/studio-admin";

const inputClass =
  "min-h-9 w-24 rounded-[8px] border-2 border-ink bg-white px-2 text-sm font-bold text-ink outline-none transition focus:ring-4 focus:ring-yellow/35 disabled:cursor-not-allowed disabled:opacity-60";

const KIND_LABELS: Record<string, string> = { image: "Slika", video: "Video", audio: "Zvuk" };
const JOB_STATUSES = ["reserved", "running", "done", "failed", "refunded"] as const;

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-[11px] font-black text-red-700">{message}</p>;
}

/** Broj koji se čuva na blur/Enter; ne diže mutaciju dok je vrednost nepromenjena. */
function InlineNumber({
  value,
  min,
  step = 1,
  onSave,
}: {
  value: number;
  min?: number;
  step?: number;
  onSave: (next: number) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(String(value));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    const next = Number(draft);
    if (!Number.isFinite(next) || (min !== undefined && next < min)) {
      setDraft(String(value));
      setError(null);
      return;
    }
    if (next === value) return;
    setPending(true);
    setError(null);
    try {
      await onSave(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Čuvanje nije uspelo.");
      setDraft(String(value));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={min}
          step={step}
          value={draft}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          }}
          className={inputClass}
        />
        {pending ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted" /> : null}
      </div>
      <ErrorLine message={error} />
    </div>
  );
}

function InlineText({ value, onSave, placeholder }: { value: string; onSave: (next: string) => Promise<unknown>; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    if (draft === value) return;
    setPending(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Čuvanje nije uspelo.");
      setDraft(value);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          }}
          className={cn(inputClass, "w-48 font-mono text-xs")}
        />
        {pending ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted" /> : null}
      </div>
      <ErrorLine message={error} />
    </div>
  );
}

function TogglePill({
  active,
  activeLabel,
  inactiveLabel,
  onToggle,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  onToggle: () => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      await onToggle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nije uspelo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={pending}
        className={cn(
          "inline-flex min-h-8 items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-xs font-black disabled:opacity-60",
          active ? "bg-emerald-100 text-emerald-900" : "bg-white text-muted",
        )}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : active ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
        {active ? activeLabel : inactiveLabel}
      </button>
      <ErrorLine message={error} />
    </div>
  );
}

function ModelsSection() {
  const models = useQuery(api.modelCatalog.listAllModels, {});
  const setCost = useMutation(api.modelCatalog.setModelCost);
  const setEnabled = useMutation(api.modelCatalog.setModelEnabled);

  return (
    <Panel className="p-6">
      <h2 className="text-2xl font-black text-ink">Katalog modela</h2>
      <p className="mt-2 text-sm font-bold text-muted">
        Cena i marža su odmah vidljive svakom korisniku čim se ovde promene - nema deploy-a.
      </p>

      {models === undefined ? (
        <div className="mt-5 flex min-h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      ) : models.length === 0 ? (
        <p className="surface-inset mt-5 border-2 border-ink bg-paper p-4 text-sm font-bold text-muted">
          Katalog je prazan. Pusti `seedModelCatalog`.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-y-2 text-left">
            <thead>
              <tr className="text-xs font-black uppercase tracking-wide text-muted">
                <th className="px-3 pb-1">Model</th>
                <th className="px-3 pb-1">Tip</th>
                <th className="px-3 pb-1">Cena (kr)</th>
                <th className="px-3 pb-1">Nabavno ($)</th>
                <th className="px-3 pb-1">Marža</th>
                <th className="px-3 pb-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model: Doc<"modelCatalog">) => {
                const margin = computeMargin(model.creditCost, model.estimatedCostUsd);
                const tone = marginTone(margin);
                return (
                  <tr key={model._id} className="surface-inset border-2 border-ink bg-paper align-top text-sm">
                    <td className="px-3 py-3 font-black text-ink">
                      {model.labelSr}
                      <p className="text-xs font-bold text-muted">{model.slug}</p>
                    </td>
                    <td className="px-3 py-3 font-bold text-ink">{KIND_LABELS[model.kind] ?? model.kind}</td>
                    <td className="px-3 py-3">
                      <InlineNumber
                        value={model.creditCost}
                        min={0}
                        onSave={(next) => setCost({ modelId: model._id, creditCost: next })}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <InlineNumber
                        value={model.estimatedCostUsd}
                        min={0}
                        step={0.001}
                        onSave={(next) =>
                          setCost({ modelId: model._id, creditCost: model.creditCost, estimatedCostUsd: next })
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex min-h-7 items-center gap-1 rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-black",
                          tone === "warn" && "bg-red-100 text-red-800",
                          tone === "ok" && "bg-emerald-100 text-emerald-900",
                          tone === "unknown" && "bg-white text-muted",
                        )}
                      >
                        {tone === "warn" ? <AlertTriangle className="size-3.5" /> : null}
                        {formatMargin(margin)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <TogglePill
                        active={model.isEnabled}
                        activeLabel="Uključen"
                        inactiveLabel="Isključen"
                        onToggle={() => setEnabled({ modelId: model._id, isEnabled: !model.isEnabled })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function PacksSection() {
  const packs = useQuery(api.creditPacks.listAllPacks, {});
  const upsertPack = useMutation(api.creditPacks.upsertPack);
  const setActive = useMutation(api.creditPacks.setPackActive);

  async function savePriceId(pack: Doc<"creditPacks">, stripePriceId: string) {
    await upsertPack({
      slug: pack.slug,
      titleSr: pack.titleSr,
      titleEn: pack.titleEn,
      priceEurCents: pack.priceEurCents,
      credits: pack.credits,
      bonusPercent: pack.bonusPercent,
      stripePriceId: stripePriceId.trim() || undefined,
      kind: pack.kind,
      ...(pack.planTier ? { planTier: pack.planTier } : {}),
      sortOrder: pack.sortOrder,
      isActive: pack.isActive,
    });
  }

  return (
    <Panel className="p-6">
      <h2 className="text-2xl font-black text-ink">Paketi i planovi</h2>
      <p className="mt-2 text-sm font-bold text-muted">
        `stripePriceId` je jedino polje koje se stalno menja - upiši ga ovde umesto po Convex dashboardu.
      </p>

      {packs === undefined ? (
        <div className="mt-5 flex min-h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      ) : packs.length === 0 ? (
        <p className="surface-inset mt-5 border-2 border-ink bg-paper p-4 text-sm font-bold text-muted">
          Katalog je prazan. Pusti `seedCreditPacks`.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-y-2 text-left">
            <thead>
              <tr className="text-xs font-black uppercase tracking-wide text-muted">
                <th className="px-3 pb-1">Paket / plan</th>
                <th className="px-3 pb-1">Cena</th>
                <th className="px-3 pb-1">Krediti</th>
                <th className="px-3 pb-1">Bonus</th>
                <th className="px-3 pb-1">Stripe Price ID</th>
                <th className="px-3 pb-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {packs.map((pack: Doc<"creditPacks">) => (
                <tr key={pack._id} className="surface-inset border-2 border-ink bg-paper align-top text-sm">
                  <td className="px-3 py-3 font-black text-ink">
                    {pack.titleSr}
                    <p className="text-xs font-bold text-muted">
                      {pack.slug} · {pack.kind === "plan" ? "pretplata" : "jednokratno"}
                    </p>
                  </td>
                  <td className="px-3 py-3 font-bold text-ink">{formatEur(pack.priceEurCents, "sr")}</td>
                  <td className="px-3 py-3 font-bold text-ink">{pack.credits.toLocaleString("sr-RS")} kr</td>
                  <td className="px-3 py-3 font-bold text-ink">{pack.bonusPercent > 0 ? `+${pack.bonusPercent}%` : "—"}</td>
                  <td className="px-3 py-3">
                    <InlineText
                      value={pack.stripePriceId ?? ""}
                      placeholder="price_..."
                      onSave={(next) => savePriceId(pack, next)}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <TogglePill
                      active={pack.isActive}
                      activeLabel="Aktivan"
                      inactiveLabel="Ugašen"
                      onToggle={() => setActive({ packId: pack._id, isActive: !pack.isActive })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function KillSwitch() {
  const state = useQuery(api.studioAdmin.getKillSwitchState, {});
  const setEnabled = useMutation(api.studioAdmin.setStudioEnabled);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(enabled: boolean) {
    setPending(true);
    setError(null);
    try {
      await setEnabled({ enabled });
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nije uspelo.");
    } finally {
      setPending(false);
    }
  }

  if (state === undefined) {
    return (
      <div className="surface-inset flex min-h-16 items-center justify-center border-2 border-ink bg-paper p-4">
        <Loader2 className="size-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className={cn("surface-inset border-2 p-4", state.enabled ? "border-ink bg-paper" : "border-red-700 bg-red-50")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-ink">
            <Power className="size-4" />
            Studio je {state.enabled ? "UKLJUČEN" : "UGAŠEN"}
          </p>
          <p className="mt-1 text-xs font-bold text-muted">
            {state.enabled
              ? "Korisnici mogu da generišu. Gašenje je trenutno i pogađa sve korisnike odmah."
              : "Nijedna nova generacija se ne prihvata. Postojeće generacije ostaju vidljive."}
          </p>
        </div>

        {state.enabled && !confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-red-800 bg-white px-4 text-xs font-black text-red-800"
          >
            Ugasi Studio
          </button>
        ) : null}

        {!state.enabled ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => void apply(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black text-ink disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Ponovo uključi Studio
          </button>
        ) : null}
      </div>

      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t-2 border-red-800/30 pt-3">
          <p className="flex items-center gap-2 text-xs font-black text-red-800">
            <AlertTriangle className="size-4" />
            Sigurno? Svi korisnici odmah gube pristup Studiju.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => void apply(false)}
            className="inline-flex min-h-9 items-center gap-2 rounded-full border-2 border-red-800 bg-red-800 px-4 text-xs font-black text-white disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Potvrdi gašenje
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="inline-flex min-h-9 items-center gap-2 rounded-full border-2 border-ink bg-white px-4 text-xs font-black text-ink disabled:opacity-60"
          >
            Otkaži
          </button>
        </div>
      ) : null}

      <ErrorLine message={error} />
    </div>
  );
}

function UsageSection() {
  // Zamrznut "sad" - query nikad ne sme sam da čita sat (isti obrazac kao
  // credits-page.tsx i studio-gallery-page.tsx).
  const [now] = useState(() => Date.now());
  const summary = useQuery(api.studioAdmin.getUsageSummary, { now });

  return (
    <Panel className="p-6">
      <h2 className="text-2xl font-black text-ink">Potrošnja</h2>
      <p className="mt-2 text-sm font-bold text-muted">
        {summary ? `Danas, ${summary.day}` : "Danas"}
      </p>

      <div className="mt-5">
        <KillSwitch />
      </div>

      {summary === undefined ? (
        <div className="mt-5 flex min-h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="surface-inset border-2 border-ink bg-paper p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted">Ukupan trošak danas</p>
            <p className="mt-1 font-display text-4xl leading-none text-ink">${summary.totalCostUsd.toFixed(2)}</p>

            <p className="mt-4 text-xs font-black uppercase tracking-wide text-muted">Poslovi po statusu</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {JOB_STATUSES.map((status) => (
                <li
                  key={status}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-full border-2 border-ink bg-white px-3 py-1 text-xs font-black text-ink"
                >
                  {jobStatusLabel(status)}: {summary.jobCounts[status]}
                </li>
              ))}
            </ul>
            {summary.jobCountsCapped ? (
              <p className="mt-2 text-[11px] font-black text-amber-800">
                Broj poslova po statusu je odsečen na prikaz - stvarno je veći.
              </p>
            ) : null}
          </div>

          <div className="surface-inset border-2 border-ink bg-paper p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted">Top 10 korisnika po trošku</p>
            {summary.topUsers.length === 0 ? (
              <p className="mt-3 text-sm font-bold text-muted">Danas još niko nije generisao ništa.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {summary.topUsers.map((row) => (
                  <li
                    key={row.userId}
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink"
                  >
                    <span className="min-w-0 truncate">{row.name}</span>
                    <span className="shrink-0 font-mono">
                      ${row.costUsd.toFixed(2)} · {row.creditsSpent} kr · {row.generations}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {summary.usageRowsCapped ? (
              <p className="mt-2 text-[11px] font-black text-amber-800">
                Lista korisnika je odsečena na prikaz - stvarno ih je više.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </Panel>
  );
}

export function StudioAdminPage() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Administracija</p>
        <h1 className="mt-2 font-display text-5xl text-ink sm:text-6xl">Studio</h1>
      </header>

      <ModelsSection />
      <PacksSection />
      <UsageSection />
    </div>
  );
}
