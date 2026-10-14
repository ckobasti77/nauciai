/* eslint-disable @next/next/no-img-element -- sličice su naši SVG-ovi i lokalni `blob:` URL-ovi. */
"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Circle,
  Copy,
  Eye,
  EyeOff,
  Heading,
  Highlighter,
  ImagePlus,
  Lock,
  LockOpen,
  PenLine,
  Redo2,
  Square,
  Star,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";

import type { EditorAsset } from "@/components/crea/editor/assets";
import { ColorPicker, IconButton, PillButton, RangeField } from "@/components/crea/editor/controls";
import { useBrandKit } from "@/components/crea/brand-kit/use-brand-kit";
import { useSeasonStickerGroups } from "@/components/crea/community/use-season";
import { SceneCanvas, type SceneCanvasHandle } from "@/components/crea/editor/scene-canvas";
import type { SceneHistory } from "@/components/crea/editor/use-scene-history";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { IMAGE_INPUT_ACCEPT } from "@/components/crea/tools/image-input";
import { FullScreenDropOverlay, useFullScreenDrop } from "@/components/studio/drop-slot";
import { cn } from "@/components/ui/primitives";
import { CREA_TOOL_COPY, fillCopy } from "@/lib/crea-copy";
import { CREA_EDITOR_COPY as T } from "@/lib/crea-editor-copy";
import {
  addNode,
  applyCollage,
  COLLAGE_LAYOUTS,
  containSize,
  CREA_FONT_WEIGHTS,
  CREA_SCENE_COLORS,
  duplicateNode,
  findNode,
  moveNode,
  nextNodeId,
  nodeLabel,
  removeNode,
  updateNode,
  watermarkImage,
  watermarkText,
  type CollageLayoutId,
  type CreaImageNode,
  type CreaNodePatch,
  type CreaScene,
  type CreaSceneNode,
  type CreaShapeNode,
  type CreaTextNode,
} from "@/lib/crea-editor-scene";
import { brandWatermarkText, type CreaBrandKit } from "@/lib/crea-brand-kit";
import { stickerUrl } from "@/lib/crea-stickers";
import type { Locale } from "@/lib/i18n";

type PanelId = "tekst" | "nalepnice" | "oblici" | "fotke" | "kolaz" | "zig" | "slojevi";

const TEXT_FIELD_ID = "crea-editor-text";

function FileButton({
  label,
  multiple,
  onFiles,
  icon,
}: {
  label: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  icon?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_INPUT_ACCEPT}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
      />
      <PillButton onClick={() => inputRef.current?.click()} icon={icon ?? <ImagePlus aria-hidden="true" className="size-4" />}>
        {label}
      </PillButton>
    </>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="type-body-sm font-semibold text-muted">{children}</p>;
}

/** Nov čvor oko sredine platna; svaki sledeći ide malo niže (pa opet gore), da se ne slažu jedan preko drugog. */
function centered(scene: CreaScene, width: number, height: number) {
  const step = Math.round(scene.height * 0.12) * ((scene.nodes.length % 5) - 2);
  const y = Math.round((scene.height - height) / 2) + step;
  return { x: Math.round((scene.width - width) / 2), y: Math.min(Math.max(0, y), Math.max(0, scene.height - height)) };
}

const BASE = { rotation: 0, opacity: 1, visible: true, locked: false } as const;

function newText(scene: CreaScene, kind: "heading" | "body" | "hand", locale: Locale, brand: CreaBrandKit | null): CreaTextNode {
  const unit = Math.min(scene.width, scene.height);
  const fontSize = Math.round(unit * (kind === "heading" ? 0.1 : kind === "hand" ? 0.07 : 0.05));
  const width = Math.round(scene.width * 0.8);
  const text = (kind === "heading" ? T.newHeading : kind === "hand" ? T.newHand : T.newBody)[locale];
  return {
    ...BASE,
    ...centered(scene, width, fontSize * 1.2),
    id: nextNodeId(scene, "tekst"),
    kind: "text",
    text,
    // Brend kit (S38): naslov i tekst dobijaju slova firme; rukopis ostaje rukopis.
    font: kind === "hand" ? "rukopis" : (brand ? (kind === "heading" ? brand.fonts.heading : brand.fonts.body) : "nunito"),
    weight: kind === "heading" ? 900 : kind === "hand" ? 400 : 700,
    fontSize,
    fit: false,
    width,
    lineHeight: 1.15,
    align: "center",
    verticalAlign: "top",
    fill: CREA_SCENE_COLORS.mastilo,
    uppercase: false,
  };
}

