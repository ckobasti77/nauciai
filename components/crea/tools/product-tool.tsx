"use client";

import { Shirt } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";

import { ToolHeader, ToolRunner, type CreaToolOutput } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { providerPhoto, useWorkImage } from "@/components/crea/tools/mask-canvas";
import { MaskEditor, type MaskEditorHandle } from "@/components/crea/tools/mask-editor";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import { makeSelection } from "@/components/crea/tools/select-tool";
import { TransparentPreview } from "@/components/crea/tools/transparent-preview";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { CREA_BACKGROUND_COPY, CREA_PRODUCT_COPY as T } from "@/lib/crea-edit-copy";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { maskIsUsable, type MaskStats } from "@/lib/crea-mask";
import { nearestAspectRatio, PRODUCT_ROUTES, productScenePrompt, TRYON_ROUTES } from "@/lib/crea-paid-edit";

type Mode = "odeca" | "proizvod";

/**
 * Odeća i proizvodi (S23, K12): „Probaj odeću" je postojeći Kling try-on (osoba +
 * odevni predmet, dva imenovana slota); „Proizvod u scenu" iseče proizvod klikom
 * na uređaju (0 kr, može i u galeriju) pa ga Nano Banana 2 postavi u scenu iz
 * više referenci (isečak + fotka scene) ili po opisu.
 */
export default function ProductTool(props: CreaToolProps) {
  const [mode, setMode] = useState<Mode>("odeca");
  const chips = (
    <ChoiceChips<Mode>
      legend={T.mode[props.locale]}
      name="crea-product-mode"
      options={(["odeca", "proizvod"] as const).map((id) => ({ id, label: T.modes[id][props.locale] }))}
      value={mode}
      onChange={setMode}
    />
  );
  return mode === "odeca" ? <TryOn {...props} modeChips={chips} /> : <ProductScene {...props} modeChips={chips} />;
}

function TryOn({ tool, locale, canSave, projectId, source, paid, modeChips }: CreaToolProps & { modeChips: ReactNode }) {
  const person = useImageInput(source);
  const garment = useImageInput(null);
  const ready = person.picked !== null && garment.picked !== null;

  return (
    <section
      aria-labelledby="crea-tool-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <ToolHeader tool={tool} locale={locale} icon={<Shirt aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        {modeChips}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="type-body-sm font-black text-ink">{T.person[locale]}</p>
            <ImageInput locale={locale} input={person} disabled={false} />
          </div>
          <div className="space-y-2">
            <p className="type-body-sm font-black text-ink">{T.garment[locale]}</p>
            <ImageInput locale={locale} input={garment} disabled={false} fullScreenDrop={false} />
          </div>
        </div>
        <p className="type-body-sm font-semibold text-muted">{T.tryonNote[locale]}</p>
      </div>
      <div className="mt-5 border-t border-line pt-5">
        <PaidEditPanel
          locale={locale}
          routes={TRYON_ROUTES}
          purpose="edit"
          ready={ready}
          notReadyReason={T.tryonNeed[locale]}
          prepare={async () => {
            const [personPhoto, garmentPhoto] = await Promise.all([providerPhoto(person.picked!.file), providerPhoto(garment.picked!.file)]);
            return { files: { person: [personPhoto.blob], garment: [garmentPhoto.blob] }, width: personPhoto.width, height: personPhoto.height };
          }}
          request={() => ({})}
          textField={null}
          label={T.tryonCta[locale]}
          parentJobId={person.picked?.sourceJobId ?? null}
          projectId={projectId}
          canSubmit={canSave}
          paid={paid}
        />
      </div>
    </section>
  );
}

type CutExtra = { width: number; height: number };

