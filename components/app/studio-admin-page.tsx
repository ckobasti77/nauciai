"use client";

import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, Loader2, Power, XCircle } from "lucide-react";
import { useState } from "react";

import { Panel, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { HEARTBEAT_STALE_MS } from "@/convex/studioCore";
import { parsePriceRule } from "@/convex/studioPricing";
import { formatEur } from "@/lib/credits-value";
import { computeMargin, formatMargin, jobStatusLabel, marginTone } from "@/lib/studio-admin";
import { defaultMargin, isBaseUsdEditable, priceTable } from "@/lib/studio-catalog-admin";
import { parseStudioModel, type StudioModel } from "@/lib/studio-models";

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

const PROVIDER_LABELS: Record<string, string> = { fal: "fal", google: "Google", byteplus: "BytePlus" };

/**
 * Cena SVAKE kombinacije jednog modela. Ovo je poenta v4 kataloga: jedan broj
 * u pravilu pomera celu porodicu varijanti, pa admin mora da vidi šta se
 * pomerilo - a ne da veruje na reč jednom redu sa podrazumevanim izborom.
 *
 * Cifre idu kroz isti `computeCredits` kojim se posao naplaćuje; ovde se ništa
 * ne računa ručno.
 */
function PriceBreakdown({ model }: { model: StudioModel }) {
  const table = priceTable({
    paramSpec: model.paramSpec,
    priceRule: model.priceRule,
    inputModes: model.inputModes,
    capabilities: JSON.stringify(model.capabilities),
    locale: "sr",
  });

  if (table.rows.length === 0) {
    return (
      <p className="text-xs font-bold text-muted">
        Nijedna kombinacija nema cenu - proveri cenovno pravilo ovog reda.
      </p>
    );
  }

  return (
    <div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-[10px] font-black uppercase tracking-wide text-muted">
            <th className="pb-1 pr-3">Režim</th>
            <th className="pb-1 pr-3">Kombinacija</th>
            <th className="pb-1 pr-3">Nabavno</th>
            <th className="pb-1 pr-3">Krediti</th>
            <th className="pb-1">Marža</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={`${row.inputMode}:${row.label}`} className="align-top font-bold text-ink">
              <td className="py-0.5 pr-3 text-muted">{row.inputMode || "—"}</td>
              <td className="py-0.5 pr-3">{row.label || "podrazumevano"}</td>
              <td className="py-0.5 pr-3 font-mono">${row.costUsd.toFixed(4)}</td>
              <td className="py-0.5 pr-3 font-mono">{row.credits}</td>
              <td className={cn("py-0.5 font-mono", marginTone(row.margin) === "warn" && "text-red-700")}>
                {formatMargin(row.margin)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {table.hidden > 0 ? (
        <p className="mt-2 text-[11px] font-black text-amber-800">
          Prikazano je {table.rows.length} kombinacija, ima ih još {table.hidden}. Najmanja marža u
          CELOM prostoru je {formatMargin(table.worstMargin)}.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Zbir izmerenog troska jednog modela (W6). `undefined` je "jos nije ucitano",
 * a red sa `measuredJobs: 0` je "izmereno nula poslova" - dva razlicita stanja.
 */
type ModelCostRow = {
  modelSlug: string;
  measuredJobs: number;
  actualCostUsd: number;
  creditCost: number;
  /** Zasto poslovi ovog modela nemaju izmeren trosak, i koliko ih je po razlogu (X3). */
  reasons: Array<{ reason: string; jobs: number }>;
  unmeasuredJobs: number;
};

/**
 * STVARNA marza, iz `actualCostUsd`-a. Model bez ijednog merenja MORA da izgleda
 * drugacije od modela sa sto merenja - isprekidan okvir i "nema merenja" umesto
 * cifre. Ista `computeMargin` kao za procenu, samo nad zbirom izmerenog troska i
 * zbirom naplacenih kredita TIH ISTIH poslova.
 */
function ReasonList({ cost }: { cost: ModelCostRow | undefined }) {
  if (!cost || cost.reasons.length === 0) return null;

  return (
    <ul className="mt-1 space-y-0.5">
      {cost.reasons.map((row) => (
        <li key={row.reason} className="text-[11px] font-bold leading-tight text-muted">
          {row.reason} · {row.jobs}
        </li>
      ))}
    </ul>
  );
}

function ActualMarginCell({ cost }: { cost: ModelCostRow | undefined }) {
  if (!cost || cost.measuredJobs === 0) {
    return (
      <div>
        <span className="inline-flex min-h-7 items-center rounded-full border-2 border-dashed border-muted bg-white px-2.5 py-0.5 text-xs font-black text-muted">
          {cost && cost.unmeasuredJobs > 0
            ? `bez merenja / ${cost.unmeasuredJobs}`
            : "nema merenja"}
        </span>
        <ReasonList cost={cost} />
      </div>
    );
  }

  const margin = computeMargin(cost.creditCost, cost.actualCostUsd);
  const tone = marginTone(margin);

  return (
    <div>
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
        <span className="font-bold text-muted">
          / {cost.measuredJobs} {cost.measuredJobs === 1 ? "posao" : "poslova"}
        </span>
      </span>
      <ReasonList cost={cost} />
    </div>
  );
}

/** Jedan red v4 kataloga; razvija se u tabelu cena po kombinaciji. */
function CatalogRow({
  row,
  cost,
  onSetPrice,
  onSetEnabled,
}: {
  row: Doc<"models">;
  cost: ModelCostRow | undefined;
  onSetPrice: (args: { baseUsd?: number; addUsd?: number }) => Promise<unknown>;
  onSetEnabled: (isEnabled: boolean) => Promise<unknown>;
}) {
  const model = parseStudioModel(row);
  const rule = parsePriceRule(row.priceRule);
  const margin = model
    ? defaultMargin({
        paramSpec: model.paramSpec,
        priceRule: model.priceRule,
        inputModes: model.inputModes,
        capabilities: row.capabilities,
      })
    : null;
  const tone = marginTone(margin);
  const editable = rule !== null && isBaseUsdEditable(rule);

  return (
    <>
      <tr className="surface-inset border-2 border-ink bg-paper align-top text-sm">
        <td className="px-3 py-3 font-black text-ink">
          {row.labelSr}
          <p className="text-xs font-bold text-muted">{row.slug}</p>
        </td>
        <td className="px-3 py-3 font-bold text-ink">{PROVIDER_LABELS[row.provider] ?? row.provider}</td>
        <td className="px-3 py-3 font-bold text-ink">{KIND_LABELS[row.kind] ?? row.kind}</td>
        <td className="px-3 py-3">
          {editable ? (
            <InlineNumber
              value={rule.baseUsd ?? 0}
              min={0}
              step={0.001}
              onSave={(next) => onSetPrice({ baseUsd: next })}
            />
          ) : (
            <p className="text-xs font-bold text-muted">iz tabele (lookup)</p>
          )}
        </td>
        <td className="px-3 py-3">
          <InlineNumber
            value={rule?.addUsd ?? 0}
            min={0}
            step={0.001}
            onSave={(next) => onSetPrice({ addUsd: next })}
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
          <ActualMarginCell cost={cost} />
        </td>
        <td className="px-3 py-3">
          <TogglePill
            active={row.isEnabled}
            activeLabel="Uključen"
            inactiveLabel="Isključen"
            onToggle={() => onSetEnabled(!row.isEnabled)}
          />
        </td>
      </tr>
      <tr>
        <td colSpan={8} className="px-3 pb-3">
          {model ? (
            <details className="surface-inset border-2 border-ink bg-white p-3">
              <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-muted">
                Cena po kombinaciji
              </summary>
              <div className="mt-3">
                <PriceBreakdown model={model} />
              </div>
            </details>
          ) : (
            <p className="text-xs font-black text-red-700">
              Red se ne može pročitati - model se korisnicima ne nudi.
            </p>
          )}
        </td>
      </tr>
    </>
  );
}

function CatalogSection() {
  const models = useQuery(api.studioModels.listAllModels, {});
  const costs = useQuery(api.studioAdmin.getModelCostSummary, {});
  const setPrice = useMutation(api.studioModels.setModelPrice);
  const setEnabled = useMutation(api.studioModels.setModelEnabled);
  const costBySlug = new Map((costs ?? []).map((row) => [row.modelSlug, row]));

  return (
    <Panel className="p-6">
      <h2 className="text-2xl font-black text-ink">Katalog v4</h2>
      <p className="mt-2 text-sm font-bold text-muted">
        Marža je za podrazumevana podešavanja; ispod 2,0x je crvena. Izmena nabavne cene odmah
        pomera cenu SVAKE kombinacije - razvij red da vidiš koje. Stvarna marža je iz onoga što je
        provajder naplatio, uz broj poslova iz kojih je izračunata. Ispod nje stoji zašto ostali
        poslovi nemaju izmeren trošak i koliko ih je po razlogu: model se ne naplacuje po tokenima
        je očekivano stanje, a nepoznat oblik odgovora i nema tarife za kategoriju su posao za
        tebe.
      </p>

      {models === undefined ? (
        <div className="mt-5 flex min-h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      ) : models.length === 0 ? (
        <p className="surface-inset mt-5 border-2 border-ink bg-paper p-4 text-sm font-bold text-muted">
          Katalog je prazan. Pusti `npm run convex:seed`.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1020px] border-separate border-spacing-y-2 text-left">
            <thead>
              <tr className="text-xs font-black uppercase tracking-wide text-muted">
                <th className="px-3 pb-1">Model</th>
                <th className="px-3 pb-1">Provajder</th>
                <th className="px-3 pb-1">Tip</th>
                <th className="px-3 pb-1">baseUsd</th>
                <th className="px-3 pb-1">addUsd</th>
                <th className="px-3 pb-1">Marža</th>
                <th className="px-3 pb-1">Stvarna marža</th>
                <th className="px-3 pb-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {models.map((row: Doc<"models">) => (
                <CatalogRow
                  key={row._id}
                  row={row}
                  cost={costBySlug.get(row.slug)}
                  onSetPrice={(args) => setPrice({ modelId: row._id, ...args })}
                  onSetEnabled={(isEnabled) => setEnabled({ modelId: row._id, isEnabled })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function ModelsSection() {
  const models = useQuery(api.modelCatalog.listAllModels, {});
  const setCost = useMutation(api.modelCatalog.setModelCost);
  const setEnabled = useMutation(api.modelCatalog.setModelEnabled);

  return (
    <Panel className="p-6">
      <h2 className="text-2xl font-black text-ink">Stari katalog (modelCatalog)</h2>
      <p className="mt-2 text-sm font-bold text-muted">
        Modeli koji još nisu preseljeni u v4. Slug koji postoji i u v4 katalogu se naručuje po
        v4 pravilu - izmena cene ovde tada ne radi ništa.
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

/**
 * Heartbeat globalnog plafona (X6, nalaz N5): mrtav cron mora da se vidi i bez
 * mejla. Crveno je i odsutan red (deployment koji cron nikad nije pokrenuo) i
 * red stariji od `HEARTBEAT_STALE_MS` - cron se vrti na 15 minuta, pa je sat
 * vremena daleko iznad svakog pojedinačnog kašnjenja.
 */
function CronHealthBanner({
  now,
  heartbeatAt,
  failure,
}: {
  now: number;
  heartbeatAt: number | null;
  failure: { message: string } | null;
}) {
  const stale = heartbeatAt === null || now - heartbeatAt > HEARTBEAT_STALE_MS;
  const minutesAgo = heartbeatAt === null ? null : Math.round((now - heartbeatAt) / 60000);

  return (
    <div className="space-y-2">
      <p className={cn("text-xs font-black", stale ? "text-red-700" : "text-muted")}>
        Poslednja provera plafona:{" "}
        {minutesAgo === null
          ? "nikad"
          : minutesAgo <= 0
            ? "upravo sada"
            : `pre ${minutesAgo} min`}
      </p>
      {failure ? (
        <p className="surface-inset border-2 border-red-700 bg-red-50 p-3 text-xs font-bold text-red-800">
          Poslednji prolaz je danas pukao: {failure.message}
        </p>
      ) : null}
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

      {summary !== undefined ? (
        <div className="mt-3">
          <CronHealthBanner
            now={now}
            heartbeatAt={summary.costCapHeartbeatAt}
            failure={summary.costCapCronFailure}
          />
        </div>
      ) : null}

      {summary === undefined ? (
        <div className="mt-5 flex min-h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="surface-inset border-2 border-ink bg-paper p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted">Ukupan trošak danas</p>
            <p
              className={cn(
                "mt-1 font-display text-4xl leading-none",
                summary.totalCostUsd > summary.killUsd
                  ? "text-red-700"
                  : summary.totalCostUsd > summary.alarmUsd
                    ? "text-amber-800"
                    : "text-ink",
              )}
            >
              ${summary.totalCostUsd.toFixed(2)}
            </p>
            {/* Pragovi dolaze sa servera, iz iste konstante po kojoj se Studio
                gasi - prikaz ne sme da crta drugu liniju od stvarne. */}
            <p className="mt-1 text-xs font-bold text-muted">
              alarm na ${summary.alarmUsd} · gasi se na ${summary.killUsd}
            </p>
            <div
              className="surface-media mt-2 h-2 w-full overflow-hidden border-2 border-ink bg-white"
              role="img"
              aria-label={`Potrošeno ${summary.totalCostUsd.toFixed(2)} od ${summary.killUsd} dolara`}
            >
              <div
                className={cn(
                  "h-full",
                  summary.totalCostUsd > summary.alarmUsd ? "bg-red-500" : "bg-emerald-500",
                )}
                style={{ width: `${Math.min(100, (summary.totalCostUsd / summary.killUsd) * 100)}%` }}
              />
            </div>

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
            <p className="mt-3 text-xs font-black uppercase tracking-wide text-muted">Reaper</p>
            <p className="mt-1 text-sm font-bold text-ink">
              {summary.reapedToday === 0
                ? "Danas nijedan posao nije zaglavio."
                : `Danas refundirano zbog neodgovora: ${summary.reapedToday}`}
            </p>

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

      <CatalogSection />
      <ModelsSection />
      <PacksSection />
      <UsageSection />
    </div>
  );
}