type ShapePreset = "rect" | "ellipse" | "star" | "arrow" | "tape" | "marker";

function newShape(scene: CreaScene, preset: ShapePreset): CreaShapeNode {
  const unit = Math.min(scene.width, scene.height);
  const ink = { color: CREA_SCENE_COLORS.mastilo, width: Math.max(2, Math.round(unit * 0.006)) };
  const hard = { color: CREA_SCENE_COLORS.mastilo, x: Math.round(unit * 0.012), y: Math.round(unit * 0.012) };
  const id = nextNodeId(scene, "oblik");
  const make = (width: number, height: number, rest: Partial<CreaShapeNode> & Pick<CreaShapeNode, "shape" | "fill">): CreaShapeNode => ({
    ...BASE,
    ...centered(scene, width, height),
    id,
    kind: "shape",
    width: Math.round(width),
    height: Math.round(height),
    cornerRadius: 0,
    ...rest,
  });
  switch (preset) {
    case "rect":
      return make(unit * 0.4, unit * 0.25, { shape: "rect", fill: CREA_SCENE_COLORS.zuta, stroke: ink, cornerRadius: Math.round(unit * 0.015), shadow: hard });
    case "ellipse":
      return make(unit * 0.3, unit * 0.3, { shape: "ellipse", fill: CREA_SCENE_COLORS.zuta, stroke: ink, shadow: hard });
    case "star":
      return make(unit * 0.3, unit * 0.3, { shape: "star", fill: CREA_SCENE_COLORS.zuta, stroke: ink });
    case "arrow":
      return make(unit * 0.35, unit * 0.1, { shape: "arrow", fill: CREA_SCENE_COLORS.mastilo });
    case "tape":
      return make(unit * 0.3, unit * 0.07, { shape: "rect", fill: CREA_SCENE_COLORS.zuta, opacity: 0.85, rotation: -4 });
    case "marker":
      return make(unit * 0.5, unit * 0.06, { shape: "rect", fill: CREA_SCENE_COLORS.zuta, opacity: 0.55, cornerRadius: Math.round(unit * 0.01) });
  }
}

function photoNode(scene: CreaScene, asset: EditorAsset): CreaImageNode {
  const size = containSize(asset.width, asset.height, scene.width * 0.7, scene.height * 0.7);
  return {
    ...BASE,
    ...centered(scene, size.width, size.height),
    id: nextNodeId(scene, "fotka"),
    kind: "image",
    width: size.width,
    height: size.height,
    asset: asset.id,
    cornerRadius: 0,
    placeholder: CREA_SCENE_COLORS.krem,
  };
}

