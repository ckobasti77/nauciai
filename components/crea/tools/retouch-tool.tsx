"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import BeforeAfter from "@/components/crea/before-after";
import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { canvasToBlob, createCanvas, decodeImage, drawScaled } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { outputTypeFor, providerPhoto, resultFileName } from "@/components/crea/tools/mask-canvas";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_PAID_EDIT_COPY, CREA_RETOUCH_COPY as T } from "@/lib/crea-edit-copy";
import { CREA_IMAGE_TOOL_COPY } from "@/lib/crea-image-tools-copy";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { nearestAspectRatio, RESTORE_ROUTES } from "@/lib/crea-paid-edit";
import {
  MIN_SKIN_SHARE,
  RETOUCH_MAX_PIXELS,
  RETOUCH_STRENGTH,
  restorePrompt,
  retouchPixels,
  skinShare,
  type RetouchLevel,
} from "@/lib/crea-retouch";
import type { Locale } from "@/lib/i18n";

type RetouchExtra = { width: number; height: number; shrunk: boolean };

/** Filter na platnu: koža se zagladi, ivice (oči, usne, kosa) ostaju; ostatak fotke se ne dira. */
async function retouch(file: File, level: RetouchLevel, mobile: boolean, context: ToolRunContext): Promise<CreaToolOutput<RetouchExtra>> {
  context.reportRunning();
  const bitmap = await decodeImage(file);
  const limit = mobile ? RETOUCH_MAX_PIXELS.phone : RETOUCH_MAX_PIXELS.desktop;
  const scale = Math.min(1, Math.sqrt(limit / (bitmap.width * bitmap.height)));
  const { canvas, ctx } = createCanvas(bitmap.width * scale, bitmap.height * scale);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (skinShare(pixels.data) < MIN_SKIN_SHARE) throw new CreaLocalAiError("BAD_INPUT");
  // Jedan prolaz kroz piksele traje; daj browseru da nacrta „Radim…" pre toga.
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
  pixels.data.set(retouchPixels(pixels.data, canvas.width, canvas.height, RETOUCH_STRENGTH[level]));
  ctx.putImageData(pixels, 0, 0);
  const type = outputTypeFor(file);
  const blob = await canvasToBlob(canvas, type, 0.92);
  return {
    blob,
    kind: "image",
    fileName: resultFileName("retus", file, type),
    previewUrl: URL.createObjectURL(blob),
    params: { jacina: level, sirina: canvas.width, visina: canvas.height },
    extra: { width: canvas.width, height: canvas.height, shrunk: scale < 1 },
  };
}

/**
 * Retuš i stare fotke (S22, K12): blag retuš kože na uređaju (0 kr), a „Vrati
 * staru fotku" uz kredite (Nano Banana Pro sa opisom restauracije; bez modela u
 * katalogu piše „stiže uskoro").
 */
export default function RetouchTool({ tool, locale, caps, canSave, projectId, source, paid }: CreaToolProps) {
  const image = useImageInput(source);
  const [level, setLevel] = useState<RetouchLevel>("blago");
  const [colorize, setColorize] = useState(false);
  const [skin, setSkin] = useState<{ key: string; enough: boolean } | null>(null);
  const picked = image.picked;
  const noSkin = picked !== null && skin?.key === picked.key && !skin.enough;

  // Ima li na fotki kože (na umanjenoj kopiji) - bez nje retuš nema šta da radi, pa dugme i ne nudimo.
  useEffect(() => {
    if (!picked) return;
    let alive = true;
    void decodeImage(picked.file)
      .then((bitmap) => {
        const { ctx, canvas } = drawScaled(bitmap, 256);
        bitmap.close();
        const enough = skinShare(ctx.getImageData(0, 0, canvas.width, canvas.height).data, 1) >= MIN_SKIN_SHARE;
        if (alive) setSkin({ key: picked.key, enough });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [picked]);

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={picked?.sourceJobId ?? null}
      canRun={picked !== null && !noSkin}
      inputKey={picked ? `${picked.key}:${level}` : null}
      runLabel={T.run[locale]}
      icon={<Sparkles aria-hidden="true" className="size-5" />}
      run={(context) => retouch(picked!.file, level, caps?.mobile === true, context)}
      renderResult={(output) => <RetouchResult locale={locale} output={output} beforeUrl={picked?.url ?? ""} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <ImageInput locale={locale} input={image} disabled={busy} />
          <ChoiceChips<RetouchLevel>
            legend={T.level[locale]}
            name="crea-retouch-level"
            options={(["blago", "srednje", "jace"] as const).map((id) => ({ id, label: T.levels[id][locale] }))}
            value={level}
            onChange={setLevel}
            disabled={busy}
          />
          <p className="type-body-sm font-semibold text-muted">{T.how[locale]}</p>
          {noSkin ? <p className="type-body-sm font-bold text-ink">{T.noSkin[locale]}</p> : null}

          <section className="surface-inset space-y-3 bg-paper p-4">
            <h3 className="type-body font-black text-ink">{T.restoreTitle[locale]}</h3>
            <p className="type-body-sm font-semibold text-muted">{T.restoreBody[locale]}</p>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 type-body-sm font-bold text-ink">
              <input
                type="checkbox"
                checked={colorize}
                disabled={busy}
                onChange={(event) => setColorize(event.target.checked)}
                className="size-5 accent-ink"
              />
              {T.colorize[locale]}
            </label>
            <PaidEditPanel
              locale={locale}
              routes={RESTORE_ROUTES}
              purpose="edit"
              ready={picked !== null && !busy}
              notReadyReason={CREA_PAID_EDIT_COPY.needImage[locale]}
              prepare={async () => {
                const photo = await providerPhoto(picked!.file);
                return { files: { image: [photo.blob] }, width: photo.width, height: photo.height };
              }}
              request={(_route, text, size) => ({
                prompt: restorePrompt(colorize, text, locale),
                aspect_ratio: nearestAspectRatio(size.width, size.height),
              })}
              textField={{ label: T.extraLabel[locale], placeholder: T.extraPlaceholder[locale], required: false }}
              label={T.restoreCta[locale]}
              unavailableText={T.restoreSoon[locale]}
              parentJobId={picked?.sourceJobId ?? null}
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

function RetouchResult({ locale, output, beforeUrl }: { locale: Locale; output: CreaToolOutput<RetouchExtra>; beforeUrl: string }) {
  return (
    <div className="space-y-2">
      {output.previewUrl ? (
        <BeforeAfter
          beforeUrl={beforeUrl}
          afterUrl={output.previewUrl}
          beforeLabel={CREA_IMAGE_TOOL_COPY.before[locale]}
          afterLabel={CREA_IMAGE_TOOL_COPY.after[locale]}
          label={`${CREA_IMAGE_TOOL_COPY.before[locale]} / ${CREA_IMAGE_TOOL_COPY.after[locale]}`}
        />
      ) : null}
      {output.extra.shrunk ? (
        <p className="type-body-sm font-semibold text-muted">{fillCopy(T.shrunk[locale], { w: output.extra.width, h: output.extra.height })}</p>
      ) : null}
    </div>
  );
}
