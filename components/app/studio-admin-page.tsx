"use client";

import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, Loader2, Power, ShieldAlert, XCircle } from "lucide-react";
import { useState } from "react";

import { Panel, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { HEARTBEAT_STALE_MS } from "@/convex/studioCore";
import { parsePriceRule } from "@/convex/studioPricing";
import { formatEur } from "@/lib/credits-value";
import type { Locale } from "@/lib/i18n";
import {
  actualCostReasonLabel,
  computeMargin,
  costOriginLabel,
  formatMargin,
  jobStatusLabel,
  marginTone,
  modelCostOrigin,
} from "@/lib/studio-admin";
import { defaultMargin, isBaseUsdEditable, priceTable } from "@/lib/studio-catalog-admin";
import { parseStudioModel, type StudioModel } from "@/lib/studio-models";

const inputClass =
  "min-h-9 w-24 surface-media border-2 border-ink bg-paper-strong px-2 text-sm font-bold text-ink outline-none transition focus:ring-4 focus:ring-yellow/35 disabled:cursor-not-allowed disabled:opacity-60";

const KIND_LABELS_SR: Record<string, string> = { image: "Slika", video: "Video", audio: "Zvuk" };
const KIND_LABELS_EN: Record<string, string> = { image: "Image", video: "Video", audio: "Audio" };

const JOB_STATUSES = ["reserved", "running", "done", "failed", "refunded"] as const;
const PROVIDER_LABELS: Record<string, string> = { fal: "fal", google: "Google", byteplus: "BytePlus" };

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
  locale = "sr",
}: {
  value: number;
  min?: number;
  step?: number;
  onSave: (next: number) => Promise<unknown>;
  locale?: Locale;
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
      setError(err instanceof Error ? err.message : locale === "sr" ? "Čuvanje nije uspelo." : "Save failed.");
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

function InlineText({
  value,
  onSave,
  placeholder,
  locale = "sr",
}: {
  value: string;
  onSave: (next: string) => Promise<unknown>;
  placeholder?: string;
  locale?: Locale;
}) {
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
      setError(err instanceof Error ? err.message : locale === "sr" ? "Čuvanje nije uspelo." : "Save failed.");
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
  locale = "sr",
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  onToggle: () => Promise<unknown>;
  locale?: Locale;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      await onToggle();
    } catch (err) {
      setError(err instanceof Error ? err.message : locale === "sr" ? "Nije uspelo." : "Failed.");
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
          "inline-flex min-h-8 items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-xs font-black transition disabled:opacity-60",
          active ? "bg-emerald-100 text-emerald-900" : "bg-paper-strong text-muted",
        )}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : active ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
        {active ? activeLabel : inactiveLabel}
      </button>
      <ErrorLine message={error} />
    </div>
  );
}

/**
 * Cena SVAKE kombinacije jednog modela.
 */
