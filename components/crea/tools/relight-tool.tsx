"use client";

import { Sun } from "lucide-react";
import { useCallback, useState } from "react";

import { RangeField } from "@/components/crea/editor/controls";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { providerPhoto } from "@/components/crea/tools/mask-canvas";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import { RelightSphere } from "@/components/crea/tools/relight-sphere";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { cn } from "@/components/ui/primitives";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_PAID_EDIT_COPY, CREA_RELIGHT_COPY as T } from "@/lib/crea-edit-copy";
import { nearestAspectRatio, RELIGHT_ROUTES } from "@/lib/crea-paid-edit";
import {
  clampLight,
  DEFAULT_LIGHT,
  LIGHT_LIMITS,
  LIGHT_PRESETS,
  lightSummary,
  relightPrompt,
  type LightSetup,
  type LightSoftness,
} from "@/lib/crea-relight";

/**
 * Novo svetlo (S18, K12): pomeri „sunce" po 3D kugli (ili klizačima, ili
 * brzim izborom), a smer, visina, toplina i mekoća se pretvaraju u precizan
 * opis koji ide modelu - korisnik vidi tačno taj opis pre plaćanja.
 */
export default function RelightTool({ tool, locale, canSave, projectId, source, paid }: CreaToolProps) {
  const image = useImageInput(source);
  const [setup, setSetup] = useState<LightSetup>(DEFAULT_LIGHT);
  const [webgl, setWebgl] = useState(true);
  const onUnsupported = useCallback(() => setWebgl(false), []);
  const change = (patch: Partial<LightSetup>) => setSetup((current) => clampLight({ ...current, ...patch }));
  const presetId = LIGHT_PRESETS.find((preset) => JSON.stringify(preset.setup) === JSON.stringify(setup))?.id ?? null;

  return (
    <section
      aria-labelledby="crea-tool-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <ToolHeader tool={tool} locale={locale} icon={<Sun aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <ImageInput locale={locale} input={image} disabled={false} />

        <div className="grid gap-5 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          <div className="space-y-2">
            {webgl ? (
              <RelightSphere
                setup={setup}
                onChange={(angles) => change(angles)}
                onUnsupported={onUnsupported}
                label={`${T.sphereLabel[locale]} ${lightSummary(setup, locale)}`}
              />
            ) : (
              <p className="surface-inset bg-paper p-3 type-body-sm font-semibold text-muted">{T.noWebgl[locale]}</p>
            )}
            {webgl ? <p className="type-body-sm font-semibold text-muted">{T.sphereHint[locale]}</p> : null}
          </div>

          <div className="min-w-0 space-y-4">
            <fieldset className="min-w-0">
              <legend className="type-body-sm font-black text-ink">{T.presets[locale]}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {LIGHT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={presetId === preset.id}
                    onClick={() => setSetup(preset.setup)}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-black transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none",
                      presetId === preset.id ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper text-ink hover:border-ink",
                    )}
                  >
                    {preset.label[locale]}
                  </button>
                ))}
              </div>
            </fieldset>
            <RangeField
              label={T.azimuth[locale]}
              value={setup.azimuth}
              min={-180}
              max={180}
              display={`${setup.azimuth}°`}
              onChange={(azimuth) => change({ azimuth })}
            />
            <RangeField
              label={T.elevation[locale]}
              value={setup.elevation}
              min={LIGHT_LIMITS.elevation.min}
              max={LIGHT_LIMITS.elevation.max}
              display={`${setup.elevation}°`}
              onChange={(elevation) => change({ elevation })}
            />
            <RangeField
              label={T.kelvin[locale]}
              value={setup.kelvin}
              min={LIGHT_LIMITS.kelvin.min}
              max={LIGHT_LIMITS.kelvin.max}
              step={100}
              display={`${setup.kelvin} K`}
              onChange={(kelvin) => change({ kelvin })}
            />
            <ChoiceChips<LightSoftness>
              legend={T.softness[locale]}
              name="crea-relight-softness"
              options={(["meko", "tvrdo"] as const).map((id) => ({ id, label: T.softnesses[id][locale] }))}
              value={setup.softness}
              onChange={(softness) => change({ softness })}
            />
          </div>
        </div>

        <div className="surface-inset space-y-2 bg-paper p-4" aria-live="polite">
          <p className="type-body font-black text-ink">{fillCopy(T.summary[locale], { summary: lightSummary(setup, locale) })}</p>
          <p className="type-body-sm font-bold text-muted">{T.promptTitle[locale]}</p>
          <p className="type-body-sm font-semibold text-ink">{relightPrompt(setup, locale)}</p>
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <PaidEditPanel
          locale={locale}
          routes={RELIGHT_ROUTES}
          purpose="edit"
          ready={image.picked !== null}
          notReadyReason={CREA_PAID_EDIT_COPY.needImage[locale]}
          prepare={async () => {
            const photo = await providerPhoto(image.picked!.file);
            return { files: { image: [photo.blob] }, width: photo.width, height: photo.height };
          }}
          request={(_route, text, size) => ({
            prompt: relightPrompt(setup, locale, text),
            aspect_ratio: nearestAspectRatio(size.width, size.height),
          })}
          textField={{ label: T.extraLabel[locale], placeholder: T.extraPlaceholder[locale], required: false }}
          label={T.cta[locale]}
          parentJobId={image.picked?.sourceJobId ?? null}
          projectId={projectId}
          canSubmit={canSave}
          paid={paid}
        />
      </div>
    </section>
  );
}
