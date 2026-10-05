/* eslint-disable @next/next/no-img-element -- sličice fotki su lokalni `blob:` URL-ovi. */
"use client";

import { ArrowLeft, ImagePlus, LayoutTemplate, Move, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { useEditorAssets, type EditorAsset } from "@/components/crea/editor/assets";
import { PillButton } from "@/components/crea/editor/controls";
import { EditorResult, ExportOptions, useCanvasMaxHeight, type EditorExtra, type ExportChoice } from "@/components/crea/editor/export-options";
import { SceneCanvas, type SceneCanvasHandle } from "@/components/crea/editor/scene-canvas";
import { SceneEditor } from "@/components/crea/editor/scene-editor";
import { useSceneHistory, type SceneHistory } from "@/components/crea/editor/use-scene-history";
import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { IMAGE_INPUT_ACCEPT } from "@/components/crea/tools/image-input";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { Button } from "@/components/ui/button";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_EDITOR_COPY, CREA_TEMPLATE_COPY as T } from "@/lib/crea-editor-copy";
import { exportFileName, exportPlan } from "@/lib/crea-editor-scene";
import { CREA_TEMPLATES, setFieldText, setSlotAsset, templateById, templateFields, type CreaTemplateId, type TemplateField } from "@/lib/crea-templates";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import type { Locale } from "@/lib/i18n";

const NO_ASSETS: ReadonlyMap<string, EditorAsset> = new Map();

/**
 * Šabloni (S29, K10): mim, YouTube sličica, Instagram objava i priča, poster,
 * pozivnice i jelovnik u brendu sveske. Korisnik popunjava polja i dodaje
 * fotke; izgled ostaje (tekst se smanji da stane u svoj okvir). „Uredi slobodno"
 * otvara istu scenu u editoru (S28) - sve na uređaju, 0 kredita.
 */
export default function TemplatesTool({ tool, locale, caps, canSave, projectId }: CreaToolProps) {
  const history = useSceneHistory();
  const { scene, reset, apply } = history;
  const { assets, addFiles } = useEditorAssets();
  const canvasRef = useRef<SceneCanvasHandle | null>(null);
  const [templateId, setTemplateId] = useState<CreaTemplateId | null>(null);
  const [mode, setMode] = useState<"fields" | "free">("fields");
  const [choice, setChoice] = useState<ExportChoice>({ format: "png", scale: 1 });
  const maxDisplayHeight = useCanvasMaxHeight();
  const mobile = caps?.mobile ?? false;
  const template = templateById(templateId);

  function choose(id: CreaTemplateId) {
    const next = templateById(id);
    if (!next) return;
    setTemplateId(id);
    setMode("fields");
    reset(next.scene);
  }

  async function run(context: ToolRunContext): Promise<CreaToolOutput<EditorExtra>> {
    const canvas = canvasRef.current;
    if (!scene || !canvas || !template) throw new CreaLocalAiError("UNSUPPORTED");
    context.reportRunning();
    const plan = exportPlan(scene, choice.scale, mobile);
    const blob = await canvas.exportImage({ width: plan.width, height: plan.height, format: choice.format, quality: 0.92 });
    return {
      blob,
      kind: "image",
      fileName: exportFileName(template.id, choice.format, plan.width, plan.height),
      previewUrl: URL.createObjectURL(blob),
      params: { sablon: template.id, sirina: plan.width, visina: plan.height, format: choice.format },
      extra: { width: plan.width, height: plan.height },
    };
  }

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      canRun={scene !== null && template !== undefined}
      inputKey={scene && template ? `${template.id}:${history.revision}:${mode}:${choice.format}:${choice.scale}` : null}
      runLabel={CREA_EDITOR_COPY.exportCta[locale]}
      icon={<LayoutTemplate aria-hidden="true" className="size-5" />}
      run={run}
      renderResult={(output) => <EditorResult locale={locale} output={output} />}
    >
      {({ busy }) =>
        scene && template ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 flex-1 type-h4 text-ink">{template.title[locale]}</h3>
              <Button
                variant="ghost"
                disabled={busy}
                icon={<ArrowLeft aria-hidden="true" className="size-4" />}
                onClick={() => {
                  setTemplateId(null);
                  reset(null);
                }}
              >
                {T.otherTemplate[locale]}
              </Button>
            </div>

            {mode === "fields" ? (
              <div className="@container">
                <div className="grid items-start gap-5 @min-[560px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="surface-inset bg-surface-b p-2 @min-[560px]:sticky @min-[560px]:top-4 sm:p-3">
                    <SceneCanvas
                      ref={canvasRef}
                      scene={scene}
                      assets={assets}
                      interactive={false}
                      slotHint={CREA_EDITOR_COPY.addPhotoHere[locale]}
                      maxDisplayHeight={Math.round(maxDisplayHeight * 0.85)}
                      label={fillCopy(T.previewLabel[locale], { name: template.title[locale] })}
                    />
                  </div>
                  <TemplateFields locale={locale} history={history} assets={assets} addFiles={addFiles} disabled={busy} />
                </div>
              </div>
            ) : (
              <SceneEditor
                locale={locale}
                history={history}
                assets={assets}
                addFiles={addFiles}
                canvasRef={canvasRef}
                maxDisplayHeight={maxDisplayHeight}
              />
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              {mode === "fields" ? (
                <>
                  <PillButton
                    disabled={busy}
                    icon={<Move aria-hidden="true" className="size-4" />}
                    onClick={() => {
                      // Slobodno uređivanje: sve što je šablon zaključao sada sme da se pomera.
                      apply((current) => ({ ...current, nodes: current.nodes.map((node) => (node.locked ? { ...node, locked: false } : node)) }));
                      setMode("free");
                    }}
                  >
                    {T.freeEdit[locale]}
                  </PillButton>
                  <p className="type-body-sm font-semibold text-muted">{T.freeEditHint[locale]}</p>
                </>
              ) : (
                <PillButton disabled={busy} icon={<ArrowLeft aria-hidden="true" className="size-4" />} onClick={() => setMode("fields")}>
                  {T.backToFields[locale]}
                </PillButton>
              )}
            </div>

            <ExportOptions locale={locale} scene={scene} mobile={mobile} value={choice} onChange={setChoice} />
          </div>
        ) : (
          <TemplateGallery locale={locale} onChoose={choose} disabled={busy} />
        )
      }
    </ToolRunner>
  );
}

