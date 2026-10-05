/* eslint-disable @next/next/no-img-element -- rezultat je lokalni `blob:` URL, koji next/image ne obrađuje. */
"use client";

import { useSyncExternalStore } from "react";

import type { CreaToolOutput } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_EDITOR_COPY as T } from "@/lib/crea-editor-copy";
import { EXPORT_FORMATS, exportPlan, type CreaScene, type ExportFormat } from "@/lib/crea-editor-scene";
import { emptySlots } from "@/lib/crea-templates";
import type { Locale } from "@/lib/i18n";

export type ExportChoice = { format: ExportFormat; scale: 1 | 2 };
export type EditorExtra = { width: number; height: number };

/** Izbor formata i veličine izvoza (i napomena za telefon i prazna mesta za fotku). */
export function ExportOptions({
  locale,
  scene,
  mobile,
  value,
  onChange,
}: {
  locale: Locale;
  scene: CreaScene;
  mobile: boolean;
  value: ExportChoice;
  onChange: (value: ExportChoice) => void;
}) {
  const standard = exportPlan(scene, 1, mobile);
  const sharp = exportPlan(scene, 2, mobile);
  const plan = value.scale === 2 ? sharp : standard;
  const empty = emptySlots(scene);
  return (
    <div className="space-y-4 border-t border-line pt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceChips
          legend={T.exportFormat[locale]}
          name="crea-editor-format"
          options={(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((id) => ({ id, label: EXPORT_FORMATS[id].label }))}
          value={value.format}
          onChange={(format) => onChange({ ...value, format })}
        />
        <ChoiceChips
          legend={T.exportSize[locale]}
          name="crea-editor-scale"
          options={[
            { id: 1 as const, label: T.exportStandard[locale], hint: fillCopy(T.exportSize1[locale], { w: standard.width, h: standard.height }) },
            { id: 2 as const, label: T.exportSharp[locale], hint: fillCopy(T.exportSize1[locale], { w: sharp.width, h: sharp.height }) },
          ]}
          value={value.scale}
          onChange={(scale) => onChange({ ...value, scale })}
        />
      </div>
      {plan.limited ? <p className="type-body-sm font-semibold text-muted">{T.exportLimited[locale]}</p> : null}
      {empty.length > 0 ? (
        <p className="type-body-sm font-semibold text-muted">
          {fillCopy(T.emptySlots[locale], { names: empty.map((slot) => slot.label[locale]).join(", ") })}
        </p>
      ) : null}
    </div>
  );
}

export function EditorResult({ locale, output }: { locale: Locale; output: CreaToolOutput<EditorExtra> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
      {output.previewUrl ? (
        <img
          src={output.previewUrl}
          alt={output.fileName}
          className="surface-media max-h-96 w-full bg-paper object-contain shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
        />
      ) : null}
      <div className="space-y-1">
        <p className="break-all type-body-sm font-semibold text-muted">{output.fileName}</p>
        <p className="font-mono text-sm font-black text-ink">
          {fillCopy(T.exportedSize[locale], { w: output.extra.width, h: output.extra.height })}
        </p>
      </div>
    </div>
  );
}

/** Visina prikaza platna: oko dve trećine prozora, da uspravna scena ne pojede ekran. */
function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

export function useCanvasMaxHeight(): number {
  return useSyncExternalStore(
    subscribeResize,
    () => Math.max(300, Math.round(window.innerHeight * 0.66)),
    () => 560,
  );
}