export function SceneEditor({
  locale,
  history,
  assets,
  addFiles,
  canvasRef,
  maxDisplayHeight,
}: {
  locale: Locale;
  history: SceneHistory;
  assets: ReadonlyMap<string, EditorAsset>;
  addFiles: (files: readonly File[]) => Promise<EditorAsset[]>;
  canvasRef: Ref<SceneCanvasHandle>;
  maxDisplayHeight: number;
}) {
  const scene = history.scene!;
  const { apply } = history;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelId>("tekst");
  const canvasFocusRef = useRef<HTMLDivElement | null>(null);
  const hintId = useId();
  const selected = findNode(scene, selectedId);
  // Brend kit (S38, K15): slova za nov tekst, ime i logo za žig (boje nudi `ColorPicker`).
  const brand = useBrandKit() ?? null;
  // Sezonske nalepnice (K27, G12) su prva grupa dok sezona traje.
  const stickerGroups = useSeasonStickerGroups();

  const select = useCallback((nodeId: string | null) => {
    setSelectedId(nodeId);
    canvasFocusRef.current?.focus({ preventScroll: true });
  }, []);

  const change = useCallback(
    (nodeId: string, patch: CreaNodePatch, key?: string) => apply((current) => updateNode(current, nodeId, patch), key),
    [apply],
  );

  const add = useCallback(
    (make: (current: CreaScene) => CreaSceneNode) => {
      // Čvor se pravi nad scenom sa ekrana (klik stiže posle rendera), pa je id poznat odmah.
      const node = make(scene);
      apply((current) => addNode(current, node));
      setSelectedId(node.id);
    },
    [apply, scene],
  );

  /** Fotke: prvo popune izabrano prazno mesto (šablon, kolaž), ostale idu kao novi slojevi. */
  const addPhotos = useCallback(
    async (files: readonly File[]) => {
      const added = await addFiles(files);
      if (added.length === 0) return;
      const target = selected?.kind === "image" && (selected.slot || selected.asset === null) ? selected : null;
      apply((current) => {
        let next = current;
        let rest = added;
        if (target) {
          next = updateNode(next, target.id, { asset: added[0]!.id });
          rest = added.slice(1);
        }
        for (const asset of rest) next = addNode(next, photoNode(next, asset));
        return next;
      });
    },
    [addFiles, apply, selected],
  );

  const dragging = useFullScreenDrop(true, (files) => void addPhotos(files));

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === "z") {
      event.preventDefault();
      if (event.shiftKey) history.redo();
      else history.undo();
      return;
    }
    if (mod && key === "y") {
      event.preventDefault();
      history.redo();
      return;
    }
    if (!selected) return;
    if (event.key === "Escape") {
      setSelectedId(null);
      return;
    }
    if (selected.locked) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      apply((current) => removeNode(current, selected.id));
      setSelectedId(null);
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      change(selected.id, { x: selected.x + move[0], y: selected.y + move[1] }, `strelice:${selected.id}`);
    }
  }

  const panels: Array<{ id: PanelId; label: string }> = [
    { id: "tekst", label: T.tabText[locale] },
    { id: "nalepnice", label: T.tabStickers[locale] },
    { id: "oblici", label: T.tabShapes[locale] },
    { id: "fotke", label: T.tabPhotos[locale] },
    { id: "kolaz", label: T.tabCollage[locale] },
    { id: "zig", label: T.tabWatermark[locale] },
    { id: "slojevi", label: T.tabLayers[locale] },
  ];

  return (
    <div className="space-y-4" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center gap-2">
        <IconButton label={T.undo[locale]} onClick={history.undo} disabled={!history.canUndo}>
          <Undo2 aria-hidden="true" className="size-5" />
        </IconButton>
        <IconButton label={T.redo[locale]} onClick={history.redo} disabled={!history.canRedo}>
          <Redo2 aria-hidden="true" className="size-5" />
        </IconButton>
        <span className="ml-auto font-mono text-xs font-bold text-muted">
          {scene.width} × {scene.height} px
        </span>
      </div>

      <div
        ref={canvasFocusRef}
        tabIndex={0}
        role="group"
        aria-label={fillCopy(T.canvasLabel[locale], { w: scene.width, h: scene.height })}
        aria-describedby={hintId}
        className="surface-inset bg-surface-b p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:p-3"
      >
        <SceneCanvas
          ref={canvasRef}
          scene={scene}
          assets={assets}
          interactive
          selectedId={selectedId}
          onSelect={select}
          onChange={change}
          onEditText={() => document.getElementById(TEXT_FIELD_ID)?.focus()}
          slotHint={T.addPhotoHere[locale]}
          maxDisplayHeight={maxDisplayHeight}
          label={fillCopy(T.canvasLabel[locale], { w: scene.width, h: scene.height })}
        />
      </div>
      <div id={hintId} className="space-y-1">
        <Hint>{T.canvasHint[locale]}</Hint>
        <p className="hidden type-body-sm font-semibold text-muted md:block">{T.keysHint[locale]}</p>
      </div>

      <div className="border-t border-line pt-4">
        {selected ? (
          <SelectionPanel
            locale={locale}
            node={selected}
            scene={scene}
            assets={assets}
            onChange={(patch, key) => change(selected.id, patch, key)}
            onApply={apply}
            onDeselect={() => setSelectedId(null)}
            onPhotos={(files) => void addPhotos(files)}
          />
        ) : (
          <Hint>{T.nothingSelected[locale]}</Hint>
        )}
      </div>

      <div className="space-y-4 border-t border-line pt-4">
        <ChoiceChips legend={T.panels[locale]} name="crea-editor-panel" options={panels} value={panel} onChange={setPanel} />
        {panel === "tekst" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <PillButton onClick={() => add((current) => newText(current, "heading", locale, brand))} icon={<Heading aria-hidden="true" className="size-4" />}>
                {T.addText[locale]}
              </PillButton>
              <PillButton onClick={() => add((current) => newText(current, "body", locale, brand))} icon={<Type aria-hidden="true" className="size-4" />}>
                {T.addTextBody[locale]}
              </PillButton>
              <PillButton onClick={() => add((current) => newText(current, "hand", locale, brand))} icon={<PenLine aria-hidden="true" className="size-4" />}>
                {T.addTextHand[locale]}
              </PillButton>
            </div>
            <Hint>{T.textHint[locale]}</Hint>
          </div>
        ) : null}
        {panel === "nalepnice" ? (
          <div className="space-y-3">
            {stickerGroups.map((group) => (
              <div key={group.id}>
                <p className="type-body-sm font-black text-ink">{group.label[locale]}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {group.stickers.map((sticker) => (
                    <button
                      key={sticker.id}
                      type="button"
                      aria-label={sticker.label[locale]}
                      title={sticker.label[locale]}
                      onClick={() =>
                        add((current) => {
                          const size = Math.round(Math.min(current.width, current.height) * 0.22);
                          return { ...BASE, ...centered(current, size, size), id: nextNodeId(current, "nalepnica"), kind: "sticker", sticker: sticker.id, width: size, height: size };
                        })
                      }
                      className="igra-press grid size-12 place-items-center rounded-full border-2 border-transparent bg-paper hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      <img src={stickerUrl(sticker.id)} alt="" className="size-8" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {panel === "oblici" ? (
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["rect", T.shapeRect, <Square key="i" aria-hidden="true" className="size-4" />],
                ["ellipse", T.shapeEllipse, <Circle key="i" aria-hidden="true" className="size-4" />],
                ["star", T.shapeStar, <Star key="i" aria-hidden="true" className="size-4" />],
                ["arrow", T.shapeArrow, <ArrowRight key="i" aria-hidden="true" className="size-4" />],
                ["tape", T.shapeTape, <Square key="i" aria-hidden="true" className="size-4 -rotate-6" />],
                ["marker", T.shapeHighlight, <Highlighter key="i" aria-hidden="true" className="size-4" />],
              ] as const
            ).map(([preset, label, icon]) => (
              <PillButton key={preset} onClick={() => add((current) => newShape(current, preset))} icon={icon}>
                {label[locale]}
              </PillButton>
            ))}
          </div>
        ) : null}
        {panel === "fotke" ? (
          <div className="space-y-3">
            <FileButton label={T.addPhoto[locale]} multiple onFiles={(files) => void addPhotos(files)} />
            <Hint>{T.photosHint[locale]}</Hint>
          </div>
        ) : null}
        {panel === "kolaz" ? <CollagePanel locale={locale} scene={scene} addFiles={addFiles} onApply={apply} /> : null}
        {panel === "zig" ? <WatermarkPanel locale={locale} brand={brand} addFiles={addFiles} onAdd={add} /> : null}
        {panel === "slojevi" ? (
          <LayersPanel locale={locale} scene={scene} selectedId={selectedId} onSelect={select} onApply={apply} />
        ) : null}
      </div>

      {dragging ? <FullScreenDropOverlay label={CREA_TOOL_COPY.dropLabel[locale]} hint={T.photosHint[locale]} /> : null}
    </div>
  );
}

function SelectionPanel({
  locale,
  node,
  scene,
  assets,
  onChange,
  onApply,
  onDeselect,
  onPhotos,
}: {
  locale: Locale;
  node: CreaSceneNode;
  scene: CreaScene;
  assets: ReadonlyMap<string, EditorAsset>;
  onChange: (patch: CreaNodePatch, key?: string) => void;
  onApply: SceneHistory["apply"];
  onDeselect: () => void;
  onPhotos: (files: File[]) => void;
}) {
  const unit = Math.min(scene.width, scene.height);
  const key = (what: string) => `${what}:${node.id}`;
  const ink = { color: CREA_SCENE_COLORS.mastilo, width: Math.max(2, Math.round(unit * 0.006)) };
  const hard = { color: CREA_SCENE_COLORS.mastilo, x: Math.round(unit * 0.01), y: Math.round(unit * 0.01) };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 basis-full truncate type-body font-black text-ink sm:basis-auto sm:flex-1">
          {fillCopy(T.selected[locale], { name: nodeLabel(node, locale) })}
        </p>
        <IconButton label={node.locked ? T.unlock[locale] : T.lock[locale]} pressed={node.locked} onClick={() => onChange({ locked: !node.locked })}>
          {node.locked ? <Lock aria-hidden="true" className="size-4" /> : <LockOpen aria-hidden="true" className="size-4" />}
        </IconButton>
        <IconButton label={T.bringForward[locale]} onClick={() => onApply((current) => moveNode(current, node.id, "up"))}>
          <ArrowUp aria-hidden="true" className="size-4" />
        </IconButton>
        <IconButton label={T.sendBackward[locale]} onClick={() => onApply((current) => moveNode(current, node.id, "down"))}>
          <ArrowDown aria-hidden="true" className="size-4" />
        </IconButton>
        <IconButton label={T.duplicate[locale]} onClick={() => onApply((current) => duplicateNode(current, node.id))}>
          <Copy aria-hidden="true" className="size-4" />
        </IconButton>
        <IconButton
          label={T.remove[locale]}
          onClick={() => {
            onApply((current) => removeNode(current, node.id));
            onDeselect();
          }}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </IconButton>
      </div>
      {node.locked ? <Hint>{T.lockedHint[locale]}</Hint> : null}

      {node.kind === "text" ? <TextControls locale={locale} node={node} onChange={onChange} unit={unit} /> : null}

      {node.kind === "image" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {node.asset && assets.get(node.asset) ? (
              <img
                src={assets.get(node.asset)!.url}
                alt=""
                className="surface-media size-14 object-cover shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
              />
            ) : null}
            <FileButton label={node.asset ? T.replacePhoto[locale] : T.addPhotoHere[locale]} onFiles={onPhotos} />
            {node.slot && node.asset ? (
              <PillButton onClick={() => onChange({ asset: null })}>{T.removePhoto[locale]}</PillButton>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <PillButton pressed={Boolean(node.stroke)} onClick={() => onChange({ stroke: node.stroke ? undefined : ink })}>
              {T.border[locale]}
            </PillButton>
            <PillButton pressed={Boolean(node.shadow)} onClick={() => onChange({ shadow: node.shadow ? undefined : hard })}>
              {T.shadow[locale]}
            </PillButton>
          </div>
          <RangeField
            label={T.rounded[locale]}
            value={node.cornerRadius}
            min={0}
            max={Math.round(Math.min(node.width, node.height) / 2)}
            onChange={(value) => onChange({ cornerRadius: value }, key("ugao"))}
          />
        </div>
      ) : null}

      {node.kind === "shape" ? (
        <div className="space-y-4">
          <ColorPicker
            locale={locale}
            legend={T.fill[locale]}
            value={node.fill ?? CREA_SCENE_COLORS.bela}
            onChange={(value) => onChange({ fill: value }, key("boja"))}
            customLabel={T.customColor[locale]}
          />
          <div className="flex flex-wrap gap-2">
            {node.shape !== "arrow" ? (
              <PillButton pressed={node.fill === null} onClick={() => onChange({ fill: node.fill === null ? CREA_SCENE_COLORS.zuta : null, stroke: node.stroke ?? ink })}>
                {T.noFill[locale]}
              </PillButton>
            ) : null}
            {node.shape !== "arrow" ? (
              <PillButton pressed={Boolean(node.stroke)} onClick={() => onChange({ stroke: node.stroke ? undefined : ink, fill: node.fill ?? CREA_SCENE_COLORS.zuta })}>
                {T.border[locale]}
              </PillButton>
            ) : null}
            <PillButton pressed={Boolean(node.shadow)} onClick={() => onChange({ shadow: node.shadow ? undefined : hard })}>
              {T.shadow[locale]}
            </PillButton>
          </div>
          {node.shape === "rect" ? (
            <RangeField
              label={T.rounded[locale]}
              value={node.cornerRadius}
              min={0}
              max={Math.round(Math.min(node.width, node.height) / 2)}
              onChange={(value) => onChange({ cornerRadius: value }, key("ugao"))}
            />
          ) : null}
        </div>
      ) : null}

      <RangeField
        label={T.opacity[locale]}
        value={Math.round(node.opacity * 100)}
        min={10}
        max={100}
        display={`${Math.round(node.opacity * 100)} %`}
        onChange={(value) => onChange({ opacity: value / 100 }, key("providnost"))}
      />
    </div>
  );
}

function TextControls({
  locale,
  node,
  onChange,
  unit,
}: {
  locale: Locale;
  node: CreaTextNode;
  onChange: (patch: Partial<CreaTextNode>, key?: string) => void;
  unit: number;
}) {
  const key = (what: string) => `${what}:${node.id}`;
  const weights = CREA_FONT_WEIGHTS[node.font];
  const weightLabel = (weight: number) => (weight >= 900 ? T.weightBlack : weight >= 700 ? T.weightBold : T.weightRegular)[locale];
  const strokeWidth = Math.max(2, Math.round(node.fontSize * 0.08));
  const shadowOffset = Math.max(2, Math.round(node.fontSize * 0.06));
  const maxLength = node.field?.maxLength;
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={TEXT_FIELD_ID} className="type-body-sm font-black text-ink">
          {node.field ? node.field.label[locale] : T.text[locale]}
        </label>
        <textarea
          id={TEXT_FIELD_ID}
          value={node.text}
          rows={node.text.includes("\n") || node.text.length > 40 ? 3 : 2}
          maxLength={maxLength}
          onChange={(event) => onChange({ text: event.target.value }, key("tekst"))}
          className="surface-inset mt-2 block w-full border-2 border-ink bg-paper px-3 py-2 text-base font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceChips
          legend={T.font[locale]}
          name={`crea-font-${node.id}`}
          options={[
            { id: "nunito", label: T.fontNunito[locale] },
            { id: "rukopis", label: T.fontHand[locale] },
            { id: "montserrat", label: T.fontMontserrat[locale] },
            { id: "lora", label: T.fontLora[locale] },
          ]}
          value={node.font}
          onChange={(font) => {
            const next = CREA_FONT_WEIGHTS[font];
            onChange({ font, weight: next.includes(node.weight) ? node.weight : next[next.length - 1]! });
          }}
        />
        {weights.length > 1 ? (
          <ChoiceChips
            legend={T.weight[locale]}
            name={`crea-weight-${node.id}`}
            options={weights.map((weight) => ({ id: weight, label: weightLabel(weight) }))}
            value={node.weight}
            onChange={(weight) => onChange({ weight })}
          />
        ) : null}
      </div>
      <RangeField
        label={T.size[locale]}
        value={Math.round(node.fontSize)}
        min={Math.max(8, Math.round(unit * 0.015))}
        max={Math.round(unit * 0.3)}
        display={`${Math.round(node.fontSize)} px`}
        onChange={(fontSize) => onChange({ fontSize }, key("velicina"))}
      />
      <ColorPicker
        locale={locale}
        legend={T.color[locale]}
        value={node.fill}
        onChange={(fill) => onChange({ fill }, key("boja"))}
        customLabel={T.customColor[locale]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="sr-only">{T.align[locale]}</span>
        {(
          [
            ["left", T.alignLeft, AlignLeft],
            ["center", T.alignCenter, AlignCenter],
            ["right", T.alignRight, AlignRight],
          ] as const
        ).map(([align, label, Icon]) => (
          <IconButton key={align} label={label[locale]} pressed={node.align === align} onClick={() => onChange({ align })}>
            <Icon aria-hidden="true" className="size-4" />
          </IconButton>
        ))}
        <PillButton
          pressed={Boolean(node.stroke)}
          onClick={() =>
            onChange({ stroke: node.stroke ? undefined : { color: node.fill === CREA_SCENE_COLORS.mastilo ? CREA_SCENE_COLORS.bela : CREA_SCENE_COLORS.mastilo, width: strokeWidth } })
          }
        >
          {T.outline[locale]}
        </PillButton>
        <PillButton
          pressed={Boolean(node.shadow)}
          onClick={() =>
            onChange({
              shadow: node.shadow
                ? undefined
                : { color: node.fill === CREA_SCENE_COLORS.zuta ? CREA_SCENE_COLORS.mastilo : CREA_SCENE_COLORS.zuta, x: shadowOffset, y: shadowOffset },
            })
          }
        >
          {T.shadow[locale]}
        </PillButton>
        <PillButton pressed={node.uppercase} onClick={() => onChange({ uppercase: !node.uppercase })}>
          {T.uppercase[locale]}
        </PillButton>
      </div>
    </div>
  );
}

function CollagePanel({
  locale,
  scene,
  addFiles,
  onApply,
}: {
  locale: Locale;
  scene: CreaScene;
  addFiles: (files: readonly File[]) => Promise<EditorAsset[]>;
  onApply: SceneHistory["apply"];
}) {
  const [layout, setLayout] = useState<CollageLayoutId>("cetiri");
  const [gap, setGap] = useState<"none" | "thin" | "wide">("thin");
  const unit = Math.min(scene.width, scene.height);
  const options = (which: typeof gap) => {
    const size = which === "none" ? 0 : Math.round(unit * (which === "thin" ? 0.015 : 0.035));
    return { gap: size, margin: size, cornerRadius: size === 0 ? 0 : Math.round(unit * 0.012) };
  };
  const current = scene.nodes.flatMap((node) => (node.kind === "image" && node.role === "kolaz" && node.asset ? [node.asset] : []));
  const hasCollage = scene.nodes.some((node) => node.kind === "image" && node.role === "kolaz");

  function relayout(nextLayout: CollageLayoutId, nextGap: typeof gap) {
    if (hasCollage) onApply((latest) => applyCollage(latest, nextLayout, current, options(nextGap)));
  }

  return (
    <div className="space-y-4">
      <ChoiceChips
        legend={T.collageLayout[locale]}
        name="crea-collage-layout"
        options={COLLAGE_LAYOUTS.map((entry) => ({ id: entry.id, label: entry.label[locale] }))}
        value={layout}
        onChange={(id) => {
          setLayout(id);
          relayout(id, gap);
        }}
      />
      <ChoiceChips
        legend={T.collageGap[locale]}
        name="crea-collage-gap"
        options={[
          { id: "none" as const, label: T.collageNone[locale] },
          { id: "thin" as const, label: T.collageThin[locale] },
          { id: "wide" as const, label: T.collageWide[locale] },
        ]}
        value={gap}
        onChange={(id) => {
          setGap(id);
          relayout(layout, id);
        }}
      />
      <FileButton
        label={T.collagePick[locale]}
        multiple
        onFiles={(files) =>
          void addFiles(files).then((added) => {
            if (added.length === 0) return;
            onApply((latest) => applyCollage(latest, layout, added.map((asset) => asset.id), options(gap)));
          })
        }
      />
      <Hint>{T.collageHint[locale]}</Hint>
    </div>
  );
}

function WatermarkPanel({
  locale,
  brand,
  addFiles,
  onAdd,
}: {
  locale: Locale;
  brand: CreaBrandKit | null;
  addFiles: (files: readonly File[]) => Promise<EditorAsset[]>;
  onAdd: (make: (scene: CreaScene) => CreaSceneNode) => void;
}) {
  // Brend kit (S38): ime firme je podrazumevan tekst žiga, logo je jedno dugme.
  const [text, setText] = useState<string>(brand ? brandWatermarkText(brand) : T.watermarkDefault[locale]);
  const [logoFailed, setLogoFailed] = useState(false);

  async function addBrandLogo() {
    if (!brand?.logoUrl) return;
    try {
      const response = await fetch(brand.logoUrl);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const [asset] = await addFiles([new File([blob], "logo.png", { type: blob.type || "image/png" })]);
      if (asset) onAdd((scene) => watermarkImage(scene, asset.id, asset.width, asset.height));
      setLogoFailed(false);
    } catch {
      setLogoFailed(true);
    }
  }
  const id = useId();
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={id} className="type-body-sm font-black text-ink">
          {T.watermarkText[locale]}
        </label>
        <input
          id={id}
          value={text}
          maxLength={80}
          onChange={(event) => setText(event.target.value)}
          className="surface-inset mt-2 block min-h-11 w-full border-2 border-ink bg-paper px-3 text-base font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <PillButton disabled={!text.trim()} onClick={() => onAdd((scene) => watermarkText(scene, text.trim()))} icon={<Type aria-hidden="true" className="size-4" />}>
          {T.watermarkAddText[locale]}
        </PillButton>
        {brand?.logoUrl ? (
          <PillButton onClick={() => void addBrandLogo()} icon={<ImagePlus aria-hidden="true" className="size-4" />}>
            {T.watermarkBrandLogo[locale]}
          </PillButton>
        ) : null}
        <FileButton
          label={T.watermarkAddLogo[locale]}
          onFiles={(files) =>
            void addFiles(files.slice(0, 1)).then(([asset]) => {
              if (asset) onAdd((scene) => watermarkImage(scene, asset.id, asset.width, asset.height));
            })
          }
        />
      </div>
      <Hint>{T.watermarkHint[locale]}</Hint>
      {logoFailed ? <Hint>{T.watermarkBrandLogoFailed[locale]}</Hint> : null}
    </div>
  );
}

