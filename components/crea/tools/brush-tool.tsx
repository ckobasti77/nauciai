"use client";

import { Brush } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { prepareMaskEdit, useWorkImage } from "@/components/crea/tools/mask-canvas";
import { MaskEditor, type MaskEditorHandle } from "@/components/crea/tools/mask-editor";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { CREA_PAID_EDIT_COPY } from "@/lib/crea-edit-copy";
import { maskIsUsable, type MaskStats } from "@/lib/crea-mask";
import { BRUSH_ROUTES } from "@/lib/crea-paid-edit";

/**
 * Četkica i opis (S11, K11): ofarbaj deo slike (ili klikni na predmet),
 * napiši šta tu ide, pa plaćena izmena kroz katalog - Ideogram 4.5 sa pravom
 * maskom, ili Nano Banana 2 sa obojenim delom. Cena je na dugmetu; posao ide
 * kroz postojeći tok i stiže u istoriju kao nova verzija slike.
 */
export default function BrushTool({ tool, locale, caps, canSave, projectId, source, paid }: CreaToolProps) {
  const image = useImageInput(source);
  const { work } = useWorkImage(image.picked?.file ?? null);
  const editor = useRef<MaskEditorHandle | null>(null);
  const [stats, setStats] = useState<MaskStats>({ coverage: 0, box: null });
  const onStats = useCallback((next: MaskStats) => setStats(next), []);
  const usable = maskIsUsable(stats);

  return (
    <section
      aria-labelledby="crea-tool-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <ToolHeader tool={tool} locale={locale} icon={<Brush aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <ImageInput locale={locale} input={image} disabled={false} />
        {work && image.picked ? (
          <MaskEditor
            key={image.picked.key}
            ref={editor}
            locale={locale}
            image={work.work}
            tools={["cetkica", "gumica", "klik"]}
            disabled={false}
            caps={caps}
            onStats={onStats}
          />
        ) : null}
      </div>
      <div className="mt-5 border-t border-line pt-5">
        <PaidEditPanel
          locale={locale}
          routes={BRUSH_ROUTES}
          purpose="edit"
          ready={work !== null && usable}
          notReadyReason={work ? CREA_PAID_EDIT_COPY.needMask[locale] : CREA_PAID_EDIT_COPY.needImage[locale]}
          prepare={async (route) => {
            const maskCanvas = editor.current?.maskCanvas();
            if (!work || !maskCanvas) throw new Error("NEISPRAVNI_ULAZI");
            return prepareMaskEdit(work, maskCanvas, route);
          }}
          parentJobId={image.picked?.sourceJobId ?? null}
          projectId={projectId}
          canSubmit={canSave}
          paid={paid}
        />
      </div>
    </section>
  );
}