function TemplateGallery({ locale, onChoose, disabled }: { locale: Locale; onChoose: (id: CreaTemplateId) => void; disabled: boolean }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="type-h4 text-ink">{T.pickTitle[locale]}</h3>
        <p className="mt-1 type-body-sm font-semibold text-muted">{T.pickHint[locale]}</p>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CREA_TEMPLATES.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChoose(template.id)}
              className="surface-inset group flex h-full w-full flex-col gap-2 border border-line bg-paper p-2 text-left transition hover:-translate-y-0.5 hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span className="grid h-40 w-full place-items-center sm:h-44">
                <SceneCanvas
                  scene={template.scene}
                  assets={NO_ASSETS}
                  interactive={false}
                  maxDisplayHeight={160}
                  label={fillCopy(T.previewLabel[locale], { name: template.title[locale] })}
                />
              </span>
              <span className="px-1 text-sm font-black text-ink">{template.title[locale]}</span>
              <span className="px-1 pb-1 text-xs font-bold text-muted">{template.summary[locale]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TemplateFields({
  locale,
  history,
  assets,
  addFiles,
  disabled,
}: {
  locale: Locale;
  history: SceneHistory;
  assets: ReadonlyMap<string, EditorAsset>;
  addFiles: (files: readonly File[]) => Promise<EditorAsset[]>;
  disabled: boolean;
}) {
  const scene = history.scene!;
  const fields = templateFields(scene);
  return (
    <div className="space-y-4">
      <div>
        <h4 className="type-body font-black text-ink">{T.fieldsTitle[locale]}</h4>
        <p className="mt-1 type-body-sm font-semibold text-muted">{T.layoutKept[locale]}</p>
      </div>
      {fields.map((field) =>
        field.kind === "text" ? (
          <TextFieldInput
            key={field.nodeId}
            locale={locale}
            field={field}
            disabled={disabled}
            onChange={(value) => history.apply((current) => setFieldText(current, field.field.id, value), `polje:${field.field.id}`)}
          />
        ) : (
          <SlotInput
            key={field.nodeId}
            locale={locale}
            field={field}
            asset={field.asset ? assets.get(field.asset) : undefined}
            disabled={disabled}
            onFiles={(files) =>
              void addFiles(files.slice(0, 1)).then(([asset]) => {
                if (asset) history.apply((current) => setSlotAsset(current, field.slot.id, asset.id));
              })
            }
            onRemove={() => history.apply((current) => setSlotAsset(current, field.slot.id, null))}
          />
        ),
      )}
    </div>
  );
}

function TextFieldInput({
  locale,
  field,
  disabled,
  onChange,
}: {
  locale: Locale;
  field: Extract<TemplateField, { kind: "text" }>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const counterId = useId();
  const common = {
    id,
    value: field.value,
    maxLength: field.field.maxLength,
    disabled,
    "aria-describedby": counterId,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
    className:
      "surface-inset mt-2 block w-full border-2 border-ink bg-paper px-3 text-base font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60",
  };
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="type-body-sm font-black text-ink">
          {field.field.label[locale]}
        </label>
        <span id={counterId} className="font-mono text-xs font-bold text-muted">
          {fillCopy(T.chars[locale], { n: field.value.length, max: field.field.maxLength })}
        </span>
      </div>
      {field.field.multiline ? (
        <textarea {...common} rows={Math.min(7, Math.max(3, field.value.split("\n").length + 1))} className={`${common.className} py-2`} />
      ) : (
        <input {...common} type="text" className={`${common.className} min-h-11`} />
      )}
    </div>
  );
}

function SlotInput({
  locale,
  field,
  asset,
  disabled,
  onFiles,
  onRemove,
}: {
  locale: Locale;
  field: Extract<TemplateField, { kind: "image" }>;
  asset: EditorAsset | undefined;
  disabled: boolean;
  onFiles: (files: File[]) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div>
      <p className="type-body-sm font-black text-ink">{fillCopy(T.photoFor[locale], { label: field.slot.label[locale] })}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {asset ? (
          <img src={asset.url} alt="" className="surface-media size-14 object-cover shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" />
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_INPUT_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            onFiles(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
        />
        <PillButton disabled={disabled} onClick={() => inputRef.current?.click()} icon={<ImagePlus aria-hidden="true" className="size-4" />}>
          {asset ? T.changePhoto[locale] : T.choosePhoto[locale]}
        </PillButton>
        {asset ? (
          <PillButton disabled={disabled} onClick={onRemove} icon={<X aria-hidden="true" className="size-4" />}>
            {T.removePhoto[locale]}
          </PillButton>
        ) : null}
      </div>
    </div>
  );
}