function ProductScene({ tool, locale, caps, canSave, projectId, source, paid, modeChips }: CreaToolProps & { modeChips: ReactNode }) {
  const product = useImageInput(source);
  const scene = useImageInput(null);
  const { work } = useWorkImage(product.picked?.file ?? null);
  const editor = useRef<MaskEditorHandle | null>(null);
  const [stats, setStats] = useState<MaskStats>({ coverage: 0, box: null });
  const onStats = useCallback((next: MaskStats) => setStats(next), []);
  const usable = maskIsUsable(stats);
  const maskKey = `${stats.coverage.toFixed(5)}:${stats.box ? `${stats.box.x},${stats.box.y},${stats.box.width},${stats.box.height}` : ""}`;
  const mobile = caps?.mobile === true;
  const hasScene = scene.picked !== null;

  /** Isečak proizvoda (PNG sa providnošću) iz trenutne oznake - isti za čuvanje i za plaćeni korak. */
  async function cutOut(signal: AbortSignal): Promise<CreaToolOutput<CutExtra>> {
    const maskCanvas = editor.current?.maskCanvas();
    if (!work || !maskCanvas || !product.picked) throw new CreaLocalAiError("BAD_INPUT");
    const output = await makeSelection(work, product.picked.file, maskCanvas, "izdvoji", mobile, {
      signal,
      reportDownload: () => undefined,
      reportRunning: () => undefined,
      reportProgress: () => undefined,
    });
    return { ...output, extra: { width: output.extra.width, height: output.extra.height } };
  }

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={product.picked?.sourceJobId ?? null}
      // Klik preuzima MagicTouch u editoru maske (sa svojom porukom); isecanje ne preuzima ništa.
      models={[]}
      canRun={work !== null && usable}
      inputKey={product.picked ? `${product.picked.key}:${maskKey}` : null}
      runLabel={T.cutRun[locale]}
      icon={<Shirt aria-hidden="true" className="size-5" />}
      run={(context) => cutOut(context.signal)}
      renderResult={(output) => (
        <div className="space-y-2">
          {output.previewUrl ? <TransparentPreview url={output.previewUrl} alt={T.product[locale]} transparent /> : null}
          <p className="type-body-sm font-semibold text-muted">{CREA_BACKGROUND_COPY.transparentNote[locale]}</p>
        </div>
      )}
    >
      {({ busy }) => (
        <div className="space-y-5">
          {modeChips}
          <div className="space-y-2">
            <p className="type-body-sm font-black text-ink">{T.product[locale]}</p>
            <ImageInput locale={locale} input={product} disabled={busy} />
          </div>
          {work && product.picked ? (
            <>
              <p className="type-body-sm font-semibold text-muted">{T.productHint[locale]}</p>
              <MaskEditor
                key={product.picked.key}
                ref={editor}
                locale={locale}
                image={work.work}
                tools={["klik", "cetkica", "gumica"]}
                initialTool="klik"
                disabled={busy}
                caps={caps}
                onStats={onStats}
              />
            </>
          ) : null}

          <section className="surface-inset space-y-3 bg-paper p-4">
            <p className="type-body-sm font-black text-ink">{T.scene[locale]}</p>
            <ImageInput locale={locale} input={scene} disabled={busy} fullScreenDrop={false} />
            <PaidEditPanel
              locale={locale}
              routes={PRODUCT_ROUTES}
              purpose="edit"
              ready={work !== null && usable && !busy}
              notReadyReason={T.needCut[locale]}
              prepare={async () => {
                const cut = await cutOut(new AbortController().signal);
                const files: Blob[] = [cut.blob];
                let size = { width: cut.extra.width, height: cut.extra.height };
                if (scene.picked) {
                  const photo = await providerPhoto(scene.picked.file);
                  files.push(photo.blob);
                  size = { width: photo.width, height: photo.height };
                }
                return { files: { image: files }, ...size };
              }}
              request={(_route, text, size) => ({
                prompt: productScenePrompt(hasScene, text, locale),
                aspect_ratio: nearestAspectRatio(size.width, size.height),
              })}
              textField={{ label: T.sceneLabel[locale], placeholder: T.scenePlaceholder[locale], required: !hasScene }}
              label={T.productCta[locale]}
              parentJobId={product.picked?.sourceJobId ?? null}
              projectId={projectId}
              canSubmit={canSave}
              paid={paid}
            />
          </section>
        </div>
      )}
    </ToolRunner>
  );
}
