"use client";

import { FilePlus2, Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useEditorAssets, type EditorAsset } from "@/components/crea/editor/assets";
import { EditorResult, ExportOptions, useCanvasMaxHeight, type EditorExtra, type ExportChoice } from "@/components/crea/editor/export-options";
import type { SceneCanvasHandle } from "@/components/crea/editor/scene-canvas";
import { SceneEditor } from "@/components/crea/editor/scene-editor";
import { useSceneHistory } from "@/components/crea/editor/use-scene-history";
import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { CREA_EDITOR_COPY as T } from "@/lib/crea-editor-copy";
import {
  canvasSizeForImage,
  CREA_SCENE_COLORS,
  EDITOR_CANVAS_PRESETS,
  emptyScene,
  exportFileName,
  exportPlan,
  type CreaScene,
} from "@/lib/crea-editor-scene";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import type { Locale } from "@/lib/i18n";

/** Fotka postaje platno: iste mere (do 2048 px), fotka je zaključan donji sloj. */
function sceneFromPhoto(asset: EditorAsset): CreaScene {
  const size = canvasSizeForImage(asset.width, asset.height);
  return {
    ...emptyScene(size.width, size.height, CREA_SCENE_COLORS.bela),
    nodes: [
      {
        id: "fotka-1",
        kind: "image",
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: true,
        asset: asset.id,
        cornerRadius: 0,
        placeholder: CREA_SCENE_COLORS.krem,
      },
    ],
  };
}

/**
 * Editor na platnu (S28, K10): tekst sa srpskim slovima, nalepnice, oblici,
 * vodeni žig, kolaž, slojevi i poništi/ponovi - sve na uređaju, 0 kredita.
 * Izvoz (PNG/JPG/WebP) ide kroz `ToolRunner`, pa se rezultat čuva u galeriju
 * kao i kod ostalih lokalnih alata (i kao verzija rada iz galerije, K05).
 */
export default function EditorTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const history = useSceneHistory();
  const { scene, reset } = history;
  const { assets, addFiles } = useEditorAssets();
  const canvasRef = useRef<SceneCanvasHandle | null>(null);
  const [choice, setChoice] = useState<ExportChoice>({ format: "png", scale: 1 });
  const [parentJobId, setParentJobId] = useState<Id<"generationJobs"> | null>(null);
  const image = useImageInput(source);
  const maxDisplayHeight = useCanvasMaxHeight();
  const mobile = caps?.mobile ?? false;

  // Izabrana (ili iz galerije stigla) fotka postaje platno - samo dok platno još ne postoji.
  const picked = image.picked;
  const hasScene = scene !== null;
  useEffect(() => {
    if (!picked || hasScene) return;
    let alive = true;
    void addFiles([picked.file]).then(([asset]) => {
      if (!alive || !asset) return;
      reset(sceneFromPhoto(asset));
      setParentJobId(picked.sourceJobId ?? null);
    });
    return () => {
      alive = false;
    };
  }, [picked, hasScene, addFiles, reset]);

  async function run(context: ToolRunContext): Promise<CreaToolOutput<EditorExtra>> {
    const canvas = canvasRef.current;
    if (!scene || !canvas) throw new CreaLocalAiError("UNSUPPORTED");
    context.reportRunning();
    const plan = exportPlan(scene, choice.scale, mobile);
    const blob = await canvas.exportImage({ width: plan.width, height: plan.height, format: choice.format, quality: 0.92 });
    return {
      blob,
      kind: "image",
      fileName: exportFileName("slika", choice.format, plan.width, plan.height),
      previewUrl: URL.createObjectURL(blob),
      params: { sirina: plan.width, visina: plan.height, slojeva: scene.nodes.length, format: choice.format },
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
      parentJobId={parentJobId}
      canRun={scene !== null && scene.nodes.length > 0}
      inputKey={scene ? `${history.revision}:${choice.format}:${choice.scale}` : null}
      runLabel={T.exportCta[locale]}
      icon={<Type aria-hidden="true" className="size-5" />}
      run={run}
      renderResult={(output) => <EditorResult locale={locale} output={output} />}
    >
      {({ busy }) =>
        scene ? (
          <div className="space-y-4">
            <SceneEditor
              locale={locale}
              history={history}
              assets={assets}
              addFiles={addFiles}
              canvasRef={canvasRef}
              maxDisplayHeight={maxDisplayHeight}
            />
            <ExportOptions locale={locale} scene={scene} mobile={mobile} value={choice} onChange={setChoice} />
            <div className="border-t border-line pt-4">
              <Button
                variant="ghost"
                disabled={busy}
                icon={<FilePlus2 aria-hidden="true" className="size-4" />}
                onClick={() => {
                  if (history.canUndo && !window.confirm(T.restartConfirm[locale])) return;
                  reset(null);
                  setParentJobId(null);
                }}
              >
                {T.restart[locale]}
              </Button>
            </div>
          </div>
        ) : (
          <StartChooser locale={locale} image={image} disabled={busy} onBlank={(width, height) => reset(emptyScene(width, height))} />
        )
      }
    </ToolRunner>
  );
}

/** Sličica odnosa stranica platna (uspravno, kvadrat, položeno). */
function PresetGlyph({ width, height }: { width: number; height: number }) {
  const w = 18 * Math.min(1, width / height);
  const h = 18 * Math.min(1, height / width);
  return (
    <svg aria-hidden="true" viewBox="0 0 22 22" className="size-[22px] shrink-0">
      <rect x={(22 - w) / 2} y={(22 - h) / 2} width={w} height={h} rx={2} className="fill-yellow stroke-ink" strokeWidth={2} />
    </svg>
  );
}

function StartChooser({
  locale,
  image,
  disabled,
  onBlank,
}: {
  locale: Locale;
  image: ReturnType<typeof useImageInput>;
  disabled: boolean;
  onBlank: (width: number, height: number) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="type-h4 text-ink">{T.startTitle[locale]}</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-inset space-y-3 bg-paper p-4">
          <h4 className="type-body font-black text-ink">{T.startPhoto[locale]}</h4>
          <p className="type-body-sm font-semibold text-muted">{T.startPhotoHint[locale]}</p>
          <ImageInput locale={locale} input={image} disabled={disabled} />
        </section>
        <section className="surface-inset space-y-3 bg-paper p-4">
          <h4 className="type-body font-black text-ink">{T.startBlank[locale]}</h4>
          <p className="type-body-sm font-semibold text-muted">{T.startBlankHint[locale]}</p>
          <ul className="space-y-2">
            {EDITOR_CANVAS_PRESETS.map((preset) => (
              <li key={preset.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onBlank(preset.width, preset.height)}
                  className="igra-press flex min-h-11 w-full items-center gap-3 rounded-full border-2 border-ink/25 bg-paper-strong px-4 py-1.5 text-left hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                >
                  <PresetGlyph width={preset.width} height={preset.height} />
                  <span className="min-w-0 flex-1 truncate text-sm font-black text-ink">{preset.label[locale]}</span>
                  <span className="shrink-0 font-mono text-xs font-bold text-muted">
                    {preset.width} × {preset.height}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
