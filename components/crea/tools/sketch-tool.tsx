"use client";

import { PencilRuler } from "lucide-react";
import { useId, useRef, useState } from "react";

import { SketchCanvas, SKETCH_SIZE, type SketchCanvasHandle } from "@/components/crea/create/sketch-canvas";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { providerPhoto } from "@/components/crea/tools/mask-canvas";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { CREA_MAKE_TOOLS_COPY as T } from "@/lib/crea-create-copy";
import { referenceRouteParams, SKETCH_ROUTES } from "@/lib/crea-paid-edit";
import { sketchToImagePrompt, type SketchSource } from "@/lib/crea-prompt-compose";
import { styleById } from "@/lib/crea-styles";

/** Stilovi koji imaju smisla za crtež (S10); „realno" je bez stila. */
export const SKETCH_STYLE_IDS = ["realno", "ilu-akvarel", "ilu-anime", "3d-crtani", "ilu-strip", "um-ulje", "ilu-decja", "3d-glina"] as const;

/**
 * Skica u sliku (Crea K13, S10): crtež na platnu ili fotka crteža iz sveske →
 * prava slika u izabranom stilu. Plaćeno kroz postojeći tok (`PaidEditPanel`:
 * upload → `studio.createJob`, cena na dugmetu, DEMO bez ključa).
 */
export default function SketchTool({ tool, locale, canSave, projectId, source, paid }: CreaToolProps) {
  const [from, setFrom] = useState<SketchSource>(source ? "sveska" : "platno");
  const [styleId, setStyleId] = useState<(typeof SKETCH_STYLE_IDS)[number]>("realno");
  const [text, setText] = useState("");
  const [drawn, setDrawn] = useState(false);
  const canvas = useRef<SketchCanvasHandle | null>(null);
  const photo = useImageInput(source);
  const textId = useId();
  const ready = from === "platno" ? drawn : photo.picked !== null;
  const prompt = sketchToImagePrompt({ source: from, styleId: styleId === "realno" ? null : styleId, text }, locale);

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<PencilRuler aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <ChoiceChips<SketchSource>
          legend={T.sketchSource[locale]}
          name="crea-sketch-source"
          options={(["platno", "sveska"] as const).map((id) => ({ id, label: T.sketchSources[id][locale] }))}
          value={from}
          onChange={setFrom}
        />
        {from === "platno" ? (
          <SketchCanvas ref={canvas} locale={locale} onChange={(revision) => setDrawn(revision > 0)} />
        ) : (
          <div className="space-y-2">
            <p className="type-body-sm font-black text-ink">{T.sketchPhoto[locale]}</p>
            <ImageInput locale={locale} input={photo} disabled={false} />
          </div>
        )}
        <ChoiceChips
          legend={T.sketchStyle[locale]}
          name="crea-sketch-style"
          options={SKETCH_STYLE_IDS.map((id) => ({ id, label: id === "realno" ? T.sketchRealistic[locale] : (styleById(id)?.label[locale] ?? id) }))}
          value={styleId}
          onChange={setStyleId}
        />
        <div>
          <label htmlFor={textId} className="type-body-sm font-black text-ink">
            {T.sketchText[locale]}
          </label>
          <input
            id={textId}
            value={text}
            maxLength={300}
            onChange={(event) => setText(event.target.value)}
            placeholder={T.sketchTextPlaceholder[locale]}
            className="surface-inset mt-2 block min-h-11 w-full border-2 border-ink bg-paper px-3 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        </div>
      </div>
      <div className="mt-5 border-t border-line pt-5">
        <PaidEditPanel
          locale={locale}
          routes={SKETCH_ROUTES}
          purpose="edit"
          ready={ready}
          notReadyReason={T.sketchNeed[locale]}
          prepare={async () => {
            if (from === "platno") {
              const blob = await canvas.current!.toBlob();
              return { files: { image: [blob] }, width: SKETCH_SIZE, height: SKETCH_SIZE };
            }
            const prepared = await providerPhoto(photo.picked!.file);
            return { files: { image: [prepared.blob] }, width: prepared.width, height: prepared.height };
          }}
          request={(route, _text, size) => referenceRouteParams(route, prompt, size.width, size.height)}
          measured={() => ({ input_images: 1 })}
          textField={null}
          label={T.sketchCta[locale]}
          parentJobId={from === "sveska" ? (photo.picked?.sourceJobId ?? null) : null}
          projectId={projectId}
          canSubmit={canSave}
          paid={paid}
        />
      </div>
    </section>
  );
}