function PriceBreakdown({ model, locale }: { model: StudioModel; locale: Locale }) {
  const table = priceTable({
    paramSpec: model.paramSpec,
    priceRule: model.priceRule,
    inputModes: model.inputModes,
    capabilities: JSON.stringify(model.capabilities),
    locale,
  });

  if (table.rows.length === 0) {
    return (
      <p className="text-xs font-bold text-muted">
        {locale === "sr"
          ? "Nijedna kombinacija nema cenu - proveri cenovno pravilo ovog reda."
          : "No combination has a price - check the price rule of this row."}
      </p>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-wide text-muted">
              <th className="pb-1 pr-3">{locale === "sr" ? "Režim" : "Mode"}</th>
              <th className="pb-1 pr-3">{locale === "sr" ? "Kombinacija" : "Combination"}</th>
              <th className="pb-1 pr-3">{locale === "sr" ? "Nabavno" : "Cost"}</th>
              <th className="pb-1 pr-3">{locale === "sr" ? "Krediti" : "Credits"}</th>
              <th className="pb-1">{locale === "sr" ? "Marža" : "Margin"}</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={`${row.inputMode}:${row.label}`} className="align-top font-bold text-ink">
                <td className="py-0.5 pr-3 text-muted">{row.inputMode || "—"}</td>
                <td className="py-0.5 pr-3">{row.label || (locale === "sr" ? "podrazumevano" : "default")}</td>
                <td className="py-0.5 pr-3 font-mono">${row.costUsd.toFixed(4)}</td>
                <td className="py-0.5 pr-3 font-mono">{row.credits}</td>
                <td className={cn("py-0.5 font-mono", marginTone(row.margin) === "warn" && "text-red-700")}>
                  {formatMargin(row.margin)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.hidden > 0 ? (
        <p className="mt-2 text-[11px] font-black text-amber-800">
          {locale === "sr"
            ? `Prikazano je ${table.rows.length} kombinacija, ima ih još ${table.hidden}. Najmanja marža u CELOM prostoru je ${formatMargin(table.worstMargin)}.`
            : `Showing ${table.rows.length} combinations, ${table.hidden} more available. Lowest margin in the ENTIRE space is ${formatMargin(table.worstMargin)}.`}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Zbir izmerenog troska jednog modela (W6).
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
 * Lista razloga mapirana u ljudske rečenice (Tačka 2).
 * Sirov serverski kod ostaje u `title` atributu za pretragu/dijagnostiku.
 */
function ReasonList({ cost, locale }: { cost: ModelCostRow | undefined; locale: Locale }) {
  if (!cost || cost.reasons.length === 0) return null;

  return (
    <ul className="mt-1 space-y-0.5">
      {cost.reasons.map((row) => (
        <li
          key={row.reason}
          title={row.reason}
          className="text-[11px] font-bold leading-tight text-muted"
        >
          {actualCostReasonLabel(row.reason, locale)} · {row.jobs}
        </li>
      ))}
    </ul>
  );
}

/**
 * Prikaz marže po modelu sa jasnim poreklom (Tačka 3 / Nalaz Y3).
 * Modeli kod kojih je broj naša interna tarifa nad prijavljenom količinom su
 * vizuelno odvojeni i ne nazivaju se "Stvarna marža".
 */
function ActualMarginCell({
  slug,
  cost,
  locale,
}: {
  slug: string;
  cost: ModelCostRow | undefined;
  locale: Locale;
}) {
  const origin = modelCostOrigin(slug, cost?.measuredJobs ?? 0);
  const unmeasuredWord = locale === "sr" ? "bez merenja" : "unmeasured";
  const noMeasurementWord = locale === "sr" ? "nema merenja" : "no measurement";
  const jobsWord =
    locale === "sr"
      ? cost?.measuredJobs === 1
        ? "posao"
        : "poslova"
      : cost?.measuredJobs === 1
        ? "job"
        : "jobs";

  if (origin === "no_measurement" || !cost) {
    return (
      <div>
        <span className="inline-flex min-h-7 items-center rounded-full border-2 border-dashed border-muted bg-paper-strong px-2.5 py-0.5 text-xs font-black text-muted">
          {cost && cost.unmeasuredJobs > 0
            ? `${unmeasuredWord} / ${cost.unmeasuredJobs}`
            : noMeasurementWord}
        </span>
        <ReasonList cost={cost} locale={locale} />
      </div>
    );
  }

  const margin = computeMargin(cost.creditCost, cost.actualCostUsd);
  const tone = marginTone(margin);

  if (origin === "internal_quantity_rate") {
    return (
      <div className="space-y-1">
        <div className="flex flex-col gap-0.5">
          <span
            className="inline-flex min-h-7 items-center gap-1 self-start rounded-full border-2 border-dashed border-amber-800 bg-amber-50 px-2.5 py-0.5 text-xs font-black text-amber-900"
            title={
              locale === "sr"
                ? "Nije nezavisno merenje provajdera — obračunato preko naše tarife nad prijavljenom količinom (uvek daje 2,5×)"
                : "Not independent provider invoice — computed using internal rate over reported quantity (always yields 2.5×)"
            }
          >
            <AlertTriangle className="size-3.5 text-amber-800" />
            <span>{formatMargin(margin)}</span>
            <span className="font-bold text-amber-800/80">
              / {cost.measuredJobs} {jobsWord}
            </span>
          </span>
          <span className="inline-block text-[10px] font-black uppercase tracking-wider text-amber-900">
            {costOriginLabel(origin, locale)}
          </span>
        </div>
        <ReasonList cost={cost} locale={locale} />
      </div>
    );
  }

  // origin === "provider_invoice"
  return (
    <div className="space-y-1">
      <div className="flex flex-col gap-0.5">
        <span
          className={cn(
            "inline-flex min-h-7 items-center gap-1 self-start rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-black",
            tone === "warn" && "bg-red-100 text-red-800",
            tone === "ok" && "bg-emerald-100 text-emerald-900",
            tone === "unknown" && "bg-paper-strong text-muted",
          )}
        >
          {tone === "warn" ? <AlertTriangle className="size-3.5" /> : null}
          <span>{formatMargin(margin)}</span>
          <span className="font-bold text-muted">
            / {cost.measuredJobs} {jobsWord}
          </span>
        </span>
        <span className="inline-block text-[10px] font-black uppercase tracking-wider text-emerald-800">
          {costOriginLabel(origin, locale)}
        </span>
      </div>
      <ReasonList cost={cost} locale={locale} />
    </div>
  );
}

/** Jedan red v4 kataloga; razvija se u tabelu cena po kombinaciji. */
function CatalogRow({
  row,
  cost,
  onSetPrice,
  onSetEnabled,
  locale,
}: {
  row: Doc<"models">;
  cost: ModelCostRow | undefined;
  onSetPrice: (args: { baseUsd?: number; addUsd?: number }) => Promise<unknown>;
  onSetEnabled: (isEnabled: boolean) => Promise<unknown>;
  locale: Locale;
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
  const kindLabels = locale === "en" ? KIND_LABELS_EN : KIND_LABELS_SR;
  const label = locale === "en" && row.labelEn ? row.labelEn : row.labelSr;

  return (
    <>
      <tr className="surface-inset border-2 border-ink bg-paper align-top text-sm">
        <td className="px-3 py-3 font-black text-ink">
          {label}
          <p className="text-xs font-bold text-muted">{row.slug}</p>
        </td>
        <td className="px-3 py-3 font-bold text-ink">{PROVIDER_LABELS[row.provider] ?? row.provider}</td>
        <td className="px-3 py-3 font-bold text-ink">{kindLabels[row.kind] ?? row.kind}</td>
        <td className="px-3 py-3">
          {editable ? (
            <InlineNumber
              value={rule.baseUsd ?? 0}
              min={0}
              step={0.001}
              onSave={(next) => onSetPrice({ baseUsd: next })}
              locale={locale}
            />
          ) : (
            <p className="text-xs font-bold text-muted">
              {locale === "sr" ? "iz tabele (lookup)" : "table lookup"}
            </p>
          )}
        </td>
        <td className="px-3 py-3">
          <InlineNumber
            value={rule?.addUsd ?? 0}
            min={0}
            step={0.001}
            onSave={(next) => onSetPrice({ addUsd: next })}
            locale={locale}
          />
        </td>
        <td className="px-3 py-3">
          <span
            className={cn(
              "inline-flex min-h-7 items-center gap-1 rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-black",
              tone === "warn" && "bg-red-100 text-red-800",
              tone === "ok" && "bg-emerald-100 text-emerald-900",
              tone === "unknown" && "bg-paper-strong text-muted",
            )}
          >
            {tone === "warn" ? <AlertTriangle className="size-3.5" /> : null}
            {formatMargin(margin)}
          </span>
        </td>
        <td className="px-3 py-3">
          <ActualMarginCell slug={row.slug} cost={cost} locale={locale} />
        </td>
        <td className="px-3 py-3">
          <TogglePill
            active={row.isEnabled}
            activeLabel={locale === "sr" ? "Uključen" : "Enabled"}
            inactiveLabel={locale === "sr" ? "Isključen" : "Disabled"}
            onToggle={() => onSetEnabled(!row.isEnabled)}
            locale={locale}
          />
        </td>
      </tr>
      <tr>
        <td colSpan={8} className="px-3 pb-3">
          {model ? (
            <details className="surface-inset border-2 border-ink bg-paper-strong p-3">
              <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-muted">
                {locale === "sr" ? "Cena po kombinaciji" : "Price by combination"}
              </summary>
              <div className="mt-3">
                <PriceBreakdown model={model} locale={locale} />
              </div>
            </details>
          ) : (
            <p className="text-xs font-black text-red-700">
              {locale === "sr"
                ? "Red se ne može pročitati - model se korisnicima ne nudi."
                : "Row cannot be read - model is not offered to users."}
            </p>
          )}
        </td>
      </tr>
    </>
  );
}

function CatalogSection({ locale }: { locale: Locale }) {
  const models = useQuery(api.studioModels.listAllModels, {});
  const costs = useQuery(api.studioAdmin.getModelCostSummary, {});
  const setPrice = useMutation(api.studioModels.setModelPrice);
  const setEnabled = useMutation(api.studioModels.setModelEnabled);
  const costBySlug = new Map((costs ?? []).map((row) => [row.modelSlug, row]));

  return (
    <Panel className="p-6">
      <h2 className="text-2xl font-black text-ink">{locale === "sr" ? "Katalog v4" : "Catalog v4"}</h2>
      <p className="mt-2 text-sm font-bold text-muted">
        {locale === "sr"
          ? "Marža je za podrazumevana podešavanja; ispod 2,0x je crvena. Izmena nabavne cene odmah pomera cenu SVAKE kombinacije — razvij red da vidiš koje. Stvarna marža je iz onoga što je provajder naplatio (faktura), dok modeli sa internom tarifom nad količinom nose posebnu oznaku."
          : "Margin is for default settings; below 2.0x is red. Editing the cost immediately shifts the price of EVERY combination — expand the row to see details. Actual margin comes from provider billing (invoice), while models with internal rate over reported quantity are explicitly labeled."}
      </p>

      {models === undefined ? (
        <div className="mt-5 flex min-h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      ) : models.length === 0 ? (
        <p className="surface-inset mt-5 border-2 border-ink bg-paper p-4 text-sm font-bold text-muted">
          {locale === "sr"
            ? "Katalog je prazan. Pusti `npm run convex:seed`."
            : "Catalog is empty. Run `npm run convex:seed`."}
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1040px] border-separate border-spacing-y-2 text-left">
            <thead>
              <tr className="text-xs font-black uppercase tracking-wide text-muted">
                <th className="px-3 pb-1">{locale === "sr" ? "Model" : "Model"}</th>
                <th className="px-3 pb-1">{locale === "sr" ? "Provajder" : "Provider"}</th>
                <th className="px-3 pb-1">{locale === "sr" ? "Tip" : "Kind"}</th>
                <th className="px-3 pb-1">baseUsd</th>
                <th className="px-3 pb-1">addUsd</th>
                <th className="px-3 pb-1">{locale === "sr" ? "Marža (procena)" : "Margin (est.)"}</th>
                <th className="px-3 pb-1">{locale === "sr" ? "Stvarna marža / Izvor" : "Actual Margin / Source"}</th>
                <th className="px-3 pb-1">{locale === "sr" ? "Status" : "Status"}</th>
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
                  locale={locale}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function ModelsSection({ locale }: { locale: Locale }) {
  const models = useQuery(api.modelCatalog.listAllModels, {});
  const setCost = useMutation(api.modelCatalog.setModelCost);
  const setEnabled = useMutation(api.modelCatalog.setModelEnabled);
  const kindLabels = locale === "en" ? KIND_LABELS_EN : KIND_LABELS_SR;

  return (
    <Panel className="p-6">
      <h2 className="text-2xl font-black text-ink">
        {locale === "sr" ? "Stari katalog (modelCatalog)" : "Legacy Catalog (modelCatalog)"}
      </h2>
      <p className="mt-2 text-sm font-bold text-muted">
        {locale === "sr"
          ? "Modeli koji još nisu preseljeni u v4. Slug koji postoji i u v4 katalogu se naručuje po v4 pravilu — izmena cene ovde tada ne radi ništa."
          : "Models not yet migrated to v4. A slug that exists in the v4 catalog is ordered according to v4 rules — modifying prices here has no effect."}
      </p>

      {models === undefined ? (
        <div className="mt-5 flex min-h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      ) : models.length === 0 ? (
        <p className="surface-inset mt-5 border-2 border-ink bg-paper p-4 text-sm font-bold text-muted">
          {locale === "sr"
            ? "Katalog je prazan. Pusti `seedModelCatalog`."
            : "Catalog is empty. Run `seedModelCatalog`."}
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-y-2 text-left">
            <thead>
              <tr className="text-xs font-black uppercase tracking-wide text-muted">
                <th className="px-3 pb-1">{locale === "sr" ? "Model" : "Model"}</th>
                <th className="px-3 pb-1">{locale === "sr" ? "Tip" : "Kind"}</th>
                <th className="px-3 pb-1">{locale === "sr" ? "Cena (kr)" : "Price (cr)"}</th>
                <th className="px-3 pb-1">{locale === "sr" ? "Nabavno ($)" : "Cost ($)"}</th>
                <th className="px-3 pb-1">{locale === "sr" ? "Marža" : "Margin"}</th>
                <th className="px-3 pb-1">{locale === "sr" ? "Status" : "Status"}</th>
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
                    <td className="px-3 py-3 font-bold text-ink">{kindLabels[model.kind] ?? model.kind}</td>
                    <td className="px-3 py-3">
                      <InlineNumber
                        value={model.creditCost}
                        min={0}
                        onSave={(next) => setCost({ modelId: model._id, creditCost: next })}
                        locale={locale}
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
                        locale={locale}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex min-h-7 items-center gap-1 rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-black",
                          tone === "warn" && "bg-red-100 text-red-800",
                          tone === "ok" && "bg-emerald-100 text-emerald-900",
                          tone === "unknown" && "bg-paper-strong text-muted",
                        )}
                      >
                        {tone === "warn" ? <AlertTriangle className="size-3.5" /> : null}
                        {formatMargin(margin)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <TogglePill
                        active={model.isEnabled}
                        activeLabel={locale === "sr" ? "Uključen" : "Enabled"}
                        inactiveLabel={locale === "sr" ? "Isključen" : "Disabled"}
                        onToggle={() => setEnabled({ modelId: model._id, isEnabled: !model.isEnabled })}
                        locale={locale}
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

function PacksSection({ locale }: { locale: Locale }) {
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
      <h2 className="text-2xl font-black text-ink">
        {locale === "sr" ? "Paketi i planovi" : "Packs & Plans"}
      </h2>
      <p className="mt-2 text-sm font-bold text-muted">
        {locale === "sr"
          ? "`stripePriceId` je jedino polje koje se stalno menja — upiši ga ovde umesto po Convex dashboardu."
          : "`stripePriceId` is the only field that frequently changes — configure it here instead of Convex dashboard."}
      </p>

      {packs === undefined ? (
        <div className="mt-5 flex min-h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      ) : packs.length === 0 ? (
        <p className="surface-inset mt-5 border-2 border-ink bg-paper p-4 text-sm font-bold text-muted">
          {locale === "sr"
            ? "Katalog je prazan. Pusti `seedCreditPacks`."
            : "Catalog is empty. Run `seedCreditPacks`."}
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-y-2 text-left">
            <thead>
              <tr className="text-xs font-black uppercase tracking-wide text-muted">
                <th className="px-3 pb-1">{locale === "sr" ? "Paket / plan" : "Pack / Plan"}</th>
                <th className="px-3 pb-1">{locale === "sr" ? "Cena" : "Price"}</th>
                <th className="px-3 pb-1">{locale === "sr" ? "Krediti" : "Credits"}</th>
                <th className="px-3 pb-1">{locale === "sr" ? "Bonus" : "Bonus"}</th>
                <th className="px-3 pb-1">Stripe Price ID</th>
                <th className="px-3 pb-1">{locale === "sr" ? "Status" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {packs.map((pack: Doc<"creditPacks">) => {
                const title = locale === "en" && pack.titleEn ? pack.titleEn : pack.titleSr;
                const kindDesc =
                  locale === "sr"
                    ? pack.kind === "plan"
                      ? "pretplata"
                      : "jednokratno"
                    : pack.kind === "plan"
                      ? "subscription"
                      : "one-time";
                return (
                  <tr key={pack._id} className="surface-inset border-2 border-ink bg-paper align-top text-sm">
                    <td className="px-3 py-3 font-black text-ink">
                      {title}
                      <p className="text-xs font-bold text-muted">
                        {pack.slug} · {kindDesc}
                      </p>
                    </td>
                    <td className="px-3 py-3 font-bold text-ink">{formatEur(pack.priceEurCents, locale)}</td>
                    <td className="px-3 py-3 font-bold text-ink">
                      {pack.credits.toLocaleString(locale === "sr" ? "sr-RS" : "en-US")}{" "}
                      {locale === "sr" ? "kr" : "cr"}
                    </td>
                    <td className="px-3 py-3 font-bold text-ink">
                      {pack.bonusPercent > 0 ? `+${pack.bonusPercent}%` : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <InlineText
                        value={pack.stripePriceId ?? ""}
                        placeholder="price_..."
                        onSave={(next) => savePriceId(pack, next)}
                        locale={locale}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <TogglePill
                        active={pack.isActive}
                        activeLabel={locale === "sr" ? "Aktivan" : "Active"}
                        inactiveLabel={locale === "sr" ? "Ugašen" : "Inactive"}
                        onToggle={() => setActive({ packId: pack._id, isActive: !pack.isActive })}
                        locale={locale}
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

function KillSwitchCard({ locale }: { locale: Locale }) {
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
      setError(err instanceof Error ? err.message : locale === "sr" ? "Nije uspelo." : "Failed.");
    } finally {
      setPending(false);
    }
  }

  if (state === undefined) {
    return (
      <div className="surface-card flex min-h-20 items-center justify-center border-2 border-ink bg-paper-strong p-4 shadow-[4px_4px_0_0_var(--ink)]">
        <Loader2 className="size-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "surface-card border-2 p-5 shadow-[4px_4px_0_0_var(--ink)]",
        state.enabled ? "border-ink bg-paper-strong" : "border-red-700 bg-red-50",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex size-3.5 rounded-full border border-ink",
                state.enabled ? "bg-emerald-500 animate-pulse" : "bg-red-600",
              )}
            />
            <p className="text-base font-black text-ink">
              {locale === "sr"
                ? `Studio zaštita: Studio je ${state.enabled ? "UKLJUČEN" : "UGAŠEN"}`
                : `Studio Protection: Studio is ${state.enabled ? "ENABLED" : "SHUT DOWN"}`}
            </p>
          </div>
          <p className="mt-1 text-xs font-bold text-muted">
            {state.enabled
              ? locale === "sr"
                ? "Korisnici mogu normalno da generišu. Gašenje je trenutno i pogađa sve korisnike odmah."
                : "Users can generate normally. Shutting down is instant and immediately stops new requests."
              : locale === "sr"
                ? "Nijedna nova generacija se ne prihvata. Postojeće generacije ostaju vidljive."
                : "No new generation requests are accepted. Existing generations remain visible."}
          </p>
        </div>

        {state.enabled && !confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-red-800 bg-paper-strong px-4 text-xs font-black text-red-800 transition hover:bg-red-50 focus-visible:outline-red-800"
          >
            <Power className="size-3.5" />
            {locale === "sr" ? "Ugasi Studio" : "Shut down Studio"}
          </button>
        ) : null}

        {!state.enabled ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => void apply(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--ink)] transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-3.5" />}
            {locale === "sr" ? "Ponovo uključi Studio" : "Re-enable Studio"}
          </button>
        ) : null}
      </div>

      {confirming ? (
        <div className="surface-inset mt-4 flex flex-wrap items-center gap-3 border-2 border-red-800 bg-red-100/70 p-3">
          <p className="flex items-center gap-2 text-xs font-black text-red-800">
            <AlertTriangle className="size-4 shrink-0" />
            {locale === "sr"
              ? "Sigurno? Svi korisnici odmah gube mogućnost pokretanja novih generacija."
              : "Are you sure? All users will immediately lose the ability to start new generations."}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => void apply(false)}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border-2 border-red-800 bg-red-800 px-4 text-xs font-black text-white transition hover:bg-red-900 disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {locale === "sr" ? "Potvrdi gašenje" : "Confirm shutdown"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-xs font-black text-ink transition hover:bg-paper disabled:opacity-60"
            >
              {locale === "sr" ? "Otkaži" : "Cancel"}
            </button>
          </div>
        </div>
      ) : null}

      <ErrorLine message={error} />
    </div>
  );
}

/**
 * Prikaz zdravlja crona i heartbeat-a (Tačka 4).
 * Podignuto na vrh stranice — ako je stariji od 60 min, to je prvo što se vidi.
 */
function ProminentHealthAlert({
  now,
  heartbeatAt,
  failure,
  locale,
}: {
  now: number;
  heartbeatAt: number | null;
  failure: { message: string } | null;
  locale: Locale;
}) {
  const stale = heartbeatAt === null || now - heartbeatAt > HEARTBEAT_STALE_MS;
  const minutesAgo = heartbeatAt === null ? null : Math.round((now - heartbeatAt) / 60000);

  if (!stale && !failure) return null;

  return (
    <div
      role="alert"
      className="surface-card border-2 border-red-700 bg-red-100 p-4 shadow-[4px_4px_0_0_#b91c1c]"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-6 shrink-0 text-red-700" />
        <div className="space-y-1">
          <p className="text-sm font-black uppercase tracking-wide text-red-900">
            {locale === "sr"
              ? "UPOZORENJE: Zaštitni cron globalnog plafona nije aktivan!"
              : "CRITICAL: Global cost cap protection cron is not active!"}
          </p>
          <p className="text-xs font-bold text-red-800">
            {locale === "sr"
              ? `Poslednja provera plafona: ${
                  minutesAgo === null
                    ? "nikad (cron nije registrovan)"
                    : `pre ${minutesAgo} min (starije od dozvoljenih 60 min)`
                }.`
              : `Last cost cap heartbeat: ${
                  minutesAgo === null
                    ? "never (cron never executed)"
                    : `${minutesAgo} min ago (older than allowed 60 min)`
                }.`}
          </p>
          {failure ? (
            <p className="surface-inset mt-2 border-2 border-red-800 bg-paper-strong p-2.5 text-xs font-mono font-bold text-red-900">
              {locale === "sr" ? "Poslednja greška crona:" : "Last cron error:"} {failure.message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UsageSection({
  summary,
  now,
  locale,
}: {
  summary:
    | {
        day: string;
        totalCostUsd: number;
        topUsers: Array<{
          userId: string;
          name: string;
          costUsd: number;
          creditsSpent: number;
          generations: number;
        }>;
        jobCounts: Record<string, number>;
        reapedToday: number;
        alarmUsd: number;
        killUsd: number;
        usageRowsCapped: boolean;
        jobCountsCapped: boolean;
        costCapHeartbeatAt: number | null;
        costCapCronFailure: { message: string } | null;
      }
    | undefined;
  now: number;
  locale: Locale;
}) {
  const stale =
    summary === undefined ||
    summary.costCapHeartbeatAt === null ||
    now - summary.costCapHeartbeatAt > HEARTBEAT_STALE_MS;
  const minutesAgo =
    summary?.costCapHeartbeatAt === null || summary?.costCapHeartbeatAt === undefined
      ? null
      : Math.round((now - summary.costCapHeartbeatAt) / 60000);

  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-black text-ink">{locale === "sr" ? "Potrošnja" : "Usage & Spend"}</h2>
          <p className="mt-1 text-sm font-bold text-muted">
            {summary
              ? `${locale === "sr" ? "Danas" : "Today"}, ${summary.day}`
              : locale === "sr"
                ? "Danas"
                : "Today"}
          </p>
        </div>

        {summary ? (
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full border-2 px-3 py-1 text-xs font-black",
              stale
                ? "border-red-700 bg-red-100 text-red-800"
                : "border-ink bg-paper text-ink",
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                stale ? "bg-red-600" : "bg-emerald-500",
              )}
            />
            <span>
              {locale === "sr" ? "Heartbeat plafona:" : "Cap heartbeat:"}{" "}
              {minutesAgo === null
                ? locale === "sr"
                  ? "nikad"
                  : "never"
                : minutesAgo <= 0
                  ? locale === "sr"
                    ? "upravo sada"
                    : "just now"
                  : locale === "sr"
                    ? `pre ${minutesAgo} min`
                    : `${minutesAgo} min ago`}
            </span>
          </div>
        ) : null}
      </div>

      {summary === undefined ? (
        <div className="mt-5 flex min-h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="surface-inset border-2 border-ink bg-paper p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted">
              {locale === "sr" ? "Ukupan trošak danas" : "Total cost today"}
            </p>
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
            <p className="mt-1 text-xs font-bold text-muted">
              {locale === "sr"
                ? `alarm na $${summary.alarmUsd} · gasi se na $${summary.killUsd}`
                : `alarm at $${summary.alarmUsd} · kills at $${summary.killUsd}`}
            </p>
            <div
              className="surface-media mt-2 h-2.5 w-full overflow-hidden border-2 border-ink bg-paper-strong"
              role="img"
              aria-label={`Potrošeno ${summary.totalCostUsd.toFixed(2)} od ${summary.killUsd} dolara`}
            >
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  summary.totalCostUsd > summary.alarmUsd ? "bg-red-500" : "bg-emerald-500",
                )}
                style={{ width: `${Math.min(100, (summary.totalCostUsd / summary.killUsd) * 100)}%` }}
              />
            </div>

            <p className="mt-4 text-xs font-black uppercase tracking-wide text-muted">
              {locale === "sr" ? "Poslovi po statusu" : "Jobs by status"}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {JOB_STATUSES.map((status) => (
                <li
                  key={status}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3 py-1 text-xs font-black text-ink"
                >
                  {jobStatusLabel(status, locale)}: {summary.jobCounts[status] ?? 0}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs font-black uppercase tracking-wide text-muted">Reaper</p>
            <p className="mt-1 text-sm font-bold text-ink">
              {summary.reapedToday === 0
                ? locale === "sr"
                  ? "Danas nijedan posao nije zaglavio."
                  : "No jobs were stuck today."
                : locale === "sr"
                  ? `Danas refundirano zbog neodgovora: ${summary.reapedToday}`
                  : `Refunded today due to timeout: ${summary.reapedToday}`}
            </p>

            {summary.jobCountsCapped ? (
              <p className="mt-2 text-[11px] font-black text-amber-800">
                {locale === "sr"
                  ? "Broj poslova po statusu je odsečen na prikaz — stvarno je veći."
                  : "Job count by status is capped in display — actual count is higher."}
              </p>
            ) : null}
          </div>

          <div className="surface-inset border-2 border-ink bg-paper p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted">
              {locale === "sr" ? "Top 10 korisnika po trošku" : "Top 10 users by spend"}
            </p>
            {summary.topUsers.length === 0 ? (
              <p className="mt-3 text-sm font-bold text-muted">
                {locale === "sr"
                  ? "Danas još niko nije generisao ništa."
                  : "No generations recorded today."}
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {summary.topUsers.map((row) => (
                  <li
                    key={row.userId}
                    className="surface-media flex items-center justify-between gap-3 border-2 border-ink/20 bg-paper-strong px-3 py-1.5 text-xs font-bold text-ink"
                  >
                    <span className="min-w-0 truncate">{row.name}</span>
                    <span className="shrink-0 font-mono">
                      ${row.costUsd.toFixed(2)} · {row.creditsSpent} {locale === "sr" ? "kr" : "cr"} ·{" "}
                      {row.generations}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {summary.usageRowsCapped ? (
              <p className="mt-2 text-[11px] font-black text-amber-800">
                {locale === "sr"
                  ? "Lista korisnika je odsečena na prikaz — stvarno ih je više."
                  : "User list is capped in display — actual count is higher."}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </Panel>
  );
}

export function StudioAdminPage({ locale = "sr" }: { locale?: Locale }) {
  // Zamrznut "sad" za query-je
  const [now] = useState(() => Date.now());
  const summary = useQuery(api.studioAdmin.getUsageSummary, { now });

  return (
    <div className="min-h-screen bg-studio-canvas px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">
              {locale === "sr" ? "Administracija" : "Administration"}
            </p>
            <h1 className="mt-1 font-display text-4xl text-ink sm:text-5xl">Studio</h1>
          </div>
        </header>

        {summary ? (
          <ProminentHealthAlert
            now={now}
            heartbeatAt={summary.costCapHeartbeatAt}
            failure={summary.costCapCronFailure}
            locale={locale}
          />
        ) : null}

        <KillSwitchCard locale={locale} />
        <UsageSection summary={summary} now={now} locale={locale} />
        <CatalogSection locale={locale} />
        <ModelsSection locale={locale} />
        <PacksSection locale={locale} />
      </div>
    </div>
  );
}