function LayersPanel({
  locale,
  scene,
  selectedId,
  onSelect,
  onApply,
}: {
  locale: Locale;
  scene: CreaScene;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
  onApply: SceneHistory["apply"];
}) {
  const ordered = [...scene.nodes].reverse();
  return (
    <div className="space-y-4">
      {ordered.length === 0 ? (
        <Hint>{T.layersEmpty[locale]}</Hint>
      ) : (
        <>
          <Hint>{T.layersHint[locale]}</Hint>
          <ol className="divide-y divide-line">
            {ordered.map((node) => {
              const active = node.id === selectedId;
              return (
                <li key={node.id} className="flex items-center gap-1 py-1.5">
                  <button
                    type="button"
                    onClick={() => onSelect(node.id)}
                    aria-current={active || undefined}
                    className={cn(
                      "min-h-11 min-w-0 flex-1 truncate rounded-full px-3 text-left text-sm font-black transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none",
                      active ? "bg-yellow text-ink" : "text-ink hover:bg-paper",
                      !node.visible && "text-muted line-through",
                    )}
                  >
                    {nodeLabel(node, locale)}
                  </button>
                  <IconButton label={T.bringToFront[locale]} onClick={() => onApply((current) => moveNode(current, node.id, "top"))}>
                    <ChevronsUp aria-hidden="true" className="size-4" />
                  </IconButton>
                  <IconButton label={T.sendToBack[locale]} onClick={() => onApply((current) => moveNode(current, node.id, "bottom"))}>
                    <ChevronsDown aria-hidden="true" className="size-4" />
                  </IconButton>
                  <IconButton
                    label={node.visible ? T.hide[locale] : T.show[locale]}
                    pressed={!node.visible}
                    onClick={() => onApply((current) => updateNode(current, node.id, { visible: !node.visible }))}
                  >
                    {node.visible ? <Eye aria-hidden="true" className="size-4" /> : <EyeOff aria-hidden="true" className="size-4" />}
                  </IconButton>
                  <IconButton
                    label={node.locked ? T.unlock[locale] : T.lock[locale]}
                    pressed={node.locked}
                    onClick={() => onApply((current) => updateNode(current, node.id, { locked: !node.locked }))}
                  >
                    {node.locked ? <Lock aria-hidden="true" className="size-4" /> : <LockOpen aria-hidden="true" className="size-4" />}
                  </IconButton>
                </li>
              );
            })}
          </ol>
        </>
      )}
      <ColorPicker
        locale={locale}
        legend={T.background[locale]}
        value={scene.background}
        onChange={(background) => onApply((current) => ({ ...current, background: background.toLowerCase() }), "pozadina")}
        customLabel={T.customColor[locale]}
      />
    </div>
  );
}
