import type { ParamControl } from "@/convex/studioParamSpec";
import type { PriceRule } from "@/convex/studioPricing";
import { parseQuantitySource, roundAndClampQuantity } from "@/convex/studioJobCore";
import { buildParams, creditsFor, paramValuesForMode } from "./studio-params";

/**
 * Cena jednog plaćenog posla iz alata (Crea K20) pre nego što ode serveru: ista
 * računica kao `createJob` - podrazumevane vrednosti režima, parametri alata i
 * izmerena količina zaokružena i isečena kao naplata (`roundAndClampQuantity`).
 */

export type PricedModel = {
  slug: string;
  paramSpec: ParamControl[];
  priceRule: PriceRule;
  capabilities: Record<string, unknown>;
  creditFactor?: number;
};

export type PricedJob = {
  modelSlug: string;
  inputMode: string;
  params: Record<string, string | number | boolean>;
  /** Količine koje server meri (trajanje, broj znakova). */
  measured: Record<string, number>;
};

/** Krediti za posao, ili `null` kad modela nema ili kombinacija nema cenu (nikad nula). */
export function jobCredits(job: PricedJob, catalog: readonly PricedModel[]): number | null {
  const model = catalog.find((entry) => entry.slug === job.modelSlug);
  if (!model) return null;
  const source = parseQuantitySource(JSON.stringify(model.capabilities));
  const measured: Record<string, number> = {};
  for (const [key, value] of Object.entries(job.measured)) {
    measured[key] = source && source.param === key ? roundAndClampQuantity(source, value) : value;
  }
  const params = buildParams(model.paramSpec, { ...paramValuesForMode(model.paramSpec, job.inputMode), ...job.params }, job.inputMode, measured);
  return creditsFor(model.priceRule, params, job.inputMode, model.creditFactor);
}
