/* eslint-disable @next/next/no-img-element -- rezultat je potpisan URL iz Convex storage-a (ili DEMO SVG). */
"use client";

import { useMutation } from "convex/react";
import { ArrowLeft, ArrowRight, CircleCheck, Coins, PencilLine, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { FieldMic } from "@/components/crea/create/mic-button";

import { useBrandKit } from "@/components/crea/brand-kit/use-brand-kit";
import { CREA_ICONS } from "@/components/crea/crea-icons";
import type { MyElement } from "@/components/crea/elements/shared";
import { CharacterPicker, characterImages } from "@/components/crea/recipes/character-picker";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { useWatchedJob } from "@/components/crea/tools/job-image";
import { providerPhoto } from "@/components/crea/tools/mask-canvas";
import { PaidEditPanel, type PaidEditFiles } from "@/components/crea/tools/paid-edit";
import type { CreaPaidContext } from "@/components/crea/tools/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { brandSummary } from "@/lib/crea-brand-kit";
import { fillCopy } from "@/lib/crea-copy";
import type { CreaPaidRoute } from "@/lib/crea-paid-edit";
import {
  recipeDefaults,
  recipeExampleValues,
  recipeMissingField,
  recipeRequest,
  type CreaRecipe,
  type CreaRecipeModel,
  type CreaRecipeNextStep,
} from "@/lib/crea-recipes";
import { CREA_RECIPE_COPY as T, CREA_RECIPE_MODEL_LABELS } from "@/lib/crea-recipes-copy";
import type { Locale } from "@/lib/i18n";
import { buildParams, creditsFor, formatCredits, paramValuesForMode } from "@/lib/studio-params";

const FIELD =
  "surface-inset mt-2 block w-full border-2 border-ink bg-paper px-3 text-base font-bold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const PILL =
  "inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0";

export type RecipeHrefs = {
  /** Nazad na sve recepte (početni ekran). */
  back: string;
  /** „Likovi" (kad lika još nema). */
  characters: string;
  /** Alat „Brend kit". */
  brandKit: string;
  /** Composer bez recepta („Napredno"). */
  advanced: string;
  /** Sledeći korak za gotov rad (alat sa `?ulaz=` ili animacija). */
  next: (step: CreaRecipeNextStep, jobId: string) => string;
  /** Detalj rada. */
  detail: (jobId: string) => string;
};

/** Fiksna cena za ekran „Primer": prvi model recepta koji je u katalogu (cena ne zavisi od polja). */
function recipeFixedPrice(recipe: CreaRecipe, paid: CreaPaidContext | null): number | null {
  for (const model of recipe.models) {
    const entry = paid?.catalog.find((row) => row.slug === model);
    if (!entry) continue;
    const built = recipeRequest(recipe, model, { values: recipeDefaults(recipe), attached: {}, brand: null, brandLogo: false });
    return creditsFor(
      entry.priceRule,
      buildParams(entry.paramSpec, { ...paramValuesForMode(entry.paramSpec, built.inputMode), ...built.params }, built.inputMode),
      built.inputMode,
      entry.creditFactor,
    );
  }
  return null;
}

/**
 * Recept (S37, K15): 2-3 polja, primer, FIKSNA cena i jedno dugme. Posao ide
 * kroz postojeći `studio.createJob` (`PaidEditPanel`: ista cena kao na serveru,
 * limiti, DEMO bez ključa); posle rezultata recept nudi sledeći korak. Brend kit
 * (S38) ide sam u opis - i logo kao slika - bez promene cene.
 */
export function CreaRecipeStage({
  locale,
  recipe,
  paid,
  canSave,
  guest,
  signInHref,
  projectId,
  hrefs,
}: {
  locale: Locale;
  recipe: CreaRecipe;
  paid: CreaPaidContext | null;
  canSave: boolean;
  guest: boolean;
  signInHref: string;
  projectId: Id<"studioProjects"> | null;
  hrefs: RecipeHrefs;
}) {
  const kit = useBrandKit();
  const createJob = useMutation(api.studio.createJob);
  const [values, setValues] = useState<Record<string, string>>(() => recipeDefaults(recipe));
  const photo = useImageInput(null);
  const [character, setCharacter] = useState<MyElement | null>(null);
  const [useBrand, setUseBrand] = useState(true);
  const [jobId, setJobId] = useState<Id<"generationJobs"> | null>(null);
  const brandId = useId();
  const Icon = CREA_ICONS[recipe.icon];

  const imageField = recipe.fields.find((field) => field.kind === "image");
  const elementField = recipe.fields.find((field) => field.kind === "element");
  const refs = useMemo(() => (character ? characterImages(character) : []), [character]);
  const attached = useMemo(() => {
    const out: Record<string, number> = {};
    if (imageField) out[imageField.key] = photo.picked ? 1 : 0;
    if (elementField) out[elementField.key] = refs.length;
    return out;
  }, [imageField, elementField, photo.picked, refs.length]);

  const brand = recipe.brand !== "none" && useBrand && kit ? kit : null;
  const brandLogo = Boolean(brand?.logoStorageId);
  const missing = recipeMissingField(recipe, values, attached);
  const request = (model: CreaRecipeModel, size?: { width: number; height: number }) =>
    recipeRequest(recipe, model, { values, attached, brand, brandLogo, ...(size && size.width > 1 ? { imageSize: size } : {}) });

  // Ulazni režim zavisi od priloženih slika (fotka, lik, logo); cena za ove modele ne zavisi.
  const routes = useMemo<CreaPaidRoute[]>(
    () =>
      recipe.models.map((model) => ({
        modelSlug: model,
        inputMode: recipeRequest(recipe, model, { values: {}, attached, brand, brandLogo }).inputMode,
        kind: "photo",
        label: CREA_RECIPE_MODEL_LABELS[model] ?? { sr: model, en: model },
      })),
    [recipe, attached, brand, brandLogo],
  );

  const fixedPrice = recipeFixedPrice(recipe, paid);

  const job = useWatchedJob(jobId);

  return (
    <section
      aria-labelledby="crea-recipe-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <header className="flex flex-wrap items-start gap-3">
        <span className="paper-island grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="type-eyebrow-sm text-muted">{T.sectionTitle[locale]}</p>
          <h2 id="crea-recipe-title" className="type-h3 text-ink">
            {recipe.title[locale]}
          </h2>
          <p className="mt-1 type-body-sm font-semibold text-muted">{recipe.summary[locale]}</p>
        </div>
        <Link href={hrefs.back} className={PILL}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          {T.allRecipes[locale]}
        </Link>
      </header>

      <div className="mt-5 grid gap-6 border-t border-line pt-5 @min-[860px]:grid-cols-[minmax(0,1fr)_minmax(240px,300px)]">
        <div className="min-w-0 space-y-5">
          {recipe.fields.map((field) => {
            if (field.kind === "select") {
              return (
                <ChoiceChips
                  key={field.key}
                  legend={field.label[locale]}
                  name={`crea-recipe-${recipe.id}-${field.key}`}
                  options={field.options.map((option) => ({ id: option.id, label: option.label[locale] }))}
                  value={values[field.key] ?? field.options[0]!.id}
                  onChange={(id) => setValues({ ...values, [field.key]: id })}
                  disabled={jobId !== null}
                />
              );
            }
            if (field.kind === "image") {
              return (
                <div key={field.key}>
                  <p className="type-body-sm font-black text-ink">
                    {field.label[locale]}
                    {!field.required ? <span className="ml-2 font-semibold text-muted">({T.optional[locale]})</span> : null}
                  </p>
                  <p className="mb-2 type-body-sm font-semibold text-muted">{field.hint[locale]}</p>
                  <ImageInput locale={locale} input={photo} disabled={jobId !== null} />
                </div>
              );
            }
            if (field.kind === "element") {
              return (
                <CharacterPicker
                  key={field.key}
                  locale={locale}
                  legend={field.label[locale]}
                  hint={field.hint[locale]}
                  enabled={canSave}
                  value={character?._id ?? null}
                  onChange={setCharacter}
                  charactersHref={hrefs.characters}
                  disabled={jobId !== null}
                />
              );
            }
            const value = values[field.key] ?? "";
            const inputId = `crea-recipe-${recipe.id}-${field.key}`;
            return (
              <div key={field.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={inputId} className="type-body-sm font-black text-ink">
                    {field.label[locale]}
                  </label>
                  <span className="font-mono text-xs font-bold text-muted">{fillCopy(T.chars[locale], { n: value.length, max: field.maxLength })}</span>
                </div>
                {field.multiline ? (
                  <>
                    <textarea
                      id={inputId}
                      value={value}
                      rows={5}
                      maxLength={field.maxLength}
                      disabled={jobId !== null}
                      onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                      placeholder={field.placeholder[locale]}
                      className={cn(FIELD, "resize-y py-2")}
                    />
                    <FieldMic
                      locale={locale}
                      value={value}
                      onChange={(next) => setValues({ ...values, [field.key]: next })}
                      disabled={jobId !== null}
                      maxLength={field.maxLength}
                    />
                  </>
                ) : (
                  <input
                    id={inputId}
                    value={value}
                    maxLength={field.maxLength}
                    disabled={jobId !== null}
                    onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                    placeholder={field.placeholder[locale]}
                    className={cn(FIELD, "min-h-11")}
                  />
                )}
              </div>
            );
          })}

          {recipe.brand !== "none" && kit !== undefined ? (
            kit ? (
              <label htmlFor={brandId} className="surface-inset flex cursor-pointer items-start gap-3 bg-paper p-3">
                <input
                  id={brandId}
                  type="checkbox"
                  checked={useBrand}
                  disabled={jobId !== null}
                  onChange={(event) => setUseBrand(event.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-ink"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 type-body-sm font-black text-ink">
                    {T.brandOn[locale]}
                    <span aria-hidden="true" className="flex gap-1">
                      {kit.colors.map((hex) => (
                        <span key={hex} className="block size-4 rounded-full shadow-[inset_0_0_0_1px_var(--shadow-hard-25)]" style={{ backgroundColor: hex }} />
                      ))}
                    </span>
                  </span>
                  <span className="mt-0.5 block type-body-sm font-semibold text-muted">
                    {brandSummary(kit, locale)} · {(recipe.brand === "full" && kit.logoStorageId ? T.brandOnHint : T.brandStyleHint)[locale]}
                  </span>
                </span>
              </label>
            ) : (
              <div className="surface-inset flex flex-wrap items-center gap-3 bg-paper p-3">
                <p className="min-w-0 flex-1 type-body-sm font-semibold text-muted">{T.brandNone[locale]}</p>
                <Link href={hrefs.brandKit} className={PILL}>
                  {T.brandSetup[locale]}
                </Link>
              </div>
            )
          ) : null}

          {jobId === null ? (
            <div className="border-t border-line pt-5">
              <PaidEditPanel
                locale={locale}
                routes={routes}
                purpose="edit"
                ready={missing === null}
                notReadyReason={missing ? fillCopy(T.missing[locale], { field: missing.label[locale] }) : null}
                prepare={async (): Promise<PaidEditFiles> => {
                  if (!photo.picked) return { files: {}, width: 1, height: 1 };
                  const prepared = await providerPhoto(photo.picked.file);
                  return { files: { image: [prepared.blob] }, width: prepared.width, height: prepared.height };
                }}
                request={(route, _text, size) => request(route.modelSlug as CreaRecipeModel, size).params}
                textField={null}
                label={T.make[locale]}
                parentJobId={null}
                projectId={projectId}
                canSubmit={canSave}
                paid={paid}
                onSent={setJobId}
                // Slike idu redom recepta: fotka (okačena upravo), slike lika i logo kita (već pinovani uploadi).
                create={async (order) => {
                  const built = request(order.modelSlug as CreaRecipeModel);
                  const uploaded = [...(order.inputs.image ?? [])];
                  let fromCharacter = 0;
                  const image: string[] = [];
                  for (const key of built.imageOrder) {
                    if (key === "brand-logo") {
                      if (brand?.logoStorageId) image.push(brand.logoStorageId);
                    } else if (key === elementField?.key) {
                      const next = refs[fromCharacter++];
                      if (next) image.push(next);
                    } else {
                      const next = uploaded.shift();
                      if (next) image.push(next);
                    }
                  }
                  return createJob({
                    modelSlug: order.modelSlug,
                    params: order.params,
                    inputMode: order.inputMode,
                    ...(image.length > 0 ? { inputs: JSON.stringify({ image }) } : {}),
                    ...(order.projectId ? { projectId: order.projectId } : {}),
                  });
                }}
                {...(imageField ? {} : { privacyNote: null })}
              />
              {guest ? (
                <Link href={signInHref} className={cn(PILL, "mt-3 border-ink bg-ink text-paper-strong")}>
                  {locale === "sr" ? "Prijavi se" : "Sign in"}
                </Link>
              ) : null}
            </div>
          ) : (
            <RecipeResult
              locale={locale}
              recipe={recipe}
              job={job}
              hrefs={hrefs}
              onAgain={() => setJobId(null)}
            />
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="surface-inset space-y-3 bg-paper p-4">
            <h3 className="inline-flex items-center gap-2 type-body font-black text-ink">
              <Sparkles aria-hidden="true" className="size-4" />
              {T.example[locale]}
            </h3>
            <p className="type-body-sm font-semibold text-muted">{recipe.example[locale]}</p>
            {recipe.fields.some((field) => field.kind === "text") ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={jobId !== null}
                onClick={() => setValues(recipeExampleValues(recipe, locale, values))}
                icon={<PencilLine aria-hidden="true" className="size-4" />}
              >
                {T.fillExample[locale]}
              </Button>
            ) : null}
          </section>
          <section className="surface-inset space-y-2 bg-paper p-4">
            <h3 className="inline-flex items-center gap-2 type-body font-black text-ink">
              <Coins aria-hidden="true" className="size-4" />
              {T.fixedPrice[locale]}
            </h3>
            <p className="type-body-sm font-semibold text-muted">
              {fixedPrice !== null ? fillCopy(T.fixedPriceBody[locale], { price: formatCredits(fixedPrice, locale) }) : T.fixedPriceLoading[locale]}
            </p>
            <p className="type-body-sm font-semibold text-muted">
              {T.format[locale]}: <span className="font-black text-ink">{T.formats[recipe.aspect][locale]}</span>
            </p>
          </section>
          <Link href={hrefs.advanced} className="inline-flex min-h-11 items-center gap-2 type-body-sm font-black text-ink underline underline-offset-4">
            <Wand2 aria-hidden="true" className="size-4" />
            {T.advanced[locale]}
          </Link>
        </aside>
      </div>
    </section>
  );
}

function RecipeResult({
  locale,
  recipe,
  job,
  hrefs,
  onAgain,
}: {
  locale: Locale;
  recipe: CreaRecipe;
  job: ReturnType<typeof useWatchedJob>;
  hrefs: RecipeHrefs;
  onAgain: () => void;
}) {
  const failed = job?.status === "failed" || job?.status === "refunded";
  const done = job?.status === "done" && job.outputUrl ? job : null;

  return (
    <div className="surface-inset space-y-4 bg-paper p-4" aria-live="polite">
      {failed ? (
        <>
          <p className="type-body-sm font-black text-red-700 dark:text-red-300">{T.failed[locale]}</p>
          <Button variant="secondary" onClick={onAgain} icon={<RefreshCw aria-hidden="true" className="size-4" />}>
            {T.again[locale]}
          </Button>
        </>
      ) : done ? (
        <>
          <p className="inline-flex items-center gap-2 type-body font-black text-ink">
            <CircleCheck aria-hidden="true" className="size-5" />
            {T.done[locale]}
          </p>
          <Link href={hrefs.detail(done._id)} className="block w-fit max-w-full">
            <img
              src={done.outputUrl!}
              alt={recipe.title[locale]}
              className="surface-media block max-h-96 w-auto max-w-full bg-paper-strong shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
            />
          </Link>
          {done.isMock ? <p className="type-body-sm font-semibold text-muted">{T.demoNote[locale]}</p> : null}
          <div>
            <h3 className="type-body font-black text-ink">{T.nextTitle[locale]}</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {recipe.nextSteps.map((step) => (
                <li key={step.kind === "tool" ? step.toolId : "animate"}>
                  <Link href={hrefs.next(step, done._id)} className={PILL}>
                    {step.label[locale]}
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={hrefs.detail(done._id)} className={cn(PILL, "bg-paper-strong")}>
              {T.openWork[locale]}
            </Link>
            <Button variant="ghost" onClick={onAgain} icon={<RefreshCw aria-hidden="true" className="size-4" />}>
              {T.again[locale]}
            </Button>
          </div>
        </>
      ) : (
        <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
          <Spinner size="sm" />
          {T.waiting[locale]}
        </p>
      )}
    </div>
  );
}
