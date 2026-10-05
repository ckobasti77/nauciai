"use client";

import { Users } from "lucide-react";
import { useId, useState } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { providerPhoto } from "@/components/crea/tools/mask-canvas";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { CREA_MAKE_TOOLS_COPY as T } from "@/lib/crea-create-copy";
import { referenceRouteParams, SLOTS_ROUTES } from "@/lib/crea-paid-edit";
import { assembleSlotsPrompt, CREA_SLOT_IDS, type CreaSlotId } from "@/lib/crea-prompt-compose";

/**
 * Ko · Gde · Kako (Crea K13, S7): tri slike - lik, mesto, stil - nad modelima koji
 * primaju više referenci. Opis se sam sklopi (`assembleSlotsPrompt`) i vidi se pre
 * plaćanja; korisnik dopisuje samo šta se dešava.
 */
export default function SlotsTool({ tool, locale, canSave, projectId, source, paid }: CreaToolProps) {
  const inputs: Record<CreaSlotId, ReturnType<typeof useImageInput>> = {
    ko: useImageInput(source),
    gde: useImageInput(null),
    kako: useImageInput(null),
  };
  const [text, setText] = useState("");
  const textId = useId();
  const filled = { ko: inputs.ko.picked !== null, gde: inputs.gde.picked !== null, kako: inputs.kako.picked !== null };
  const { order, prompt } = assembleSlotsPrompt(filled, text, locale);
  const ready = order.length >= 2;

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Users aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <div className="grid gap-4 md:grid-cols-3">
          {CREA_SLOT_IDS.map((slot) => (
            <div key={slot} className="space-y-2">
              <p className="type-body-sm font-black text-ink">
                {T.slots[slot][locale]} <span className="font-semibold text-muted">· {T.slotHints[slot][locale]}</span>
              </p>
              {/* Tri mete za sliku: nijedna ne prima prevlačenje preko celog ekrana (jedna meta po ekranu). */}
              <ImageInput locale={locale} input={inputs[slot]} disabled={false} fullScreenDrop={false} />
            </div>
          ))}
        </div>
        <div>
          <label htmlFor={textId} className="type-body-sm font-black text-ink">
            {T.slotsText[locale]}
          </label>
          <input
            id={textId}
            value={text}
            maxLength={300}
            onChange={(event) => setText(event.target.value)}
            placeholder={T.slotsTextPlaceholder[locale]}
            className="surface-inset mt-2 block min-h-11 w-full border-2 border-ink bg-paper px-3 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        </div>
        {prompt ? (
          <div className="surface-inset bg-paper p-3">
            <p className="type-body-sm font-black text-ink">{T.slotsPreview[locale]}</p>
            <p className="mt-1 type-body-sm font-semibold text-ink">{prompt}</p>
          </div>
        ) : null}
      </div>
      <div className="mt-5 border-t border-line pt-5">
        <PaidEditPanel
          locale={locale}
          routes={SLOTS_ROUTES}
          purpose="edit"
          ready={ready}
          notReadyReason={T.slotsNeed[locale]}
          prepare={async () => {
            const photos = await Promise.all(order.map((slot) => providerPhoto(inputs[slot].picked!.file)));
            const first = photos[0]!;
            return { files: { image: photos.map((entry) => entry.blob) }, width: first.width, height: first.height };
          }}
          request={(route, _text, size) => referenceRouteParams(route, prompt, size.width, size.height)}
          measured={() => ({ input_images: Math.max(1, order.length) })}
          textField={null}
          label={T.slotsCta[locale]}
          parentJobId={inputs.ko.picked?.sourceJobId ?? null}
          projectId={projectId}
          canSubmit={canSave}
          paid={paid}
        />
      </div>
    </section>
  );
}
